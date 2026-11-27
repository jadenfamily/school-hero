// 3D 월드 · 캐릭터 생성 (입체감 있는 복셀/로우폴리 3D + 빽빽한 2D 지면 텍스처)
// 캐릭터·몬스터·소품·상자·NPC는 모두 실제 부피가 있는 3D 모델이다 (평면 빌보드 금지 —
// 종이 인형처럼 보인다는 피드백 반영). 지면만 2D 텍스처(표면이므로)이며 높낮이
// 지형 + 높이 음영 + 강한 그림자로 입체감을 낸다.
import { AVATAR_MAP, GRADES, ARMOR_KINDS, ZONES, EARTH_GATE, GYEONGGI_GATE, BORDERS, borderDistrictId } from './data.js';
import { visualEquip, PROP_SIZE, PROP_R, faceTextureFor3D } from './sprites.js';
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
// 고해상도 캔버스(1920×1536 = 1픽셀 0.25m)에 구역별 빽빽한 도트 결을 그린다.
// 큰 평평한 네모는 없고, 1px 스페클·풀잎·꽃·개별 자갈 + 전체 1px 노이즈로 어느 배율에서도
// 빈 면이 안 보인다. 높이·경사 음영은 버텍스 컬러가 맡으므로(높은 곳 밝게, 웅덩이 어둡게)
// 입체감은 그대로 산다. 구역 모양은 울퉁불퉁한 외곽선(districtOutline) 그대로 — 사각 격자는 없다.
export function groundTexture(THREE, zones, rnd) {
  const TW = 1920, TH = 1536; // 1px = 0.25m (예전 0.5m/px의 2배 해상도 — 큰 네모 타일 제거)
  const c = document.createElement('canvas');
  c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  const X = (wx) => (wx - WORLD_BOUNDS.minX) / WORLD_W * TW;
  const Y = (wz) => (wz - WORLD_BOUNDS.minZ) / WORLD_H * TH;
  const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  // 바탕: 빈 바다 (청록빛 — 물결 평면 아래에서도 바다가 보이게)
  g.fillStyle = '#14586b';
  g.fillRect(0, 0, TW, TH);
  // 구역별 바탕 (울퉁불퉁한 다각형 + 빽빽한 도트 결)
  for (const zn of zones) {
    if (!zn.map) continue;
    const outline = districtOutline(zn.id);
    if (!outline.length) continue;
    g.beginPath();
    outline.forEach((p, i) => { if (i === 0) g.moveTo(X(p.x), Y(p.z)); else g.lineTo(X(p.x), Y(p.z)); });
    g.closePath();
    g.fillStyle = hexOf(zn.theme.ground);
    g.fill();
    g.save();
    g.clip();
    // 구역 경계 박스 (디테일은 구역 전체에 깐다)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of outline) { minX = Math.min(minX, X(pt.x)); maxX = Math.max(maxX, X(pt.x)); minY = Math.min(minY, Y(pt.z)); maxY = Math.max(maxY, Y(pt.z)); }
    minX += 16; maxX -= 16; minY += 16; maxY -= 16;
    const inX = () => minX + rnd() * (maxX - minX), inY = () => minY + rnd() * (maxY - minY);
    const mossCol = zn.theme.grass || '#6a7a4a';
    // 큰 색조 얼룩 — 1~3.5m 크기, 진하게 (게임 줌에서도 읽히는 지면 결)
    // fillRect 뭉치로 불규칙한 패치를 만든다 (동그란 얼룩이 아니라 들쭉날쭉한 모양)
    for (let i = 0; i < 220; i++) {
      const px = inX(), py = inY();
      const r = 4 + rnd() * 10;
      const tone = rnd();
      g.fillStyle = tone < 0.4 ? zn.theme.ground2 : tone < 0.7 ? (zn.theme.grass || hexOf(zn.theme.ground)) : tone < 0.85 ? '#ffffff' : '#000000';
      g.globalAlpha = 0.26 + rnd() * 0.25;
      g.fillRect(px - r, py - r * 0.7, r * 2, r * 1.4);
      g.fillRect(px - r * 0.6, py - r * 1.1, r * 1.2, r * 0.8);
      g.fillRect(px - r * 0.4, py + r * 0.2, r * 1.4, r * 0.7);
    }
    // 균열 — 어두운 지그재그 선 (바위·흙바닥의 갈라짐)
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) {
      let px = inX(), py = inY();
      g.globalAlpha = 0.35 + rnd() * 0.3;
      g.beginPath(); g.moveTo(px, py);
      let a = rnd() * Math.PI * 2;
      for (let sgm = 0; sgm < 5; sgm++) {
        a += (rnd() - 0.5) * 1.6;
        px += Math.cos(a) * (3 + rnd() * 5); py += Math.sin(a) * (3 + rnd() * 5);
        g.lineTo(px, py);
      }
      g.stroke();
    }
    // 이끼 패치 — 초록 얼룩 (바위·나무 그늘 아래)
    for (let i = 0; i < 55; i++) {
      const px = inX(), py = inY();
      g.globalAlpha = 0.3 + rnd() * 0.25;
      g.fillStyle = mossCol;
      g.beginPath(); g.ellipse(px, py, 3 + rnd() * 6, 2 + rnd() * 4, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    // 자갈 무리 — 2~3px 돌멩이 3~5개씩 뭉쳐서
    for (let i = 0; i < 160; i++) {
      const px = inX(), py = inY();
      g.globalAlpha = 0.4 + rnd() * 0.4;
      for (let j = 0; j < 3 + Math.floor(rnd() * 3); j++) {
        g.fillStyle = rnd() > 0.5 ? '#8a8a8a' : '#5a4a3a';
        g.fillRect(px + (rnd() - 0.5) * 8, py + (rnd() - 0.5) * 8, 2, 2);
      }
    }
    // 픽셀 스페클 — 구역 경계 안쪽에 1px 점을 빽빽하게 (모래·눈의 반점, 잔디의 결)
    for (let i = 0; i < 16000; i++) {
      const px = inX(), py = inY();
      const r = rnd();
      if (r < 0.12) { g.globalAlpha = 0.22 + rnd() * 0.13; g.fillStyle = '#000000'; g.fillRect(px, py, 1, 1); }
      else if (r < 0.24) { g.globalAlpha = 0.18 + rnd() * 0.12; g.fillStyle = '#ffffff'; g.fillRect(px, py, 1, 1); }
      else if (r < 0.30) { g.globalAlpha = 0.2 + rnd() * 0.12; g.fillStyle = zn.theme.ground2; g.fillRect(px, py, 1, 1); }
    }
    // 구역별 특징 — 사막은 모래 능선, 설산·빙하는 눈 더미, 화산은 검은 현무암
    if (zn.id === 3 || zn.id === 7) { // 사막·달표면: 모래 능선 (긴 곡선 줄무늬)
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
      for (let i = 0; i < 32; i++) {
        const px = inX(), py = inY();
        g.globalAlpha = 0.3 + rnd() * 0.25;
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + 20 + rnd() * 20, py + (rnd() - 0.5) * 12, px + 44 + rnd() * 24, py + (rnd() - 0.5) * 16);
        g.stroke();
      }
    }
    if (zn.id === 9 || zn.id === 8) { // 설산·빙하: 눈 더미 (흰 타원)
      for (let i = 0; i < 80; i++) {
        const px = inX(), py = inY();
        g.globalAlpha = 0.3 + rnd() * 0.3;
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(px, py, 4 + rnd() * 8, 3 + rnd() * 5, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
      }
    }
    if (zn.id === 6 || zn.id === 12) { // 화산·마계섬: 검은 현무암 덩어리
      for (let i = 0; i < 65; i++) {
        const px = inX(), py = inY();
        g.globalAlpha = 0.4 + rnd() * 0.3;
        g.fillStyle = '#1c1c22';
        g.fillRect(px, py, 3 + rnd() * 5, 2 + rnd() * 4);
      }
    }
    // 풀잎 — 잔디 구역에만 (3개 잎이 한 곳에서 나는 풀 무늬, 더 크고 촘촘하게)
    if (zn.theme.grass) {
      g.strokeStyle = zn.theme.grass;
      g.lineWidth = 1;
      for (let i = 0; i < 1700; i++) {
        const px = inX(), py = inY();
        g.globalAlpha = 0.5 + rnd() * 0.35;
        const h = 3 + rnd() * 3;
        g.beginPath();
        g.moveTo(px, py); g.lineTo(px - 1.5, py - h);
        g.moveTo(px, py); g.lineTo(px + 0.5, py - h * 1.2);
        g.moveTo(px + 1.5, py); g.lineTo(px + 2.5, py - h * 0.8);
        g.stroke();
      }
      // 꽃 — 잔디 구역 곳곳에 2px 꽃점
      const FLOWER_COLS = ['#ff9ec4', '#ffd257', '#ffffff', '#ff7a6a'];
      for (let i = 0; i < 220; i++) {
        const px = inX(), py = inY();
        g.globalAlpha = 0.75 + rnd() * 0.25;
        g.fillStyle = FLOWER_COLS[Math.floor(rnd() * FLOWER_COLS.length)];
        g.fillRect(px, py, 2, 2);
      }
    }
    g.restore();
    g.globalAlpha = 1;
    // 경계선 — 어두운 겹선 + 밝은 속선 (층층이 쌓인 절벽 느낌)
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 8;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3;
    g.stroke();
  }
  // 한강 물줄기 (z=-96 라인, 가로 전체) — 굵은 도트 밴드 + 파도 디더링
  const ry0 = Y(RIVER_Z - 8), ry1 = Y(RIVER_Z + 8);
  g.fillStyle = '#2a9ab0';
  g.fillRect(0, ry0, TW, ry1 - ry0);
  g.fillStyle = 'rgba(168,232,238,.5)';
  for (let i = 0; i < 800; i++) g.fillRect(rnd() * TW, ry0 + rnd() * (ry1 - ry0), 2, 1);
  g.fillStyle = 'rgba(0,40,60,.4)';
  for (let i = 0; i < 450; i++) g.fillRect(rnd() * TW, ry0 + rnd() * (ry1 - ry0), 3, 1);
  // 메인 길: 구역 중심을 잇는 돌길 (포탈 구간은 끊긴다) — 자갈이 박힌 굵은 길
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
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 40;
  traceChain([1, 2, 3, 4, 5, 6, 7, 8, 9]); traceChain([10, 11, 12]); traceChain([13, 14, 15, 16, 17, 18]);
  g.stroke();
  g.strokeStyle = '#9c8a63'; g.lineWidth = 26;
  traceChain([1, 2, 3, 4, 5, 6, 7, 8, 9]); traceChain([10, 11, 12]); traceChain([13, 14, 15, 16, 17, 18]);
  g.stroke();
  // 길 위 자갈 — 낱개 돌멩이를 촘촘하게
  for (let i = 0; i < 2000; i++) {
    const seg = PATH_SEGS[Math.floor(rnd() * PATH_SEGS.length)];
    if (!seg) break;
    const t = rnd();
    const wx = seg[0].x + (seg[1].x - seg[0].x) * t + (rnd() - 0.5) * 5;
    const wz = seg[0].z + (seg[1].z - seg[0].z) * t + (rnd() - 0.5) * 5;
    g.globalAlpha = 0.35 + rnd() * 0.45;
    g.fillStyle = rnd() > 0.5 ? '#f2e6c8' : '#5a4a2e';
    g.fillRect(X(wx), Y(wz), 1.4, 1.4);
  }
  g.globalAlpha = 1;
  // 1px 입자 노이즈 — 지면 전체에 고운 결을 입혀 어느 배율에서도 평평한 면이 없게 한다
  try {
    const img = g.getImageData(0, 0, TW, TH);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 18;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  } catch (e) { /* 스텁 환경에서는 무시 */ }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; // 확대 시 픽셀이 뭉개지지 않고 굵은 블록으로 보인다
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 4; // 낮은 시선각에서도 지면이 흐릿해지지 않게
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


// 로우폴리 치비 휴머노이드. 정면은 +z (rotation.y = atan2(dx,dz)가 이동 방향을 향한다).
// opts: { avatar, skin, uniform, hair, accent, weaponFam, grade, armorFam, capeColor, scale, polish }
// polish: 주인공·동료만 true — 초상화처럼 다듬은 비율·얼굴. 몬스터 휴머노이드는 polish을
// 넘기지 않으므로 기존 수치 그대로 만들어진다 (이 함수 안의 P ? A : B는 전부 P=false면 예전 값).
// 주인공 머리 앞면의 구면 캡 — 초상화 스타일 얼굴 특징(눈·눈썹·코·입·볼)을
// 캔버스 텍스처로 그려 머리 구(반지름 0.28) 앞면에 딱 붙인다.
// 캡은 머리 구와 같은 중심의 구면 조각(반지름 0.285)이라 떠 있지 않고,
// 투명 배경이라 머리 피부색이 그대로 보인다. 실패하면 null을 돌려줘
// 지오메트리 눈으로 폴백한다 (스텁 환경·텍스처 실패 시에도 얼굴이 있어야 한다).
function makeFaceCap(THREE, av) {
  try {
    if (typeof document === 'undefined' || !av) return null;
    const texCanvas = faceTextureFor3D(av, 256);
    if (!texCanvas || !texCanvas.width) return null;
    const tex = new THREE.CanvasTexture(texCanvas);
    if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    // phi: 앞면(+Z, π/2) 기준 ±0.75rad / theta: 0.85..2.05rad (이마 위~턱 아래)
    const geo = new THREE.SphereGeometry(0.285, 24, 16, Math.PI / 2 - 0.75, 1.5, 0.85, 1.2);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const cap = new THREE.Mesh(geo, m);
    cap.castShadow = false;
    cap.userData.faceCap = true;
    return cap;
  } catch (e) { return null; }
}

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
  const trimCol = opts.trimColor || null; // 장식색 (벨트·오라에 반영)
  const P = !!opts.polish; // 주인공·동료만: 초상화처럼 다듬은 비율·얼굴 (몬스터는 기존 그대로)
  // 의상 수집 전환 (2026-11-27): 코스튬은 외형에 반영되지 않는다 — 몸통은 항상 기본 교복 색이다.

  const skinM = mat(THREE, skin);
  const uniM = mat(THREE, uniform);
  const outfitM = uniM; // 기본 교복 색 (코스튬 색 변경 없음)
  const hairM = mat(THREE, hairCol);
  const pantsM = mat(THREE, av ? av.pants : 0x2c3242);
  const capeM = mat(THREE, capeCol);
  const gradeM = mat(THREE, gradeCol);
  const metalM = mat(THREE, 0xdfe7f2);
  const darkM = mat(THREE, 0x20242e);
  const M = { grade: gradeM, metal: metalM };

  const g = new THREE.Group();
  g.add(blobShadow(THREE, 0.42));

  // 다리 (고관절 y=0.55에서 회전) — 허벅지→무릎→종아리→부츠, 굴곡 있게
  // 피벗(0.55)과 전체 길이(0.5)는 그대로 — 걷기·스윙 애니메이션은 그대로 동작한다.
  const mkLeg = (sx) => {
    const leg = new THREE.Group(); leg.position.set(sx * 0.11 * bulk, 0.55, 0);
    const thigh = new THREE.Mesh(gBox(THREE, P ? 0.14 : 0.16, 0.24, 0.19), pantsM);
    thigh.position.y = -0.12; leg.add(thigh);
    const knee = new THREE.Mesh(gBox(THREE, P ? 0.11 : 0.13, 0.07, 0.15), pantsM);
    knee.position.y = -0.27; leg.add(knee);
    const calf = new THREE.Mesh(gBox(THREE, P ? 0.1 : 0.12, 0.16, 0.14), pantsM);
    calf.position.y = -0.38; leg.add(calf);
    const boot = new THREE.Mesh(gBox(THREE, P ? 0.16 : 0.18, 0.1, 0.26), darkM);
    boot.position.set(0, -0.5, 0.03); leg.add(boot);
    return leg;
  };
  const legL = mkLeg(-1); g.add(legL);
  const legR = mkLeg(1); g.add(legR);
  if (opts.robe || (av && av.skirt)) {
    const skirt = cone(THREE, 0.34 * bulk, 0.42, uniform, 8);
    skirt.position.y = 0.62; g.add(skirt);
  }

  // 몸통 그룹 (걷기 바운스·공격 돌진/기울기용, 자식은 절대 높이로 배치)
  const body = new THREE.Group(); body.userData.baseY = 0; g.add(body);
  // 몸통 — 가슴→허리→엉덩이 테이퍼 (스택 박스, 네모 상자가 아니라 몸처럼)
  // 전체 높이 0.56–1.14, 중심 0.85는 그대로 — 스윙·바운스 기준점 유지.
  if (P) {
    const stack = [
      [0.48, 0.12, 0.27, 1.08], // 가슴
      [0.46, 0.16, 0.26, 0.94], // 상체
      [0.40, 0.16, 0.24, 0.78], // 허리 (좁게)
      [0.44, 0.14, 0.25, 0.63], // 엉덩이
    ];
    for (const [w, h, d, y] of stack) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), outfitM);
      part.scale.x = bulk; part.position.y = y; body.add(part);
    }
    const shoulderBar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.26), outfitM);
    shoulderBar.scale.x = bulk; shoulderBar.position.y = 1.1; body.add(shoulderBar);
  } else {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), outfitM);
    torso.position.y = 0.85; body.add(torso);
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
  // 얼굴 특징: 주인공은 초상화 스타일 캔버스 텍스처를 구면 캡에 입히고,
  // 동료는 커진 지오메트리 눈(흰자+홍채+하이라이트+속눈썹)을 쓴다.
  // 캡이 없으면(동료·NPC·스텁 환경) 지오메트리 눈으로 폴백한다.
  let faceCap = null;
  if (P && av) faceCap = makeFaceCap(THREE, av);
  if (faceCap) head.add(faceCap);
  if (!faceCap) {
    if (P) {
      // 초상화 같은 큰 눈: 흰자 + 홍채 + 하이라이트 + 속눈썹
      const whiteM = mat(THREE, 0xffffff);
      const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
      for (const s of [-1, 1]) {
        const sc = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), whiteM);
        sc.scale.set(1, 1.3, 0.45); sc.position.set(0.11 * s, 0.02, 0.24); head.add(sc);
        const ir = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 6), irisM);
        ir.scale.set(1, 1.3, 0.5); ir.position.set(0.11 * s, 0.02, 0.26); head.add(ir);
        const hl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), hlM);
        hl.position.set(0.11 * s - 0.025, 0.06, 0.285); head.add(hl);
        const lash = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.02), darkM);
        lash.position.set(0.11 * s, 0.11, 0.27); lash.rotation.z = -s * 0.12; head.add(lash);
      }
    } else {
      const eyeGeo = new THREE.SphereGeometry(0.04, 6, 5);
      const eyeL = new THREE.Mesh(eyeGeo, irisM); eyeL.position.set(-0.11, 0.02, 0.26); head.add(eyeL);
      const eyeR = new THREE.Mesh(eyeGeo, irisM); eyeR.position.set(0.11, 0.02, 0.26); head.add(eyeR);
    }
  }
  if (av && !faceCap) {
    // 눈썹 (머리색) — 얼굴 인상 구분 (다듬으면 안쪽이 살짝 올라간 초상화 눈썹)
    const browGeo = new THREE.BoxGeometry(P ? 0.09 : 0.1, P ? 0.02 : 0.025, 0.02);
    const browL = new THREE.Mesh(browGeo, hairM); browL.position.set(-0.11, 0.13, 0.27); if (P) browL.rotation.z = 0.15; head.add(browL);
    const browR = new THREE.Mesh(browGeo, hairM); browR.position.set(0.11, 0.13, 0.27); if (P) browR.rotation.z = -0.15; head.add(browR);
  }
  if (!faceCap) {
    // 코·입 (얼굴이 밋밋하다는 피드백 반영) — 캡이 있으면 텍스처에 이미 있다
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), skinM);
    nose.position.set(0, -0.03, 0.29); head.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(P ? 0.11 : 0.1, 0.02, 0.02), mat(THREE, 0x8a4a3a));
    mouth.position.set(0, -0.14, 0.28); head.add(mouth);
  }
  if (P && !faceCap) {
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

  // 팔 (어깨 y=1.08에서 회전) — 어깨→상완→팔꿈치→전완→손, 굴곡 있게
  // 피벗(1.08)과 전체 길이(0.5)는 그대로 — 스윙 키프레임은 그대로 동작한다.
  const mkArm = (sx) => {
    const arm = new THREE.Group(); arm.position.set(sx * (P ? 0.3 : 0.33) * bulk, 1.08, 0);
    const upper = new THREE.Mesh(gBox(THREE, P ? 0.13 : 0.15, 0.22, P ? 0.15 : 0.17), outfitM);
    upper.position.y = -0.11; arm.add(upper);
    const elbow = new THREE.Mesh(gBox(THREE, P ? 0.1 : 0.12, 0.06, P ? 0.12 : 0.14), outfitM);
    elbow.position.y = -0.25; arm.add(elbow);
    const fore = new THREE.Mesh(gBox(THREE, P ? 0.11 : 0.13, 0.2, P ? 0.13 : 0.15), outfitM);
    fore.position.y = -0.38; arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skinM);
    hand.position.set(0, -0.48, 0); arm.add(hand);
    return arm;
  };
  const armR = mkArm(1); body.add(armR);
  const armL = mkArm(-1); body.add(armL);
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

  // 등급 오라 (희귀 이상)
  if (grade >= 2) {
    const aura = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 24),
      new THREE.MeshBasicMaterial({ color: trimCol || gradeCol, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.02; g.add(aura);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (opts.scale) g.scale.setScalar(opts.scale);
  if (P) {
    // 컨셉 시트의 굵은 어두운 아웃라인 — 뒤집은 껍질(inverted hull)로 머리·몸통 실루엣에
    // 어두운 테를 두른다 (종이 인형이 아니라 입체감 있는 윤곽). 그림자는 만들지 않는다.
    const hullM = new THREE.MeshBasicMaterial({ color: 0x1e2230, side: THREE.BackSide });
    const headHull = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), hullM);
    headHull.castShadow = false; head.add(headHull);
    const torsoHull = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.64, 0.32), hullM);
    torsoHull.scale.x = bulk; torsoHull.castShadow = false; torsoHull.position.set(0, 0.85, 0); body.add(torsoHull);
  }
  const sc = opts.scale || 1;
  // 판정 분리 (2026-11-27 아바타 축소): 보이는 모델만 작아지고, 판정(반경·머리 높이·키)은
  // 예전 스케일 그대로 둔다 — 이동 충돌·공격 사거리·히트박스가 비주얼 축소로 바뀌지 않게.
  // hitScale을 안 넘기면(몬스터·NPC) 예전처럼 scale과 같다.
  const hsc = opts.hitScale || sc;
  g.userData = {
    avatar: av, height: 1.9 * hsc, headY: 1.6 * hsc, radius: 0.42 * hsc,
    armR, armL, legL, legR, body, head, weapon, weaponGroup,
    isHeroSprite: false,
  };
  return g;
}

