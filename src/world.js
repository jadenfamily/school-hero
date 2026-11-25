// 3D 월드 · 캐릭터 생성 (2.5D 도트 스프라이트 + 로우폴리 지형)
import { AVATAR_MAP, GRADES, ARMOR_KINDS, ZONES, EARTH_GATE, GYEONGGI_GATE, BORDERS, borderDistrictId } from './data.js';
import { visualEquip, COSTUME_VISUAL } from './sprites.js';
import { ASSET_URL, getTexture, aspectOf } from './assets.js';
const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- 하나의 연결된 판타지 지도 ----------
// 480×384 월드 (x -240..240, z -144..240), 96×96 구역 18개를 5열×4행으로 배치.
//   북(z=-144):  마계섬(12)  강북 사막(3)  한강 심해(4)  북한산 설산(9)  수원 화성(13)
//   중:          강화 마계성(11) 마곡 늪지(2) 남산 유적(5) 도봉 빙하(8) 성남 테크(14)
//   남(z=+144):  마계 인천항(10) 여의도 숲(1) 관악 화산(6) 강남 달표면(7) 고양 호수(15)
//   최남(z=+240): (빈 바다) (빈 바다) 가평 산호수(18) 파주 휴전선(17) 용인 테마파크(16)
// 해금 순서: 서울 1→9 → (지구 귀환 게이트 포탈) → 마계 인천 10→12 → (마계 관문 포탈) → 경기도 13→18.
// 서울 좌표는 그대로 (기존 저장본 위치 보존). 인천은 서울 서쪽, 경기도는 서울 동쪽·남쪽을 두른다.
export const WORLD_W = 480;
export const WORLD_H = 384;
export const WORLD_BOUNDS = { minX: -240, maxX: 240, minZ: -144, maxZ: 240 };
const GRID = [
  [12, 3, 4, 9, 13],
  [11, 2, 5, 8, 14],
  [10, 1, 6, 7, 15],
  // 최남서 모서리 2칸은 빈 바다 (갈 수 없는 곳 — districtAt은 가장 가까운 구역을 돌려준다)
  [10, 18, 18, 17, 16],
];
export function districtAt(x, z) {
  const col = Math.max(0, Math.min(4, Math.floor((x - WORLD_BOUNDS.minX) / 96)));
  const row = Math.max(0, Math.min(3, Math.floor((z - WORLD_BOUNDS.minZ) / 96)));
  return ZONES.find((zn) => zn.id === GRID[row][col]) || ZONES[0];
}
export function worldPos(zone, lx, lz) {
  return { x: zone.map.cx + lx, z: zone.map.cz + lz };
}
// 해금 순서대로 구역 중심을 잇는 메인 길 — 포탈로 건너는 구간(9→10, 12→13)은 길이 이어지지 않는다
export const PATH_CENTERS = ZONES.filter((z) => z.map).map((z) => ({ x: z.map.cx, z: z.map.cz }));
const PORTAL_JUMPS = new Set(['9>10', '12>13']);
const PATH_SEGS = [];
for (let i = 0; i < ZONES.length - 1; i++) {
  if (PORTAL_JUMPS.has(`${ZONES[i].id}>${ZONES[i + 1].id}`)) continue;
  PATH_SEGS.push([{ x: ZONES[i].map.cx, z: ZONES[i].map.cz }, { x: ZONES[i + 1].map.cx, z: ZONES[i + 1].map.cz }]);
}
// 평탄화 지점: 각 구역의 스폰·NPC·보스·미드·필드·추가보스·통로 + 두 포탈 + 숨은 상자
// (월드 좌표 + 평탄 반경). 스폰·NPC는 작게(3m), 보스 아레나는 넓게(4.5m), 상자는 1.5m —
// 그 밖은 지형이 그대로 살아 있다.
const FLAT_POINTS = [];
for (const zn of ZONES) {
  if (!zn.map) continue;
  const add = (p, r) => { if (p) FLAT_POINTS.push({ ...worldPos(zn, p.x, p.z), r }); };
  add(zn.spawn, 3);
  add(zn.npc, 3);
  add(zn.boss, 4.5);
  add(zn.mid, 4.5);
  add(zn.field, 4.5);
  for (const ex of (zn.extraBosses || [])) FLAT_POINTS.push({ x: zn.map.cx + ex.x, z: zn.map.cz + ex.z, r: 4.5 });
  for (const ch of (zn.chests || [])) FLAT_POINTS.push({ ...worldPos(zn, ch.x, ch.z), r: 1.5 });
}
for (const b of BORDERS) FLAT_POINTS.push({ x: b.x, z: b.z, r: 3.5 });
FLAT_POINTS.push({ x: EARTH_GATE.x, z: EARTH_GATE.z, r: 4 });
FLAT_POINTS.push({ x: GYEONGGI_GATE.x, z: GYEONGGI_GATE.z, r: 4 });

// ---------- 울퉁불퉁한 구역 경계 ----------
// 직선 사각 경계 대신, 경계마다 노이즈로 휘어진 곡선을 쓴다 (실제 지도처럼).
// 휘어짐은 경계의 양 끝 모서리와 통로 중심에서 정확히 0이 된다 —
// 그래서 이웃 구역의 경계와 빈틈없이 맞물리고, 통로는 정확히 직선 경계 위에 놓인다.
function borderSeed(b) { return (b.a * 7 + b.b * 13) % 97; }
export function borderWobble(b, t) {
  const s = borderSeed(b);
  // sin(2πt): t=0(모서리)·0.5(통로)·1(모서리)에서 0
  return Math.sin(2 * Math.PI * t) * (5.5 * Math.sin(2 * Math.PI * 1.3 * t + s) + 3 * Math.sin(2 * Math.PI * 2.7 * t + s * 1.7));
}
// 경계 위의 점 (t=0..1, 정방향: along 'x'면 x 증가, 'z'면 z 증가)
export function borderPoint(b, t) {
  const w = borderWobble(b, t);
  if (b.along === 'x') return { x: b.x - 48 + t * 96, z: b.z + w };
  return { x: b.x + w, z: b.z - 48 + t * 96 };
}
// 빈 바다와 맞닿은 경계 (10번·1번 남쪽, 18번 서쪽) — 통로가 없는 자연물 벽.
// 각 벽은 구역 한 변(96m) 길이로 끊는다: 벽의 양끝이 구역 모서리와 맞아떨어져야
// 휘어짐(wobble)이 모서리에서 0이 되고, 이웃 구역 윤곽이 어긋나지 않는다.
const VOID_WALLS = [
  { x0: -240, z0: 144, x1: -144, z1: 144, seed: 41 }, // 10번 남쪽
  { x0: -144, z0: 144, x1: -48, z1: 144, seed: 42 }, // 1번 남쪽
  { x0: -48, z0: 144, x1: -48, z1: 240, seed: 83 }, // 18번 서쪽
];
function voidWobble(wall, t) {
  const s = wall.seed;
  return Math.sin(Math.PI * t) * (4 * Math.sin(2 * Math.PI * 1.7 * t + s) + 2.5 * Math.sin(2 * Math.PI * 3.1 * t + s * 1.3));
}
function voidPoint(wall, t) {
  const w = voidWobble(wall, t);
  const dx = wall.x1 - wall.x0, dz = wall.z1 - wall.z0;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len, nz = dx / len; // 수직 방향 오프셋
  return { x: wall.x0 + dx * t + nx * w, z: wall.z0 + dz * t + nz * w };
}
// 구역 외곽선 (닫힌 다각형, 시계 방향) — 지면 텍스처·미니맵·월드맵이 같은 모양을 쓴다.
// 한 변의 각 점마다 그 위치를 지나는 경계(공유 휘어짐)·빈 바다 벽·직선 중 맞는 것을 쓴다.
// 그래서 이웃 구역끼리 같은 경계 점을 공유해 빈틈없이 맞물리고, 한 변이 경계와 빈 바다로
// 나뉘는 경우(6번 남쪽 변)도 자연스럽게 이어진다.
export function districtOutline(zoneId) {
  const zn = ZONES.find((z) => z.id === zoneId);
  if (!zn || !zn.map) return [];
  const { cx, cz } = zn.map;
  const x0 = cx - 48, x1 = cx + 48, z0 = cz - 48, z1 = cz + 48;
  const N = 24; // 한 변당 샘플 수
  // 가로 경계(z 고정) 위의 점: x를 주면 휘어짐(수직 오프셋)을 돌려준다
  const wobAtX = (x, zEdge) => {
    const b = BORDERS.find((bb) => bb.along === 'x' && bb.z === zEdge && Math.abs(x - bb.x) <= 48);
    if (b) return borderWobble(b, (x - (b.x - 48)) / 96);
    const w = VOID_WALLS.find((ww) => ww.z0 === zEdge && ww.z1 === zEdge && x >= ww.x0 && x <= ww.x1);
    if (w) return voidWobble(w, (x - w.x0) / (w.x1 - w.x0));
    return 0;
  };
  // 세로 경계(x 고정) 위의 점: z를 주면 휘어짐(수평 오프셋)을 돌려준다
  const wobAtZ = (z, xEdge) => {
    const b = BORDERS.find((bb) => bb.along === 'z' && bb.x === xEdge && Math.abs(z - bb.z) <= 48);
    if (b) return borderWobble(b, (z - (b.z - 48)) / 96);
    const w = VOID_WALLS.find((ww) => ww.x0 === xEdge && ww.x1 === xEdge && z >= ww.z0 && z <= ww.z1);
    if (w) return voidWobble(w, (z - w.z0) / (w.z1 - w.z0));
    return 0;
  };
  const pts = [];
  for (let i = 0; i < N; i++) { const x = x0 + (i / N) * 96; pts.push({ x, z: z0 + wobAtX(x, z0) }); } // 북 (서→동)
  for (let i = 0; i < N; i++) { const z = z0 + (i / N) * 96; pts.push({ x: x1 + wobAtZ(z, x1), z }); } // 동 (북→남)
  for (let i = 0; i < N; i++) { const x = x1 - (i / N) * 96; pts.push({ x, z: z1 + wobAtX(x, z1) }); } // 남 (동→서)
  for (let i = 0; i < N; i++) { const z = z1 - (i / N) * 96; pts.push({ x: x0 + wobAtZ(z, x0), z }); } // 서 (남→북)
  return pts;
}
// 한강: 지도 가로를 흐르는 강 (구역 4 중심선 z=-96 부근, 얕은 수로)
const RIVER_Z = -96;

// ---------- 지형 높이 ----------
// 결정적 지형 높이: 월드 좌표 기준, 서 있는 구역마다 다른 언덕/웅덩이.
// 작은 파도(h1·h2)에 지도 규모의 큰 언덕·웅덩이(h3·h4)를 더해 산을 오르고 구덩이로
// 내려가는 게 확실히 느껴진다. 진폭은 대략 ±3~4, 경사는 걷기에 무리 없는 수준.
// 스폰·NPC·보스 아레나·게이트만 국소적으로 평탄하게 하고, 메인 길목 평탄화는 없앴다
// (길도 언덕을 타고 오른다). 한강 라인(z=-96)은 얕은 수로.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => t * t * (3 - 2 * t);
function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function groundHeight(x, z) {
  const d0 = districtAt(x, z);
  const cx = d0.map.cx, cz = d0.map.cz;
  // 구역 경계 단차 제거: 경계 10m 안에서 이웃 구역 높이와 섞는다
  // (잡음 위상이 구역마다 달라서 그냥 두면 경계에서 최대 4m 단차가 생긴다.
  //  모서리에서는 대각선 구역까지 섞어야 네 방향에서 모두 연속이 된다)
  const px = (x - cx) / 96, pz = (z - cz) / 96; // -0.5..0.5 (구역 안 상대 위치)
  // 경계에서는 양쪽 구역 높이의 평균이 되어야 연속이다 — 그래서 가중치는 경계에서 0.5까지만 오른다
  const wx = 0.5 * smooth(clamp01((Math.abs(px) - 0.3958) / 0.1042));
  const wz = 0.5 * smooth(clamp01((Math.abs(pz) - 0.3958) / 0.1042));
  let h = rawHeightFor(x, z, d0.id);
  if (wx > 0 || wz > 0) {
    const hX = wx > 0 ? rawHeightFor(x, z, districtAt(cx + Math.sign(px) * 96, z).id) : h;
    const hZ = wz > 0 ? rawHeightFor(x, z, districtAt(x, cz + Math.sign(pz) * 96).id) : h;
    const hC = (wx > 0 && wz > 0) ? rawHeightFor(x, z, districtAt(cx + Math.sign(px) * 96, cz + Math.sign(pz) * 96).id) : h;
    h = (1 - wx) * (1 - wz) * h + wx * (1 - wz) * hX + (1 - wx) * wz * hZ + wx * wz * hC;
  }
  // 평탄화: 모든 지점이 0을 향하므로 겹쳐도 서로 안 싸운다
  // (스폰·NPC는 4m 간격, 보스 아레나끼리도 겹침 — 앵커가 다르면 단차가 생긴다)
  let flat = 1;
  for (const fp of FLAT_POINTS) {
    const d = Math.hypot(x - fp.x, z - fp.z);
    flat = Math.min(flat, smooth(clamp01((d - fp.r) / 7)));
  }
  h *= flat;
  // 한강 수로: 평탄한 곳(보스 아레나·게이트)은 강 속 섬처럼 그대로 둔다
  const dRiver = Math.abs(z - RIVER_Z);
  const rk = (1 - smooth(clamp01((dRiver - 4) / 6))) * flat;
  return h * (1 - rk) + (-0.7) * rk;
}

// 평탄화·수로 전 높이 (파도 + 큰 언덕·웅덩이) — zId를 지정하면 해당 구역 위상으로 잰다
function rawHeightFor(x, z, zId) {
  const a = zId * 1.7 + 0.6;
  const b = zId * 2.3 + 1.9;
  const h1 = Math.sin(x * 0.09 + a) * Math.cos(z * 0.075 + b);
  const h2 = Math.sin(x * 0.045 - b * 0.7 + z * 0.06 + a * 0.5) * Math.cos(z * 0.05 - a);
  // 큰 언덕·웅덩이 (파장 200m 안팎 — 구역을 가로지르는 오르막·내리막)
  const h3 = Math.sin(x * 0.028 + a * 1.3) * Math.cos(z * 0.034 + b * 0.8);
  const h4 = Math.sin((x + z) * 0.016 + b) * Math.cos((x - z) * 0.02 + a);
  return h1 * 1.35 + h2 * 1.05 + h3 * 1.5 + h4 * 1.1;
}

