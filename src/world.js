// 3D 월드 · 캐릭터 생성 (2.5D 도트 스프라이트 + 로우폴리 지형)
import { AVATAR_MAP, GRADES, ARMOR_KINDS, ZONES, EARTH_GATE } from './data.js';
import { visualEquip } from './sprites.js';
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

// ---------- 하나의 연결된 서울 지도 ----------
// 288×288 월드, 96×96 구역 9개를 3×3으로 배치. 해금 순서대로 뱀처럼 이어진다.
//   북(z=-144):  강북 사막(3)  한강 심해(4)  북한산 설산(9)
//   중:          마곡 늪지(2)  남산 유적(5)  도봉 빙하(8)
//   남(z=+144):  여의도 숲(1)  관악 화산(6)  강남 달표면(7)
export const WORLD_SIZE = 288;
export const WORLD_HALF = 144;
const GRID = [[3, 4, 9], [2, 5, 8], [1, 6, 7]];
export function districtAt(x, z) {
  const col = Math.max(0, Math.min(2, Math.floor((x + WORLD_HALF) / 96)));
  const row = Math.max(0, Math.min(2, Math.floor((z + WORLD_HALF) / 96)));
  return ZONES.find((zn) => zn.id === GRID[row][col]) || ZONES[0];
}
export function worldPos(zone, lx, lz) {
  return { x: zone.map.cx + lx, z: zone.map.cz + lz };
}
// 해금 순서대로 구역 중심을 잇는 메인 길 (뱀 모양)
export const PATH_CENTERS = ZONES.filter((z) => z.map).map((z) => ({ x: z.map.cx, z: z.map.cz }));
const PATH_SEGS = [];
for (let i = 0; i < PATH_CENTERS.length - 1; i++) PATH_SEGS.push([PATH_CENTERS[i], PATH_CENTERS[i + 1]]);
// 평탄화 지점: 각 구역의 스폰·NPC·보스·미드·필드·추가보스·게이트 (월드 좌표)
const FLAT_POINTS = [];
for (const zn of ZONES) {
  if (!zn.map) continue;
  const pts = [zn.spawn, zn.npc, zn.boss, zn.mid, zn.field];
  for (const p of pts) if (p) FLAT_POINTS.push(worldPos(zn, p.x, p.z));
  for (const ex of (zn.extraBosses || [])) FLAT_POINTS.push({ x: zn.map.cx + ex.x, z: zn.map.cz + ex.z });
  if (zn.gate) FLAT_POINTS.push({ x: zn.gate.x, z: zn.gate.z });
}
// 한강: 지도 가로를 흐르는 강 (구역 4 중심선 z=-96 부근, 얕은 수로)
const RIVER_Z = -96;

// ---------- 지형 높이 ----------
// 결정적 지형 높이: 월드 좌표 기준, 서 있는 구역마다 다른 완만한 언덕/웅덩이. 진폭 약 1.2~2.0.
// 스폰·NPC·보스/필드·메인 길목·게이트는 평탄하게 만든다. 한강 라인(z=-96)은 얕은 수로.
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
  const zId = districtAt(x, z).id;
  const a = zId * 1.7 + 0.6;
  const b = zId * 2.3 + 1.9;
  const h1 = Math.sin(x * 0.09 + a) * Math.cos(z * 0.075 + b);
  const h2 = Math.sin(x * 0.045 - b * 0.7 + z * 0.06 + a * 0.5) * Math.cos(z * 0.05 - a);
  let h = h1 * 0.9 + h2 * 0.7;
  // 평탄화 지점 (스폰·NPC·보스·게이트 등)
  for (const fp of FLAT_POINTS) {
    const d = Math.hypot(x - fp.x, z - fp.z);
    h *= smooth(clamp01((d - 3.5) / 4.5));
  }
  // 메인 길목: 구역 중심을 잇는 길에서 3.2 이내를 평탄하게
  let dPath = Infinity;
  for (const [p0, p1] of PATH_SEGS) dPath = Math.min(dPath, distToSeg(x, z, p0.x, p0.z, p1.x, p1.z));
  h *= smooth(clamp01((dPath - 3.2) / 3.5));
  // 한강 수로: 강 라인을 따라 얕게 팬다
  const dRiver = Math.abs(z - RIVER_Z);
  const rk = 1 - smooth(clamp01((dRiver - 4) / 6));
  h = h * (1 - rk) + (-0.7) * rk;
  return h;
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