// ---------- 캐릭터 ----------
// 3D 로우폴리 휴머노이드. 장착 무기·방어구가 외형에 반영된다.
// 주인공 — 3D 로우폴리 휴머노이드 (입체감). 초상화처럼 다듬은 비율·얼굴(polish),
// 장착 무기·방어구·코스튬이 그대로 보인다. 아바타 축소 (2026-11-27):
// 1.9m × 1.16 ≈ 2.2m + 카메라를 뒤로 빼서 화면 높이의 ~10%로 보인다 (예전 2.85m·~16%).
// 판정은 hitScale 1.5로 예전 그대로 — 비주얼만 작아진다.
export const PLAYER_SCALE = 1.16;
export function makePlayer(THREE, family = 'sword', av = null, equip = null, appearance = null) {
  const A = av || AVATAR_MAP.boyA;
  const eq = visualEquip(equip, appearance);
  const armor = eq.armor || null;
  return makeHumanoid3D(THREE, {
    avatar: A, weaponFam: family || 'sword', polish: true, scale: PLAYER_SCALE, hitScale: 1.5,
    armorFam: armor ? armor.fam : null,
    capeColor: armor && armor.capeColor ? armor.capeColor : null,
    trimColor: armor && armor.trimColor ? armor.trimColor : null,
    grade: eq.weapon ? (eq.weapon.grade || 0) : 0,
  });
}
// ---------- GLB 주인공 테스트 (?hero=glb) ----------
// Tripo에서 만든 시우 GLB(assets/siwoo.glb)를 플레이어 대신 쓴다. 이 함수를 부르는 곳은
// game.js의 GLB 분기뿐이라, 플래그가 없으면 절차적 makeHumanoid3D 주인공이 그대로다.
// 주인공 GLB는 Tripo Studio에서 리깅된 모델(assets/siwoo.glb)이라 뼈대가 있다 —
// 걷기·공격할 때 팔·다리 뼈를 코드로 직접 움직인다 (makeGlbHeroRigAnimator).
// 리깅이 없는 GLB가 들어오면 기존 전신 애니메이터(바운스 + 돌진)로 폴백한다.
// 구워진 검은 로드 때 제거하고 장착 무기를 오른손에 붙인다 (attachGlbHandWeapon).
// 의상 수집 전환 (2026-11-27): GLB 주인공은 항상 기본 교복이다. 코스튬 3D 파츠는
// 붙이지 않는다 (예전 applyGlbHeroCostume은 삭제됨).
// 얼굴은 +Z를 향한다 (절차적 플레이어의 앞면과 같은 방향 — 소프트웨어 렌더로 확인됨).
export const GLB_HERO_TARGET_HEIGHT = 2.2; // 절차적 주인공과 같은 키 (makePlayer 1.9 × 1.16)
// blobShadow 기준 키 — 축소 전 주인공 키 (그림자 반경은 키에 비례해 줄어든다)
const GLB_SHADOW_REF_HEIGHT = 2.85;
const GLTF_LOADER_URLS = [
  '../vendor/loaders/GLTFLoader.js',
  '../vendor/GLTFLoader.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
];

async function importGlTFLoader() {
  let lastErr = null;
  for (const u of GLTF_LOADER_URLS) {
    try {
      const m = await import(u);
      if (m && m.GLTFLoader) return m.GLTFLoader;
    } catch (e) { lastErr = e; }
  }
  throw new Error('gltf-loader-unavailable' + (lastErr && lastErr.message ? ': ' + lastErr.message : ''));
}

function loadGlbWithLoader(LoaderClass, url) {
  return new Promise((resolve, reject) => {
    const loader = new LoaderClass();
    loader.load(url, resolve, undefined, (err) => reject(err instanceof Error ? err : new Error('glb-load-failed')));
  });
}

// GLB 전신 애니메이션: 팔다리는 건드리지 않고 몸 전체만 움직인다.
// (게임 루프가 매 프레임 mesh.position을 플레이어 위치로 다시 맞추므로 += 보정이다.)
function makeGlbHeroAnimator(outer, inner) {
  let t = 0;
  return (p, dt) => {
    t += dt;
    const on = p.atkAnim > 0;
    const k = on ? Math.min(1, 1 - p.atkAnim / (p.atkAnimMax || 0.22)) : 1;
    const bobY = (p.moving && !on) ? Math.abs(Math.sin(p.walkT)) * 0.05 : Math.sin(t * 2.1) * 0.012;
    outer.position.y += bobY;
    if (on) {
      // 공격 돌진: 빠르게 나가서 돌아온다 (전신만)
      const s = Math.sin(k * Math.PI);
      outer.position.x += Math.sin(p.facing) * 0.3 * s;
      outer.position.z += Math.cos(p.facing) * 0.3 * s;
      inner.rotation.x = 0.08 * s; // 살짝 앞으로 숙이기
    } else {
      inner.rotation.x = 0;
    }
  };
}

// [skin-brightness-fix] Tripo GLB의 baseColorFactor가 0.8이라 GLTFLoader가
// 재질 색을 (0.8, 0.8, 0.8)로 만들어 텍스처 전체를 0.8배로 어둡게 렌더링한다
// (피부 텍스처를 밝게 고쳐도 여전히 어둡게 보이는 원인). 로드 직후 색을
// 흰색(1, 1, 1)으로 되돌려 텍스처 본연의 밝기로 보이게 한다. 텍스처(map)는
// 그대로 두고 색만 되돌리므로 다른 부위 밝기도 함께 정상화된다.
// [skin-brightness-fix-3] 색을 흰색으로 되돌려도 48° 탑다운 시점에서 얼굴이
// 그림자에 가려 여전히 어둡게 보여, 자체발광(emissive)으로 얼굴을 띄운다.
// [skin-brightness-fix-4] 균일 발광(emissiveIntensity 2.0)은 교복·머리까지
// 하얗게 띄워 캐릭터 전체가 빛나는 유령처럼 보였다. 그래서 basecolor
// 텍스처를 발광 맵(emissiveMap)으로 써서 밝은 부분(피부)만 발광하고
// 어두운 부분(검은 머리·남색 교복)은 거의 발광하지 않게 한다.
// 주인공·동료 GLB 공통 (loadGlbHero / loadGlbCompanion 둘 다 이걸 쓴다).
function applyGlbSkinFix(src) {
  src.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.color) m.color.setRGB(1, 1, 1);
      if (m && m.emissive) {
        if (m.map) m.emissiveMap = m.map;
        m.emissive.setRGB(1, 1, 1);
        m.emissiveIntensity = 0.35;
        m.needsUpdate = true;
      }
    }
  });
}
// [/skin-brightness-fix]

// GLB 월드 바운딩박스: 각 메쉬의 지오메트리 bbox 8개 모서리를 matrixWorld로
// 변환해 합친다. Box3.setFromObject는 스킨 메쉬의 캐시된 boundingBox(뼈대
// 기준, 로드 시점 boneMatrices)를 쓰는데, 리깅된 GLB는 노드 체인
// (node_0 rotY -90° × 메쉬 rotX -90°)이 축을 꼬아서 Y 크기를 키(0.998)가
// 아니라 깊이(0.456)로 잰다 — 그래서 시우 리깅 GLB 스케일이 6.24(2.19배)가
// 돼 캐릭터가 화면에서 너무 크게 보이고 발이 땅 아래로 내려갔다.
// 지오메트리 bbox는 바인드 포즈(렌더러가 매 프레임 skeleton.update() 뒤
// 실제로 그리는 자세)라 정확하고, 리그 없는 GLB·동료 GLB는 setFromObject와
// 같은 값을 준다 (검증됨: 4종 동료·리그 없는 시우 모두 배율 변화 1.000x).
function glbWorldBox(THREE, src) {
  src.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  src.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      v.applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
    }
  });
  return box;
}