function mat(THREE, color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}
function box(THREE, w, h, d, color) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(THREE, color));
}
function sphere(THREE, r, color, seg = 8) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat(THREE, color));
}
function cone(THREE, r, h, color, seg = 6) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(THREE, color));
}
function cyl(THREE, rt, rb, h, color, seg = 6) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(THREE, color));
}
function glow(THREE, color, size) {
  return new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
}
function blobShadow(THREE, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

function setShadow(g) {
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}

// ---------- 몬스터용 공유 지오메트리 캐시 ----------
// 같은 도형의 몬스터끼리 지오메트리만 공유한다. 재질은 인형마다 새로 만든다
// (피격 플래시·색상 틴트가 인형별로 동작해야 하기 때문).
// disposeGroup은 인형 단위로 지오메트리를 해제하므로, 공유 지오메트리에는 shared
// 표시를 달고 game.js의 disposeGroup은 shared 지오메트리를 해제하지 않는다.
const GEO_CACHE = new Map();
function sharedGeo(key, make) {
  let g = GEO_CACHE.get(key);
  if (!g) { g = make(); g.userData.shared = true; GEO_CACHE.set(key, g); }
  return g;
}
const gBox = (T, w, h, d) => sharedGeo(`b${w},${h},${d}`, () => new T.BoxGeometry(w, h, d));
const gSphere = (T, r, w = 8, h = 6) => sharedGeo(`s${r},${w},${h}`, () => new T.SphereGeometry(r, w, h));
const gCone = (T, r, h, s = 6) => sharedGeo(`c${r},${h},${s}`, () => new T.ConeGeometry(r, h, s));
const gCyl = (T, rt, rb, h, s = 6) => sharedGeo(`y${rt},${rb},${h},${s}`, () => new T.CylinderGeometry(rt, rb, h, s));
const gRing = (T, ri, ro) => sharedGeo(`r${ri},${ro}`, () => new T.RingGeometry(ri, ro, 24));

function dotTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function labelSprite(THREE, text, color = '#ffd257') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.strokeText(text, 64, 70);
  g.fillStyle = color;
  g.fillText(text, 64, 70);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1.1, 1.1, 1.1);
  return s;
}

// ---------- 지면 텍스처 (도트 스타일) ----------
// 저해상도 캔버스(240×192 = 1픽셀 2m)에 구역별 평탄한 도트 색을 그리고,
// NearestFilter로 확대해 땅이 굵은 픽셀 블록으로 보이게 한다.
// 높이·경사 음영은 버텍스 컬러가 맡으므로(높은 곳 밝게, 웅덩이 어둡게) 입체감은 그대로 산다.
// 구역 모양은 울퉁불퉁한 외곽선(districtOutline) 그대로 — 사각 격자는 없다.
function groundTexture(THREE, zones, rnd) {
  const TW = 240, TH = 192;
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  const X = (wx) => (wx - WORLD_BOUNDS.minX) / WORLD_W * TW;
  const Y = (wz) => (wz - WORLD_BOUNDS.minZ) / WORLD_H * TH;
  const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  // 바탕: 빈 바다 (최남서 모서리) — 구역 다각형이 그 위를 덮는다
  g.fillStyle = '#16283e';
  g.fillRect(0, 0, TW, TH);
  // 구역별 바탕 (울퉁불퉁한 다각형 + 평탄한 도트 색)
  for (const zn of zones) {
    if (!zn.map) continue;
    const outline = districtOutline(zn.id);
    if (!outline.length) continue;
    g.beginPath();
    outline.forEach((p, i) => { if (i === 0) g.moveTo(X(p.x), Y(p.z)); else g.lineTo(X(p.x), Y(p.z)); });
    g.closePath();
    g.fillStyle = hexOf(zn.theme.ground);
    g.fill();
    // 구역 안 굵은 얼룩 (도트 결) — ground2·grass 색 2~4픽셀 덩어리
    g.save();
    g.clip();
    for (let i = 0; i < 26; i++) {
      const px = X(zn.map.cx) + (rnd() - 0.5) * 44, py = Y(zn.map.cz) + (rnd() - 0.5) * 44;
      const r = 1.5 + rnd() * 2.5;
      g.globalAlpha = 0.35 + rnd() * 0.4;
      g.fillStyle = rnd() > 0.5 ? zn.theme.ground2 : (zn.theme.grass || hexOf(zn.theme.ground));
      g.fillRect(px - r, py - r * 0.7, r * 2, r * 1.4);
    }
    g.restore();
    g.globalAlpha = 1;
    // 경계선 (구역 색보다 어둡게, 1픽셀)
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1;
    g.stroke();
  }
  // 한강 물줄기 (z=-96 라인, 가로 전체) — 굵은 도트 밴드
  const ry0 = Y(RIVER_Z - 8), ry1 = Y(RIVER_Z + 8);
  g.fillStyle = '#2a7a96';
  g.fillRect(0, ry0, TW, ry1 - ry0);
  g.fillStyle = 'rgba(168,232,238,.5)';
  for (let i = 0; i < 46; i++) g.fillRect(rnd() * TW, ry0 + rnd() * (ry1 - ry0), 2, 1);
  // 메인 길: 구역 중심을 잇는 돌길 (포탈 구간은 끊긴다) — 굵은 도트 선
  const traceChain = (ids) => {
    g.beginPath();
    ids.forEach((id, i) => {
      const zn = zones.find((z) => z.id === id);
      if (!zn || !zn.map) return;
      const px = X(zn.map.cx), py = Y(zn.map.cz);
      if (i === 0) g.moveTo(px, py);
      else {
        const prev = zones.find((z) => z.id === ids[i - 1]);
        g.quadraticCurveTo(X(prev.map.cx), Y(zn.map.cz), px, py);
      }
    });
  };
  g.lineCap = 'square';
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 5;
  traceChain([1, 2, 3, 4, 5, 6, 7, 8, 9]); traceChain([10, 11, 12]); traceChain([13, 14, 15, 16, 17, 18]);
  g.stroke();
  g.strokeStyle = '#9c8a63'; g.lineWidth = 3;
  traceChain([1, 2, 3, 4, 5, 6, 7, 8, 9]); traceChain([10, 11, 12]); traceChain([13, 14, 15, 16, 17, 18]);
  g.stroke();
  // 길 위 자갈 도트
  for (let i = 0; i < 240; i++) {
    const seg = PATH_SEGS[Math.floor(rnd() * PATH_SEGS.length)];
    if (!seg) break;
    const t = rnd();
    const wx = seg[0].x + (seg[1].x - seg[0].x) * t + (rnd() - 0.5) * 5;
    const wz = seg[0].z + (seg[1].z - seg[0].z) * t + (rnd() - 0.5) * 5;
    g.globalAlpha = 0.3 + rnd() * 0.4;
    g.fillStyle = rnd() > 0.5 ? '#f2e6c8' : '#5a4a2e';
    g.fillRect(X(wx), Y(wz), 1.5, 1.5);
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; // 확대 시 픽셀이 뭉개지지 않고 굵은 블록으로 보인다
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 1;
  return tex;
}

// ---------- 3D 로우폴리 휴머노이드 ----------
// 손(그립) 원점에서 뻗는 무기. 근접 무기는 아래(-y)로, 지팡이는 위로 뻗는다.
// (인형 1개 안에서만 지오메트리/재질을 공유한다. disposeGroup이 인형 단위로
//  지오메트리를 해제하므로, 인형끼리 공유하면 다른 인형이 깨진다.)
function buildWeaponMesh(THREE, fam, M) {
  const g = new THREE.Group();
  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const tipDown = (mesh, y) => { mesh.rotation.x = Math.PI; return add(mesh, 0, y, 0); };
  switch (fam) {
    case 'dagger': {
      add(cyl(THREE, 0.03, 0.03, 0.13, 0x6a4a22), 0, -0.06, 0);
      add(box(THREE, 0.14, 0.04, 0.05, 0xdfe7f2), 0, -0.14, 0);
      add(box(THREE, 0.07, 0.2, 0.025, 0xdfe7f2), 0, -0.25, 0);
      add(box(THREE, 0.02, 0.18, 0.028, 0xffffff), 0, -0.25, 0); // 날 선 하이라이트
      tipDown(cone(THREE, 0.035, 0.1, 0xdfe7f2, 4), -0.4);
      add(sphere(THREE, 0.035, 0xdfe7f2, 6), 0, 0.02, 0); // 자루 끝 장식구
      break;
    }
    case 'axe': {
      add(cyl(THREE, 0.03, 0.035, 0.42, 0x8a6a3a), 0, -0.26, 0);
      add(box(THREE, 0.3, 0.2, 0.05, 0xdfe7f2), 0, -0.48, 0);
      add(box(THREE, 0.1, 0.12, 0.05, 0xdfe7f2), 0, -0.48, 0.08);
      add(box(THREE, 0.22, 0.14, 0.04, 0xdfe7f2), 0, -0.48, -0.06); // 뒷날
      tipDown(cone(THREE, 0.04, 0.12, 0xdfe7f2, 4), -0.64); // 머리 위 뾰족한 돌기
      break;
    }
    case 'mace': {
      add(cyl(THREE, 0.03, 0.035, 0.4, 0x8a6a3a), 0, -0.25, 0);
      add(box(THREE, 0.07, 0.05, 0.07, 0xdfe7f2), 0, -0.32, 0); // 손잡이 띠
      add(sphere(THREE, 0.11, 0xdfe7f2, 8), 0, -0.47, 0);
      for (let i = 0; i < 6; i++) {
        const s = cone(THREE, 0.03, 0.08, 0xdfe7f2, 4);
        const a = (i / 6) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.11, -0.47, Math.sin(a) * 0.11);
        s.rotation.z = -Math.cos(a) * 1.2; s.rotation.x = Math.sin(a) * 1.2;
        g.add(s);
      }
      break;
    }
    case 'bow': {
      const limbT = box(THREE, 0.04, 0.4, 0.04, 0x8a6a3a);
      limbT.position.set(0, 0.2, -0.07); limbT.rotation.x = -0.4; g.add(limbT);
      const limbB = box(THREE, 0.04, 0.4, 0.04, 0x8a6a3a);
      limbB.position.set(0, -0.2, -0.07); limbB.rotation.x = 0.4; g.add(limbB);
      add(box(THREE, 0.05, 0.05, 0.05, 0xdfe7f2), 0, 0.38, -0.14); // 활 끝 장식
      add(box(THREE, 0.05, 0.05, 0.05, 0xdfe7f2), 0, -0.38, -0.14);
      add(box(THREE, 0.015, 0.72, 0.015, 0xf2ead0), 0, 0, -0.22);
      add(box(THREE, 0.06, 0.12, 0.06, 0x6a4a22), 0, 0, 0); // 손잡이 감개
      const shaft = cyl(THREE, 0.015, 0.015, 0.5, 0xdcc39a, 5);
      shaft.rotation.x = Math.PI / 2; add(shaft, 0, 0, 0.12);
      const tip = cone(THREE, 0.03, 0.09, 0xe9f2ff, 4);
      tip.rotation.x = Math.PI / 2; add(tip, 0, 0, 0.4);
      break;
    }
    case 'crossbow': {
      add(box(THREE, 0.07, 0.07, 0.42, 0x8a6a3a), 0, -0.05, 0.05);
      add(box(THREE, 0.44, 0.05, 0.05, 0xdfe7f2), 0, -0.02, 0.22);
      add(box(THREE, 0.05, 0.08, 0.05, 0xdfe7f2), 0, 0.04, 0.05); // 조준기
      const crank = cyl(THREE, 0.02, 0.02, 0.12, 0x6a4a22, 5);
      crank.rotation.z = Math.PI / 2; add(crank, 0, -0.05, -0.16); // 감는 손잡이
      const bolt = cyl(THREE, 0.015, 0.015, 0.34, 0xd7e2f0, 5);
      bolt.rotation.x = Math.PI / 2; add(bolt, 0, 0.02, 0.12);
      break;
    }
    case 'staff': {
      add(cyl(THREE, 0.028, 0.035, 0.85, 0x8a6a3a), 0, -0.05, 0);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.grade);
      add(orb, 0, 0.48, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 6, 14), M.metal);
      ring.rotation.x = Math.PI / 2; add(ring, 0, 0.48, 0);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 12), M.metal);
      ring2.rotation.y = Math.PI / 2; add(ring2, 0, 0.48, 0);
      for (const s of [-1, 1]) { // 궤도를 도는 작은 룬
        const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), M.grade);
        add(rune, 0.22 * s, 0.48, 0);
      }
      tipDown(cone(THREE, 0.04, 0.1, 0xdfe7f2, 4), -0.52);
      break;
    }
    case 'book': {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.42), M.grade);
      add(cover, 0, -0.12, 0);
      add(box(THREE, 0.27, 0.045, 0.37, 0xf7f0d8), 0, -0.1, 0);
      add(box(THREE, 0.34, 0.05, 0.06, 0x6a4a22), 0, -0.12, -0.19); // 책등
      add(box(THREE, 0.05, 0.02, 0.14, 0xc0392b), 0.1, -0.1, 0.24); // 책갈피 리본
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), M.grade);
      add(rune, 0, 0.22, 0);
      break;
    }
    case 'sword':
    default: {
      add(cyl(THREE, 0.03, 0.03, 0.14, 0x6a4a22), 0, -0.07, 0);
      add(box(THREE, 0.2, 0.045, 0.055, 0xdfe7f2), 0, -0.15, 0);
      add(box(THREE, 0.085, 0.28, 0.028, 0xdfe7f2), 0, -0.31, 0);
      add(box(THREE, 0.02, 0.24, 0.032, 0xffffff), 0, -0.31, 0); // 검신 홈 하이라이트
      tipDown(cone(THREE, 0.042, 0.12, 0xdfe7f2, 4), -0.5);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), M.grade);
      add(gem, 0, -0.15, 0.045);
      add(sphere(THREE, 0.04, 0xdfe7f2, 6), 0, 0.02, 0); // 자루 끝 장식구
      break;
    }
  }
  return g;
}