// ---------- 지면 텍스처 (하나의 서울 지도 전체, 2048) ----------
// 구역마다 다른 바탕색, 구역 중심을 잇는 뱀 모양 돌길, 한강 물줄기, 구역별 장식을 한 장에 그린다.
function groundTexture(THREE, zones, rnd) {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const X = (wx) => (wx + WORLD_HALF) / WORLD_SIZE * S;
  const Y = (wz) => (wz + WORLD_HALF) / WORLD_SIZE * S;
  const hexOf = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  g.fillStyle = '#101825';
  g.fillRect(0, 0, S, S);
  // 구역별 바탕 (중심 잔디색 → 가장자리 ground2)
  for (const zn of zones) {
    if (!zn.map) continue;
    const cx = X(zn.map.cx), cy = Y(zn.map.cz);
    const R = S / 3 * 0.72;
    const grd = g.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
    grd.addColorStop(0, zn.theme.grass || hexOf(zn.theme.ground));
    grd.addColorStop(0.55, hexOf(zn.theme.ground));
    grd.addColorStop(1, zn.theme.ground2);
    g.fillStyle = grd;
    g.fillRect(cx - S / 6, cy - S / 6, S / 3, S / 3);
  }
  // 바탕 얼룩 (서 있는 구역 색으로)
  for (let i = 0; i < 4200; i++) {
    const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 26;
    const wx = x / S * WORLD_SIZE - WORLD_HALF, wz = y / S * WORLD_SIZE - WORLD_HALF;
    const zn = districtAt(wx, wz);
    g.globalAlpha = 0.06 + rnd() * 0.14;
    g.fillStyle = rnd() > 0.45 ? hexOf(zn.theme.ground) : (zn.theme.grass || hexOf(zn.theme.ground));
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd() * 0.6), rnd() * 3.14, 0, 6.283);
    g.fill();
  }
  // 잔풀 결
  for (let i = 0; i < 8000; i++) {
    const x = rnd() * S, y = rnd() * S;
    const wx = x / S * WORLD_SIZE - WORLD_HALF, wz = y / S * WORLD_SIZE - WORLD_HALF;
    const zn = districtAt(wx, wz);
    g.globalAlpha = 0.12 + rnd() * 0.22;
    g.strokeStyle = rnd() > 0.5 ? (zn.theme.grass || hexOf(zn.theme.ground)) : zn.theme.ground2;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 6, y - 2 - rnd() * 6);
    g.stroke();
  }
  g.globalAlpha = 1;
  // 한강 물줄기 (z=-96 라인, 가로 전체)
  const ry0 = Y(RIVER_Z - 8), ry1 = Y(RIVER_Z + 8);
  g.fillStyle = '#2a7a96';
  g.fillRect(0, ry0, S, ry1 - ry0);
  g.globalAlpha = 0.35; g.strokeStyle = '#a8e8ee'; g.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const y = ry0 + rnd() * (ry1 - ry0);
    g.beginPath(); g.moveTo(rnd() * S * 0.4, y);
    g.bezierCurveTo(S * 0.35, y + (rnd() - 0.5) * 14, S * 0.65, y + (rnd() - 0.5) * 14, S * (0.6 + rnd() * 0.4), y);
    g.stroke();
  }
  g.globalAlpha = 1;
  // 구역별 장식: 늪 웅덩이(2) · 심해 고리(4) · 용암 빛(6) · 달 크레이터(7) · 빙하 반짝임(8)
  const z2 = zones.find((z) => z.id === 2), z4 = zones.find((z) => z.id === 4);
  const z6 = zones.find((z) => z.id === 6), z7 = zones.find((z) => z.id === 7);
  const z8 = zones.find((z) => z.id === 8);
  if (z2) for (let i = 0; i < 16; i++) {
    const x = X(z2.map.cx) + (rnd() - 0.5) * S / 3.4, y = Y(z2.map.cz) + (rnd() - 0.5) * S / 3.4, r = 26 + rnd() * 60;
    g.globalAlpha = 0.5; g.fillStyle = '#2b4a45';
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 6.283); g.fill();
    g.globalAlpha = 0.25; g.strokeStyle = '#9bd6bf'; g.lineWidth = 2; g.stroke();
  }
  if (z4) {
    g.globalAlpha = 0.22; g.strokeStyle = '#a8e8ee'; g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const x = X(z4.map.cx) + (rnd() - 0.5) * S / 3.4, y = Y(z4.map.cz) + (rnd() - 0.5) * S / 3.4, r = 30 + rnd() * 90;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke();
    }
  }
  if (z6) for (let i = 0; i < 22; i++) {
    const x = X(z6.map.cx) + (rnd() - 0.5) * S / 3.4, y = Y(z6.map.cz) + (rnd() - 0.5) * S / 3.4, r = 8 + rnd() * 26;
    g.globalAlpha = 0.35 + rnd() * 0.3; g.fillStyle = rnd() > 0.5 ? '#ff7a3a' : '#ffb03a';
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, 6.283); g.fill();
  }
  if (z7) for (let i = 0; i < 18; i++) {
    const x = X(z7.map.cx) + (rnd() - 0.5) * S / 3.4, y = Y(z7.map.cz) + (rnd() - 0.5) * S / 3.4, r = 14 + rnd() * 34;
    g.globalAlpha = 0.3; g.fillStyle = '#5a5e68';
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.globalAlpha = 0.4; g.strokeStyle = '#c9ced8'; g.lineWidth = 2; g.stroke();
  }
  if (z8) for (let i = 0; i < 60; i++) {
    const x = X(z8.map.cx) + (rnd() - 0.5) * S / 3.4, y = Y(z8.map.cz) + (rnd() - 0.5) * S / 3.4;
    g.globalAlpha = 0.5 + rnd() * 0.4; g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x, y, 1.5 + rnd() * 3, 0, 6.283); g.fill();
  }
  g.globalAlpha = 1;
  // 구역 경계선 (은은하게)
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 3;
  for (const b of [-48, 48]) {
    g.beginPath(); g.moveTo(X(b), 0); g.lineTo(X(b), S); g.stroke();
    g.beginPath(); g.moveTo(0, Y(b)); g.lineTo(S, Y(b)); g.stroke();
  }
  // 메인 길: 구역 중심을 잇는 뱀 모양 돌길
  const pathW = 30;
  const trace = () => {
    g.beginPath();
    PATH_CENTERS.forEach((p, i) => {
      const px = X(p.x), py = Y(p.z);
      if (i === 0) g.moveTo(px, py);
      else {
        const prev = PATH_CENTERS[i - 1];
        g.quadraticCurveTo(X(prev.x), Y(p.z), px, py);
      }
    });
  };
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = pathW + 12; trace(); g.stroke();
  g.strokeStyle = '#9c8a63'; g.lineWidth = pathW; trace(); g.stroke();
  // 길 위 돌 / 자갈
  for (let i = 0; i < 1600; i++) {
    const t = rnd();
    const seg = Math.min(PATH_SEGS.length - 1, Math.floor(t * PATH_SEGS.length));
    const [a, b] = PATH_SEGS[seg];
    const lt = t * PATH_SEGS.length - seg;
    const wx = a.x + (b.x - a.x) * lt + (rnd() - 0.5) * pathW * 0.9 / (S / WORLD_SIZE);
    const wz = a.z + (b.z - a.z) * lt + (rnd() - 0.5) * pathW * 0.9 / (S / WORLD_SIZE);
    g.globalAlpha = 0.10 + rnd() * 0.18;
    g.fillStyle = rnd() > 0.5 ? '#f2e6c8' : '#5a4a2e';
    g.beginPath();
    g.ellipse(X(wx), Y(wz), 1 + rnd() * 4, 1 + rnd() * 3, rnd() * 3, 0, 6.283);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
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
      tipDown(cone(THREE, 0.035, 0.1, 0xdfe7f2, 4), -0.4);
      break;
    }
    case 'axe': {
      add(cyl(THREE, 0.03, 0.035, 0.42, 0x8a6a3a), 0, -0.26, 0);
      add(box(THREE, 0.3, 0.2, 0.05, 0xdfe7f2), 0, -0.48, 0);
      add(box(THREE, 0.1, 0.12, 0.05, 0xdfe7f2), 0, -0.48, 0.08);
      break;
    }
    case 'mace': {
      add(cyl(THREE, 0.03, 0.035, 0.4, 0x8a6a3a), 0, -0.25, 0);
      add(sphere(THREE, 0.11, 0xdfe7f2, 8), 0, -0.47, 0);
      for (let i = 0; i < 4; i++) {
        const s = cone(THREE, 0.03, 0.08, 0xdfe7f2, 4);
        const a = (i / 4) * Math.PI * 2;
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
      add(box(THREE, 0.015, 0.72, 0.015, 0xf2ead0), 0, 0, -0.22);
      const shaft = cyl(THREE, 0.015, 0.015, 0.5, 0xdcc39a, 5);
      shaft.rotation.x = Math.PI / 2; add(shaft, 0, 0, 0.12);
      const tip = cone(THREE, 0.03, 0.09, 0xe9f2ff, 4);
      tip.rotation.x = Math.PI / 2; add(tip, 0, 0, 0.4);
      break;
    }
    case 'crossbow': {
      add(box(THREE, 0.07, 0.07, 0.42, 0x8a6a3a), 0, -0.05, 0.05);
      add(box(THREE, 0.44, 0.05, 0.05, 0xdfe7f2), 0, -0.02, 0.22);
      const bolt = cyl(THREE, 0.015, 0.015, 0.34, 0xd7e2f0, 5);
      bolt.rotation.x = Math.PI / 2; add(bolt, 0, 0.02, 0.12);
      break;
    }
    case 'staff': {
      add(cyl(THREE, 0.028, 0.035, 0.85, 0x8a6a3a), 0, -0.05, 0);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.grade);
      add(orb, 0, 0.48, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 14), M.metal);
      ring.rotation.x = Math.PI / 2; add(ring, 0, 0.48, 0);
      tipDown(cone(THREE, 0.04, 0.1, 0xdfe7f2, 4), -0.52);
      break;
    }
    case 'book': {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.42), M.grade);
      add(cover, 0, -0.12, 0);
      add(box(THREE, 0.27, 0.045, 0.37, 0xf7f0d8), 0, -0.1, 0);
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), M.grade);
      add(rune, 0, 0.22, 0);
      break;
    }
    case 'sword':
    default: {
      add(cyl(THREE, 0.03, 0.03, 0.14, 0x6a4a22), 0, -0.07, 0);
      add(box(THREE, 0.2, 0.045, 0.055, 0xdfe7f2), 0, -0.15, 0);
      add(box(THREE, 0.085, 0.28, 0.028, 0xdfe7f2), 0, -0.31, 0);
      tipDown(cone(THREE, 0.042, 0.12, 0xdfe7f2, 4), -0.5);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), M.grade);
      add(gem, 0, -0.15, 0.045);
      break;
    }
  }
  return g;
}