// GLB 정적 캐릭터 뼈대 (주인공·동료 공통): 키 맞추기 + 그림자 + 팔다리 피벗 스텁.
// GLB 원본 높이(약 99 단위, y=0 바닥)를 목표 키로 맞추고, y=0에 세운다.
// 팔다리 피벗 스텁 — 빈 Object3D라서 돌려도 보이는 부분은 움직이지 않는다.
// 기존 코드가 userData.armR/armL/legL/legR/head를 찾아도 크래시가 나지 않는다.
function buildGlbCharacter(THREE, src, targetHeight, headY, radius, tag) {
  const box = glbWorldBox(THREE, src);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (!isFinite(size.y) || size.y <= 0) throw new Error('glb-bad-bounds');
  const scale = targetHeight / size.y;
  const inner = new THREE.Group();
  src.position.y -= box.min.y * scale;
  src.scale.setScalar(scale);
  inner.add(src);
  // 그림자 반경은 축소 전 키(2.85m) 기준 0.42에서 키에 비례해 줄어든다 (주인공 0.32, 동료 0.29)
  inner.add(blobShadow(THREE, 0.42 * (targetHeight / GLB_SHADOW_REF_HEIGHT)));
  // 그림자 (절차적 캐릭터와 같은 방식)
  inner.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const outer = new THREE.Group();
  outer.add(inner);
  const k = targetHeight / GLB_HERO_TARGET_HEIGHT;
  const stub = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y * k, z); inner.add(o); return o; };
  const armR = stub(0.28, 1.08, 0);
  const armL = stub(-0.28, 1.08, 0);
  const legL = stub(-0.11, 0.55, 0);
  const legR = stub(0.11, 0.55, 0);
  const head = stub(0, 1.44, 0);
  outer.userData = {
    avatar: null, height: targetHeight, headY, radius, glbScale: scale,
    armR, armL, legL, legR, body: inner, head, weapon: null, weaponGroup: null,
    isHeroSprite: false, [tag]: true,
  };
  return { outer, inner };
}

// 리깅된 GLB 주인공 뼈대 찾기: 스킨이 있는 메쉬의 스켈레톤에서 팔·다리 뼈를 찾는다.
// GLTFLoader가 뼈대 이름의 콜론을 제거해 mixamorig:LeftArm이 mixamorigLeftArm이
// 되므로, 콜론 유무·대소문자를 무시하고 찾는다. 스킨이 없으면 null.
function findRigBones(src) {
  let skinned = null;
  src.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o; });
  if (!skinned) return null;
  const norm = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const byNorm = new Map();
  for (const b of skinned.skeleton.bones) byNorm.set(norm(b.name), b);
  const get = (name) => byNorm.get(norm(name)) || null;
  const bones = {
    armL: get('mixamorig:LeftArm'),
    foreArmL: get('mixamorig:LeftForeArm'),
    armR: get('mixamorig:RightArm'),
    foreArmR: get('mixamorig:RightForeArm'),
    upLegL: get('mixamorig:LeftUpLeg'),
    legL: get('mixamorig:LeftLeg'),
    upLegR: get('mixamorig:RightUpLeg'),
    legR: get('mixamorig:RightLeg'),
  };
  if (!bones.armR || !bones.armL || !bones.upLegL || !bones.upLegR) return null;
  // 바인드 포즈 쿼터니언을 저장한다: 뼈대의 바인드 회전은 identity가 아니라서
  // rotation.x/z를 직접 대입하면 자세가 무너진다. 매 프레임 기본 자세로
  // 되돌린 뒤 상대 회전을 곱한다.
  for (const b of Object.values(bones)) if (b) b.userData.baseQuat = b.quaternion.clone();
  return bones;
}

// 리깅된 GLB 주인공 애니메이터: 전신 바운스·돌진(기존 makeGlbHeroAnimator과 동일) +
// 뼈대 팔다리 (걷기 스윙 + 검 휘두르기). Head/Hands/Spine은 건드리지 않는다.
// Mixamo 뼈대 축 (실제 GLB 프로브로 확인): rotateZ가 앞뒤 스윙(음수=앞으로),
// rotateX가 좌우 스윙(오른팔 양수=몸통 가로지르기). 곡선은 절차적
// animateArm의 검 휘두르기 키프레임과 같다 (타격 → 팔로우스루 → 회복).
function makeGlbHeroRigAnimator(outer, inner, bones) {
  let t = 0;
  const eoc = (x) => 1 - Math.pow(1 - x, 3);
  const sm = (x) => x * x * (3 - 2 * x);
  // 뼈대를 기본 자세로 되돌린 뒤 상대 회전을 곱한다 (rz=앞뒤, rx=좌우).
  const setBone = (b, rz, rx) => {
    if (!b) return;
    b.quaternion.copy(b.userData.baseQuat);
    if (rz) b.rotateZ(rz);
    if (rx) b.rotateX(rx);
  };
  const restBones = () => {
    for (const b of Object.values(bones)) if (b) b.quaternion.copy(b.userData.baseQuat);
  };
  return (p, dt) => {
    t += dt;
    const on = p.atkAnim > 0;
    const k = on ? Math.min(1, 1 - p.atkAnim / (p.atkAnimMax || 0.22)) : 1;
    const bobY = (p.moving && !on) ? Math.abs(Math.sin(p.walkT)) * 0.05 : Math.sin(t * 2.1) * 0.012;
    outer.position.y += bobY;
    if (on) {
      const s = Math.sin(k * Math.PI);
      outer.position.x += Math.sin(p.facing) * 0.3 * s;
      outer.position.z += Math.cos(p.facing) * 0.3 * s;
      inner.rotation.x = 0.08 * s; // 살짝 앞으로 숙이기
      // 키프레임 보간: stops = [진행도, 값, 구간 이징]. 첫 값과 마지막 값은 항상 0이다.
      const kf = (stops) => {
        if (k <= stops[0][0]) return stops[0][1];
        for (let i = 1; i < stops.length; i++) {
          if (k <= stops[i][0]) {
            const t0 = stops[i - 1][0], v0 = stops[i - 1][1];
            const t1 = stops[i][0], v1 = stops[i][1];
            const e = stops[i][2] || sm;
            return v0 + (v1 - v0) * e((k - t0) / (t1 - t0));
          }
        }
        return stops[stops.length - 1][1];
      };
      // 검: 빠르게 가로 베기 → 반대쪽으로 더 넘어가는 팔로우스루 → 회복
      const rx = kf([[0, 0], [0.32, -1.1, eoc], [0.62, -0.7, sm], [1, 0, sm]]);
      const rz = kf([[0, 0], [0.32, 1.5, eoc], [0.62, 1.75, sm], [1, 0, sm]]);
      setBone(bones.armR, rx, rz);
      setBone(bones.foreArmR, rx * 0.5, 0);
      setBone(bones.armL, 0, 0);
      // 공격 중에는 다리를 디딤 자세로 고정한다
      setBone(bones.upLegL, -0.12, 0);
      setBone(bones.upLegR, 0.12, 0);
      setBone(bones.legL, 0.1, 0);
      setBone(bones.legR, 0.1, 0);
      // 몸통 비틀기는 넣지 않는다: inner 전체를 비틀면 발까지 돌아가 디딤 자세가
      // 무너지고, Spine 뼈는 건드리지 않기로 했다 (머리·손과 같은 이유).
    } else {
      inner.rotation.x = 0;
      if (p.moving) {
        const w = Math.sin(p.walkT);
        const legSwing = w * 0.55, armSwing = w * 0.2;
        setBone(bones.upLegL, -legSwing, 0);
        setBone(bones.upLegR, legSwing, 0);
        setBone(bones.legL, Math.max(0, -w) * 0.7, 0);
        setBone(bones.legR, Math.max(0, w) * 0.7, 0);
        setBone(bones.armL, armSwing, 0);
        setBone(bones.armR, -armSwing, 0);
        setBone(bones.foreArmL, 0, 0);
        setBone(bones.foreArmR, 0, 0);
      } else {
        restBones();
      }
    }
  };
}

// 리깅된 GLB 동료 애니메이터: 주인공 리깅 애니메이터와 같은 Mixamo 8본 방식
// (걷기 스윙 + 공격 휘두르기). 위치 밥은 동료 쪽(updateCompanions)이
// 맡으므로 여기서는 뼈대·숙임·돌진만 한다. Head/Hands/Spine은 건드리지 않는다.
function makeGlbCompanionRigAnimator(outer, inner, bones) {
  const eoc = (x) => 1 - Math.pow(1 - x, 3);
  const sm = (x) => x * x * (3 - 2 * x);
  // 뼈대를 기본 자세로 되돌린 뒤 상대 회전을 곱한다 (rz=앞뒤, rx=좌우).
  const setBone = (b, rz, rx) => {
    if (!b) return;
    b.quaternion.copy(b.userData.baseQuat);
    if (rz) b.rotateZ(rz);
    if (rx) b.rotateX(rx);
  };
  const restBones = () => {
    for (const b of Object.values(bones)) if (b) b.quaternion.copy(b.userData.baseQuat);
  };
  return (p, dt) => {
    const on = p.atkAnim > 0;
    const k = on ? Math.min(1, 1 - p.atkAnim / (p.atkAnimMax || 0.22)) : 1;
    if (on) {
      const s = Math.sin(k * Math.PI);
      outer.position.x += Math.sin(p.facing) * 0.3 * s;
      outer.position.z += Math.cos(p.facing) * 0.3 * s;
      inner.rotation.x = 0.08 * s; // 살짝 앞으로 숙이기
      const kf = (stops) => {
        if (k <= stops[0][0]) return stops[0][1];
        for (let i = 1; i < stops.length; i++) {
          if (k <= stops[i][0]) {
            const t0 = stops[i - 1][0], v0 = stops[i - 1][1];
            const t1 = stops[i][0], v1 = stops[i][1];
            const e = stops[i][2] || sm;
            return v0 + (v1 - v0) * e((k - t0) / (t1 - t0));
          }
        }
        return stops[stops.length - 1][1];
      };
      // 오른팔 휘두르기: 와인드업 → 타격 → 팔로우스루 → 회복 (주인공과 같은 곡선)
      const rx = kf([[0, 0], [0.32, -1.1, eoc], [0.62, -0.7, sm], [1, 0, sm]]);
      const rz = kf([[0, 0], [0.32, 1.5, eoc], [0.62, 1.75, sm], [1, 0, sm]]);
      setBone(bones.armR, rx, rz);
      setBone(bones.foreArmR, rx * 0.5, 0);
      setBone(bones.armL, 0, 0);
      // 공격 중에는 다리를 디딤 자세로 고정한다
      setBone(bones.upLegL, -0.12, 0);
      setBone(bones.upLegR, 0.12, 0);
      setBone(bones.legL, 0.1, 0);
      setBone(bones.legR, 0.1, 0);
    } else {
      inner.rotation.x = 0;
      if (p.moving) {
        const w = Math.sin(p.walkT);
        const legSwing = w * 0.55, armSwing = w * 0.2;
        setBone(bones.upLegL, -legSwing, 0);
        setBone(bones.upLegR, legSwing, 0);
        setBone(bones.legL, Math.max(0, -w) * 0.7, 0);
        setBone(bones.legR, Math.max(0, w) * 0.7, 0);
        setBone(bones.armL, armSwing, 0);
        setBone(bones.armR, -armSwing, 0);
        setBone(bones.foreArmL, 0, 0);
        setBone(bones.foreArmR, 0, 0);
      } else {
        restBones();
      }
    }
  };
}

// [glb-sword-fix] 리깅된 시우 GLB의 검은 메쉬에 구워져 있다 (Tripo 입력 이미지가
// 검을 든 모습이라 검 지오메트리가 모델 안에 들어 있다 — 게임 무기 오브젝트가
// 아니다. buildGlbCharacter는 GLB 주인공의 weapon을 null로 둔다). 그래서
// 무기를 바꿔도 검은 그대로 보이고, 검날 정점의 스킨 가중치가 다리 뼈에
// 24%나 걸려 있어 (검날 끝은 RightUpLeg 0.56) 걸을 때 검날이 다리를 따라가고
// 공격할 때도 팔을 덜 따라간다. 검날 정점을 오른손 뼈에 100% 다시 묶어
// 검 전체가 손에 고정되게 한다. 바인드 포즈에서는 모든 뼈가 기본 자세라
// 정점 위치는 그대로이고, 애니메이션 중에만 검의 움직임이 바뀐다.
// 검날 판별: 베이스컬러 텍스처에서 푸른 강철색(B>95, B>R+25, B>G+10, R<150)인
// 정점 중 오른손 근처 상자 안에 있는 것. 손가락·팔뚝 정점이 섞여 들어와도
// 해롭지 않다 — 손가락·팔뚝 뼈는 애니메이터가 건드리지 않아 손 뼈와
// 완전히 같은 움직임이라, 손에 100% 묶어도 위치가 그대로이다.
// (무기를 바꿔도 구워진 검이 보이는 것은 removeGlbSword + attachGlbHandWeapon이
// 해결한다 — 구워진 검날은 로드 때 제거하고 게임 무기를 오른손에 붙인다.)
function makeTexelSamplerFromImage(img) {
  try {
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c2d = cv.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(img, 0, 0);
    const data = c2d.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width, H = cv.height;
    return (u, v) => {
      const x = Math.min(W - 1, Math.max(0, (u * W) | 0));
      const y = Math.min(H - 1, Math.max(0, ((1 - v) * H) | 0));
      const o = (y * W + x) * 4;
      return [data[o], data[o + 1], data[o + 2]];
    };
  } catch (e) { return null; }
}

// 검날 정점을 오른손 뼈에 100% 다시 묶는다. texelAt(u, v) -> [r, g, b].
// (테스트에서 주입할 수 있게 샘플러를 인자로 받는다.)
export function fixGlbSwordSkinning(THREE, src, texelAt) {
  if (!texelAt) return 0;
  let skinned = null;
  src.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o; });
  if (!skinned) return 0;
  const skel = skinned.skeleton;
  const norm = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  // (norm()으로 양쪽을 정규화하므로 대소문자는 상관없음)
  let handIdx = -1;
  for (let i = 0; i < skel.bones.length; i++) {
    if (norm(skel.bones[i].name) === norm('mixamorig:RightHand')) { handIdx = i; break; }
  }
  if (handIdx < 0) return 0;
  const pos = skinned.geometry.attributes.position;
  const uv = skinned.geometry.attributes.uv;
  const skinIndex = skinned.geometry.attributes.skinIndex;
  const skinWeight = skinned.geometry.attributes.skinWeight;
  if (!pos || !uv || !skinIndex || !skinWeight) return 0;
  // 검날이 붙지 말아야 할 뼈 (몸통·머리·반대쪽 다리) — norm()으로 정규화해 비교
  const noTouch = new Set(['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:LeftShoulder'].map(norm));
  src.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  skel.bones[handIdx].getWorldPosition(hp);
  const v = new THREE.Vector3();
  let fixed = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(skinned.matrixWorld);
    // 오른손 근처 상자 (검날이 손에서 다리 앞까지 걸쳐 있는 범위)
    if (v.x < hp.x - 0.25 || v.x > hp.x + 0.38 || v.y < hp.y - 0.55 || v.y > hp.y + 0.10 || v.z < hp.z || v.z > hp.z + 0.40) continue;
    // 가장 큰 가중치의 뼈가 몸통·머리·반대쪽 다리면 건드리지 않는다
    let topIdx = -1, topW = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w > topW) { topW = w; topIdx = skinIndex.getComponent(i, k); }
    }
    if (topIdx < 0 || !skel.bones[topIdx] || noTouch.has(norm(skel.bones[topIdx].name))) continue;
    const c = texelAt(uv.getX(i), uv.getY(i));
    if (!c) continue;
    // 푸른 강철색 검날 (남색 교복·검은 머리·피부는 이 색이 아니다)
    if (!(c[2] > 95 && c[2] > c[0] + 25 && c[2] > c[1] + 10 && c[0] < 150)) continue;
    skinIndex.setXYZW(i, handIdx, 0, 0, 0);
    skinWeight.setXYZW(i, 1, 0, 0, 0);
    fixed++;
  }
  if (fixed > 0) {
    skinIndex.needsUpdate = true;
    skinWeight.needsUpdate = true;
  }
  return fixed;
}