// 코스튬 고유 파츠 — COSTUME_VISUAL(sprites.js) 한 곳만 보고 3D에 붙인다.
// (가방 2D 전신도 같은 맵을 쓴다.) 파츠에는 userData.costumePiece 이름을 달아
// 스모크 테스트에서 코스튬마다 붙었는지 확인할 수 있게 한다.
function addCostumePieces(THREE, parts, vis, cols) {
  const { head, body } = parts;
  const tag = (m, name) => { m.userData.costumePiece = name; return m; };
  const capeM = mat(THREE, cols.cape);
  const goldM = mat(THREE, 0xffd257);
  const darkM = mat(THREE, 0x20242e);
  const add = (parent, mesh, x, y, z) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
  if (vis.head === 'hood') {
    // 후드 (얼굴 앞은 트인 반구) — 닌자·암살자·어둠 망토
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), capeM);
    add(head, tag(hood, 'hood'), 0, 0.1, -0.08);
  } else if (vis.head === 'tricorn') {
    // 해적 삼각모 (챙 + 돔 + 금테)
    add(head, tag(new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 12), darkM), 'tricorn'), 0, 0.2, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), darkM);
    dome.scale.set(1, 0.55, 1); add(head, tag(dome, 'tricorn'), 0, 0.22, 0);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.02, 6, 12), goldM);
    band.rotation.x = Math.PI / 2; add(head, tag(band, 'tricorn'), 0, 0.24, 0);
  } else if (vis.head === 'kabuto') {
    // 사무라이 투구 (돔 + 뿔 + 금빛 앞장식)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat(THREE, 0x8c1f28));
    dome.scale.set(1, 0.62, 1); add(head, tag(dome, 'kabuto'), 0, 0.2, 0);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 4), mat(THREE, 0xdfe7f2));
      horn.position.set(0.3 * s, 0.32, 0); horn.rotation.z = -s * 0.9; head.add(tag(horn, 'kabuto'));
    }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), goldM);
    disc.rotation.x = Math.PI / 2; add(head, tag(disc, 'kabuto'), 0, 0.14, 0.3);
  } else if (vis.head === 'crown') {
    // 황금 왕관
    add(head, tag(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 8), goldM), 'crown'), 0, 0.34, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(head, tag(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 4), goldM), 'crown'), Math.cos(a) * 0.2, 0.42, Math.sin(a) * 0.2);
    }
  } else if (vis.head === 'halo') {
    // 성기사 후광 (머리 위 금빛 고리)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), goldM);
    halo.rotation.x = Math.PI / 2 - 0.2; add(head, tag(halo, 'halo'), 0, 0.52, 0);
  } else if (vis.head === 'antler') {
    // 드루이드 뿔 (가지 달린 뿔 2개)
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 4), mat(THREE, 0x8a6a3a));
      a.position.set(0.22 * s, 0.4, 0); a.rotation.z = -s * 0.5; head.add(tag(a, 'antler'));
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), mat(THREE, 0x8a6a3a));
      b.position.set(0.3 * s, 0.46, 0); b.rotation.z = -s * 1.2; head.add(tag(b, 'antler'));
    }
  } else if (vis.head === 'crest') {
    // 기사 투구 장식 (금빛 깃)
    add(head, tag(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), goldM), 'crest'), 0, 0.42, 0);
  }
  if (vis.mask) {
    // 복면 (눈만 보이는 어두운 면포)
    add(head, tag(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), darkM), 'mask'), 0, -0.1, 0.27);
  }
  if (vis.cloak) {
    // 큰 망토 (기존 망토보다 넓고 길게)
    add(body, tag(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.9, 0.05), capeM), 'cloak'), 0, 0.78, -0.24);
  }
  if (vis.coat) {
    // 해적 코트 (빨간 앞판 + 황금 단추)
    add(body, tag(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.04), mat(THREE, 0x7a2e2e)), 'coat'), 0, 0.88, 0.15);
    for (let i = 0; i < 3; i++) {
      add(body, tag(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), goldM), 'coat'), 0, 1.0 - i * 0.12, 0.18);
    }
  }
  if (vis.armor) {
    // 사무라이 갑주 (붉은 판 + 흰 매듭끈)
    add(body, tag(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.05), mat(THREE, 0x8c1f28)), 'armor'), 0, 0.9, 0.15);
    add(body, tag(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.05), mat(THREE, 0xe8e8e8)), 'armor'), 0, 0.78, 0.15);
  }
  if (vis.plate) {
    // 성기사 판금 (흰 판 + 금테)
    add(body, tag(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.38, 0.05), mat(THREE, 0xf2e6c8)), 'plate'), 0, 0.9, 0.15);
    add(body, tag(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.05), goldM), 'plate'), 0, 1.06, 0.15);
  }
  if (vis.sash) {
    // 황금 예복 붉은 띠 (대각선)
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.04), mat(THREE, 0xc03050));
    sash.rotation.z = 0.6; add(body, tag(sash, 'sash'), 0, 0.88, 0.15);
  }
  if (vis.rune) {
    // 마법사 빛나는 문양 (가슴 원반)
    const rune = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12),
      new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.85 }));
    add(body, tag(rune, 'rune'), 0, 0.95, 0.16);
  }
  if (vis.flower) {
    // 드루이드 꽃 (어깨·가슴 분홍 꽃 3송이)
    for (let i = 0; i < 3; i++) {
      add(body, tag(new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), mat(THREE, 0xff9ec4)), 'flower'), -0.16 + i * 0.16, 1.08 - (i % 2) * 0.06, 0.16);
    }
  }
}