// 로우폴리 치비 휴머노이드. 정면은 +z (rotation.y = atan2(dx,dz)가 이동 방향을 향한다).
// opts: { avatar, skin, uniform, hair, accent, weaponFam, grade, armorFam, capeColor, scale }
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

  const skinM = mat(THREE, skin);
  const uniM = mat(THREE, uniform);
  const hairM = mat(THREE, hairCol);
  const pantsM = mat(THREE, av ? av.pants : 0x2c3242);
  const capeM = mat(THREE, capeCol);
  const gradeM = mat(THREE, gradeCol);
  const metalM = mat(THREE, 0xdfe7f2);
  const darkM = mat(THREE, 0x20242e);
  const M = { grade: gradeM, metal: metalM };

  const g = new THREE.Group();
  g.add(blobShadow(THREE, 0.42));

  // 다리 (고관절 y=0.55에서 회전)
  const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.18);
  legGeo.translate(0, -0.25, 0);
  const legL = new THREE.Group(); legL.position.set(-0.11 * bulk, 0.55, 0);
  legL.add(new THREE.Mesh(legGeo, pantsM)); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.11 * bulk, 0.55, 0);
  legR.add(new THREE.Mesh(legGeo, pantsM)); g.add(legR);
  if (opts.robe || (av && av.skirt)) {
    const skirt = cone(THREE, 0.34 * bulk, 0.42, uniform, 8);
    skirt.position.y = 0.62; g.add(skirt);
  }

  // 몸통 그룹 (걷기 바운스·공격 돌진/기울기용, 자식은 절대 높이로 배치)
  const body = new THREE.Group(); body.userData.baseY = 0; g.add(body);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.3), uniM);
  torso.scale.x = bulk;
  torso.position.y = 0.85; body.add(torso);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.32), trimCol ? mat(THREE, trimCol) : gradeM);
  belt.scale.x = bulk;
  belt.position.y = 0.6; body.add(belt);
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.05), capeM);
  cape.scale.x = bulk;
  cape.position.set(0, 0.82, -0.19); body.add(cape);

  // 머리
  const head = new THREE.Group(); head.position.y = 1.42; body.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skinM));
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.31, 10, 8), hairM);
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
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), hairM);
      bun.position.set(0.34 * s, 0.02, -0.04); head.add(bun);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 6), hairM);
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
  const irisM = mat(THREE, av ? av.iris : 0x3d6fd6);
  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 5);
  const eyeL = new THREE.Mesh(eyeGeo, irisM); eyeL.position.set(-0.11, 0.02, 0.26); head.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, irisM); eyeR.position.set(0.11, 0.02, 0.26); head.add(eyeR);
  if (av) {
    // 눈썹 (머리색) — 얼굴 인상 구분
    const browGeo = new THREE.BoxGeometry(0.1, 0.025, 0.02);
    const browL = new THREE.Mesh(browGeo, hairM); browL.position.set(-0.11, 0.13, 0.27); head.add(browL);
    const browR = new THREE.Mesh(browGeo, hairM); browR.position.set(0.11, 0.13, 0.27); head.add(browR);
  }

  // 팔 (어깨 y=1.08에서 회전)
  const armGeo = new THREE.BoxGeometry(0.14, 0.5, 0.16);
  armGeo.translate(0, -0.22, 0);
  const armR = new THREE.Group(); armR.position.set(0.33 * bulk, 1.08, 0);
  armR.add(new THREE.Mesh(armGeo, uniM));
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skinM);
  handR.position.set(0, -0.48, 0); armR.add(handR); body.add(armR);
  const armL = new THREE.Group(); armL.position.set(-0.33 * bulk, 1.08, 0);
  armL.add(new THREE.Mesh(armGeo, uniM));
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), skinM);
  handL.position.set(0, -0.48, 0); armL.add(handL); body.add(armL);

  // 무기 (오른손)
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0, -0.48, 0.04);
  armR.add(weaponGroup);
  const weapon = buildWeaponMesh(THREE, fam, M);
  weaponGroup.add(weapon);

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
      ? { skin: color, uniform: dark, hair: dark, pants: dark, hairStyle: 'long', skirt: !!cfg.robe, ribbon: 0, iris: (shape === 'skeleton' || shape === 'mummy') ? 0x1a1a22 : 0xffffff }
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
    } else if (shape === 'orc') {
      for (const s of [-1, 1]) {
        const tusk = new THREE.Mesh(gCone(THREE, 0.035, 0.12, 4), mat(THREE, 0xf2ead0));
        tusk.position.set(0.09 * s, -0.22, 0.26); head.add(tusk);
      }
    } else if (shape === 'lizard') {
      const tail = new THREE.Mesh(gCone(THREE, 0.12, 0.7, 6), darkM);
      tail.position.set(0, 0.5, -0.4); tail.rotation.x = 1.9; hg.add(tail);
    } else if (shape === 'mummy') {
      for (const s of [-1, 1]) {
        const ge = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), bm(0xffc93c));
        ge.position.set(0.11 * s, 0.02, 0.27); head.add(ge);
      }
    } else if (shape === 'witch') {
      const hat = new THREE.Mesh(gCone(THREE, 0.3, 0.55, 8), hM);
      hat.position.set(0, 0.42, -0.02); head.add(hat);
      const brim = new THREE.Mesh(gCyl(THREE, 0.42, 0.42, 0.04, 12), hM);
      brim.position.set(0, 0.16, 0); head.add(brim);
    } else if (shape === 'anubis') {
      const snout = new THREE.Mesh(gBox(THREE, 0.22, 0.16, 0.3), hM);
      snout.position.set(0, -0.06, 0.3); head.add(snout);
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(gCone(THREE, 0.09, 0.34, 4), hM);
        ear.position.set(0.14 * s, 0.36, 0); head.add(ear);
      }
    } else if (shape === 'barbarian') {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(gCone(THREE, 0.07, 0.26, 4), mat(THREE, 0xf2ead0));
        horn.position.set(0.3 * s, 0.22, 0); horn.rotation.z = s * -0.9; head.add(horn);
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
    top = 0.96; radius = 0.5;
  } else if (shape === 'frog') {
    const b = pSph(0.6, bodyM); b.scale.set(1, 0.62, 1.1); put(b, 0, 0.34, 0);
    put(pSph(0.2, bodyM), -0.22, 0.72, 0.3);
    put(pSph(0.2, bodyM), 0.22, 0.72, 0.3);
    put(pSph(0.08, eyeM, 6, 5), -0.22, 0.74, 0.46);
    put(pSph(0.08, eyeM, 6, 5), 0.22, 0.74, 0.46);
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
      for (let i = 0; i < 3; i++) put(pBox(0.06, 0.06, 0.28, darkM), 0.32 * s, 0.12, -0.3 + i * 0.25);
    }
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
    top = 2.15; radius = 0.6;
  } else if (shape === 'ent') {
    put(pCyl(0.32, 0.42, 1.5, bodyM, 8), 0, 0.75, 0);
    const brL = pCyl(0.08, 0.12, 0.9, darkM, 6); brL.position.set(-0.5, 1.5, 0); brL.rotation.z = 0.6; body.add(brL);
    const brR = pCyl(0.08, 0.12, 0.9, darkM, 6); brR.position.set(0.5, 1.5, 0); brR.rotation.z = -0.6; body.add(brR);
    put(pSph(0.5, darkM), 0, 1.95, 0);
    put(pSph(0.42, darkM), -0.38, 1.75, 0.1);
    put(pSph(0.38, darkM), 0.38, 1.78, -0.05);
    eyes(1.2, 0.12, 0.36, 0.05);
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
      const e1 = pSph(0.05, eyeM, 6, 5); e1.position.set(-0.11, 0.05, 0.26); hd.add(e1);
      const e2 = pSph(0.05, eyeM, 6, 5); e2.position.set(0.11, 0.05, 0.26); hd.add(e2);
      heads.push(hd);
    }
    const tail = pCon(0.2, 0.9, darkM); tail.position.set(0, 0.5, -0.95); tail.rotation.x = -1.9; body.add(tail);
    top = 2.15; radius = 0.9;
  } else if (shape === 'kraken') {
    const dome = pSph(1.0, bodyM); dome.scale.set(1, 0.85, 1); put(dome, 0, 1.1, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tent = pCon(0.16, 1.0, darkM); tent.position.set(Math.cos(a) * 0.7, 0.55, Math.sin(a) * 0.7);
      tent.rotation.z = Math.cos(a) * 0.35; tent.rotation.x = -Math.sin(a) * 0.35; body.add(tent);
    }
    for (const s of [-1, 1]) {
      const up = pCon(0.18, 1.1, darkM); up.position.set(0.85 * s, 1.6, 0); up.rotation.z = s * -0.7; body.add(up);
    }
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
    wingL = new THREE.Group(); wingL.position.set(-0.35, 1.55, -0.1); body.add(wingL);
    const wl = pBox(1.25, 0.05, 0.65, darkM); wl.position.set(-0.65, 0, 0); wingL.add(wl);
    wingR = new THREE.Group(); wingR.position.set(0.35, 1.55, -0.1); body.add(wingR);
    const wr = pBox(1.25, 0.05, 0.65, darkM); wr.position.set(0.65, 0, 0); wingR.add(wr);
    const tl1 = pCon(0.2, 0.7, darkM); tl1.position.set(0, 1.0, -0.8); tl1.rotation.x = -1.9; body.add(tl1);
    const tl2 = pCon(0.12, 0.6, darkM); tl2.position.set(0, 1.0, -1.3); tl2.rotation.x = -1.9; body.add(tl2);
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
    eyes(0.45, 0.12, 0.3, 0.05);
    top = 1.7; radius = 0.7;
  } else if (shape === 'wraith') {
    put(pCon(0.55, 1.35, bodyM, 8), 0, 0.68, 0);
    put(pSph(0.3, darkM), 0, 1.45, 0);
    for (const s of [-1, 1]) {
      const ge = pSph(0.05, bm(0x9fd8ff), 6, 5); put(ge, 0.1 * s, 1.45, 0.26);
      const sleeve = pCon(0.09, 0.5, darkM); sleeve.position.set(0.5 * s, 0.9, 0.1); sleeve.rotation.z = s * 0.5; body.add(sleeve);
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
    robe: c.id === 'healer' || c.id === 'mage',
  });
  const u = g.userData;
  const metalM = mat(THREE, 0xdfe7f2);
  const uniM = mat(THREE, c.color);
  if (c.id === 'tank') {
    // 투구 (돔 + 코받이)
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), metalM);
    helm.scale.set(1, 0.62, 1); helm.position.set(0, 0.2, 0); u.head.add(helm);
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
    // 후드 (얼굴을 감싸는 구) + 지팡이 끝 빛
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), uniM);
    hood.scale.set(1, 1.05, 1); hood.position.set(0, 0.06, -0.12); u.head.add(hood);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.48, 0); u.weaponGroup.add(glow);
  } else if (c.id === 'melee') {
    // 머리띠 + 왼손 단검 (쌍단검)
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.06), mat(THREE, 0xffffff));
    band.position.set(0, 0.14, 0.24); u.head.add(band);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.02), mat(THREE, 0xffffff));
    tail.position.set(0.08, -0.06, -0.3); tail.rotation.z = 0.2; u.head.add(tail);
    const off = new THREE.Group();
    off.position.set(0, -0.48, 0.04);
    off.add(buildWeaponMesh(THREE, 'dagger', { grade: mat(THREE, gradeColor), metal: metalM }));
    u.armL.add(off);
  } else if (c.id === 'mage') {
    // 뾰족모자 (원뿔 + 챙) + 왼손 마법책 + 지팡이 끝 빛
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 8), uniM);
    hat.position.set(0, 0.44, -0.02); u.head.add(hat);
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