// [glb-sword-remove] 구워진 검날 정점을 오른손 관절 위치로 접어 검날을
// 사실상 사라지게 한다. 검날 정점은 손가락·다리 등 몸통 정점과 삼각형을
// 공유해 인덱스 버퍼로 지우면 손·다리에 구멍이 나므로, 정점 자체를 손
// 관절(손 메쉬 안에 숨는 한 점)으로 옮기는 방식을 쓴다. 남은 삼각형은
// 손 관절에서 몸통 접촉점까지 이어지는 얇은 조각(sliver)이 되지만,
// 대부분이 몸통색이고 게임 카메라 거리에서는 거의 보이지 않는다
// (소프트웨어 렌더로 확인: 전신·뒷모습에서 검날이 사라지고 캐릭터가
// 깨끗하게 보인다). 자루(손잡이)는 색이 피부와 겹쳐 안정적으로 구분할
// 수 없어 남겨 둔다 — 게임 무기(attachGlbHandWeapon)의 자루가 같은
// 자리를 덮는다. fixGlbSwordSkinning 뒤에 부른다 (이미 손에 100% 묶인
// 정점을 접는다). 반환: 접은 검날 정점 수.
export function removeGlbSword(THREE, src, texelAt) {
  if (!texelAt) return 0;
  let skinned = null;
  src.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o; });
  if (!skinned) return 0;
  const skel = skinned.skeleton;
  const norm = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  let handIdx = -1;
  for (let i = 0; i < skel.bones.length; i++) {
    if (norm(skel.bones[i].name) === norm('mixamorig:RightHand')) { handIdx = i; break; }
  }
  if (handIdx < 0) return 0;
  const pos = skinned.geometry.attributes.position;
  const uv = skinned.geometry.attributes.uv;
  const skinIndex = skinned.geometry.attributes.skinIndex;
  const skinWeight = skinned.geometry.attributes.skinWeight;
  if (!pos || !uv || !skinIndex || !skinWeight) return 0;
  const noTouch = new Set(['mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2', 'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot', 'mixamorig:LeftShoulder'].map(norm));
  src.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  skel.bones[handIdx].getWorldPosition(hp);
  // 손 관절의 바인드 위치를 메쉬 로컬(원본 GLB) 좌표로 바꾼다
  const handLocal = new THREE.Vector3().copy(hp);
  skinned.worldToLocal(handLocal);
  const v = new THREE.Vector3();
  let removed = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(skinned.matrixWorld);
    // 오른손 근처 상자 (검날이 손에서 다리 앞까지 걸쳐 있는 범위)
    if (v.x < hp.x - 0.25 || v.x > hp.x + 0.38 || v.y < hp.y - 0.55 || v.y > hp.y + 0.10 || v.z < hp.z || v.z > hp.z + 0.40) continue;
    let topIdx = -1, topW = -1;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight.getComponent(i, k);
      if (w > topW) { topW = w; topIdx = skinIndex.getComponent(i, k); }
    }
    if (topIdx < 0 || !skel.bones[topIdx] || noTouch.has(norm(skel.bones[topIdx].name))) continue;
    const c = texelAt(uv.getX(i), uv.getY(i));
    if (!c) continue;
    // 푸른 강철색 검날 (fixGlbSwordSkinning과 같은 판별식)
    if (!(c[2] > 95 && c[2] > c[0] + 25 && c[2] > c[1] + 10 && c[0] < 150)) continue;
    pos.setXYZ(i, handLocal.x, handLocal.y, handLocal.z);
    skinIndex.setXYZW(i, handIdx, 0, 0, 0);
    skinWeight.setXYZW(i, 1, 0, 0, 0);
    removed++;
  }
  if (removed > 0) {
    pos.needsUpdate = true;
    skinIndex.needsUpdate = true;
    skinWeight.needsUpdate = true;
  }
  return removed;
}

export async function loadGlbHero(THREE, url, opts = {}) {
  const LoaderClass = await importGlTFLoader();
  const gltf = await loadGlbWithLoader(LoaderClass, url);
  const src = gltf.scene;
  applyGlbSkinFix(src);
  const { outer, inner } = buildGlbCharacter(THREE, src, GLB_HERO_TARGET_HEIGHT, 2.4, 0.63, 'glbHero'); // headY 2.4·반경 0.63은 판정용 예전 값 그대로 (비주얼 키만 2.2m로 축소)
  // [glb-sword-fix] 구워진 검날을 오른손에 다시 묶는다 (다리를 따라가지 않게)
  let swordFixed = 0;
  let swordRemoved = 0;
  if (opts.fixSword !== false) {
    outer.updateMatrixWorld(true);
    let img = null;
    src.traverse((o) => {
      if (img || !o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (m && m.map && m.map.image) { img = m.map.image; break; } }
    });
    const sampler = makeTexelSamplerFromImage(img);
    swordFixed = fixGlbSwordSkinning(THREE, src, sampler);
    // [glb-sword-remove] 검날 정점을 손 관절로 접어 검날을 사라지게 한다
    if (swordFixed > 0) swordRemoved = removeGlbSword(THREE, src, sampler);
  }
  outer.userData.swordFixed = swordFixed;
  outer.userData.swordRemoved = swordRemoved;
  // 리깅된 GLB면 뼈대 애니메이터를, 아니면 기존 전신 애니메이터를 쓴다
  const bones = findRigBones(src);
  outer.userData.animate = bones
    ? makeGlbHeroRigAnimator(outer, inner, bones)
    : makeGlbHeroAnimator(outer, inner);
  outer.userData.rigBones = bones;
  return outer;
}

// 손 뼈의 기본 자세(바인드) 기준 쿼터니언 — outer(캐릭터) 기준 상대값.
// 애니메이터가 움직이는 팔·팔뚝 뼈는 저장된 baseQuat(바인드 자세)을 쓰고,
// 손 뼈 자체는 애니메이터가 건드리지 않아 현재 쿼터니언이 곧 바인드다.
// outer 자체의 facing 회전은 제외한다 (캐릭터 기준 방향이 필요하므로).
// 무기 장착 시점(전투 중 팔이 들려 있을 때도)에도 기본 자세 기준이라
// 결과가 일정하다.
function glbHandRestQuat(THREE, outer, hand) {
  const chain = [];
  let o = hand;
  while (o && o !== outer) { chain.unshift(o); o = o.parent; }
  const q = new THREE.Quaternion();
  for (const node of chain) {
    const lq = (node.userData && node.userData.baseQuat) ? node.userData.baseQuat : node.quaternion;
    q.multiply(lq);
  }
  return q;
}

// [glb-hand-weapon] GLB 주인공의 오른손 뼈에 게임 무기를 붙인다.
// buildWeaponMesh로 만든 무기(자루가 원점, 날이 로컬 -Y)는 절차적
// 주인공이 armR 피벗에 붙는 것과 같은 방식이다. GLB 손 뼈의 로컬 공간은
// 원본 GLB 단위(약 1 단위)라 무기 그룹을 1/스케일로 줄여 게임 크기
// (날 0.5m)로 맞춘다.
// 날붙이(검·단검·도끼·메이스)는 기본 자세에서 날이 위·앞을 향하게 든다.
// 구워진 검의 손 로컬 방향(-0.104, 0.731, 0.675 — 프로브 실측)은 기본
// 자세에서 월드 아래를 향해서, 검날이 다리 옆으로 길게 늘어져 다리에
// 붙은 것처럼 보였다 (기본 자세 실측: 날 방향 (0.32,-0.94,-0.13),
// 날-허벅지 0.21m, 날끝-무릎 0.22m). 위·앞으로 들면 손에 든 게 또렷하다.
// 지팡이·책·활·석궁은 -Y 끝이 아래를 향하는 게 맞아서 예전 방향을 유지한다
// (지팡이 구슬 위로, 책은 손 아래로).
// 장착 무기를 바꾸면 다시 불러 이전 무기를 떼고 새 무기를 붙인다.
// 손 뼈 자체는 건드리지 않는다 (애니메이터가 팔·팔뚝만 움직인다).
export function attachGlbHandWeapon(THREE, outer, fam, grade) {
  if (!outer) return null;
  let skinned = null;
  outer.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton) skinned = o; });
  if (!skinned) return null;
  const skel = skinned.skeleton;
  const norm = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  let hand = null;
  for (const b of skel.bones) {
    if (norm(b.name) === norm('mixamorig:RightHand')) { hand = b; break; }
  }
  if (!hand) return null;
  // 이전 무기 떼기 (지오메트리·재질 정리)
  for (const p of hand.children.filter((c) => c.userData && c.userData.glbHandWeapon)) {
    hand.remove(p);
    p.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mm of mats) if (mm && mm.dispose) mm.dispose();
    });
  }
  const g = Math.min(5, Math.max(0, grade || 0));
  const M = { grade: mat(THREE, GRADES[g].color), metal: mat(THREE, 0xdfe7f2) };
  const weaponGroup = new THREE.Group();
  weaponGroup.userData.glbHandWeapon = true;
  weaponGroup.add(buildWeaponMesh(THREE, fam || 'sword', M));
  // 날붙이는 기본 자세에서 날이 위·앞을 향하게, 나머지는 예전 방향 유지
  let bladeDir;
  if (fam === 'sword' || fam === 'dagger' || fam === 'axe' || fam === 'mace') {
    const qRest = glbHandRestQuat(THREE, outer, hand);
    const want = new THREE.Vector3(-0.2, 1, 0.5).normalize(); // 캐릭터 기준: 위·앞·바깥쪽
    bladeDir = want.applyQuaternion(qRest.clone().invert()).normalize();
  } else {
    // 구워진 검의 손 로컬 방향 (프로브 실측) — 지팡이·책·활·석궁용
    bladeDir = new THREE.Vector3(-0.104, 0.731, 0.675).normalize();
  }
  weaponGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), bladeDir);
  // 손 뼈 로컬 공간은 원본 GLB 단위라 1/스케일로 줄인다.
  // 게임 무기(날 0.5m)가 2.85m 주인공 손에서 너무 작게 보여서 1.5배로 키운다 (날 ~0.75m).
  // 날이 위·앞을 향하는 기본 자세라 몸에 닿지 않고, 새 검 없는 siwoo.glb로
  // 바꿔도 같은 손 뼈에 붙으므로 이 배율은 그대로 이어진다.
  outer.updateMatrixWorld(true);
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), s = new THREE.Vector3();
  new THREE.Matrix4().copy(hand.matrixWorld).decompose(_p, _q, s);
  const effScale = (s.x > 0 && isFinite(s.x)) ? s.x : (outer.userData.glbScale || 1);
  weaponGroup.scale.setScalar(1.5 / effScale);
  hand.add(weaponGroup);
  outer.userData.weapon = weaponGroup.children[0] || null;
  outer.userData.weaponGroup = weaponGroup;
  return weaponGroup;
}


// ---------- GLB 탱커 동료 테스트 (?companion=glb) ----------
// Tripo 탱커 GLB(assets/tank.glb)를 탱커 동료 대신 쓴다. 주인공 GLB와 같은
// 정적 메쉬(뼈대 없음)라 팔다리 애니메이션은 하지 않고, 게임 루프가 정하는
// 위치·회전·걷기 바운스만 전신에 적용된다. 피부 처리(색 흰색 복원 +
// 텍스처 변조 발광)도 주인공과 동일하다. 얼굴은 +Z를 향한다
// (소프트웨어 렌더로 확인: +Z에서 얼굴·방패·검이 보이고 -Z에서 뒷모습).
export const GLB_COMPANION_TARGET_HEIGHT = 1.98; // 절차적 동료와 같은 키 (1.9 × 1.04)
export async function loadGlbCompanion(THREE, url) {
  const LoaderClass = await importGlTFLoader();
  const gltf = await loadGlbWithLoader(LoaderClass, url);
  const src = gltf.scene;
  applyGlbSkinFix(src);
  const { outer, inner } = buildGlbCharacter(THREE, src, GLB_COMPANION_TARGET_HEIGHT, 2.16, 0.57, 'glbCompanion'); // headY 2.16·반경 0.57은 판정용 예전 값 그대로
  // 리깅된 GLB면 뼈대 애니메이터를 단다 (주인공과 같은 Mixamo 8본 방식).
  // 리그가 없으면 animate가 없어 전신 정적(기존 방식) 그대로 둔다.
  const bones = findRigBones(src);
  if (bones) {
    outer.userData.animate = makeGlbCompanionRigAnimator(outer, inner, bones);
    outer.userData.rigBones = bones;
  }
  return outer;
}

// ---------- 도트(복셀) 스타일 몬스터 도우미 ----------
// 몬스터는 구·원뿔·원기둥·토러스를 쓰지 않고 상자(복셀)만으로 만든다.
// 치수는 0.04m 복셀 격자에 맞춰져 도트 스타일 지도 텍스처와 같은 결을 낸다.
// (주인공·동료의 makeHumanoid3D는 건드리지 않는다 — 몬스터 전용.)
const VOX = 0.04;
const vq = (n) => Math.max(VOX, Math.round(n / VOX) * VOX);
function vBoxMesh(THREE, w, h, d, m) {
  return new THREE.Mesh(gBox(THREE, vq(w), vq(h), vq(d)), m);
}
// 복셀 구: 층층이 쌓은 상자 (작으면 상자 하나)
function vBall(THREE, r, m) {
  if (r <= 0.16) return vBoxMesh(THREE, 2 * r, 2 * r, 2 * r, m);
  const g = new THREE.Group();
  const layers = r > 0.3
    ? [[0.62, -0.78], [0.92, -0.42], [1, 0], [0.92, 0.42], [0.62, 0.78]]
    : [[0.7, -0.6], [1, 0], [0.7, 0.6]];
  const th = r > 0.3 ? 0.44 * r : 0.8 * r;
  for (const [f, dy] of layers) {
    const b = vBoxMesh(THREE, 2 * r * f, th, 2 * r * f, m);
    b.position.y = dy * r; g.add(b);
  }
  return g;
}
// 복셀 원뿔(피라미드): 아래가 넓고 위로 좁아지는 층층 상자
function vPyr(THREE, r, h, m) {
  if (r <= 0.12 || h <= 0.25) return vBoxMesh(THREE, 2 * r, h, 2 * r, m);
  const g = new THREE.Group();
  for (const [f, dy, th] of [[1, -0.3, 0.4], [0.66, 0.05, 0.35], [0.33, 0.35, 0.25]]) {
    const b = vBoxMesh(THREE, 2 * r * f, th * h, 2 * r * f, m);
    b.position.y = dy * h; g.add(b);
  }
  return g;
}
// 복셀 기둥: 네모 단면 상자 (위아래 굵기가 다르면 두 단으로)
function vRod(THREE, rt, rb, h, m) {
  if (Math.abs(rt - rb) <= 0.05) return vBoxMesh(THREE, 2 * Math.max(rt, rb), h, 2 * Math.max(rt, rb), m);
  const g = new THREE.Group();
  const b = vBoxMesh(THREE, 2 * rb, 0.5 * h, 2 * rb, m); b.position.y = -0.25 * h; g.add(b);
  const t = vBoxMesh(THREE, 2 * rt, 0.5 * h, 2 * rt, m); t.position.y = 0.25 * h; g.add(t);
  return g;
}