// 로우폴리 치비 휴머노이드. 정면은 +z (rotation.y = atan2(dx,dz)가 이동 방향을 향한다).
// opts: { avatar, skin, uniform, hair, accent, weaponFam, grade, armorFam, capeColor, scale, polish, costumeId }
// polish: 주인공·동료만 true — 초상화처럼 다듬은 비율·얼굴. 몬스터 휴머노이드는 polish을
// 넘기지 않으므로 기존 수치 그대로 만들어진다 (이 함수 안의 P ? A : B는 전부 P=false면 예전 값).
export function makeHumanoid3D(THREE, opts = {}) {
  const av = opts.avatar || null;
  const skin = opts.skin != null ? opts.skin : (av ? av.skin : 0xf2c9a0);
  const uniform = opts.uniform != null ? opts.uniform : (av ? av.uniform : 0x2b3a66);
  const hairCol = opts.hair != null ? opts.hair : (av ? av.hair : 0x1e2130);
  const accent = opts.accent != null ? opts.accent : (av ? av.accent : 0x4a6bd6);
  const fam = opts.weaponFam || 'sword';
  const grade = Math.min(5, Math.max(0, opts.grade || 0));
  const gradeCol = GRADES[grade].color;
  // bulk: 몸통 너비 배율 (탱커 동료 1.32, 근접 동료 0.85 등 — 실루엣 구분용)
  const bulk = opts.bulk || 1;
  let capeCol = opts.capeColor || null;
  if (!capeCol && opts.armorFam && ARMOR_KINDS[opts.armorFam]) capeCol = ARMOR_KINDS[opts.armorFam].cape;
  if (!capeCol) capeCol = accent;
  const trimCol = opts.trimColor || null; // 코스튬 장식색 (벨트·오라에 반영)
  const P = !!opts.polish; // 주인공·동료만: 초상화처럼 다듬은 비율·얼굴 (몬스터는 기존 그대로)
  const vis = opts.costumeId && COSTUME_VISUAL[opts.costumeId] ? COSTUME_VISUAL[opts.costumeId] : null;
  const outfitCol = vis ? vis.outfit : null;

  const skinM = mat(THREE, skin);
  const uniM = mat(THREE, uniform);
  const outfitM = outfitCol != null ? mat(THREE, outfitCol) : uniM; // 코스튬을 입으면 몸통은 코스튬 색
  const hairM = mat(THREE, hairCol);
  const pantsM = mat(THREE, av ? av.pants : 0x2c3242);
  const capeM = mat(THREE, capeCol);
  const gradeM = mat(THREE, gradeCol);
  const metalM = mat(THREE, 0xdfe7f2);
  const darkM = mat(THREE, 0x20242e);
  const M = { grade: gradeM, metal: metalM };

  const g = new THREE.Group();
  g.add(blobShadow(THREE, 0.42));

  // 다리 (고관절 y=0.55에서 회전) + 부츠
  const legGeo = new THREE.BoxGeometry(P ? 0.13 : 0.16, 0.5, 0.18);
  legGeo.translate(0, -0.25, 0);
  const bootGeo = new THREE.BoxGeometry(P ? 0.16 : 0.18, 0.1, 0.26);
  const legL = new THREE.Group(); legL.position.set(-0.11 * bulk, 0.55, 0);
  legL.add(new THREE.Mesh(legGeo, pantsM));
  const bootL = new THREE.Mesh(bootGeo, darkM); bootL.position.set(0, -0.5, 0.03); legL.add(bootL);
  g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11 * bulk, 0.55, 0);
  legR.add(new THREE.Mesh(legGeo, pantsM));
  const bootR = new THREE.Mesh(bootGeo, darkM); bootR.position.set(0, -0.5, 0.03); legR.add(bootR);
  g.add(legR);
  if (opts.robe || (av && av.skirt)) {
    const skirt = cone(THREE, 0.34 * bulk, 0.42, uniform, 8);
    skirt.position.y = 0.62; g.add(skirt);
  }
  if (vis && vis.robe) {
    // 코스튬 로브 (발끝까지 내려오는 긴 로브 — 치마보다 크고 길어서 치마를 가린다)
    const robe = cone(THREE, 0.38 * bulk, 0.62, outfitCol, 8);
    robe.userData.costumePiece = 'robe';
    robe.position.y = 0.55; g.add(robe);
  }

  // 몸통 그룹 (걷기 바운스·공격 돌진/기울기용, 자식은 절대 높이로 배치)
  const body = new THREE.Group(); body.userData.baseY = 0; g.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(P ? 0.46 : 0.52, P ? 0.58 : 0.55, P ? 0.26 : 0.3), outfitM);
  torso.scale.x = bulk;
  torso.position.y = 0.85; body.add(torso);
  if (P) {
    // 가슴→허리 테이퍼 (상체가 네모 상자가 아니라 몸처럼 보이게)
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.27), outfitM);
    chest.scale.x = bulk; chest.position.y = 1.06; body.add(chest);
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.24), outfitM);
    waist.scale.x = bulk; waist.position.y = 0.64; body.add(waist);
  }
  // 가슴 갑주 (금속 판) + 벨트 버클 + 망토 밑단
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.05), metalM);
  plate.scale.x = bulk;
  plate.position.set(0, 0.9, P ? 0.14 : 0.16); body.add(plate);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(P ? 0.48 : 0.54, 0.08, P ? 0.28 : 0.32), trimCol ? mat(THREE, trimCol) : gradeM);
  belt.scale.x = bulk;
  belt.position.y = 0.6; body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), metalM);
  buckle.position.set(0, 0.6, P ? 0.15 : 0.17); body.add(buckle);
  const cape = new THREE.Mesh(new THREE.BoxGeometry(P ? 0.44 : 0.46, 0.72, 0.05), capeM);
  cape.scale.x = bulk;
  cape.position.set(0, 0.82, -0.19); body.add(cape);
  const capeDark = mat(THREE, new THREE.Color(capeCol).multiplyScalar(0.7).getHex());
  const hem = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.06), capeDark);
  hem.scale.x = bulk;
  hem.position.set(0, 0.48, -0.19); body.add(hem);
  if (P) {
    // 망토 밑단 플레어 (뒤로 살짝 벌어져 망토가 흐르는 느낌)
    const flare = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.04), capeDark);
    flare.scale.x = bulk; flare.position.set(0, 0.42, -0.24); flare.rotation.x = 0.18; body.add(flare);
  }

  // 머리
  const head = new THREE.Group(); head.position.y = P ? 1.44 : 1.42; body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(P ? 0.28 : 0.3, 10, 8), skinM));
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(P ? 0.29 : 0.31, 10, 8), hairM);
  hairTop.scale.set(1, 0.72, 1); hairTop.position.set(0, 0.09, -0.04); head.add(hairTop);
  // 아바타별 헤어 실루엣 (3D가 초상화와 닮아 보이게 — hair3d가 없으면 hairStyle로 폴백)
  const hs = av ? (av.hair3d || av.hairStyle) : null;
  const backHair = () => {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.09), hairM);
    back.position.set(0, -0.22, -0.26); head.add(back);
  };
  if (hs === 'long' || hs === 'twin' || hs === 'bun') backHair();
  if (hs === 'messy' || hs === 'spiky') {
    const n = hs === 'spiky' ? 5 : 3;
    const w = hs === 'spiky' ? 0.09 : 0.07, h = hs === 'spiky' ? 0.22 : 0.16;
    for (let i = 0; i < n; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(w, h, 4), hairM);
      spike.position.set(-0.2 + i * (0.4 / (n - 1)), 0.32, 0);
      spike.rotation.z = (i - (n - 1) / 2) * 0.32; head.add(spike);
    }
  } else if (hs === 'fringe') {
    // 앞머리 (정돈된 짧은 머리)
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.1), hairM);
    fringe.position.set(0, 0.2, 0.24); head.add(fringe);
  } else if (hs === 'twin') {
    // 양갈래 (머리 양옆 뭉치 + 늘어지는 꼬리)
    for (const s of [-1, 1]) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(P ? 0.16 : 0.15, 8, 6), hairM);
      bun.position.set(0.34 * s, 0.02, -0.04); head.add(bun);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(P ? 0.1 : 0.09, P ? 0.42 : 0.34, 6), hairM);
      tail.position.set(0.36 * s, -0.26, -0.06); tail.rotation.z = s * 0.25; head.add(tail);
    }
  } else if (hs === 'bun') {
    // 정수리 똥머리 + 긴 뒷머리
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), hairM);
    bun.position.set(0, 0.38, -0.02); head.add(bun);
  }
  if (av && av.ribbon) {
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), mat(THREE, av.ribbon));
    rb.position.set(0, 0.12, -0.3); head.add(rb);
  }
  if (P) {
    // 초상화처럼 다듬은 머리 디테일 (기존 실루엣 위에 덧댄다)
    if (hs === 'fringe') {
      // 앞머리 겹층 (이마 위로 흘러내리는 두 번째 층)
      const layer = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.08), hairM);
      layer.position.set(0, 0.15, 0.26); layer.rotation.x = -0.15; head.add(layer);
    } else if (hs === 'twin') {
      // 양갈래 리본 (뭉치마다 작은 리본)
      for (const s of [-1, 1]) {
        const bow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), mat(THREE, av.ribbon || 0xc03050));
        bow.position.set(0.34 * s, 0.16, -0.02); bow.rotation.z = s * 0.4; head.add(bow);
      }
    } else if (hs === 'bun') {
      // 똥머리 리본
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), mat(THREE, av.ribbon || 0x8a6ad0));
      bow.position.set(0, 0.28, -0.16); head.add(bow);
    }
    if (hs === 'spiky' || hs === 'messy') {
      // 앞머리 뾰족 가닥 2개
      for (const s of [-1, 1]) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), hairM);
        sp.position.set(0.16 * s, 0.3, 0.14); sp.rotation.x = 0.5; sp.rotation.z = -s * 0.25; head.add(sp);
      }
    }
    if (hs === 'long' || hs === 'bun' || hs === 'spiky') {
      // 옆으로 흘러내리는 머리결 (기존 fringe/messy 옆머리와 같은 결)
      for (const s of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.07), hairM);
        lock.position.set(0.26 * s, -0.1, 0.06); head.add(lock);
      }
    }
  }
  const irisM = mat(THREE, av ? av.iris : 0x3d6fd6);
  if (P) {
    // 초상화 같은 큰 눈: 흰자 + 홍채 + 하이라이트 3겹
    const whiteM = mat(THREE, 0xffffff);
    const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const s of [-1, 1]) {
      const sc = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), whiteM);
      sc.scale.set(1, 1.25, 0.45); sc.position.set(0.11 * s, 0.02, 0.24); head.add(sc);
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), irisM);
      ir.scale.set(1, 1.25, 0.5); ir.position.set(0.11 * s, 0.02, 0.26); head.add(ir);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), hlM);
      hl.position.set(0.11 * s - 0.02, 0.06, 0.285); head.add(hl);
    }
  } else {
    const eyeGeo = new THREE.SphereGeometry(0.04, 6, 5);
    const eyeL = new THREE.Mesh(eyeGeo, irisM); eyeL.position.set(-0.11, 0.02, 0.26); head.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, irisM); eyeR.position.set(0.11, 0.02, 0.26); head.add(eyeR);
  }
  if (av) {
    // 눈썹 (머리색) — 얼굴 인상 구분 (다듬으면 안쪽이 살짝 올라간 초상화 눈썹)
    const browGeo = new THREE.BoxGeometry(P ? 0.09 : 0.1, P ? 0.02 : 0.025, 0.02);
    const browL = new THREE.Mesh(browGeo, hairM); browL.position.set(-0.11, 0.13, 0.27); if (P) browL.rotation.z = 0.15; head.add(browL);
    const browR = new THREE.Mesh(browGeo, hairM); browR.position.set(0.11, 0.13, 0.27); if (P) browR.rotation.z = -0.15; head.add(browR);
  }
  // 코·입 (얼굴이 밋밋하다는 피드백 반영)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), skinM);
  nose.position.set(0, -0.03, 0.29); head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(P ? 0.11 : 0.1, 0.02, 0.02), mat(THREE, 0x8a4a3a));
  mouth.position.set(0, -0.14, 0.28); head.add(mouth);
  if (P) {
    // 볼터치 (초상화의 볼 홍조)
    const blushM = mat(THREE, 0xff9aa8);
    for (const s of [-1, 1]) {
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), blushM);
      bl.scale.set(1, 0.7, 0.3); bl.position.set(0.17 * s, -0.08, 0.22); head.add(bl);
    }
  }
  // 옆머리 (앞머리·산발 스타일은 옆으로 흘러내리는 머리결 추가)
  if (hs === 'fringe' || hs === 'messy') {
    for (const s of [-1, 1]) {
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.08), hairM);
      lock.position.set(0.27 * s, -0.08, 0.08); head.add(lock);
    }
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), hairM);
    tuft.position.set(0.08, 0.38, 0.02); tuft.rotation.z = -0.3; head.add(tuft);
  }

  // 팔 (어깨 y=1.08에서 회전)
  const armGeo = new THREE.BoxGeometry(P ? 0.12 : 0.14, 0.5, P ? 0.14 : 0.16);
  armGeo.translate(0, -0.22, 0);
  const armR = new THREE.Group(); armR.position.set((P ? 0.3 : 0.33) * bulk, 1.08, 0);
  armR.add(new THREE.Mesh(armGeo, outfitM));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skinM);
  handR.position.set(0, -0.48, 0); armR.add(handR); body.add(armR);
  const armL = new THREE.Group(); armL.position.set(-(P ? 0.3 : 0.33) * bulk, 1.08, 0);
  armL.add(new THREE.Mesh(armGeo, outfitM));
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skinM);
  handL.position.set(0, -0.48, 0); armL.add(handL); body.add(armL);
  // 어깨 갑주 (양쪽)
  for (const s of [-1, 1]) {
    const paul = new THREE.Mesh(new THREE.SphereGeometry(P ? 0.11 : 0.13, 8, 6), metalM);
    paul.scale.set(1, 0.6, 1);
    paul.position.set((P ? 0.33 : 0.36) * bulk * s, 1.14, 0);
    if (P) paul.rotation.z = -s * 0.2;
    body.add(paul);
  }

  // 무기 (오른손)
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0, -0.48, 0.04);
  armR.add(weaponGroup);
  const weapon = buildWeaponMesh(THREE, fam, M);
  weaponGroup.add(weapon);
  if (P) weaponGroup.scale.setScalar(1.12); // 무기가 더 또렷하게 보이게

  // 코스튬 고유 장식 (입으면 바로 보인다 — 망토/벨트 색만 바꾸던 예전 방식과 달리 머리·몸통에 실제 파츠가 붙는다)
  if (vis) addCostumePieces(THREE, { head, body }, vis, { cape: capeCol, trim: trimCol, outfit: outfitCol });

  // 등급 오라 (희귀 이상)
  if (grade >= 2) {
    const aura = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 24),
      new THREE.MeshBasicMaterial({ color: trimCol || gradeCol, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.02; g.add(aura);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (opts.scale) g.scale.setScalar(opts.scale);
  g.userData = {
    avatar: av, height: 1.9, headY: 1.6, radius: 0.42,
    armR, armL, legL, legR, body, head, weapon, weaponGroup,
    isHeroSprite: false,
  };
  return g;
}

// ---------- 캐릭터 ----------
// 3D 로우폴리 휴머노이드. 장착 무기·방어구가 외형에 반영된다.
export function makePlayer(THREE, family = 'sword', av = null, equip = null, appearance = null) {
  const A = av || AVATAR_MAP.boyA;
  const eq = visualEquip(equip, appearance);
  const weapon = eq && eq.weapon ? eq.weapon : (family && family !== 'slash' ? { fam: family, grade: 0 } : { fam: 'sword', grade: 0 });
  const armor = eq && eq.armor ? eq.armor : null;
  return makeHumanoid3D(THREE, {
    avatar: A, weaponFam: weapon.fam, grade: weapon.grade || 0,
    armorFam: armor ? armor.fam : null, capeColor: armor && armor.capeColor ? armor.capeColor : null,
    trimColor: armor && armor.trimColor ? armor.trimColor : null,
    polish: true, costumeId: armor && armor.costume ? armor.costume : null,
  });
}
// ---------- 몬스터 3D ----------
// 빌보드 스프라이트 대신 로우폴리 3D 모델 (주인공 휴머노이드와 같은 덩어리 스타일).
// 지오메트리는 도형별로 공유(캐시)하고, 재질은 인형마다 새로 만든다
// (피격 플래시·색상 틴트가 인형별로 동작해야 하기 때문).
const MONSTER_H = {
  slime: 0.92, goblin: 1.14, orc: 1.4, frog: 1.12, lizard: 1.42, scarab: 1.02, crab: 1.2,
  scorpion: 1.24, mummy: 1.52, merfolk: 1.5, siren: 1.52, naga: 1.86, wraith: 1.62,
  witch: 1.78, golem: 2.2, ent: 2.4, ogre: 2.15, anubis: 2.05, hydra: 2.0, kraken: 2.6,
  dragon: 2.6, mushroom: 1.9, barbarian: 2.0, skeleton: 1.5,
};

export function makeMonster3D(THREE, def) {
  const color = def.color != null ? def.color : 0x888888;
  const dark = def.dark != null ? def.dark : 0x444444;
  const shape = def.shape || 'goblin';
  const bossMul = def.boss === 'field' ? 1.22 : def.boss === 'boss' ? 1.12 : def.boss === 'mid' ? 1.05 : def.elite ? 1.06 : 1;
  const bounce = ['slime', 'frog', 'scarab', 'goblin', 'mushroom'].includes(shape);
  const float = ['wraith', 'witch', 'siren', 'kraken', 'dragon'].includes(shape);
  const baseY = float ? 0.2 : 0;
  const tintMats = [];
  const tm = (c) => { const m = mat(THREE, c); m.userData.base = new THREE.Color(c); tintMats.push(m); return m; };
  const bm = (c) => new THREE.MeshBasicMaterial({ color: c });
  const pBox = (w, h, d, m) => new THREE.Mesh(gBox(THREE, w, h, d), m);
  const pSph = (r, m, w = 8, h = 6) => new THREE.Mesh(gSphere(THREE, r, w, h), m);
  const pCon = (r, h, m, s = 6) => new THREE.Mesh(gCone(THREE, r, h, s), m);
  const pCyl = (rt, rb, h, m, s = 6) => new THREE.Mesh(gCyl(THREE, rt, rb, h, s), m);
  const bodyM = tm(color);
  const darkM = tm(dark);
  const eyeM = bm(0x1a1a22);

  let g = new THREE.Group();
  let body = new THREE.Group();
  g.add(body);
  g.add(blobShadow(THREE, 0.42));
  let legL = null, legR = null, armL = null, armR = null, wingL = null, wingR = null, heads = null;
  let top = MONSTER_H[shape] || 1.28;
  let radius = 0.45;
  const put = (mesh, x, y, z, parent) => { mesh.position.set(x, y, z); (parent || body).add(mesh); return mesh; };
  const eyes = (y, xOff, z, r = 0.05) => {
    put(pSph(r, eyeM, 6, 5), -xOff, y, z);
    put(pSph(r, eyeM, 6, 5), xOff, y, z);
  };

  // ---- 휴머노이드형 (makeHumanoid3D 변형 + 도형별 특징) ----
  const HUM = {
    goblin: { scale: 0.6, weaponFam: 'dagger', bulk: 0.9 },
    orc: { scale: 0.75, weaponFam: 'mace', bulk: 1.2 },
    lizard: { scale: 0.75, weaponFam: 'sword', bulk: 0.95 },
    mummy: { scale: 0.8, weaponFam: 'staff', bulk: 0.95 },
    siren: { scale: 0.8, weaponFam: 'staff', bulk: 0.9, longHair: true, robe: true },
    merfolk: { scale: 0.8, weaponFam: 'sword', bulk: 0.9, noLegs: true, tail: 'fish' },
    naga: { scale: 1.0, weaponFam: 'sword', bulk: 0.95, noLegs: true, tail: 'snake' },
    witch: { scale: 0.95, weaponFam: 'staff', bulk: 0.9, longHair: true, robe: true, hat: true },
    anubis: { scale: 1.08, weaponFam: 'sword', bulk: 1.05 },
    barbarian: { scale: 1.05, weaponFam: def.weapon || 'axe', bulk: 1.2 },
    ogre: { scale: 1.13, weaponFam: 'mace', bulk: 1.25 },
    skeleton: { scale: 0.8, weaponFam: 'sword', bulk: 0.9 },
  };
  if (HUM[shape]) {
    const cfg = HUM[shape];
    const av = (cfg.longHair || cfg.robe)
      ? { skin: color, uniform: dark, hair: dark, pants: dark, hairStyle: 'long', skirt: !!cfg.robe, ribbon: 0, iris: shape === 'skeleton' ? 0x9fe8ff : shape === 'mummy' ? 0x1a1a22 : 0xffffff }
      : null;
    const hg = makeHumanoid3D(THREE, {
      avatar: av, skin: color, uniform: dark, hair: dark, accent: color,
      weaponFam: cfg.weaponFam, grade: 0, scale: cfg.scale * bossMul, bulk: cfg.bulk, robe: !!cfg.robe,
    });
    const head = hg.userData.head;
    const hM = mat(THREE, dark);
    if (shape === 'goblin') {
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(gCone(THREE, 0.09, 0.22, 4), hM);
        ear.position.set(0.32 * s, 0.12, 0); ear.rotation.z = s * -1.1; head.add(ear);
      }
      const nose = new THREE.Mesh(gCone(THREE, 0.05, 0.12, 4), hM);
      nose.position.set(0, -0.05, 0.32); nose.rotation.x = Math.PI / 2; head.add(nose);
      const teeth = new THREE.Mesh(gBox(THREE, 0.14, 0.04, 0.02), mat(THREE, 0xffffff));
      teeth.position.set(0, -0.2, 0.28); head.add(teeth);
    } else if (shape === 'orc') {
      for (const s of [-1, 1]) {
        const tusk = new THREE.Mesh(gCone(THREE, 0.035, 0.12, 4), mat(THREE, 0xf2ead0));
        tusk.position.set(0.09 * s, -0.22, 0.26); head.add(tusk);
      }
      const brow = new THREE.Mesh(gBox(THREE, 0.34, 0.05, 0.04), hM);
      brow.position.set(0, 0.1, 0.27); head.add(brow);
      const jaw = new THREE.Mesh(gBox(THREE, 0.2, 0.05, 0.03), mat(THREE, 0xf2ead0));
      jaw.position.set(0, -0.24, 0.27); head.add(jaw);
    } else if (shape === 'lizard') {
      const tail = new THREE.Mesh(gCone(THREE, 0.12, 0.7, 6), darkM);
      tail.position.set(0, 0.5, -0.4); tail.rotation.x = 1.9; hg.add(tail);
      for (let i = 0; i < 3; i++) { // 등 가시
        const sp = new THREE.Mesh(gCone(THREE, 0.06, 0.18, 4), darkM);
        sp.position.set(0, 0.78 + i * 0.22, -0.2); sp.rotation.x = -0.5; hg.add(sp);
      }
    } else if (shape === 'mummy') {
      for (const s of [-1, 1]) {
        const ge = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), bm(0xffc93c));
        ge.position.set(0.11 * s, 0.02, 0.27); head.add(ge);
      }
      // 붕대 띠 (몸통 대각선 + 머리)
      const bandM = mat(THREE, 0xf2ead0);
      for (const [y, rz] of [[0.75, 0.5], [1.0, -0.4]]) {
        const band = new THREE.Mesh(gBox(THREE, 0.56, 0.07, 0.34), bandM);
        band.position.set(0, y, 0); band.rotation.z = rz; hg.userData.body.add(band);
      }
      const hband = new THREE.Mesh(gBox(THREE, 0.5, 0.07, 0.5), bandM);
      hband.position.set(0, 0.18, 0); head.add(hband);
    } else if (shape === 'witch') {
      const hat = new THREE.Mesh(gCone(THREE, 0.3, 0.55, 8), hM);
      hat.position.set(0, 0.42, -0.02); head.add(hat);
      const brim = new THREE.Mesh(gCyl(THREE, 0.42, 0.42, 0.04, 12), hM);
      brim.position.set(0, 0.16, 0); head.add(brim);
      const wart = new THREE.Mesh(gSphere(THREE, 0.04, 6, 5), mat(THREE, 0x6a8a3a));
      wart.position.set(0.05, -0.05, 0.3); head.add(wart);
      const bottle = new THREE.Mesh(gCyl(THREE, 0.05, 0.05, 0.14, 6), tm(0x7fd06a));
      bottle.position.set(0.24, 0.62, 0.16); hg.userData.body.add(bottle);
    } else if (shape === 'anubis') {
      const snout = new THREE.Mesh(gBox(THREE, 0.22, 0.16, 0.3), hM);
      snout.position.set(0, -0.06, 0.3); head.add(snout);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(gCone(THREE, 0.09, 0.34, 4), hM);
        ear.position.set(0.14 * s, 0.36, 0); head.add(ear);
      }
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 14), mat(THREE, 0xd8a93c));
      collar.rotation.x = Math.PI / 2; collar.position.set(0, 1.22, 0); hg.add(collar);
      for (const s of [-1, 1]) { // 눈가 줄무늬
        const stripe = new THREE.Mesh(gBox(THREE, 0.05, 0.14, 0.02), hM);
        stripe.position.set(0.17 * s, 0.02, 0.26); stripe.rotation.z = s * 0.4; head.add(stripe);
      }
    } else if (shape === 'barbarian') {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(gCone(THREE, 0.07, 0.26, 4), mat(THREE, 0xf2ead0));
        horn.position.set(0.3 * s, 0.22, 0); horn.rotation.z = s * -0.9; head.add(horn);
      }
      // 모피 허리띠 + 등 모피
      const furM = mat(THREE, 0xd8c9a8);
      const furBelt = new THREE.Mesh(gBox(THREE, 0.56, 0.1, 0.34), furM);
      furBelt.position.set(0, 0.62, 0); hg.userData.body.add(furBelt);
      const furBack = new THREE.Mesh(gBox(THREE, 0.4, 0.5, 0.05), furM);
      furBack.position.set(0, 0.85, -0.22); hg.userData.body.add(furBack);
    } else if (shape === 'siren') {
      const pin = new THREE.Mesh(gSphere(THREE, 0.07, 6, 5), mat(THREE, 0xffffff));
      pin.position.set(0.3, 0.14, 0.05); head.add(pin);
      const shell = new THREE.Mesh(gSphere(THREE, 0.09, 6, 5), mat(THREE, 0xf2d8e8));
      shell.position.set(0, 1.0, 0.18); hg.userData.body.add(shell);
    } else if (shape === 'merfolk') {
      for (let i = 0; i < 3; i++) { // 꼬리 지느러미 능선
        const fin = new THREE.Mesh(gCone(THREE, 0.06, 0.2, 4), darkM);
        fin.position.set(0, 0.55 - i * 0.18, -0.28); fin.rotation.x = -0.7; hg.add(fin);
      }
      const shell = new THREE.Mesh(gSphere(THREE, 0.09, 6, 5), mat(THREE, 0xf2d8e8));
      shell.position.set(0, 1.0, 0.18); hg.userData.body.add(shell);
    } else if (shape === 'naga') {
      for (const s of [-1, 1]) { // 코브라 후드
        const hood = new THREE.Mesh(gCone(THREE, 0.16, 0.4, 4), darkM);
        hood.position.set(0.2 * s, 0.08, -0.18); hood.rotation.z = s * 0.5; head.add(hood);
      }
      const tongue = new THREE.Mesh(gBox(THREE, 0.04, 0.02, 0.14), mat(THREE, 0xd84a5a));
      tongue.position.set(0, -0.18, 0.32); head.add(tongue);
    } else if (shape === 'skeleton') {
      for (let i = 0; i < 3; i++) { // 갈비뼈
        const rib = new THREE.Mesh(gBox(THREE, 0.4, 0.05, 0.02), mat(THREE, 0xf2f2f2));
        rib.position.set(0, 0.78 + i * 0.14, 0.17); hg.userData.body.add(rib);
      }
    }
    if (cfg.noLegs) {
      hg.remove(hg.userData.legL); hg.remove(hg.userData.legR);
      if (cfg.tail === 'fish') {
        const tail = new THREE.Mesh(gCone(THREE, 0.34, 0.9, 6), tm(color));
        tail.position.set(0, 0.35, -0.05); tail.rotation.x = Math.PI; hg.add(tail);
        const fin = new THREE.Mesh(gBox(THREE, 0.5, 0.08, 0.3), tm(dark));
        fin.position.set(0, 0.05, -0.15); hg.add(fin);
      } else {
        const s1 = new THREE.Mesh(gSphere(THREE, 0.34, 8, 6), tm(dark)); s1.position.set(0, 0.32, 0); hg.add(s1);
        const s2 = new THREE.Mesh(gSphere(THREE, 0.26, 8, 6), tm(dark)); s2.position.set(0, 0.14, -0.08); hg.add(s2);
        const tip = new THREE.Mesh(gCone(THREE, 0.16, 0.5, 6), tm(dark)); tip.position.set(0, 0.1, -0.3); tip.rotation.x = 1.4; hg.add(tip);
      }
    }
    hg.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshLambertMaterial) {
        if (!o.material.userData.base) o.material.userData.base = new THREE.Color(o.material.color.getHex());
        if (!tintMats.includes(o.material)) tintMats.push(o.material);
      }
    });
    g = hg;
    body = hg.userData.body; legL = hg.userData.legL; legR = hg.userData.legR;
    armL = hg.userData.armL; armR = hg.userData.armR;
    if (cfg.noLegs) { legL = null; legR = null; }
    top = 1.72 * cfg.scale * bossMul;
    radius = 0.42 * cfg.scale * bossMul;
    return finish({ scaled: true });
  }

  // ---- 비휴머노이드형 ----
  if (shape === 'slime') {
    // 통통한 키세스 물방울 (둥근 몸통 + 뾰족한 꼭지)
    const blob = pSph(0.5, bodyM); blob.scale.set(1, 0.72, 1); put(blob, 0, 0.36, 0);
    put(pCon(0.26, 0.32, bodyM), 0, 0.8, 0);
    eyes(0.45, 0.18, 0.42, 0.06);
    put(pBox(0.16, 0.03, 0.02, darkM), 0, 0.32, 0.48); // 입
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    shine.scale.set(1, 0.6, 0.6); put(shine, -0.2, 0.6, 0.32); // 광택
    top = 0.96; radius = 0.5;
  } else if (shape === 'frog') {
    const b = pSph(0.6, bodyM); b.scale.set(1, 0.62, 1.1); put(b, 0, 0.34, 0);
    put(pSph(0.2, bodyM), -0.22, 0.72, 0.3);
    put(pSph(0.2, bodyM), 0.22, 0.72, 0.3);
    put(pSph(0.08, eyeM, 6, 5), -0.22, 0.74, 0.46);
    put(pSph(0.08, eyeM, 6, 5), 0.22, 0.74, 0.46);
    put(pSph(0.28, tm(0xd8f0a8)), 0, 0.22, 0.42); // 목주머니
    for (const [sx, sz] of [[-0.25, -0.15], [0.2, -0.3], [0.05, 0.1]]) {
      put(pSph(0.07, darkM, 6, 5), sx, 0.62, sz); // 등 반점
    }
    put(pBox(0.3, 0.12, 0.42, darkM), -0.48, 0.08, 0.1);
    put(pBox(0.3, 0.12, 0.42, darkM), 0.48, 0.08, 0.1);
    top = 0.95; radius = 0.6;
  } else if (shape === 'scarab') {
    const dome = pSph(0.5, bodyM); dome.scale.set(1, 0.6, 1.25); put(dome, 0, 0.3, 0);
    put(pSph(0.2, darkM), 0, 0.32, 0.55);
    const horn = pCon(0.08, 0.25, darkM); horn.position.set(0, 0.5, 0.62); horn.rotation.x = 0.7; body.add(horn);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      put(pBox(0.08, 0.08, 0.25, darkM), 0.5 * s, 0.1, -0.2 + i * 0.25);
    }
    for (const s of [-1, 1]) { // 날개집 (등딱지)
      const wing = pBox(0.34, 0.1, 0.7, darkM); put(wing, 0.2 * s, 0.52, -0.1);
    }
    put(pBox(0.03, 0.08, 0.7, tm(0x2a4a6a)), 0, 0.54, -0.1); // 날개집 가운데 선
    put(pSph(0.07, tm(0xffd257), 6, 5), 0, 0.48, 0.6); // 머리 보석
    top = 0.7; radius = 0.55;
  } else if (shape === 'crab') {
    put(pBox(1.15, 0.32, 0.7, bodyM), 0, 0.32, 0);
    for (const s of [-1, 1]) {
      put(pSph(0.22, darkM), 0.72 * s, 0.35, 0.15);
      const claw = pCon(0.12, 0.28, darkM); claw.position.set(0.72 * s, 0.35, 0.4); claw.rotation.x = Math.PI / 2; body.add(claw);
      const stalk = pCyl(0.03, 0.03, 0.3, darkM, 5); put(stalk, 0.18 * s, 0.62, 0.25);
      put(pSph(0.08, eyeM, 6, 5), 0.18 * s, 0.78, 0.25);
      for (let i = 0; i < 3; i++) put(pBox(0.06, 0.06, 0.3, darkM), 0.6 * s, 0.12, -0.15 + i * 0.2);
    }
    for (let i = 0; i < 3; i++) { // 등껍질 가시
      const sp = pCon(0.06, 0.16, darkM); sp.position.set(-0.3 + i * 0.3, 0.52, -0.05); body.add(sp);
    }
    put(pBox(0.2, 0.04, 0.03, darkM), 0, 0.28, 0.36); // 입
    top = 0.9; radius = 0.65;
  } else if (shape === 'scorpion') {
    put(pBox(0.55, 0.3, 0.5, bodyM), 0, 0.3, 0.25);
    put(pBox(0.5, 0.28, 0.5, bodyM), 0, 0.28, -0.35);
    const t1 = pSph(0.13, darkM); put(t1, 0, 0.45, -0.6);
    const t2 = pSph(0.13, darkM); put(t2, 0, 0.65, -0.8);
    const t3 = pSph(0.13, darkM); put(t3, 0, 0.85, -0.95);
    const sting = pCon(0.09, 0.28, darkM); sting.position.set(0, 1.0, -1.0); sting.rotation.x = -0.5; body.add(sting);
    for (const s of [-1, 1]) {
      put(pSph(0.18, darkM), 0.45 * s, 0.3, 0.5);
      // 집게발 (두 갈래)
      const p1 = pCon(0.06, 0.22, darkM); p1.position.set(0.45 * s, 0.34, 0.68); p1.rotation.x = Math.PI / 2; p1.rotation.z = s * 0.3; body.add(p1);
      const p2 = pCon(0.06, 0.22, darkM); p2.position.set(0.45 * s, 0.26, 0.68); p2.rotation.x = Math.PI / 2; p2.rotation.z = s * -0.3; body.add(p2);
      for (let i = 0; i < 3; i++) put(pBox(0.06, 0.06, 0.28, darkM), 0.32 * s, 0.12, -0.3 + i * 0.25);
    }
    put(pBox(0.4, 0.08, 0.4, darkM), 0, 0.48, -0.1); // 등판
    eyes(0.38, 0.14, 0.5, 0.045);
    top = 1.05; radius = 0.6;
  } else if (shape === 'golem') {
    legL = new THREE.Group(); legL.position.set(-0.24, 0.55, 0); body.add(legL);
    put(pBox(0.3, 0.55, 0.35, darkM), 0, -0.27, 0, legL);
    legR = new THREE.Group(); legR.position.set(0.24, 0.55, 0); body.add(legR);
    put(pBox(0.3, 0.55, 0.35, darkM), 0, -0.27, 0, legR);
    put(pBox(1.0, 1.1, 0.65, bodyM), 0, 1.15, 0);
    put(pBox(0.45, 0.4, 0.4, darkM), 0, 1.95, 0);
    armL = new THREE.Group(); armL.position.set(-0.64, 1.5, 0); body.add(armL);
    put(pBox(0.28, 0.9, 0.3, bodyM), 0, -0.4, 0, armL);
    armR = new THREE.Group(); armR.position.set(0.64, 1.5, 0); body.add(armR);
    put(pBox(0.28, 0.9, 0.3, bodyM), 0, -0.4, 0, armR);
    put(pSph(0.25, darkM), -0.6, 1.62, 0);
    put(pSph(0.25, darkM), 0.6, 1.62, 0);
    for (const s of [-1, 1]) put(pSph(0.06, bm(0xffc93c), 6, 5), 0.11 * s, 1.95, 0.21);
    // 바위 금 + 이끼 + 가슴 속 빛나는 핵
    for (const [cy, rz] of [[1.0, 0.6], [1.35, -0.5], [0.85, 1.2]]) {
      const crack = pBox(0.03, 0.3, 0.02, darkM); crack.position.set(0.15, cy, 0.34); crack.rotation.z = rz; body.add(crack);
    }
    put(pSph(0.09, tm(0x5a8a3a), 6, 5), -0.55, 1.7, 0.1);
    put(pSph(0.07, tm(0x5a8a3a), 6, 5), 0.5, 1.68, 0.12);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
    core.position.set(0, 1.2, 0.32); body.add(core);
    top = 2.15; radius = 0.6;
  } else if (shape === 'ent') {
    put(pCyl(0.32, 0.42, 1.5, bodyM, 8), 0, 0.75, 0);
    const brL = pCyl(0.08, 0.12, 0.9, darkM, 6); brL.position.set(-0.5, 1.5, 0); brL.rotation.z = 0.6; body.add(brL);
    const brR = pCyl(0.08, 0.12, 0.9, darkM, 6); brR.position.set(0.5, 1.5, 0); brR.rotation.z = -0.6; body.add(brR);
    for (const s of [-1, 1]) { // 가지 끝 잔가지 손가락
      const twig = pCyl(0.03, 0.05, 0.35, darkM, 5);
      twig.position.set(0.78 * s, 1.95, 0); twig.rotation.z = s * 0.9; body.add(twig);
    }
    put(pSph(0.5, darkM), 0, 1.95, 0);
    put(pSph(0.42, darkM), -0.38, 1.75, 0.1);
    put(pSph(0.38, darkM), 0.38, 1.78, -0.05);
    put(pSph(0.3, darkM), 0.1, 2.15, -0.15); // 잎 더미 추가
    put(pSph(0.26, tm(0x7fc46a), 6, 5), -0.3, 2.05, 0.15);
    eyes(1.2, 0.12, 0.36, 0.05);
    put(pBox(0.16, 0.04, 0.03, darkM), 0, 1.05, 0.36); // 입
    top = 2.45; radius = 0.55;
  } else if (shape === 'hydra') {
    const bd = pSph(0.85, bodyM); bd.scale.set(1, 0.75, 1.1); put(bd, 0, 0.65, 0);
    heads = [];
    for (let i = -1; i <= 1; i++) {
      const neck = new THREE.Group(); neck.position.set(0.38 * i, 1.25, 0.1); neck.rotation.z = -0.25 * i; body.add(neck);
      put(pCyl(0.14, 0.2, 0.8, darkM, 6), 0, 0.35, 0, neck);
      const hd = new THREE.Group(); hd.position.set(0, 0.8, 0); neck.add(hd);
      const skull = pSph(0.3, bodyM); hd.add(skull);
      const jaw = pCon(0.12, 0.3, darkM, 4); jaw.position.set(0, -0.12, 0.28); jaw.rotation.x = Math.PI / 2; hd.add(jaw);
      const horn = pCon(0.06, 0.2, darkM, 4); horn.position.set(0, 0.3, -0.05); horn.rotation.x = -0.4; hd.add(horn);
      const teeth = pBox(0.16, 0.04, 0.02, tm(0xffffff)); teeth.position.set(0, -0.06, 0.32); hd.add(teeth);
      const e1 = pSph(0.05, eyeM, 6, 5); e1.position.set(-0.11, 0.05, 0.26); hd.add(e1);
      const e2 = pSph(0.05, eyeM, 6, 5); e2.position.set(0.11, 0.05, 0.26); hd.add(e2);
      heads.push(hd);
    }
    for (let i = 0; i < 3; i++) { // 등 지느러미 능선
      const fin = pCon(0.08, 0.22, darkM, 4); fin.position.set(0, 1.25, -0.3 - i * 0.3); body.add(fin);
    }
    const tail = pCon(0.2, 0.9, darkM); tail.position.set(0, 0.5, -0.95); tail.rotation.x = -1.9; body.add(tail);
    top = 2.15; radius = 0.9;
  } else if (shape === 'kraken') {
    const dome = pSph(1.0, bodyM); dome.scale.set(1, 0.85, 1); put(dome, 0, 1.1, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tent = pCon(0.16, 1.0, darkM); tent.position.set(Math.cos(a) * 0.7, 0.55, Math.sin(a) * 0.7);
      tent.rotation.z = Math.cos(a) * 0.35; tent.rotation.x = -Math.sin(a) * 0.35; body.add(tent);
      put(pSph(0.05, tm(0xf2f2f2), 6, 5), Math.cos(a) * 0.78, 0.3, Math.sin(a) * 0.78); // 빨판
    }
    for (const s of [-1, 1]) {
      const up = pCon(0.18, 1.1, darkM); up.position.set(0.85 * s, 1.6, 0); up.rotation.z = s * -0.7; body.add(up);
    }
    const beak = pCon(0.14, 0.3, darkM, 4); beak.position.set(0, 0.72, 0.92); beak.rotation.x = Math.PI / 2; body.add(beak);
    put(pSph(0.14, eyeM, 6, 5), -0.3, 1.3, 0.82);
    put(pSph(0.14, eyeM, 6, 5), 0.3, 1.3, 0.82);
    top = 2.1; radius = 1.0;
  } else if (shape === 'dragon') {
    const bd = pSph(0.6, bodyM); bd.scale.set(1.4, 0.9, 0.9); put(bd, 0, 1.1, 0);
    const neck = pCyl(0.16, 0.24, 0.8, darkM, 6); neck.position.set(0, 1.6, 0.55); neck.rotation.x = 0.5; body.add(neck);
    put(pBox(0.4, 0.3, 0.55, darkM), 0, 2.0, 0.85);
    put(pBox(0.22, 0.16, 0.3, darkM), 0, 1.94, 1.18);
    for (const s of [-1, 1]) {
      const horn = pCon(0.07, 0.3, tm(0xf2ead0)); horn.position.set(0.14 * s, 2.2, 0.7); horn.rotation.x = -0.5; body.add(horn);
      const e = pSph(0.05, eyeM, 6, 5); e.position.set(0.12 * s, 2.04, 1.08); body.add(e);
    }
    for (let i = 0; i < 4; i++) { // 등 가시
      const sp = pCon(0.07, 0.24, darkM, 4); sp.position.set(0, 1.72 - i * 0.06, 0.2 - i * 0.32); sp.rotation.x = -0.3; body.add(sp);
    }
    for (let i = 0; i < 3; i++) { // 배 비늘
      put(pBox(0.5, 0.12, 0.3, tm(0xd8c9a8)), 0, 0.62, 0.5 - i * 0.32);
    }
    wingL = new THREE.Group(); wingL.position.set(-0.35, 1.55, -0.1); body.add(wingL);
    const wl = pBox(1.25, 0.05, 0.65, darkM); wl.position.set(-0.65, 0, 0); wingL.add(wl);
    wingR = new THREE.Group(); wingR.position.set(0.35, 1.55, -0.1); body.add(wingR);
    const wr = pBox(1.25, 0.05, 0.65, darkM); wr.position.set(0.65, 0, 0); wingR.add(wr);
    const tl1 = pCon(0.2, 0.7, darkM); tl1.position.set(0, 1.0, -0.8); tl1.rotation.x = -1.9; body.add(tl1);
    const tl2 = pCon(0.12, 0.6, darkM); tl2.position.set(0, 1.0, -1.3); tl2.rotation.x = -1.9; body.add(tl2);
    const tsp = pCon(0.06, 0.2, darkM, 4); tsp.position.set(0, 1.15, -1.55); tsp.rotation.x = -0.6; body.add(tsp);
    put(pBox(0.22, 0.4, 0.25, darkM), -0.3, 0.5, 0.1);
    put(pBox(0.22, 0.4, 0.25, darkM), 0.3, 0.5, 0.1);
    top = 2.35; radius = 0.9;
  } else if (shape === 'mushroom') {
    const stemM = tm(0xf2ead0);
    put(pCyl(0.28, 0.34, 1.0, stemM, 8), 0, 0.5, 0);
    const cap = pSph(0.95, bodyM); cap.scale.set(1, 0.55, 1); put(cap, 0, 1.15, 0);
    for (const [sx, sy, sz] of [[-0.4, 1.5, 0.5], [0.35, 1.55, 0.45], [0, 1.62, -0.3], [0.5, 1.35, -0.4]]) {
      put(pSph(0.12, tm(0xffffff)), sx, sy, sz);
    }
    put(pSph(0.09, tm(0xffffff)), -0.55, 1.3, 0.3);
    put(pSph(0.09, tm(0xffffff)), 0.15, 1.66, 0.35);
    const sprout = pCon(0.06, 0.22, tm(0x7fc46a), 4); sprout.position.set(0.2, 1.78, -0.1); body.add(sprout);
    eyes(0.45, 0.12, 0.3, 0.05);
    put(pBox(0.14, 0.03, 0.02, darkM), 0, 0.32, 0.32); // 입
    top = 1.7; radius = 0.7;
  } else if (shape === 'wraith') {
    put(pCon(0.55, 1.35, bodyM, 8), 0, 0.68, 0);
    put(pSph(0.3, darkM), 0, 1.45, 0);
    const hoodPt = pCon(0.16, 0.3, darkM, 6); hoodPt.position.set(0, 1.78, 0); body.add(hoodPt);
    for (const s of [-1, 1]) {
      const ge = pSph(0.05, bm(0x9fd8ff), 6, 5); put(ge, 0.1 * s, 1.45, 0.26);
      const sleeve = pCon(0.09, 0.5, darkM); sleeve.position.set(0.5 * s, 0.9, 0.1); sleeve.rotation.z = s * 0.5; body.add(sleeve);
    }
    for (let i = -1; i <= 1; i++) { // 찢어진 자락
      const tear = pCon(0.08, 0.3, darkM, 4); tear.position.set(0.3 * i, 0.12, 0.05); tear.rotation.x = Math.PI; body.add(tear);
    }
    top = 1.75; radius = 0.5;
  } else {
    // 알 수 없는 도형은 고블린형 휴머노이드로 폴백
    const hg = makeHumanoid3D(THREE, {
      avatar: null, skin: color, uniform: dark, hair: dark, accent: color,
      weaponFam: 'dagger', grade: 0, scale: 0.62 * bossMul, bulk: 0.9,
    });
    hg.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshLambertMaterial) {
        if (!o.material.userData.base) o.material.userData.base = new THREE.Color(o.material.color.getHex());
        if (!tintMats.includes(o.material)) tintMats.push(o.material);
      }
    });
    g = hg;
    body = hg.userData.body; legL = hg.userData.legL; legR = hg.userData.legR;
    armL = hg.userData.armL; armR = hg.userData.armR;
    top = 1.72 * 0.62 * bossMul;
    radius = 0.42 * 0.62 * bossMul;
    return finish({ scaled: true });
  }
  return finish({});

  // ---- 마무리: 보스 스케일·보스 링·userData·애니메이션 ----
  function finish(opts) {
    const scaled = opts && opts.scaled;
    const finalTop = top * (scaled ? 1 : bossMul);
    const finalRadius = radius * (scaled ? 1 : bossMul);
    if (!scaled) g.scale.setScalar(bossMul);
    if (def.boss) {
      const tierColor = def.boss === 'field' ? 0xff5566 : def.boss === 'boss' ? 0xb46cff : 0x4aa3ff;
      const ring = new THREE.Mesh(
        gRing(THREE, Math.round(finalRadius * 0.85 * 100) / 100, Math.round(finalRadius * 1.05 * 100) / 100),
        new THREE.MeshBasicMaterial({ color: tierColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const update = (time, e) => {
      const ph = e ? (e.floatT || 0) : 0;
      const moving = !!(e && e.moving);
      let y = baseY;
      if (float) y += Math.sin(time * 1.9 + ph) * 0.1;
      if (bounce) {
        const k = Math.abs(Math.sin(time * 3.4 + ph));
        body.position.y = y + k * 0.11;
        const sy = 1 + (0.5 - k) * 0.09, sx = 1 - (0.5 - k) * 0.07;
        body.scale.set(sx, sy, sx);
      } else {
        body.position.y = y + (moving ? Math.abs(Math.sin(time * 9 + ph)) * 0.05 : 0);
        // 숨쉬기: 가만히 있을 때 몸통이 살짝 부풀었다 줄어든다
        const br = 1 + Math.sin(time * 1.6 + ph) * 0.02;
        body.scale.set(1, br, 1);
      }
      if (legL && legR) {
        const sw = moving ? Math.sin(time * 10 + ph) * 0.55 : 0;
        legL.rotation.x = sw; legR.rotation.x = -sw;
      }
      if (armL && armR) {
        const sw = moving ? Math.sin(time * 10 + ph) * 0.4 : 0;
        armL.rotation.x = -sw; armR.rotation.x = sw;
      }
      body.rotation.z = (e && e.stunT > 0) ? Math.sin(time * 14) * 0.12 : 0;
      if (wingL && wingR) {
        const flying = !!(e && (e.flyY || 0) > 0.3);
        const flap = Math.sin(time * (flying ? 9 : 2.5) + ph) * (flying ? 0.5 : 0.06);
        const base = flying ? 0.25 : 0.95;
        wingL.rotation.z = base + flap; wingR.rotation.z = -base - flap;
      }
      if (heads) heads.forEach((h, i) => { h.rotation.z = Math.sin(time * 1.6 + ph + i * 2.1) * 0.08; });
    };
    const setColorTint = (hex) => {
      const tmp = new THREE.Color(hex);
      for (const m of tintMats) {
        if (hex === 0xffffff) m.color.copy(m.userData.base);
        else m.color.copy(m.userData.base).multiply(tmp);
      }
    };
    g.userData = {
      isSprite: false, radius: finalRadius, headY: finalTop * 0.96, baseY, bounce, float,
      update, hit() {}, setColorTint,
    };
    return g;
  }
}

// ---------- 몬스터 · 동료 외형 ----------
// 3D 로우폴리 몬스터 (2D 도트 스프라이트는 가방 미리보기용으로 sprites.js에 남는다)
export function makeMonster(THREE, def) {
  return makeMonster3D(THREE, def);
}

// ---------- 동료 ----------
// 직업별 실루엣이 다르다 (색만 다른 게 아니라 생김새가 다르다):
// 탱커 = 덩치 큼 + 투구 + 왼팔 방패 / 힐러 = 로브 + 후드 + 지팡이 빛
// 근접 = 날씬 + 쌍단검 + 머리띠 / 마법사 = 로브 + 뾰족모자 + 지팡이 + 왼손 책
export function makeCompanion(THREE, cls, gradeColor = 0xffffff) {
  const c = cls && cls.id ? cls : { id: 'melee', color: 0x6fcf97 };
  const famByClass = { tank: 'sword', healer: 'staff', melee: 'dagger', mage: 'staff' };
  const scaleByClass = { tank: 1.02, healer: 0.88, melee: 0.86, mage: 0.92 };
  const bulkByClass = { tank: 1.32, healer: 0.9, melee: 0.85, mage: 0.9 };
  const g = makeHumanoid3D(THREE, {
    avatar: null, skin: 0xf2c9a0, uniform: c.color, hair: c.color, accent: 0xffffff,
    weaponFam: famByClass[c.id] || 'sword', grade: 2,
    scale: scaleByClass[c.id] || 0.92, bulk: bulkByClass[c.id] || 1,
    robe: c.id === 'healer' || c.id === 'mage', polish: true,
  });
  const u = g.userData;
  const metalM = mat(THREE, 0xdfe7f2);
  const uniM = mat(THREE, c.color);
  if (c.id === 'tank') {
    // 투구 (돔 + 코받이) + 깃털 장식
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), metalM);
    helm.scale.set(1, 0.62, 1); helm.position.set(0, 0.2, 0); u.head.add(helm);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 6), mat(THREE, 0xc0392b));
    plume.position.set(0, 0.44, 0); u.head.add(plume);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.04), metalM);
    guard.position.set(0, -0.02, 0.3); u.head.add(guard);
    // 왼팔 방패 (원반 + 직업색 테두리)
    const shield = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12), metalM);
    disc.rotation.x = Math.PI / 2; shield.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), uniM);
    shield.add(rim);
    shield.position.set(0, -0.35, 0.14);
    u.armL.add(shield);
  } else if (c.id === 'healer') {
    // 후드 (얼굴을 감싸는 구) + 지팡이 끝 빛 + 허리 약주머니
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), uniM);
    hood.scale.set(1, 1.05, 1); hood.position.set(0, 0.06, -0.12); u.head.add(hood);
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.1), mat(THREE, 0x8a6a3a));
    pouch.position.set(0.26, 0.62, 0.14); u.body.add(pouch);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.48, 0); u.weaponGroup.add(glow);
  } else if (c.id === 'melee') {
    // 머리띠 + 왼손 단검 (쌍단검) + 목 스카프
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.06), mat(THREE, 0xffffff));
    band.position.set(0, 0.14, 0.24); u.head.add(band);
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), mat(THREE, 0xc0392b));
    scarf.position.set(0, 1.18, -0.12); u.body.add(scarf);
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.03), mat(THREE, 0xc0392b));
    scarfTail.position.set(0.08, 1.0, -0.26); scarfTail.rotation.x = 0.25; u.body.add(scarfTail);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.02), mat(THREE, 0xffffff));
    tail.position.set(0.08, -0.06, -0.3); tail.rotation.z = 0.2; u.head.add(tail);
    const off = new THREE.Group();
    off.position.set(0, -0.48, 0.04);
    off.add(buildWeaponMesh(THREE, 'dagger', { grade: mat(THREE, gradeColor), metal: metalM }));
    u.armL.add(off);
  } else if (c.id === 'mage') {
    // 뾰족모자 (원뿔 + 챙) + 왼손 마법책 + 지팡이 끝 빛 + 가슴 별 문양
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 8), uniM);
    hat.position.set(0, 0.44, -0.02); u.head.add(hat);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), mat(THREE, 0xffd257));
    star.position.set(0, 0.95, 0.18); u.body.add(star);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 12), uniM);
    brim.position.set(0, 0.14, 0); u.head.add(brim);
    const off = new THREE.Group();
    off.position.set(0, -0.48, 0.04);
    off.add(buildWeaponMesh(THREE, 'book', { grade: mat(THREE, gradeColor), metal: metalM }));
    u.armL.add(off);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xc9a4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.48, 0); u.weaponGroup.add(glow);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeChest(THREE) {
  const url = ASSET_URL.prop('chest');
  const g = new THREE.Group();
  const h = 1.0, w = h * (aspectOf(THREE, url) || 1.2);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: getTexture(THREE, url), transparent: true, alphaTest: 0.4, depthWrite: true }));
  mesh.scale.set(w, h, 1);
  mesh.position.y = h / 2;
  const art = new THREE.Group(); art.add(mesh); g.add(art);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(w * 0.34, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; g.add(shadow);
  const glowS = new THREE.Mesh(new THREE.CircleGeometry(0.7, 18), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowS.rotation.x = -Math.PI / 2; glowS.position.y = 0.05; g.add(glowS);
  g.userData = { lid: { rotation: { x: 0 }, position: { z: 0 } }, mesh, art, opened: false, url, h };
  return g;
}

export function makeNpc(THREE, icon) {
  const g = new THREE.Group();
  const robe = cone(THREE, 0.45, 1.1, 0x5c4a86, 7); robe.position.y = 0.55; g.add(robe);
  const body = box(THREE, 0.36, 0.4, 0.24, 0x6f5a9a); body.position.y = 1.05; g.add(body);
  const head = sphere(THREE, 0.22, 0xf2c9a0); head.position.y = 1.42; g.add(head);
  const hat = cone(THREE, 0.3, 0.42, 0x3a2d5c, 7); hat.position.y = 1.66; g.add(hat);
  const beard = cone(THREE, 0.16, 0.3, 0xe8e8f0, 5); beard.position.set(0, 1.28, 0.16); beard.rotation.x = Math.PI; g.add(beard);
  const staff = cyl(THREE, 0.035, 0.035, 1.3, 0x8a6a3a, 5); staff.position.set(0.42, 0.8, 0.1); g.add(staff);
  const orb = glow(THREE, 0x9fd8ff, 0.1); orb.position.set(0.42, 1.48, 0.1); g.add(orb);
  const marker = labelSprite(THREE, '!', '#ffd257');
  marker.position.set(0, 2.3, 0);
  g.add(marker);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { marker, body };
  return g;
}

// ---------- 소품 ----------
function propMesh(THREE, kind, rnd) {
  const g = new THREE.Group();
  if (kind === 'tree') {
    const h = 1.6 + rnd() * 1.2;
    const trunk = cyl(THREE, 0.16, 0.24, h, 0x6b4a2a, 6); trunk.position.y = h / 2; g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const f = cone(THREE, 1.05 - i * 0.22, 1.1, [0x3f8a3a, 0x4f9a42, 0x5fa84c][i], 7);
      f.position.y = h * 0.75 + i * 0.55; g.add(f);
    }
    g.userData.r = 0.5;
  } else if (kind === 'rock') {
    const r = 0.75 + rnd() * 0.6;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(THREE, 0x8d929c));
    m.position.y = r * 0.55; m.rotation.set(rnd(), rnd(), rnd()); m.scale.set(1, 0.8, 1); g.add(m);
    const m2 = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.55, 0), mat(THREE, 0x767b85));
    m2.position.set(r * 0.7, r * 0.3, r * 0.4); g.add(m2);
    g.userData.r = r * 0.95;
  } else if (kind === 'grass') {
    for (let i = 0; i < 5; i++) {
      const h = 0.35 + rnd() * 0.35;
      const blade = cone(THREE, 0.06, h, i % 2 ? 0x6fbf58 : 0x4f9a42, 3);
      blade.position.set((rnd() - 0.5) * 0.5, h / 2, (rnd() - 0.5) * 0.5);
      blade.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4);
      g.add(blade);
    }
    g.userData.r = 0.22;
  } else if (kind === 'flower') {
    for (let i = 0; i < 4; i++) {
      const h = 0.25 + rnd() * 0.3;
      const stem = cyl(THREE, 0.015, 0.02, h, 0x4f9a42, 4);
      stem.position.set((rnd() - 0.5) * 0.6, h / 2, (rnd() - 0.5) * 0.6); g.add(stem);
      const petal = sphere(THREE, 0.075, [0xffe066, 0xff9ec4, 0xb9a6ff, 0xff7a6a][i % 4], 5);
      petal.position.set(stem.position.x, h + 0.05, stem.position.z); g.add(petal);
    }
    g.userData.r = 0.2;
  } else if (kind === 'bush') {
    for (let i = 0; i < 3; i++) {
      const b = sphere(THREE, 0.32 + rnd() * 0.2, 0x4a8f3a, 6);
      b.position.set((rnd() - 0.5) * 0.6, 0.25, (rnd() - 0.5) * 0.6); g.add(b);
    }
    g.userData.r = 0.42;
  } else if (kind === 'deadTree') {
    const h = 2.2 + rnd() * 1.2;
    const trunk = cyl(THREE, 0.1, 0.22, h, 0x4a3f3a, 6); trunk.position.y = h / 2; trunk.rotation.z = (rnd() - 0.5) * 0.2; g.add(trunk);
    for (let i = 0; i < 4; i++) {
      const br = cyl(THREE, 0.03, 0.07, 0.9, 0x4a3f3a, 4);
      br.position.set((rnd() - 0.5) * 0.6, h * 0.55 + i * 0.28, (rnd() - 0.5) * 0.6);
      br.rotation.set((rnd() - 0.5) * 1.4, rnd() * 3, (rnd() - 0.5) * 1.6); g.add(br);
    }
    g.userData.r = 0.4;
  } else if (kind === 'reed') {
    for (let i = 0; i < 6; i++) {
      const h = 0.8 + rnd() * 0.9;
      const r = cyl(THREE, 0.02, 0.035, h, 0x6f8a52, 4);
      r.position.set((rnd() - 0.5) * 0.7, h / 2, (rnd() - 0.5) * 0.7); r.rotation.z = (rnd() - 0.5) * 0.35; g.add(r);
      const top = cone(THREE, 0.06, 0.2, 0x8a7a4a, 4); top.position.set(r.position.x, h, r.position.z); g.add(top);
    }
    g.userData.r = 0.3;
  } else if (kind === 'cactus') {
    const h = 1.2 + rnd() * 1.0;
    const trunk = cyl(THREE, 0.18, 0.22, h, 0x4f8a4a, 7); trunk.position.y = h / 2; g.add(trunk);
    const arm = cyl(THREE, 0.1, 0.12, 0.6, 0x4f8a4a, 6); arm.position.set(0.28, h * 0.7, 0); arm.rotation.z = -0.5; g.add(arm);
    g.userData.r = 0.34;
  } else if (kind === 'sandRock') {
    const r = 0.9 + rnd() * 0.8;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(THREE, 0xc9a468));
    m.position.y = r * 0.45; m.scale.set(1.2, 0.7, 1); m.rotation.set(rnd(), rnd(), rnd()); g.add(m);
    g.userData.r = r;
  } else if (kind === 'pillar' || kind === 'ruinPillar') {
    const h = 2.2 + rnd() * 2.0;
    const base = box(THREE, 0.8, 0.3, 0.8, kind === 'pillar' ? 0xc9ad74 : 0x6a8f96); base.position.y = 0.15; g.add(base);
    const col = cyl(THREE, 0.28, 0.32, h, kind === 'pillar' ? 0xdcc28a : 0x7fa4ac, 7); col.position.y = h / 2 + 0.3; g.add(col);
    const cap = box(THREE, 0.75, 0.25, 0.75, kind === 'pillar' ? 0xc9ad74 : 0x6a8f96); cap.position.y = h + 0.42; g.add(cap);
    g.userData.r = 0.5;
  } else if (kind === 'coral') {
    const c = [0xff8fa3, 0xffb36b, 0x9b8cff, 0x7fe0d0][Math.floor(rnd() * 4)];
    for (let i = 0; i < 4; i++) {
      const h = 0.7 + rnd() * 1.1;
      const br = cyl(THREE, 0.05, 0.1, h, c, 5);
      br.position.set((rnd() - 0.5) * 0.6, h / 2, (rnd() - 0.5) * 0.6);
      br.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3, (rnd() - 0.5) * 0.4); g.add(br);
    }
    g.userData.r = 0.4;
  } else if (kind === 'bubbleRock') {
    const r = 0.8 + rnd() * 0.5;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(THREE, 0x4a8894));
    m.position.y = r * 0.5; m.rotation.set(rnd(), rnd(), rnd()); g.add(m);
    g.userData.r = r;
  } else if (kind === 'wall') {
    const w = 2.2, h = 1.8, d = 0.5;
    for (let i = 0; i < 3; i++) {
      const b = box(THREE, w - i * 0.2, 0.55, d, i % 2 ? 0x77705f : 0x655f50);
      b.position.set((rnd() - 0.5) * 0.2, 0.3 + i * 0.56, 0); b.rotation.y = (rnd() - 0.5) * 0.1; g.add(b);
    }
    g.userData.r = 1.1;
  } else {
    const b = box(THREE, 1, 1, 1, 0x888888); b.position.y = 0.5; g.add(b); g.userData.r = 0.6;
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}