// ---------- 하나의 서울 지도 전체를 짓는다 ----------
// 288×288 지면 1장 + 구역별 소품(인스턴싱) + 상자 28개 + NPC 9명 + 방벽 게이트 8개 + 지구 귀환 게이트.
// 포탈은 없다 — 이동은 걸어서, 구역 이동은 게이트를 통해서만.
export function buildWorld(THREE, zones, openedChests = [], earthGateOpen = false) {
  const rnd = rand(987654321);
  const group = new THREE.Group();
  const props = [];
  const chests = [];
  const npcs = {};
  const gates = [];

  // 지면 (3D 지형: 144x144 분할 후 groundHeight로 높이 적용)
  const gtex = groundTexture(THREE, zones, rnd);
  const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 144, 144);
  const gpos = groundGeo.attributes.position;
  for (let i = 0; i < gpos.count; i++) {
    gpos.setZ(i, groundHeight(gpos.getX(i), -gpos.getY(i)));
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ map: gtex })
  );
  ground.rotation.x = -Math.PI / 2;
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
  // 바깥 테두리 (사각 경계선을 따라)
  for (let i = 0; i < 200; i++) {
    const t = (i / 200) * WORLD_SIZE * 4;
    const side = Math.floor(t / WORLD_SIZE);
    const along = (t % WORLD_SIZE) - WORLD_HALF;
    let x, z;
    if (side === 0) { x = along; z = -WORLD_HALF + 1 + rnd() * 2; }
    else if (side === 1) { x = WORLD_HALF - 1 - rnd() * 2; z = along; }
    else if (side === 2) { x = along; z = WORLD_HALF - 1 - rnd() * 2; }
    else { x = -WORLD_HALF + 1 + rnd() * 2; z = along; }
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

  // 방벽 게이트 (구역 2~9 입구) — 기둥 2개 + 빛나는 결계벽
  for (const zn of zones) {
    if (!zn.gate) continue;
    const g = new THREE.Group();
    const gy = groundHeight(zn.gate.x, zn.gate.z);
    const alongX = zn.gate.along === 'x';
    const off = 5.2;
    const px = alongX ? 0 : off, pz = alongX ? off : 0;
    for (const sgn of [-1, 1]) {
      const pil = propMesh(THREE, 'pillar', rnd);
      pil.position.set(zn.gate.x + px * sgn, groundHeight(zn.gate.x + px * sgn, zn.gate.z + pz * sgn), zn.gate.z + pz * sgn);
      pil.scale.setScalar(1.5);
      g.add(pil);
      props.push({ x: pil.position.x, z: pil.position.z, r: 0.7, kind: 'pillar' });
    }
    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0x9f7bff, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const barrier = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), barrierMat);
    barrier.position.set(zn.gate.x, gy + 2.1, zn.gate.z);
    barrier.rotation.y = alongX ? 0 : Math.PI / 2;
    g.add(barrier);
    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xc9a8ff, transparent: true, opacity: 0.8 })
    );
    glowRing.position.set(zn.gate.x, gy + 1.6, zn.gate.z);
    glowRing.rotation.y = alongX ? 0 : Math.PI / 2;
    g.add(glowRing);
    group.add(g);
    gates.push({ districtId: zn.id, x: zn.gate.x, z: zn.gate.z, group: g, barrier, barrierMat, glowRing, open: false, openT: 0 });
  }

  // 지구 귀환 게이트 (9구역 북쪽 끝) — 열리면 황금빛으로 빛난다
  const earthGate = { open: !!earthGateOpen, group: null, disc: null, ring: null };
  {
    const eg = new THREE.Group();
    const gy = groundHeight(EARTH_GATE.x, EARTH_GATE.z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.22, 10, 28),
      new THREE.MeshBasicMaterial({ color: earthGateOpen ? 0xffd257 : 0x8a97a8, transparent: true, opacity: 0.95 })
    );
    ring.position.set(EARTH_GATE.x, gy + 2.6, EARTH_GATE.z);
    eg.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd257, transparent: true, opacity: earthGateOpen ? 0.5 : 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    disc.position.set(EARTH_GATE.x, gy + 2.6, EARTH_GATE.z);
    eg.add(disc);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 1.6), new THREE.MeshLambertMaterial({ color: 0x6a6f7a, flatShading: true }));
    base.position.set(EARTH_GATE.x, gy + 0.25, EARTH_GATE.z);
    eg.add(base);
    group.add(eg);
    earthGate.group = eg;
    earthGate.disc = disc;
    earthGate.ring = ring;
  }

  // 대기 입자 (지도 전체)
  const pc = 220;
  const pos = new Float32Array(pc * 3);
  const seeds = [];
  for (let i = 0; i < pc; i++) {
    pos[i * 3] = (rnd() - 0.5) * 270;
    pos[i * 3 + 1] = 0.4 + rnd() * 5;
    pos[i * 3 + 2] = (rnd() - 0.5) * 270;
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

  function openGate(districtId) {
    const gt = gates.find((x) => x.districtId === districtId);
    if (!gt || gt.open) return false;
    gt.open = true;
    gt.openT = 0;
    return true;
  }
  function setEarthGate(open) {
    earthGate.open = !!open;
    if (earthGate.disc) earthGate.disc.material.opacity = open ? 0.5 : 0.1;
    if (earthGate.ring) earthGate.ring.material.color.setHex(open ? 0xffd257 : 0x8a97a8);
  }

  return {
    group, props, propsNear, chests, npcs, npc: npcs[1] || null, gates, earthGate,
    spawnPoints, spawnPointsByDistrict, particles: points, fieldRing: null, groundHeight,
    openGate, setEarthGate,
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
      // 열리는 게이트의 결계벽은 서서히 사라진다
      for (const gt of gates) {
        if (gt.open && gt.barrier.visible) {
          gt.openT += dt;
          gt.barrierMat.opacity = Math.max(0, 0.4 - gt.openT * 0.5);
          gt.glowRing.material.opacity = Math.max(0, 0.8 - gt.openT * 0.6);
          if (gt.openT > 0.9) { gt.barrier.visible = false; gt.glowRing.visible = false; }
        } else if (!gt.open) {
          gt.barrierMat.opacity = 0.34 + Math.sin(t * 2 + gt.districtId) * 0.1;
        }
      }
    },
  };
}