// 복셀 무기 8종 (상자만으로 만든 뭉툭한 무기 — 손잡이가 위, 날이 아래로 향한다)
function buildVoxelWeapon(THREE, fam, accent = 0x4a6bd6) {
  const g = new THREE.Group();
  const metal = mat(THREE, 0xdfe7f2);
  const wood = mat(THREE, 0x8a6a3a);
  const woodD = mat(THREE, 0x6a4a22);
  const accentM = mat(THREE, accent);
  const white = mat(THREE, 0xffffff);
  const add = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
  const bx = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  switch (fam) {
    case 'dagger': {
      add(bx(0.06, 0.12, 0.06, woodD), 0, -0.06, 0);
      add(bx(0.14, 0.04, 0.06, metal), 0, -0.14, 0);
      add(bx(0.08, 0.2, 0.03, metal), 0, -0.26, 0);
      add(bx(0.04, 0.08, 0.03, metal), 0, -0.4, 0);
      add(bx(0.08, 0.06, 0.06, metal), 0, 0.02, 0);
      break;
    }
    case 'axe': {
      add(bx(0.06, 0.42, 0.06, wood), 0, -0.26, 0);
      add(bx(0.3, 0.2, 0.05, metal), 0, -0.48, 0);
      add(bx(0.22, 0.14, 0.04, metal), 0, -0.48, -0.06);
      add(bx(0.06, 0.1, 0.06, metal), 0, -0.62, 0);
      break;
    }
    case 'mace': {
      add(bx(0.06, 0.4, 0.06, wood), 0, -0.25, 0);
      add(bx(0.2, 0.2, 0.2, metal), 0, -0.47, 0);
      for (const [sx, sy, sz] of [[0.12, 0, 0], [-0.12, 0, 0], [0, 0.12, 0], [0, -0.12, 0], [0, 0, 0.12], [0, 0, -0.12]]) {
        add(bx(0.06, 0.06, 0.06, metal), sx, -0.47 + sy, sz);
      }
      break;
    }
    case 'bow': {
      const limbT = bx(0.05, 0.4, 0.05, wood); limbT.position.set(0, 0.2, -0.07); limbT.rotation.x = -0.4; g.add(limbT);
      const limbB = bx(0.05, 0.4, 0.05, wood); limbB.position.set(0, -0.2, -0.07); limbB.rotation.x = 0.4; g.add(limbB);
      add(bx(0.06, 0.06, 0.06, metal), 0, 0.38, -0.14);
      add(bx(0.06, 0.06, 0.06, metal), 0, -0.38, -0.14);
      add(bx(0.02, 0.72, 0.02, mat(THREE, 0xf2ead0)), 0, 0, -0.22);
      add(bx(0.06, 0.12, 0.06, woodD), 0, 0, 0);
      add(bx(0.04, 0.04, 0.5, mat(THREE, 0xdcc39a)), 0, 0, 0.12); // 화살 (뭉툭한 상자)
      break;
    }
    case 'crossbow': {
      add(bx(0.08, 0.08, 0.42, wood), 0, -0.05, 0.05);
      add(bx(0.44, 0.06, 0.06, metal), 0, -0.02, 0.22);
      add(bx(0.06, 0.08, 0.06, metal), 0, 0.04, 0.05);
      add(bx(0.12, 0.04, 0.04, woodD), 0, -0.05, -0.16);
      add(bx(0.04, 0.04, 0.34, mat(THREE, 0xd7e2f0)), 0, 0.02, 0.12);
      break;
    }
    case 'staff': {
      add(bx(0.06, 0.85, 0.06, wood), 0, -0.05, 0);
      add(bx(0.2, 0.2, 0.2, accentM), 0, 0.48, 0);
      add(bx(0.08, 0.08, 0.08, accentM), 0.22, 0.48, 0);
      add(bx(0.08, 0.08, 0.08, accentM), -0.22, 0.48, 0);
      add(bx(0.06, 0.1, 0.06, metal), 0, -0.52, 0);
      break;
    }
    case 'book': {
      add(bx(0.32, 0.06, 0.42, accentM), 0, -0.12, 0);
      add(bx(0.27, 0.05, 0.37, mat(THREE, 0xf7f0d8)), 0, -0.1, 0);
      add(bx(0.34, 0.05, 0.06, woodD), 0, -0.12, -0.19);
      add(bx(0.05, 0.02, 0.14, mat(THREE, 0xc0392b)), 0.1, -0.1, 0.24);
      add(bx(0.1, 0.1, 0.1, accentM), 0, 0.22, 0);
      break;
    }
    case 'sword':
    default: {
      add(bx(0.06, 0.14, 0.06, woodD), 0, -0.07, 0);
      add(bx(0.2, 0.05, 0.06, metal), 0, -0.15, 0);
      add(bx(0.1, 0.3, 0.03, metal), 0, -0.32, 0);
      add(bx(0.02, 0.26, 0.04, white), 0, -0.32, 0);
      add(bx(0.05, 0.1, 0.03, metal), 0, -0.5, 0);
      add(bx(0.08, 0.08, 0.04, accentM), 0, -0.15, 0.05);
      add(bx(0.08, 0.06, 0.06, metal), 0, 0.02, 0);
      break;
    }
  }
  return g;
}

// 복셀 휴머노이드 몬스터 (makeHumanoid3D와 같은 userData 인터페이스·같은 앵커 높이 —
// 고블린 귀·마녀 모자 등 도형별 특징 코드가 그대로 붙는다. 상자만 쓴다.)
function makeVoxelHumanoid3D(THREE, opts = {}) {
  const skin = opts.skin != null ? opts.skin : 0xf2c9a0;
  const uniform = opts.uniform != null ? opts.uniform : 0x2b3a66;
  const hairCol = opts.hair != null ? opts.hair : 0x1e2130;
  const accent = opts.accent != null ? opts.accent : 0x4a6bd6;
  const fam = opts.weaponFam || 'sword';
  const bulk = opts.bulk || 1;
  const eyeCol = opts.eyeColor != null ? opts.eyeColor : 0xffffff;
  const skinM = mat(THREE, skin);
  const uniM = mat(THREE, uniform);
  const hairM = mat(THREE, hairCol);
  const pantsM = mat(THREE, 0x2c3242);
  const capeM = mat(THREE, accent);
  const metalM = mat(THREE, 0xdfe7f2);
  const darkM = mat(THREE, 0x20242e);
  const eyeM = mat(THREE, eyeCol);
  const capeDark = mat(THREE, new THREE.Color(accent).multiplyScalar(0.7).getHex());
  const mouthM = mat(THREE, 0x8a4a3a);

  const g = new THREE.Group();
  g.add(blobShadow(THREE, 0.42));
  const add = (mesh, x, y, z, parent) => { mesh.position.set(x, y, z); (parent || g).add(mesh); return mesh; };

  // 다리 (고관절 y=0.55에서 회전) + 부츠
  const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
  legGeo.translate(0, -0.25, 0);
  const bootGeo = new THREE.BoxGeometry(0.18, 0.1, 0.26);
  const legL = new THREE.Group(); legL.position.set(-0.11 * bulk, 0.55, 0);
  legL.add(new THREE.Mesh(legGeo, pantsM));
  const bootL = new THREE.Mesh(bootGeo, darkM); bootL.position.set(0, -0.5, 0.03); legL.add(bootL);
  g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11 * bulk, 0.55, 0);
  legR.add(new THREE.Mesh(legGeo, pantsM));
  const bootR = new THREE.Mesh(bootGeo, darkM); bootR.position.set(0, -0.5, 0.03); legR.add(bootR);
  g.add(legR);
  if (opts.robe) {
    // 로브 치마 (층층 상자 — 위 좁고 아래 넓게)
    const sk1 = new THREE.Mesh(new THREE.BoxGeometry(0.52 * bulk, 0.2, 0.32), uniM);
    sk1.position.y = 0.72; g.add(sk1);
    const sk2 = new THREE.Mesh(new THREE.BoxGeometry(0.64 * bulk, 0.24, 0.44), uniM);
    sk2.position.y = 0.5; g.add(sk2);
  }

  // 몸통 그룹 (자식은 절대 높이로 배치)
  const body = new THREE.Group(); body.userData.baseY = 0; g.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.56, 0.3), uniM);
  torso.scale.x = bulk; torso.position.y = 0.85; body.add(torso);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.05), metalM);
  plate.scale.x = bulk; plate.position.set(0, 0.9, 0.16); body.add(plate);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.32), capeM);
  belt.scale.x = bulk; belt.position.y = 0.6; body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), metalM);
  buckle.position.set(0, 0.6, 0.17); body.add(buckle);
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.05), capeM);
  cape.scale.x = bulk; cape.position.set(0, 0.82, -0.19); body.add(cape);
  const hem = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.1, 0.06), capeDark);
  hem.scale.x = bulk; hem.position.set(0, 0.48, -0.19); body.add(hem);

  // 머리 (상자 + 박스 눈·코·입 — 도트 얼굴)
  const head = new THREE.Group(); head.position.y = 1.42; body.add(head);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.48), skinM), 0, 0, 0, head);
  // 어두운 아웃라인 (뒤집은 껍질) — 머리 실루엣에 테가 보인다
  add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.54, 0.54), new THREE.MeshBasicMaterial({ color: 0x1e2230, side: THREE.BackSide })), 0, 0, 0, head);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.5), hairM), 0, 0.24, -0.02, head);
  if (opts.longHair) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.52, 0.1), hairM), 0, -0.2, -0.26, head);
  }
  for (const s of [-1, 1]) {
    // 컨셉 시트처럼 크고 또렷한 눈 — 흰자 박스 + 어두운 동공
    add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.04), eyeM), 0.11 * s, 0.02, 0.26, head);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02), darkM), 0.11 * s, 0.02, 0.285, head);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), hairM), 0.11 * s, 0.14, 0.26, head);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), skinM), 0, -0.03, 0.28, head);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), mouthM), 0, -0.14, 0.27, head);

  // 팔 (어깨 y=1.08에서 회전) + 어깨 갑주 + 무기
  const armGeo = new THREE.BoxGeometry(0.14, 0.5, 0.16);
  armGeo.translate(0, -0.22, 0);
  const armR = new THREE.Group(); armR.position.set(0.33 * bulk, 1.08, 0);
  armR.add(new THREE.Mesh(armGeo, uniM));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skinM), 0, -0.48, 0, armR);
  body.add(armR);
  const armL = new THREE.Group(); armL.position.set(-0.33 * bulk, 1.08, 0);
  armL.add(new THREE.Mesh(armGeo, uniM));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skinM), 0, -0.48, 0, armL);
  body.add(armL);
  for (const s of [-1, 1]) {
    const paul = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.2), metalM);
    paul.position.set(0.36 * bulk * s, 1.14, 0); body.add(paul);
  }
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0, -0.48, 0.04);
  armR.add(weaponGroup);
  const weapon = buildVoxelWeapon(THREE, fam, accent);
  weaponGroup.add(weapon);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (opts.scale) g.scale.setScalar(opts.scale);
  const vsc = opts.scale || 1; // 반경·머리 높이는 모델 스케일과 함께 커진다 (판정과 모델 일치)
  g.userData = {
    avatar: null, height: 1.9 * vsc, headY: 1.6 * vsc, radius: 0.42 * vsc,
    armR, armL, legL, legR, body, head, weapon, weaponGroup,
    isHeroSprite: false,
  };
  return g;
}