// 여러 조각을 하나의 지오메트리로 합쳐 색을 구워 넣는다 (드로우콜 절약)
function mergeGeometryParts(THREE, meshes) {
  const geos = [];
  for (const m of meshes) {
    m.updateMatrix();
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    const c = m.material.color || { r: 1, g: 1, b: 1 };
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ---------- 하나의 판타지 지도 전체를 짓는다 ----------
// 480×384 지면 1장 + 구역별 소품(인스턴싱) + 경계 자연물 벽 + 상자 55개 + NPC 18명
// + 방벽 게이트(통로마다) + 지구 귀환 게이트 + 마계 관문.
// 포탈은 걷는 길이 아니라, 게이트에 다가가 [들어가기]를 눌러 이동한다.
export function buildWorld(THREE, zones, openedChests = [], earthGateOpen = false, unlockedIds = [], gyeonggiGateOpen = false) {
  const unlocked = new Set(unlockedIds || []);
  const rnd = rand(987654321);
  const group = new THREE.Group();
  const props = [];
  const chests = [];
  const npcs = {};
  const gates = [];

  // 지면 (3D 지형: 240x192 분할 후 groundHeight로 높이 적용 — 한 칸 2m, 예전과 같다)
  // 평면은 z 중심이 48이다 (월드 z -144..240). 정점 높이는 월드 좌표로 잰다.
  const gtex = groundTexture(THREE, zones, rnd);
  const groundGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, 240, 192);
  const gpos = groundGeo.attributes.position;
  for (let i = 0; i < gpos.count; i++) {
    gpos.setZ(i, groundHeight(gpos.getX(i), -gpos.getY(i) + 48));
  }
  groundGeo.computeVertexNormals();
  // 높이·경사별 음영 (버텍스 컬러 × 텍스처): 높은 곳은 햇빛 받은 밝은 톤,
  // 웅덩이는 어둡고 차가운 톤, 가파른 경사는 바위빛 — 언덕·구덩이가 눈에 띄게.
  // 경사는 메시 이웃 정점 높이로 잰다 (groundHeight 추가 호출 없이).
  {
    const SEGX = 240, SEGZ = 192, COLS = SEGX + 1;
    const colors = new Float32Array(gpos.count * 3);
    for (let i = 0; i < gpos.count; i++) {
      const ix = i % COLS, iz = Math.floor(i / COLS);
      const h = gpos.getZ(i);
      const hx0 = gpos.getZ(iz * COLS + Math.max(0, ix - 1));
      const hx1 = gpos.getZ(iz * COLS + Math.min(SEGX, ix + 1));
      const hz0 = gpos.getZ(Math.max(0, iz - 1) * COLS + ix);
      const hz1 = gpos.getZ(Math.min(SEGZ, iz + 1) * COLS + ix);
      const slope = Math.hypot(hx1 - hx0, hz1 - hz0) / 4; // 4m 구간 기울기
      let r = 1, g = 1, b = 1;
      const hi = smooth(clamp01((h - 1.6) / 2.2)); // 높은 곳 — 밝게
      r *= 1 + 0.07 * hi; g *= 1 + 0.05 * hi; b *= 1 + 0.02 * hi;
      const lo = smooth(clamp01((-1.1 - h) / 1.6)); // 낮은 웅덩이 — 어둡게
      r *= 1 - 0.22 * lo; g *= 1 - 0.16 * lo; b *= 1 - 0.12 * lo;
      const st = smooth(clamp01((slope - 0.17) / 0.16)); // 가파른 경사 — 바위빛
      r = r * (1 - st) + 0.68 * st; g = g * (1 - st) + 0.64 * st; b = b * (1 - st) + 0.58 * st;
      colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ map: gtex, vertexColors: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 48;
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- 소품 배치 (인스턴싱) ----------
  const scatter = [];
  const protoCache = {};
  function protoFor(kind) {
    if (!protoCache[kind]) {
      const r2 = rand(kind.length * 17 + 5);
      const g = propMesh(THREE, kind, r2);
      const meshes = g.children.filter((m) => m.isMesh);
      protoCache[kind] = { geo: mergeGeometryParts(THREE, meshes), r: g.userData.r || 0.5 };
    }
    return protoCache[kind];
  }
  function addProp(kind, x, z, scl, rot) {
    scatter.push({ kind, x, z, s: scl, r: rot });
    const p = protoFor(kind);
    props.push({ x, z, r: p.r * scl * 0.92, kind });
  }
  function distToPath(x, z) {
    let best = Infinity;
    for (const [a, b] of PATH_SEGS) best = Math.min(best, distToSeg(x, z, a.x, a.z, b.x, b.z));
    return best;
  }
  function nearFlatPoint(x, z, r) {
    for (const fp of FLAT_POINTS) if (Math.hypot(x - fp.x, z - fp.z) < r) return true;
    return false;
  }

  const WEIGHT = { tree: 4, deadTree: 4, rock: 3, bush: 3, grass: 4, flower: 1.4, reed: 3, cactus: 3, sandRock: 3.4, pillar: 2.4, ruinPillar: 2.6, coral: 3, bubbleRock: 2.4, wall: 1.4 };
  function pickKind(zn) {
    const pool = zn.theme.prop;
    let total = 0; for (const k of pool) total += WEIGHT[k] || 1;
    let r = rnd() * total;
    for (const k of pool) { r -= WEIGHT[k] || 1; if (r <= 0) return k; }
    return pool[0];
  }
  // 구역별 내부 소품
  for (const zn of zones) {
    if (!zn.map) continue;
    const { cx, cz } = zn.map;
    let placed = 0;
    for (let i = 0; i < 900 && placed < 210; i++) {
      const x = cx - 45 + rnd() * 90, z = cz - 45 + rnd() * 90;
      if (distToPath(x, z) < 3.4) continue;
      if (nearFlatPoint(x, z, 4.2)) continue;
      if (Math.abs(z - RIVER_Z) < 9) continue;
      const kind = pickKind(zn);
      const small = kind === 'grass' || kind === 'flower';
      const big = kind === 'tree' || kind === 'deadTree' || kind === 'pillar' || kind === 'ruinPillar' || kind === 'cactus';
      const scl = small ? 1.7 + rnd() * 1.1 : big ? 1.05 + rnd() * 0.8 : 1.0 + rnd() * 0.9;
      addProp(kind, x, z, scl, rnd() * 6.28);
      placed++;
      if (rnd() < 0.3) {
        const k2 = small ? kind : pickKind(zn);
        addProp(k2, x + (rnd() - 0.5) * 2.2, z + (rnd() - 0.5) * 2.2, scl * (0.75 + rnd() * 0.3), rnd() * 6.28);
      }
    }
  }
  // ---------- 구역 경계 자연물 벽 ----------
  // 경계마다 통로 한 곳만 남기고, 나머지 부분은 산·돌·나무로 빽빽하게 막는다.
  // (통로 중심 ±6m는 비워 둔다 — 그 자리에 결계 게이트가 선다)
  const WALL_KINDS = ['rock', 'sandRock', 'bubbleRock', 'tree', 'deadTree', 'pillar', 'ruinPillar', 'wall'];
  function wallKindFor(zn) {
    const pool = (zn.theme.prop || []).filter((k) => WALL_KINDS.includes(k));
    return pool.length ? pool[Math.floor(rnd() * pool.length)] : 'rock';
  }
  function addWallRun(points) {
    for (const p of points) {
      const zn = districtAt(p.x, p.z);
      addProp(wallKindFor(zn), p.x, p.z, 2.8 + rnd() * 0.8, rnd() * 6.28);
    }
  }
  function borderWallPoints(b) {
    const pts = [];
    for (let d = 0; d <= 96; d += 1.8) {
      const t = d / 96;
      // 통로 중심(±6m)에는 벽을 세우지 않는다
      if (Math.abs((t - 0.5) * 96) < 6) continue;
      pts.push(borderPoint(b, t));
    }
    return pts;
  }
  for (const b of BORDERS) addWallRun(borderWallPoints(b));
  for (const w of VOID_WALLS) {
    const pts = [];
    const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
    for (let d = 0; d <= len; d += 1.8) pts.push(voidPoint(w, d / len));
    addWallRun(pts);
  }

  // 바깥 테두리 (월드 직사각형 경계선을 따라)
  const PERIM = 2 * (WORLD_W + WORLD_H);
  for (let i = 0; i < 260; i++) {
    const t = (i / 260) * PERIM;
    let x, z;
    if (t < WORLD_W) { x = WORLD_BOUNDS.minX + t; z = WORLD_BOUNDS.minZ + 1 + rnd() * 2; }
    else if (t < WORLD_W + WORLD_H) { x = WORLD_BOUNDS.maxX - 1 - rnd() * 2; z = WORLD_BOUNDS.minZ + (t - WORLD_W); }
    else if (t < 2 * WORLD_W + WORLD_H) { x = WORLD_BOUNDS.maxX - (t - WORLD_W - WORLD_H); z = WORLD_BOUNDS.maxZ - 1 - rnd() * 2; }
    else { x = WORLD_BOUNDS.minX + 1 + rnd() * 2; z = WORLD_BOUNDS.maxZ - (t - 2 * WORLD_W - WORLD_H); }
    const zn = districtAt(x, z);
    const kind = rnd() > 0.55 ? zn.theme.prop[Math.floor(rnd() * zn.theme.prop.length)] : 'rock';
    addProp(kind, x, z, 2.4 + rnd() * 1.4, rnd() * 6.28);
  }

  // 인스턴스 메시 생성
  const byKind = {};
  for (const t of scatter) (byKind[t.kind] = byKind[t.kind] || []).push(t);
  const instMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const dummy = new THREE.Object3D();
  for (const [kind, arr] of Object.entries(byKind)) {
    const pr = protoFor(kind);
    const inst = new THREE.InstancedMesh(pr.geo, instMat, arr.length);
    arr.forEach((t, i) => {
      dummy.position.set(t.x, groundHeight(t.x, t.z), t.z);
      dummy.rotation.set(0, t.r, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // 소품 충돌용 공간 그리드 (매 프레임 전체 순회 대신 근처 셀만 본다)
  const CELL = 6;
  const grid = new Map();
  for (const pr of props) {
    const key = `${Math.floor(pr.x / CELL)},${Math.floor(pr.z / CELL)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(pr);
  }
  function propsNear(x, z, r = 3) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const arr = grid.get(`${cx},${cz}`);
      if (arr) for (const pr of arr) out.push(pr);
    }
    return out;
  }

  // 숨겨진 보관함 (소품 뒤 그늘에 배치)
  for (const zn of zones) {
    if (!zn.map) continue;
    (zn.chests || []).forEach((spec, idx) => {
      const wp = worldPos(zn, spec.x, spec.z);
      const chest = makeChest(THREE);
      chest.position.set(wp.x, groundHeight(wp.x, wp.z), wp.z);
      chest.rotation.y = -0.4 + rnd() * 0.8;
      group.add(chest);
      const hide = propMesh(THREE, spec.hide, rnd);
      const hd = 1.15 + rnd() * 0.5;
      const hx = wp.x + (rnd() - 0.5) * 0.5, hz = wp.z + hd;
      hide.position.set(hx, groundHeight(hx, hz), hz);
      hide.scale.setScalar(spec.hide === 'rock' || spec.hide === 'sandRock' || spec.hide === 'bubbleRock' ? 1.9 : spec.hide === 'wall' ? 1.25 : 1.5);
      hide.rotation.y = rnd() * 6.28;
      group.add(hide);
      props.push({ x: hide.position.x, z: hide.position.z, r: hide.userData.r * 1.2 || 1, kind: spec.hide });
      const gkey = `${Math.floor(hide.position.x / CELL)},${Math.floor(hide.position.z / CELL)}`;
      if (!grid.has(gkey)) grid.set(gkey, []);
      grid.get(gkey).push(props[props.length - 1]);
      const opened = openedChests.includes(`${zn.id}:${idx}`);
      if (opened) { chest.userData.lid.rotation.x = -1.9; chest.userData.lid.position.z = -0.3; }
      chests.push({ id: `${zn.id}:${idx}`, mesh: chest, x: wp.x, z: wp.z, opened });
    });
  }

  // NPC (구역마다 1명)
  for (const zn of zones) {
    if (!zn.map) continue;
    const wp = worldPos(zn, zn.npc.x, zn.npc.z);
    const npc = makeNpc(THREE, zn.npc.icon);
    npc.position.set(wp.x, groundHeight(wp.x, wp.z), wp.z);
    npc.rotation.y = Math.PI;
    group.add(npc);
    npcs[zn.id] = npc;
  }

  // 방벽 게이트 (통로마다) — 기둥 2개 + 빛나는 결계벽.
  // 구역이 열리면 결계는 완전히 사라진다 (기둥까지 통째로 — 열리기 전만 보인다).
  // 이미 해금된 구역의 통로는 처음부터 게이트가 없다.
  for (const b of BORDERS) {
    const did = borderDistrictId(b);
    const alreadyOpen = unlocked.has(did);
    const g = new THREE.Group();
    const gy = groundHeight(b.x, b.z);
    const alongX = b.along === 'x';
    const off = 5.2;
    const px = alongX ? 0 : off, pz = alongX ? off : 0;
    const pillars = [];
    const pillarProps = [];
    let barrier = null, barrierMat = null, glowRing = null;
    if (!alreadyOpen) {
      for (const sgn of [-1, 1]) {
        const pil = propMesh(THREE, 'pillar', rnd);
        pil.position.set(b.x + px * sgn, groundHeight(b.x + px * sgn, b.z + pz * sgn), b.z + pz * sgn);
        pil.scale.setScalar(1.5);
        g.add(pil);
        pillars.push(pil);
        const pp = { x: pil.position.x, z: pil.position.z, r: 0.7, kind: 'pillar' };
        props.push(pp);
        pillarProps.push(pp);
      }
      barrierMat = new THREE.MeshBasicMaterial({
        color: 0x9f7bff, transparent: true, opacity: 0.4,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      barrier = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.4), barrierMat);
      barrier.position.set(b.x, gy + 2.2, b.z); // 아래로 1m 더 내려 지형 기복에도 바닥이 뜨지 않게
      barrier.rotation.y = alongX ? 0 : Math.PI / 2;
      g.add(barrier);
      glowRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.6, 0.08, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xc9a8ff, transparent: true, opacity: 0.8 })
      );
      glowRing.position.set(b.x, gy + 1.6, b.z);
      glowRing.rotation.y = alongX ? 0 : Math.PI / 2;
      g.add(glowRing);
    }
    group.add(g);
    gates.push({ districtId: did, x: b.x, z: b.z, group: g, barrier, barrierMat, glowRing, pillars, pillarProps, open: alreadyOpen, openT: alreadyOpen ? 1 : 0 });
  }

  // 포탈 (지구 귀환 게이트 + 마계 관문) — 열리면 빛나고, 다가가 [들어가기]를 눌러 이동한다
  function makePortalGate(pos, open, ringColor, discColor) {
    const eg = new THREE.Group();
    const gy = groundHeight(pos.x, pos.z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.22, 10, 28),
      new THREE.MeshBasicMaterial({ color: open ? ringColor : 0x8a97a8, transparent: true, opacity: 0.95 })
    );
    ring.position.set(pos.x, gy + 2.6, pos.z);
    eg.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 28),
      new THREE.MeshBasicMaterial({ color: discColor, transparent: true, opacity: open ? 0.5 : 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    disc.position.set(pos.x, gy + 2.6, pos.z);
    eg.add(disc);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 1.6), new THREE.MeshLambertMaterial({ color: 0x6a6f7a, flatShading: true }));
    base.position.set(pos.x, gy + 0.25, pos.z);
    eg.add(base);
    group.add(eg);
    return { open: !!open, group: eg, disc, ring, ringColor };
  }
  const earthGate = makePortalGate(EARTH_GATE, earthGateOpen, 0xffd257, 0xffd257);
  const gyeonggiGate = makePortalGate(GYEONGGI_GATE, gyeonggiGateOpen, 0xb46cff, 0x9f7bff);

  // 대기 입자 (지도 전체)
  const pc = 220;
  const pos = new Float32Array(pc * 3);
  const seeds = [];
  for (let i = 0; i < pc; i++) {
    pos[i * 3] = (rnd() - 0.5) * 470;
    pos[i * 3 + 1] = 0.4 + rnd() * 5;
    pos[i * 3 + 2] = 48 + (rnd() - 0.5) * 370;
    seeds.push(0.2 + rnd() * 0.8);
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pmat = new THREE.PointsMaterial({
    color: 0xfff3a0, size: 0.18,
    map: dotTexture(THREE), transparent: true, opacity: 0.75, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(pgeo, pmat);
  group.add(points);

  // 몬스터 스폰 지점 (구역별)
  const spawnPointsByDistrict = {};
  const spawnPoints = [];
  for (const zn of zones) {
    if (!zn.map) continue;
    const list = [];
    const sp = worldPos(zn, zn.spawn.x, zn.spawn.z);
    const bo = worldPos(zn, zn.boss.x, zn.boss.z);
    const fi = zn.field ? worldPos(zn, zn.field.x, zn.field.z) : null;
    const np = worldPos(zn, zn.npc.x, zn.npc.z);
    for (let i = 0; i < 26; i++) {
      const x = zn.map.cx + (rnd() - 0.5) * 74, z = zn.map.cz + (rnd() - 0.5) * 74;
      if (Math.hypot(x - sp.x, z - sp.z) < 10) continue;
      if (Math.hypot(x - bo.x, z - bo.z) < 10) continue;
      if (fi && Math.hypot(x - fi.x, z - fi.z) < 11) continue;
      if (Math.hypot(x - np.x, z - np.z) < 4) continue;
      list.push({ x, z });
    }
    spawnPointsByDistrict[zn.id] = list;
    spawnPoints.push(...list);
  }

  // 통로를 연다 — 같은 구역 번호의 통로가 여러 개면(옆통로 포함) 전부 함께 열린다.
  // instant=true면 (이미 해금된 채로 불러올 때) 연출 없이 즉시 완전히 사라진다.
  function removeGateVisuals(gt) {
    // 결계·빛고리·기둥을 통째로 없앤다 (미니맵용 소품 목록에서도 뺀다)
    if (gt.barrier) gt.barrier.visible = false;
    if (gt.glowRing) gt.glowRing.visible = false;
    for (const pil of (gt.pillars || [])) pil.visible = false;
    for (const pp of (gt.pillarProps || [])) {
      const i = props.indexOf(pp);
      if (i >= 0) props.splice(i, 1);
    }
    gt.pillarProps = [];
  }
  function openGate(districtId, instant = false) {
    let any = false;
    for (const gt of gates) {
      if (gt.districtId !== districtId || gt.open) continue;
      gt.open = true;
      gt.openT = instant ? 1 : 0;
      any = true;
      if (instant) removeGateVisuals(gt);
    }
    return any;
  }
  function setPortalGate(gate, open) {
    gate.open = !!open;
    if (gate.disc) gate.disc.material.opacity = open ? 0.5 : 0.1;
    if (gate.ring) gate.ring.material.color.setHex(open ? gate.ringColor : 0x8a97a8);
  }
  function setEarthGate(open) { setPortalGate(earthGate, open); }
  function setGyeonggiGate(open) { setPortalGate(gyeonggiGate, open); }

  return {
    group, props, propsNear, chests, npcs, npc: npcs[1] || null, gates, earthGate, gyeonggiGate,
    spawnPoints, spawnPointsByDistrict, particles: points, fieldRing: null, groundHeight,
    openGate, setEarthGate, setGyeonggiGate,
    update(dt, t) {
      const arr = pgeo.attributes.position.array;
      for (let i = 0; i < pc; i++) {
        arr[i * 3 + 1] += Math.sin(t * seeds[i] + i) * dt * 0.25;
        arr[i * 3] += Math.cos(t * 0.4 + i) * dt * 0.15;
      }
      pgeo.attributes.position.needsUpdate = true;
      for (const npc of Object.values(npcs)) {
        npc.userData.marker.position.y = 2.3 + Math.sin(t * 2.2) * 0.12;
      }
      // 열리는 게이트의 결계벽은 서서히 사라진다 — 기둥도 함께 가라앉아 완전히 없어진다
      for (const gt of gates) {
        if (gt.open && gt.openT < 1) {
          gt.openT += dt;
          const k = Math.min(1, gt.openT / 0.9);
          if (gt.barrierMat) gt.barrierMat.opacity = Math.max(0, 0.4 - k * 0.4);
          if (gt.glowRing) gt.glowRing.material.opacity = Math.max(0, 0.8 - k * 0.8);
          for (const pil of (gt.pillars || [])) pil.position.y -= dt * 1.2;
          if (gt.openT >= 0.9) removeGateVisuals(gt);
        } else if (!gt.open) {
          if (gt.barrierMat) gt.barrierMat.opacity = 0.34 + Math.sin(t * 2 + gt.districtId) * 0.1;
        }
      }
    },
  };
}