// ---------- 몬스터 3D ----------
// 빌보드 스프라이트 대신 도트(복셀) 3D 모델 — 상자만으로 만든다.
// 지오메트리는 도형별로 공유(캐시)하고, 재질은 인형마다 새로 만든다
// (피격 플래시·색상 틴트가 인형별로 동작해야 하기 때문).
const MONSTER_H = {
  slime: 0.92, goblin: 1.14, orc: 1.4, frog: 1.12, lizard: 1.42, scarab: 1.02, crab: 1.2,
  scorpion: 1.24, mummy: 1.52, merfolk: 1.5, siren: 1.52, naga: 1.86, wraith: 1.62,
  witch: 1.78, golem: 2.2, ent: 2.4, ogre: 2.15, anubis: 2.05, hydra: 2.0, kraken: 2.6,
  dragon: 2.6, mushroom: 1.9, barbarian: 2.0, skeleton: 1.5,
};
// 아바타 축소 (2026-11-27): 몬스터 비주얼도 주인공과 같은 비율(1.5→1.16)로 줄여
// 주인공-몬스터 상대 크기를 유지한다. 판정 반경은 MONSTER_HIT_SCALE(예전 1.5)로
// 그대로 둬서 공격 사거리·히트박스가 바뀌지 않게 한다 (headY는 비주얼 기준이라 같이 줄어든다).
const MONSTER_SCALE = 1.16;
const MONSTER_HIT_SCALE = 1.5;

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
  // 도트 스타일: 구·원뿔·원기둥 대신 복셀 상자만 쓴다 (vBall/vPyr/vRod).
  const pBox = (w, h, d, m) => vBoxMesh(THREE, w, h, d, m);
  const pSph = (r, m) => vBall(THREE, r, m);
  const pCon = (r, h, m) => vPyr(THREE, r, h, m);
  const pCyl = (rt, rb, h, m) => vRod(THREE, rt, rb, h, m);
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
  const eyes = (y, xOff, z, r = 0.07) => { // 컨셉 시트처럼 크고 또렷한 눈
    put(pSph(r, eyeM, 6, 5), -xOff, y, z);
    put(pSph(r, eyeM, 6, 5), xOff, y, z);
  };

  // ---- 휴머노이드형 (복셀 휴머노이드 + 도형별 특징) ----
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
    const hg = makeVoxelHumanoid3D(THREE, {
      skin: color, uniform: dark, hair: dark, accent: color,
      weaponFam: cfg.weaponFam, scale: cfg.scale * bossMul * MONSTER_SCALE, bulk: cfg.bulk,
      robe: !!cfg.robe, longHair: !!cfg.longHair,
      eyeColor: shape === 'skeleton' ? 0x9fe8ff : shape === 'mummy' ? 0x1a1a22 : 0xffffff,
    });
    const head = hg.userData.head;
    const hM = mat(THREE, dark);
    if (shape === 'goblin') {
      for (const s of [-1, 1]) {
        const ear = pCon(0.09, 0.22, hM);
        ear.position.set(0.32 * s, 0.12, 0); ear.rotation.z = s * -1.1; head.add(ear);
      }
      const nose = pCon(0.05, 0.12, hM);
      nose.position.set(0, -0.05, 0.32); nose.rotation.x = Math.PI / 2; head.add(nose);
      const teeth = new THREE.Mesh(gBox(THREE, 0.14, 0.04, 0.02), mat(THREE, 0xffffff));
      teeth.position.set(0, -0.2, 0.28); head.add(teeth);
    } else if (shape === 'orc') {
      for (const s of [-1, 1]) {
        const tusk = pCon(0.035, 0.12, mat(THREE, 0xf2ead0));
        tusk.position.set(0.09 * s, -0.22, 0.26); head.add(tusk);
      }
      const brow = new THREE.Mesh(gBox(THREE, 0.34, 0.05, 0.04), hM);
      brow.position.set(0, 0.1, 0.27); head.add(brow);
      const jaw = new THREE.Mesh(gBox(THREE, 0.2, 0.05, 0.03), mat(THREE, 0xf2ead0));
      jaw.position.set(0, -0.24, 0.27); head.add(jaw);
    } else if (shape === 'lizard') {
      const tail = pCon(0.12, 0.7, darkM);
      tail.position.set(0, 0.5, -0.4); tail.rotation.x = 1.9; hg.add(tail);
      for (let i = 0; i < 3; i++) { // 등 가시
        const sp = pCon(0.06, 0.18, darkM);
        sp.position.set(0, 0.78 + i * 0.22, -0.2); sp.rotation.x = -0.5; hg.add(sp);
      }
    } else if (shape === 'mummy') {
      for (const s of [-1, 1]) {
        const ge = pSph(0.06, bm(0xffc93c));
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
      const hat = pCon(0.3, 0.55, hM);
      hat.position.set(0, 0.42, -0.02); head.add(hat);
      const brim = pCyl(0.42, 0.42, 0.04, hM);
      brim.position.set(0, 0.16, 0); head.add(brim);
      const wart = pSph(0.04, mat(THREE, 0x6a8a3a));
      wart.position.set(0.05, -0.05, 0.3); head.add(wart);
      const bottle = pCyl(0.05, 0.05, 0.14, tm(0x7fd06a));
      bottle.position.set(0.24, 0.62, 0.16); hg.userData.body.add(bottle);
    } else if (shape === 'anubis') {
      const snout = new THREE.Mesh(gBox(THREE, 0.22, 0.16, 0.3), hM);
      snout.position.set(0, -0.06, 0.3); head.add(snout);
      for (const s of [-1, 1]) {
        const ear = pCon(0.09, 0.34, hM);
        ear.position.set(0.14 * s, 0.36, 0); head.add(ear);
      }
      // 목 칼라 (복셀 판 — 토러스 대신 납작한 상자)
      const collar = pBox(0.44, 0.06, 0.44, mat(THREE, 0xd8a93c));
      collar.position.set(0, 1.22, 0); hg.add(collar);
      for (const s of [-1, 1]) { // 눈가 줄무늬
        const stripe = new THREE.Mesh(gBox(THREE, 0.05, 0.14, 0.02), hM);
        stripe.position.set(0.17 * s, 0.02, 0.26); stripe.rotation.z = s * 0.4; head.add(stripe);
      }
    } else if (shape === 'barbarian') {
      for (const s of [-1, 1]) {
        const horn = pCon(0.07, 0.26, mat(THREE, 0xf2ead0));
        horn.position.set(0.3 * s, 0.22, 0); horn.rotation.z = s * -0.9; head.add(horn);
      }
      // 모피 허리띠 + 등 모피
      const furM = mat(THREE, 0xd8c9a8);
      const furBelt = new THREE.Mesh(gBox(THREE, 0.56, 0.1, 0.34), furM);
      furBelt.position.set(0, 0.62, 0); hg.userData.body.add(furBelt);
      const furBack = new THREE.Mesh(gBox(THREE, 0.4, 0.5, 0.05), furM);
      furBack.position.set(0, 0.85, -0.22); hg.userData.body.add(furBack);
    } else if (shape === 'siren') {
      const pin = pSph(0.07, mat(THREE, 0xffffff));
      pin.position.set(0.3, 0.14, 0.05); head.add(pin);
      const shell = pSph(0.09, mat(THREE, 0xf2d8e8));
      shell.position.set(0, 1.0, 0.18); hg.userData.body.add(shell);
    } else if (shape === 'merfolk') {
      for (let i = 0; i < 3; i++) { // 꼬리 지느러미 능선
        const fin = pCon(0.06, 0.2, darkM);
        fin.position.set(0, 0.55 - i * 0.18, -0.28); fin.rotation.x = -0.7; hg.add(fin);
      }
      const shell = pSph(0.09, mat(THREE, 0xf2d8e8));
      shell.position.set(0, 1.0, 0.18); hg.userData.body.add(shell);
    } else if (shape === 'naga') {
      for (const s of [-1, 1]) { // 코브라 후드
        const hood = pCon(0.16, 0.4, darkM);
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
        const tail = pCon(0.34, 0.9, tm(color));
        tail.position.set(0, 0.35, -0.05); tail.rotation.x = Math.PI; hg.add(tail);
        const fin = new THREE.Mesh(gBox(THREE, 0.5, 0.08, 0.3), tm(dark));
        fin.position.set(0, 0.05, -0.15); hg.add(fin);
      } else {
        const s1 = pSph(0.34, tm(dark)); s1.position.set(0, 0.32, 0); hg.add(s1);
        const s2 = pSph(0.26, tm(dark)); s2.position.set(0, 0.14, -0.08); hg.add(s2);
        const tip = pCon(0.16, 0.5, tm(dark)); tip.position.set(0, 0.1, -0.3); tip.rotation.x = 1.4; hg.add(tip);
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
    top = 1.72 * cfg.scale * bossMul * MONSTER_SCALE;
    radius = 0.42 * cfg.scale * bossMul * MONSTER_HIT_SCALE; // 판정 반경은 예전 값 그대로
    return finish({ scaled: true });
  }

  // ---- 비휴머노이드형 ----
  if (shape === 'slime') {
    // 통통한 키세스 물방울 (둥근 몸통 + 뾰족한 꼭지)
    const blob = pSph(0.5, bodyM); blob.scale.set(1, 0.72, 1); put(blob, 0, 0.36, 0);
    put(pCon(0.26, 0.32, bodyM), 0, 0.8, 0);
    eyes(0.45, 0.18, 0.42, 0.06);
    put(pBox(0.16, 0.03, 0.02, darkM), 0, 0.32, 0.52); // 입 (복셀 몸통 앞면에 닿게)
    const shine = pBox(0.16, 0.1, 0.04, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    put(shine, -0.2, 0.6, 0.3); // 광택
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
    put(pSph(0.07, tm(0xffd257), 6, 5), 0, 0.48, 0.66); // 머리 보석 (복셀 머리 앞면에 닿게)
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
    const core = pBox(0.2, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
    core.position.set(0, 1.2, 0.34); body.add(core);
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
      put(pSph(0.05, tm(0xf2f2f2), 6, 5), Math.cos(a) * 0.84, 0.3, Math.sin(a) * 0.84); // 빨판 (복셀 촉수 바깥면에 닿게)
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
      const e = pSph(0.05, eyeM, 6, 5); e.position.set(0.12 * s, 2.04, 1.12); body.add(e); // 눈 (복셀 머리 앞면에 닿게)
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
    put(pBox(0.14, 0.03, 0.02, darkM), 0, 0.32, 0.36); // 입 (복셀 줄기 앞면에 닿게)
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
    // 알 수 없는 도형은 고블린형 복셀 휴머노이드로 폴백
    const hg = makeVoxelHumanoid3D(THREE, {
      skin: color, uniform: dark, hair: dark, accent: color,
      weaponFam: 'dagger', scale: 0.62 * bossMul * MONSTER_SCALE, bulk: 0.9,
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
    top = 1.72 * 0.62 * bossMul * MONSTER_SCALE;
    radius = 0.42 * 0.62 * bossMul * MONSTER_HIT_SCALE; // 판정 반경은 예전 값 그대로
    return finish({ scaled: true });
  }
  return finish({});

  // ---- 마무리: 보스 스케일·보스 링·userData·애니메이션 ----
  function finish(opts) {
    const scaled = opts && opts.scaled;
    const finalTop = top * (scaled ? 1 : bossMul * MONSTER_SCALE);
    // 판정 반경은 예전 스케일(1.5) 그대로 — 비주얼만 작아진다
    const finalRadius = radius * (scaled ? 1 : bossMul * MONSTER_HIT_SCALE);
    // 보스 링은 보이는 몸통에 딱 맞게 비주얼 반경으로 그린다
    const visualRadius = radius * (scaled ? MONSTER_SCALE / MONSTER_HIT_SCALE : bossMul * MONSTER_SCALE);
    if (!scaled) g.scale.setScalar(bossMul * MONSTER_SCALE);
    if (def.boss) {
      const tierColor = def.boss === 'field' ? 0xff5566 : def.boss === 'boss' ? 0xb46cff : 0x4aa3ff;
      const ring = new THREE.Mesh(
        gRing(THREE, Math.round(visualRadius * 0.85 * 100) / 100, Math.round(visualRadius * 1.05 * 100) / 100),
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
// 3D 복셀 몬스터 (입체감). 2D 도트 스프라이트는 가방 미리보기·도감용으로 sprites.js에 남는다.
export function makeMonster(THREE, def) {
  return makeMonster3D(THREE, def);
}

// ---------- 동료 ----------
// 직업별 실루엣이 다르다 (색만 다른 게 아니라 생김새가 다르다):
// 탱커 = 덩치 큼 + 투구 + 왼팔 방패 / 힐러 = 로브 + 후드 + 지팡이 빛
// 근접 = 날씬 + 쌍단검 + 머리띠 / 마법사 = 로브 + 뾰족모자 + 지팡이 + 왼손 책
// 동료 — 3D 휴머노이드 + 직업별 실루엣 (색만 다른 게 아니라 생김새가 다르다):
// 탱커 = 덩치 큼 + 투구 + 왼팔 방패 / 힐러 = 로브 + 후드 + 지팡이
// 근접 = 날씬 + 쌍단검 + 머리띠 / 마법사 = 로브 + 뾰족모자 + 지팡이 + 왼손 책
// 주인공(1.16배)보다 살짝 작게 1.04배. 벨트는 등급 색(gradeColor)으로 띠를 두른다.
// 판정은 hitScale 1.35로 예전 그대로 — 비주얼만 작아진다.
export const COMPANION_SCALE = 1.04;
const COMPANION_WEAPON = { tank: 'sword', healer: 'staff', melee: 'dagger', mage: 'staff' };
const COMPANION_BULK = { tank: 1.32, healer: 1, melee: 0.85, mage: 1 };
export function makeCompanion(THREE, cls, gradeColor = 0xffffff) {
  const c = cls && cls.id ? cls : { id: 'melee', color: 0x6fcf97 };
  const g = makeHumanoid3D(THREE, {
    avatar: null, skin: 0xf2c9a0, uniform: c.color, hair: 0x2a2f45, accent: c.color,
    weaponFam: COMPANION_WEAPON[c.id] || 'dagger', polish: true, scale: COMPANION_SCALE, hitScale: 1.35,
    bulk: COMPANION_BULK[c.id] || 1, grade: 0, trimColor: gradeColor,
    robe: c.id === 'healer' || c.id === 'mage',
  });
  addCompanionExtras(THREE, g, c.id, c.color);
  return g;
}
// 직업별 장식 파츠 (userData.companionPiece 태그 — 스모크 테스트 확인용)
function addCompanionExtras(THREE, g, clsId, clsColor) {
  const ud = g.userData;
  const metalM = mat(THREE, 0xdfe7f2);
  const goldM = mat(THREE, 0xffd257);
  const tag = (m, name) => { m.userData.companionPiece = name; return m; };
  const head = ud.head, body = ud.body, armL = ud.armL;
  if (clsId === 'tank') {
    // 투구 (뿔 2개 + 깃) + 왼팔 원형 방패
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), metalM);
    helm.scale.set(1, 0.6, 1); helm.position.set(0, 0.22, -0.02); head.add(tag(helm, 'helmet'));
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), metalM);
      horn.position.set(0.28 * s, 0.3, 0); horn.rotation.z = -s * 0.8; head.add(tag(horn, 'helmet'));
    }
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), mat(THREE, 0xc03050));
    plume.position.set(0, 0.42, 0); head.add(tag(plume, 'helmet'));
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), metalM);
    shield.rotation.x = Math.PI / 2; shield.position.set(0, -0.3, 0.12); armL.add(tag(shield, 'shield'));
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), goldM);
    boss.position.set(0, -0.3, 0.18); armL.add(tag(boss, 'shield'));
  } else if (clsId === 'healer') {
    // 후드 + 허리 약주머니 (지팡이는 이미 빛나는 오브가 있다)
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(THREE, clsColor));
    hood.position.set(0, 0.1, -0.08); head.add(tag(hood, 'hood'));
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), mat(THREE, 0x8a6a3a));
    pouch.position.set(0.2, 0.62, 0.14); body.add(tag(pouch, 'satchel'));
  } else if (clsId === 'melee') {
    // 머리띠 + 목 스카프 + 왼손 단검 (쌍검)
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), mat(THREE, 0xc03050));
    band.position.set(0, 0.2, 0); head.add(tag(band, 'headband'));
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), mat(THREE, 0xc03050));
    scarf.position.set(0, 1.32, 0); body.add(tag(scarf, 'scarf'));
    const off = buildVoxelWeapon(THREE, 'dagger', 0x6fcf97);
    off.scale.setScalar(0.8); off.position.set(0, -0.48, 0.04); armL.add(tag(off, 'offhand'));
  } else if (clsId === 'mage') {
    // 뾰족 모자 + 금별 + 왼손 책
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 8), mat(THREE, clsColor));
    hat.position.set(0, 0.45, -0.02); head.add(tag(hat, 'hat'));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 12), mat(THREE, clsColor));
    brim.position.set(0, 0.22, 0); head.add(tag(brim, 'hat'));
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), goldM);
    star.position.set(0, 0.62, 0.1); head.add(tag(star, 'hat'));
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.06), mat(THREE, 0x7a4a9a));
    book.position.set(0, -0.45, 0.1); armL.add(tag(book, 'book'));
  }
}

// 보관함 — 3D 나무 상자 (경첩 달린 뚜껑이 실제로 열린다). userData.lid는 진짜 경첩 그룹이다.
// (updateChests가 lid.rotation.x를 돌리고, buildWorld가 이미 열린 상자의 뚜껑을 젖혀 둔다.)
export function makeChest(THREE) {
  const g = new THREE.Group();
  const woodM = mat(THREE, 0x8a5a2a);
  const woodD = mat(THREE, 0x6a4218);
  const goldM = mat(THREE, 0xffd257);
  const ironM = mat(THREE, 0x5a5f6a);
  // 본체
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.62, 0.8), woodM);
  base.position.y = 0.31; g.add(base);
  // 금테 (본체 앞뒤)
  for (const z of [-0.41, 0.41]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.1, 0.04), goldM);
    band.position.set(0, 0.31, z); g.add(band);
  }
  // 뚜껑 — 뒷면 위쪽 경첩 기준 (열리면 뒤로 젖혀진다)
  const lid = new THREE.Group();
  lid.position.set(0, 0.62, -0.4);
  const lidBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.3, 0.8), woodD);
  lidBox.position.set(0, 0.15, 0.4); lid.add(lidBox);
  const lidBand = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.04), goldM);
  lidBand.position.set(0, 0.15, 0.81); lid.add(lidBand);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.06), goldM);
  lock.position.set(0, 0.02, 0.8); lid.add(lock);
  g.add(lid);
  // 자물쇠 걸쇠 (본체 앞면)
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.05), ironM);
  clasp.position.set(0, 0.55, 0.42); g.add(clasp);
  g.add(blobShadow(THREE, 0.7));
  const glowS = new THREE.Mesh(new THREE.CircleGeometry(0.7, 18), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowS.rotation.x = -Math.PI / 2; glowS.position.y = 0.05; g.add(glowS);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { lid, art: g, opened: false, h: 1.0 };
  return g;
}

// NPC — 3D 로브 노인 (지팡이 + 회색 수염). '!' 마커는 그대로 (buildWorld의 update가 marker를 흔든다).
// polish:true로 몸통이 테이퍼진 몸처럼 보이고(네모 상자 하나가 아니라 가슴→허리→엉덩이
// 스택 + 어두운 아웃라인), 로브는 발끝까지 내려오는 긴 원뿔로 다리를 가린다.
// 짧은 치마(robe:true, 반경 0.34)는 긴 로브보다 넓어서 그대로 두면 로브를 뚫고
// 나오므로 robe:false로 빼고 이 긴 로브만 쓴다. 회색 수염·지팡이·'!' 마커는 그대로.
export function makeNpc(THREE, icon) {
  const g = makeHumanoid3D(THREE, {
    avatar: null, skin: 0xe8c090, uniform: 0x3a4a6a, hair: 0xd8d8d8, accent: 0x3a4a6a,
    weaponFam: 'staff', polish: true, scale: 1.35, robe: false, grade: 0,
  });
  // 긴 로브 원뿔 (밑단 반경 0.46, 높이 1.1, 중심 y=0.55 → 발끝 y=0부터 어깨까지)
  const robe = cone(THREE, 0.46, 1.1, 0x3a4a6a, 8);
  robe.position.y = 0.55;
  robe.userData.npcRobe = true;
  robe.castShadow = true;
  g.add(robe);
  // 회색 수염 (머리 그룹에 붙여 머리와 함께 움직인다)
  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.06), mat(THREE, 0xd8d8d8));
  beard.position.set(0, -0.14, 0.27); g.userData.head.add(beard);
  const marker = labelSprite(THREE, '!', '#ffd257');
  marker.position.set(0, 2.3, 0);
  g.add(marker);
  g.userData.marker = marker;
  return g;
}

// ---------- 3D 소품 ----------
// 소품은 상자·원뿔·원기둥 등을 합친(mergeGeometryParts) 하나의 지오메트리로 만든다.
// 색은 버텍스 컬러로 구워 넣고, 재질은 모든 소품이 공유한다 (드로우콜·메모리 절약).
// 지오메트리 크기는 PROP_SIZE(빌보드 시절 크기)와 같아 기존 스케일(t.s)이 그대로 통한다.
let PROP_MAT = null;
function propMaterial(THREE) {
  if (!PROP_MAT) PROP_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  return PROP_MAT;
}
const PROP_GEO_CACHE = new Map();
export function buildPropGeometry(THREE, kind) {
  if (PROP_GEO_CACHE.has(kind)) return PROP_GEO_CACHE.get(kind);
  const parts = [];
  // P(지오메트리, 색, x, y, z, rx, ry, rz) — 임시 조각 메시 (합친 뒤 버린다)
  const P = (geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat(THREE, color));
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    parts.push(m); return m;
  };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
  const K = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
  const S = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
  const [w0, h0] = PROP_SIZE[kind] || [1.2, 1.2];
  switch (kind) {
    case 'tree': // 층층 나뭇잎 + 줄기 — 껍질 능선 + 잎사귀 뭉치 + 열매 + 밑동 이끼
      P(C(0.16, 0.24, 1.2), 0x6a4a22, 0, 0.6, 0);
      for (let i = 0; i < 3; i++) P(B(0.05, 1.0, 0.06), 0x4a3018, -0.12 + i * 0.12, 0.6, 0.2, -0.07, 0, 0); // 껍질 능선 (앞면)
      P(S(0.08), 0x2a1c10, 0.1, 0.7, 0.21); // 옹이
      P(K(1.0, 1.4), 0x2f9e3e, 0, 1.8, 0);
      P(K(0.8, 1.2), 0x3fae4e, 0, 2.5, 0);
      P(K(0.55, 1.0), 0x52c25e, 0, 3.1, 0);
      P(S(0.22), 0x35a844, -0.35, 1.9, 0.2); // 잎사귀 뭉치 (층마다 색 다르게, 원뿔 표면에 붙여서)
      P(S(0.2), 0x48b858, 0.35, 2.5, -0.2);
      P(S(0.18), 0x62cc6a, -0.25, 3.0, 0.2);
      P(S(0.09), 0xff5a4a, 0.18, 2.8, 0.1); // 붉은 열매
      P(B(0.5, 0.08, 0.5), 0x6a8a4a, 0, 1.25, 0); // 밑동 이끼
      break;
    case 'pine': // 소나무 — 껍질 능선 + 층마다 눈 뭉치 + 솔방울
      P(C(0.14, 0.22, 1.2), 0x4a3423, 0, 0.6, 0);
      for (let i = 0; i < 2; i++) P(B(0.05, 0.9, 0.05), 0x2a1c10, -0.08 + i * 0.16, 0.6, 0.18, -0.07, 0, 0);
      P(K(0.9, 1.3), 0x1e5a2e, 0, 1.7, 0);
      P(K(0.7, 1.1), 0x276b38, 0, 2.4, 0);
      P(K(0.5, 0.9), 0xe8f0f8, 0, 3.0, 0);
      P(S(0.13), 0xe8f0f8, 0.55, 1.35, 0.3); // 아랫층 눈 뭉치
      P(S(0.11), 0xe8f0f8, -0.45, 2.0, -0.35); // 중간층 눈 뭉치
      P(K(0.12, 0.25), 0x6a4a22, 0.72, 1.12, 0.15, 0.2, 0, 0.3); // 솔방울 (아랫가지 아래에 매달려)
      break;
    case 'deadTree': // 앙상한 고목 + 가지 + 부러진 그루터기 + 옹이
      P(C(0.14, 0.22, 1.6), 0x4a3a28, 0, 0.8, 0);
      P(B(0.12, 1.0, 0.12), 0x4a3a28, 0.5, 2.0, 0, 0, 0, -0.7);
      P(B(0.1, 0.8, 0.1), 0x4a3a28, -0.45, 2.1, 0, 0, 0, 0.7);
      P(B(0.1, 0.7, 0.1), 0x4a3a28, 0.1, 2.5, 0, 0.5, 0, 0.2);
      P(B(0.14, 0.3, 0.14), 0x3a2a18, 0.3, 1.2, 0.1, 0, 0, -0.4); // 부러진 가지 그루터기
      P(S(0.08), 0x2a1c10, -0.05, 1.5, 0.18); // 옹이
      break;
    case 'rock': // 회색 바위 — 면이 꺾인 돌 + 균열 + 이끼 + 하이라이트
      P(B(1.4, 0.9, 1.1), 0x9298a8, 0, 0.45, 0);
      P(B(0.7, 0.5, 0.6), 0xaeb4c0, -0.3, 0.95, 0.1, 0, 0.6, 0);
      P(B(0.5, 0.3, 0.4), 0x6a6f78, 0.45, 0.2, -0.2, 0, -0.4, 0);
      P(B(0.05, 0.5, 0.02), 0x4a4f58, -0.2, 0.5, 0.56, 0, 0, 0.3); // 균열 (앞면)
      P(B(0.05, 0.35, 0.02), 0x4a4f58, 0.35, 0.35, 0.56, 0, 0, -0.5);
      P(B(0.5, 0.08, 0.4), 0x5a8a3a, 0.35, 0.92, 0.2); // 윗면 이끼 (윗돌과 안 겹치게 오른쪽)
      P(B(0.5, 0.06, 0.4), 0x6a8a4a, 0.4, 0.32, -0.1); // 밑동 이끼
      P(B(0.4, 0.06, 0.3), 0xd0d5e0, -0.45, 0.92, -0.35); // 윗면 하이라이트 (뒷쪽)
      break;
    case 'sandRock': // 모래 바위 — 균열 + 밝은 면
      P(B(1.5, 0.9, 1.1), 0xc8a86a, 0, 0.45, 0);
      P(B(0.8, 0.5, 0.6), 0xd8b878, -0.3, 0.95, 0, 0, 0.6, 0);
      P(B(0.05, 0.45, 0.02), 0x8a6a3a, 0.2, 0.5, 0.56, 0, 0, 0.4); // 균열
      P(B(0.4, 0.06, 0.3), 0xe8c888, 0.45, 0.92, -0.35); // 윗면 하이라이트 (뒷쪽)
      break;
    case 'bubbleRock': // 푸른 바위 (심해) — 물방울 + 산호 점
      P(B(1.4, 0.9, 1.1), 0x5a7a9a, 0, 0.45, 0);
      P(S(0.4), 0x7aa8c8, 0.3, 0.9, 0.1);
      P(S(0.12), 0x9fd8f8, -0.4, 0.6, 0.56); // 물방울 (앞면)
      P(S(0.09), 0xff9ec4, 0.5, 0.4, 0.56); // 산호 점 (앞면)
      P(B(0.05, 0.4, 0.02), 0x3a5a7a, -0.1, 0.5, 0.56, 0, 0, 0.3); // 균열
      break;
    case 'lavaRock': // 용암 바위 + 주황 균열 (2개)
      P(B(1.5, 1.0, 1.2), 0x3a2a2a, 0, 0.5, 0);
      P(B(0.9, 0.12, 0.5), 0xff6a2a, 0, 1.02, 0, 0, 0.3, 0);
      P(B(0.5, 0.4, 0.4), 0x4a3434, -0.4, 0.3, 0.3, 0, 0.6, 0);
      P(B(0.08, 0.5, 0.02), 0xff8a2a, 0.4, 0.5, 0.61, 0, 0, 0.4); // 앞면 용암 균열
      break;
    case 'iceRock': // 얼음 바위 — 균열 + 하이라이트
      P(B(1.4, 0.9, 1.1), 0xa8d8e8, 0, 0.45, 0);
      P(B(0.7, 0.5, 0.6), 0xc8e8f8, -0.3, 0.95, 0.1, 0, 0.6, 0);
      P(B(0.05, 0.4, 0.02), 0x6a9ab8, -0.15, 0.5, 0.56, 0, 0, 0.3); // 균열
      P(B(0.4, 0.06, 0.3), 0xffffff, 0.45, 0.92, -0.35); // 윗면 하이라이트 (뒷쪽)
      break;
    case 'grass': // 풀잎 다발 — 4개 잎 + 씨앗 머리
      for (let i = -1; i <= 1; i++) P(K(0.14, 0.7), i % 2 ? 0x7ccb5e : 0x5aae4c, i * 0.25, 0.35, 0, 0, 0, i * 0.25);
      P(K(0.11, 0.55), 0x96e06a, 0.45, 0.28, 0.1, 0, 0, -0.35);
      P(S(0.06), 0xd8c878, 0.55, 0.6, 0.12); // 씨앗
      break;
    case 'flower': // 꽃 4송이 + 잎
      for (let i = 0; i < 4; i++) {
        const x = -0.3 + i * 0.2;
        P(C(0.02, 0.02, 0.4), 0x4f9a42, x, 0.2, 0);
        P(S(0.09), ['#ffe066', '#ff9ec4', '#b9a6ff', '#ff7a6a'][i], x, 0.45, 0);
      }
      P(B(0.3, 0.04, 0.12), 0x4f9a42, 0, 0.12, 0, 0, 0.3, 0); // 잎
      break;
    case 'bush': // 덤불 — 잎 뭉치 3색 + 열매
      P(S(0.55), 0x479e3e, -0.25, 0.4, 0);
      P(S(0.5), 0x5aae4c, 0.3, 0.35, 0.1);
      P(S(0.4), 0x6cbe58, 0, 0.65, -0.1);
      P(S(0.16), 0x6fbf58, -0.5, 0.6, 0.2);
      P(S(0.14), 0x2f7a2e, 0.45, 0.6, -0.2);
      P(S(0.07), 0xff5a4a, 0.1, 0.85, 0.25); // 열매
      P(S(0.06), 0xffd257, -0.75, 0.55, 0.3); // 열매
      break;
    case 'reed': // 갈대 — 씨앗 머리 2개
      for (let i = -1; i <= 1; i++) P(C(0.05, 0.07, 1.3), 0x8a9a5a, i * 0.28, 0.65, 0, 0, 0, i * 0.12);
      P(K(0.08, 0.3), 0xc8b878, 0.28, 1.45, 0);
      P(K(0.07, 0.25), 0xd8c888, -0.28, 1.4, 0.05);
      break;
    case 'cactus': // 선인장 — 가시 + 꽃
      P(C(0.22, 0.26, 1.5), 0x46a83e, 0, 0.75, 0);
      P(C(0.12, 0.12, 0.5), 0x46a83e, -0.35, 0.7, 0, 0, 0, 0.5);
      P(C(0.12, 0.12, 0.5), 0x46a83e, 0.35, 0.9, 0, 0, 0, -0.5);
      P(S(0.1), 0xff9ec4, 0, 1.6, 0);
      for (let i = 0; i < 4; i++) P(K(0.04, 0.12), 0xd8e8c8, -0.15 + i * 0.1, 1.1 + (i % 2) * 0.3, 0.24, 0.5, 0, 0); // 가시
      break;
    case 'pillar': // 돌기둥 (밑단 + 기둥 + 머리) — 균열 + 밑동 이끼
      P(B(0.9, 0.3, 0.9), 0x9a9a9a, 0, 0.15, 0);
      P(B(0.6, 3.0, 0.6), 0xb8b8b8, 0, 1.8, 0);
      P(B(0.9, 0.3, 0.9), 0x9a9a9a, 0, 3.45, 0);
      P(B(0.7, 0.2, 0.7), 0x8a8a8a, 0, 3.7, 0);
      P(B(0.05, 0.8, 0.02), 0x6a6a6a, -0.1, 2.2, 0.31, 0, 0, 0.2); // 균열 (앞면)
      P(B(0.5, 0.1, 0.5), 0x5a7a3a, 0.1, 0.32, 0.1); // 밑동 이끼
      break;
    case 'ruinPillar': // 부서진 기둥 (기울어진 윗조각) — 균열 + 이끼
      P(B(0.9, 0.3, 0.9), 0x8a8578, 0, 0.15, 0);
      P(B(0.6, 2.2, 0.6), 0xa8a294, 0, 1.25, 0);
      P(B(0.6, 0.5, 0.6), 0x8a8578, 0.25, 2.5, 0, 0, 0, -0.3);
      P(B(0.05, 0.6, 0.02), 0x6a6558, -0.12, 1.5, 0.31, 0, 0, 0.25); // 균열
      P(B(0.4, 0.08, 0.4), 0x5a7a3a, -0.1, 0.32, 0.05); // 밑동 이끼
      break;
    case 'coral': // 산호 가지 — 폴립 + 파란 점
      for (let i = -1; i <= 1; i++) P(C(0.08, 0.12, 1.1), 0xff7a8a, i * 0.35, 0.55, 0, 0, 0, -i * 0.4);
      P(C(0.07, 0.1, 0.9), 0xffa04a, 0, 0.7, 0.2, 0.3, 0, 0);
      P(S(0.12), 0xffd257, 0.35, 1.2, 0);
      P(S(0.1), 0xff9ec4, -0.4, 0.9, 0.15); // 산호 폴립
      P(S(0.08), 0x7fd8ff, 0.1, 1.0, -0.2);
      break;
    case 'wall': // 돌담 — 벽돌 줄눈
      P(B(2.2, 1.5, 0.5), 0x8d8578, 0, 0.75, 0);
      P(B(2.3, 0.25, 0.6), 0x6a6258, 0, 1.6, 0);
      P(B(0.4, 0.5, 0.55), 0x7a7268, -0.7, 1.0, 0);
      P(B(2.22, 0.06, 0.52), 0x6a6258, 0, 1.1, 0); // 벽돌 줄눈
      P(B(2.22, 0.06, 0.52), 0x6a6258, 0, 0.5, 0);
      break;
    case 'palm': // 야자수 — 살짝 굽은 줄기 + 바깥·아래로 처진 큼직한 노란빛 잎 + 코코넛
      // 줄기 (기울어지게 — rz -0.08이면 윗부분이 +X로 기운다)
      P(C(0.13, 0.2, 2.6), 0x8a6a3a, 0.12, 1.3, 0, 0, 0, -0.08);
      P(C(0.1, 0.15, 0.5), 0x6a4a22, 0.22, 2.62, 0, 0, 0, -0.08);
      // 잎 6장 — 원뿔(끝이 뾰족해 잎처럼 보인다)을 바깥·아래로 향하게.
      // Euler XYZ는 R = Rx·Ry·Rz라 rz=1.9로 +Y를 옆으로 눕힌 뒤 ry=a+π/2로 방향을 돌리면
      // 잎끝이 (sin a·0.95, -0.32, cos a·0.95) — 바깥쪽·아래를 향한다.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P(K(0.32, 1.5, 4), i % 2 ? 0x7fb83a : 0x9ccb4a, 0.2 + Math.sin(a) * 0.55, 2.6, Math.cos(a) * 0.55, 0, a + Math.PI / 2, 1.9);
      }
      P(S(0.16), 0x9ccb4a, 0.22, 2.85, 0); // 잎 중심 뭉치
      P(S(0.09), 0x6a4a22, 0.32, 2.52, 0.14); // 코코넛
      P(S(0.09), 0x6a4a22, 0.08, 2.48, -0.2);
      break;
    case 'dock': // 나무 부두 (판자 + 말뚝) — 밧줄 뭉치
      for (let i = -1; i <= 1; i++) P(B(2.4, 0.12, 0.5), 0xa87a42, 0, 0.55, i * 0.55);
      for (const x of [-1.0, 1.0]) for (const z of [-0.55, 0.55]) P(C(0.09, 0.11, 0.9), 0x7a5230, x, 0.45, z);
      P(C(0.16, 0.16, 0.1), 0xc8b878, 0.8, 0.66, 0.3); // 밧줄 뭉치
      break;
    case 'crate': // 나무 상자 + 테두리 + 세로 판자
      P(B(1.0, 1.0, 1.0), 0x9a7040, 0, 0.5, 0);
      P(B(1.05, 0.12, 1.05), 0x6a4a22, 0, 0.95, 0);
      P(B(1.05, 0.12, 1.05), 0x6a4a22, 0, 0.12, 0);
      P(B(0.12, 1.0, 1.02), 0x6a4a22, -0.3, 0.5, 0); // 세로 판자
      P(B(0.12, 1.0, 1.02), 0x6a4a22, 0.3, 0.5, 0);
      break;
    case 'barrel': // 술통 + 쇠테 (가운데 추가) + 뚜껑
      P(C(0.42, 0.38, 1.0), 0x8a5a2a, 0, 0.5, 0);
      P(C(0.44, 0.44, 0.08), 0x4a4a4a, 0, 0.85, 0);
      P(C(0.44, 0.44, 0.08), 0x4a4a4a, 0, 0.18, 0);
      P(C(0.44, 0.44, 0.08), 0x4a4a4a, 0, 0.52, 0); // 가운데 쇠테
      P(C(0.36, 0.36, 0.04), 0x6a4a22, 0, 1.0, 0); // 뚜껑
      break;
    case 'anchor': // 닻 + 고리
      P(B(0.12, 1.3, 0.12), 0x3a3f4a, 0, 0.65, 0);
      P(B(0.8, 0.12, 0.12), 0x3a3f4a, 0, 1.2, 0);
      P(B(0.7, 0.12, 0.12), 0x3a3f4a, 0, 0.25, 0);
      for (const s of [-1, 1]) P(K(0.14, 0.35), 0x3a3f4a, s * 0.4, 0.15, 0, 0, 0, s * 0.9);
      P(C(0.16, 0.16, 0.06), 0x2a2f3a, 0, 1.38, 0, 0.5, 0, 0); // 닻 고리
      break;
    case 'buoy': // 부표 (빨강·흰 줄무늬) — 빨간 줄무늬 추가
      P(C(0.3, 0.42, 0.5), 0xc03030, 0, 0.25, 0);
      P(C(0.36, 0.3, 0.35), 0xf2f2f2, 0, 0.65, 0);
      P(K(0.3, 0.4), 0xc03030, 0, 1.0, 0);
      P(S(0.08), 0xffd257, 0, 1.25, 0);
      P(C(0.34, 0.34, 0.06), 0xc03030, 0, 0.5, 0); // 빨간 줄무늬
      break;
    case 'boat': // 배 (선체 + 돛대 + 돛) — 선체 줄무늬 + 깃발
      P(B(2.4, 0.5, 0.9), 0x6a4a22, 0, 0.35, 0);
      P(B(1.8, 0.4, 0.7), 0x8a6a3a, 0, 0.7, 0);
      P(C(0.06, 0.08, 1.4), 0x4a3423, 0, 1.4, 0);
      P(B(0.9, 1.0, 0.04), 0xf2e6c8, 0, 1.5, 0.3, 0, 0.3, 0);
      P(B(2.42, 0.1, 0.92), 0x4a3423, 0, 0.55, 0); // 선체 줄무늬
      P(B(0.3, 0.2, 0.02), 0xc03030, 0, 2.15, 0); // 깃발
      break;
    case 'brazier': // 화로 (받침 + 불꽃) — 불씨 추가
      P(C(0.3, 0.4, 0.4), 0x3a3f4a, 0, 0.2, 0);
      P(C(0.08, 0.12, 0.8), 0x3a3f4a, 0, 0.8, 0);
      P(C(0.35, 0.15, 0.35), 0x2a2f3a, 0, 1.3, 0);
      P(K(0.22, 0.5), 0xff8a2a, 0, 1.65, 0);
      P(S(0.1), 0xffd257, 0, 1.5, 0);
      P(S(0.06), 0xff6a2a, 0.15, 1.85, 0.1); // 불씨
      P(S(0.05), 0xffd257, -0.12, 1.8, -0.08);
      break;
    case 'mushroom': // 버섯 — 줄기 + 빨간 갓 + 흰 점 + 작은 버섯
      P(C(0.22, 0.3, 0.8), 0xf2ead0, 0, 0.4, 0);
      P(S(0.55), 0xc03030, 0, 0.95, 0);
      P(S(0.09), 0xffffff, -0.25, 1.25, 0.3);
      P(S(0.07), 0xffffff, 0.2, 1.3, 0.35);
      P(S(0.07), 0xffffff, 0.05, 1.1, -0.4);
      P(C(0.12, 0.16, 0.4), 0xf2ead0, 0.5, 0.2, 0.25); // 작은 버섯 줄기
      P(S(0.28), 0xd84848, 0.5, 0.5, 0.25); // 작은 버섯 갓
      P(S(0.05), 0xffffff, 0.4, 0.68, 0.4);
      break;
    case 'crystal': // 수정 — 기울어진 결정 3개 + 받침
      P(K(0.28, 1.4), 0x7fd8ff, -0.25, 0.7, 0, 0, 0, 0.25);
      P(K(0.24, 1.1), 0x9fe8ff, 0.25, 0.55, 0.1, 0, 0, -0.2);
      P(K(0.18, 0.8), 0x5ab8e8, 0, 0.4, -0.15, 0.2, 0, 0);
      P(B(0.9, 0.1, 0.9), 0x3a6a8a, 0, 0.05, 0); // 수정 받침
      break;
    case 'tent': // 천막 (원뿔 + 기둥) — 입구 + 깃발
      P(K(1.2, 1.6), 0xc8b878, 0, 1.1, 0);
      P(C(0.06, 0.06, 0.6), 0x6a4a22, 0, 2.1, 0);
      P(B(2.2, 0.15, 1.6), 0x8a7a5a, 0, 0.08, 0);
      P(B(0.5, 0.9, 0.12), 0x4a3423, 0, 0.45, 1.08); // 입구
      P(B(0.25, 0.18, 0.02), 0xc03030, 0, 2.45, 0); // 깃발
      break;
    case 'fence': // 울타리 (말뚝 2개 + 가로대) — 뾰족 머리
      for (const x of [-0.9, 0.9]) P(B(0.12, 1.2, 0.12), 0x8a6a3a, x, 0.6, 0);
      P(B(2.0, 0.12, 0.08), 0x8a6a3a, 0, 1.0, 0);
      P(B(2.0, 0.12, 0.08), 0x8a6a3a, 0, 0.55, 0);
      for (const x of [-0.9, 0.9]) P(K(0.1, 0.18), 0x6a4a22, x, 1.28, 0); // 말뚝 뾰족 머리
      break;
    default: // 알 수 없는 종류는 회색 상자
      P(B(w0, h0 * 0.7, w0), 0x8a8a8a, 0, h0 * 0.35, 0);
      break;
  }
  const geo = parts.length ? mergeGeometryParts(THREE, parts) : new THREE.BoxGeometry(1, 1, 1);
  for (const m of parts) { m.geometry.dispose(); m.material.dispose(); }
  PROP_GEO_CACHE.set(kind, geo);
  return geo;
}
export function propMesh(THREE, kind, rnd) {
  // 낱개 3D 소품 (게이트 기둥·보관함 가림막 등 — 필드 소품은 buildWorld에서 인스턴싱한다)
  const m = new THREE.Mesh(buildPropGeometry(THREE, kind), propMaterial(THREE));
  m.castShadow = true;
  m.userData.r = PROP_R[kind] || 0.5;
  return m;
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

// ---------- 살아 있는 물 ----------
// 작은 캔버스 물결 텍스처 (128×128, 타일 반복) — 바다·한강 위에 까는 평면 2장이 쓴다.
// 지형 높이가 ±3~4m로 출렁여서 월드 전체 평면은 안 된다: 빈 바다(남서쪽)와
// 한강 수로(지형이 -0.7m로 파인 곳)에만 깔고, 지형이 물보다 높으면 물이 가려진다.
// 걷는 땅 위에는 절대 안 깐다 — groundY/충돌은 그대로, 물은 보기용이다.
function waterTexture(THREE, rx, ry) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1b7d92';
  g.fillRect(0, 0, 128, 128);
  const wrnd = rand(4242);
  // 물결 대시 — 밝은 청록 + 어두운 남청을 가로로 흩뿌린다
  for (let i = 0; i < 46; i++) {
    const light = wrnd() > 0.45;
    g.fillStyle = light ? 'rgba(140,220,235,0.55)' : 'rgba(10,80,105,0.5)';
    const w = 8 + wrnd() * 18, x = wrnd() * 128, y = wrnd() * 128;
    g.fillRect(x, y, w, light ? 2 : 3);
    g.fillRect(x + w * 0.3, y + 3, w * 0.5, 1);
  }
  // 잔물결 점
  for (let i = 0; i < 60; i++) {
    g.fillStyle = wrnd() > 0.5 ? 'rgba(200,245,255,0.5)' : 'rgba(8,60,80,0.4)';
    g.fillRect(wrnd() * 128, wrnd() * 128, 2, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ---------- 하나의 판타지 지도 전체를 짓는다 ----------
// 480×384 지면 1장(빽빽한 2D 텍스처 + 3D 높낮이) + 구역별 3D 소품(인스턴싱)
// + 경계 자연물 벽 + 3D 상자 55개 + 3D NPC 18명 + 방벽 게이트(통로마다)
// + 지구 귀환 게이트 + 마계 관문.
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

  // 살아 있는 물 — 빈 바다(남서쪽) + 한강 수로. 지형보다 낮으면 보이고 높으면 가려진다.
  // 걷는 땅 위에는 깔지 않는다 (groundY·충돌 불변). disposeGroup이 group과 함께 정리한다.
  const seaTex = waterTexture(THREE, 24, 12);
  const seaMat = new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.88, depthWrite: false });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(192, 96), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-144, 0.12, 192);
  group.add(sea);
  const riverTex = waterTexture(THREE, 60, 2);
  const riverMat = new THREE.MeshLambertMaterial({ map: riverTex, transparent: true, opacity: 0.88, depthWrite: false });
  const river = new THREE.Mesh(new THREE.PlaneGeometry(480, 16), riverMat);
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, -0.22, RIVER_Z);
  group.add(river);
  const water = { sea, river, seaTex, riverTex, seaMat, riverMat };

  // ---------- 소품 배치 (인스턴싱) ----------
  const scatter = [];
  const protoCache = {};
  // 소품 충돌 반경 (3D 지오메트리 크기는 PROP_SIZE와 같다)
  function protoFor(kind) {
    if (!protoCache[kind]) protoCache[kind] = { r: PROP_R[kind] || 0.5 };
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

  const WEIGHT = { tree: 4, deadTree: 4, rock: 3, bush: 3, grass: 4, flower: 1.4, reed: 3, cactus: 3, sandRock: 3.4, pillar: 1.0, ruinPillar: 1.0, coral: 3, bubbleRock: 2.4, wall: 1.4, dock: 3, crate: 3, barrel: 3, anchor: 2, buoy: 2, boat: 2, brazier: 2.4, mushroom: 3, pine: 4, crystal: 2.6, lavaRock: 3, iceRock: 3, tent: 2, fence: 2, palm: 2.5 };
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
      const small = kind === 'grass' || kind === 'flower' || kind === 'mushroom';
      const big = kind === 'tree' || kind === 'deadTree' || kind === 'pillar' || kind === 'ruinPillar' || kind === 'cactus' || kind === 'pine' || kind === 'boat' || kind === 'tent' || kind === 'dock' || kind === 'crystal' || kind === 'palm';
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
  const WALL_KINDS = ['rock', 'sandRock', 'bubbleRock', 'tree', 'deadTree', 'pillar', 'ruinPillar', 'wall', 'dock', 'crate', 'barrel', 'boat', 'anchor', 'brazier', 'lavaRock', 'iceRock', 'pine', 'crystal', 'tent', 'fence'];
  function wallKindFor(zn) {
    // 구역별 경계 벽 팔레트 (theme.wall) — 없으면 예전처럼 prop에서 벽 종류만 골라 쓴다
    const wallPool = zn.theme.wall || [];
    if (wallPool.length) return wallPool[Math.floor(rnd() * wallPool.length)];
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

  // 인스턴스 메시 생성 — 3D 소품 (합친 지오메트리 + 버텍스 컬러, 종류별 1개 메시).
  // 2D 빌보드 시절과 같은 크기로 보인다 (지오메트리가 PROP_SIZE 크기라 t.s 배율이 그대로 통한다).
  const byKind = {};
  for (const t of scatter) (byKind[t.kind] = byKind[t.kind] || []).push(t);
  const dummy = new THREE.Object3D();
  const propMat = propMaterial(THREE);
  for (const [kind, arr] of Object.entries(byKind)) {
    const geo = buildPropGeometry(THREE, kind);
    const inst = new THREE.InstancedMesh(geo, propMat, arr.length);
    arr.forEach((t, i) => {
      dummy.position.set(t.x, groundHeight(t.x, t.z), t.z);
      dummy.rotation.set(0, t.r, 0); // 3D 소품은 Y축으로만 돌린다 (눕히지 않는다)
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
      hide.rotation.y = 0; // 3D 가림막은 회전 없이 둔다 (상자를 가리는 방향 고정)
      group.add(hide);
      props.push({ x: hide.position.x, z: hide.position.z, r: hide.userData.r * 1.2 || 1, kind: spec.hide });
      const gkey = `${Math.floor(hide.position.x / CELL)},${Math.floor(hide.position.z / CELL)}`;
      if (!grid.has(gkey)) grid.set(gkey, []);
      grid.get(gkey).push(props[props.length - 1]);
      const opened = openedChests.includes(`${zn.id}:${idx}`);
      if (opened) { chest.userData.lid.rotation.x = -1.9; } // 3D 뚜껑은 경첩으로만 열린다
      chests.push({ id: `${zn.id}:${idx}`, mesh: chest, x: wp.x, z: wp.z, opened });
    });
  }

  // NPC (구역마다 1명)
  for (const zn of zones) {
    if (!zn.map) continue;
    const wp = worldPos(zn, zn.npc.x, zn.npc.z);
    const npc = makeNpc(THREE, zn.npc.icon);
    npc.position.set(wp.x, groundHeight(wp.x, wp.z), wp.z);
    npc.rotation.y = 0; // 3D NPC는 카메라(남쪽)를 향한다 (예전 빌보드는 뒤집어 보였다)
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
    spawnPoints, spawnPointsByDistrict, particles: points, fieldRing: null, groundHeight, water,
    openGate, setEarthGate, setGyeonggiGate,
    update(dt, t) {
      const arr = pgeo.attributes.position.array;
      for (let i = 0; i < pc; i++) {
        arr[i * 3 + 1] += Math.sin(t * seeds[i] + i) * dt * 0.25;
        arr[i * 3] += Math.cos(t * 0.4 + i) * dt * 0.15;
      }
      pgeo.attributes.position.needsUpdate = true;
      // 물결: 텍스처를 흘리고 투명도를 살짝 흔든다 (저렴한 스크롤 애니메이션 — 셰이더 없음)
      water.seaTex.offset.x += dt * 0.012;
      water.seaTex.offset.y += dt * 0.005;
      water.riverTex.offset.x -= dt * 0.03;
      water.seaMat.opacity = 0.86 + Math.sin(t * 0.9) * 0.04;
      water.riverMat.opacity = 0.86 + Math.sin(t * 1.3 + 1.5) * 0.04;
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
