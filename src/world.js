// 3D 월드 · 캐릭터 생성 (2.5D 도트 스프라이트 + 로우폴리 지형)
import { AVATAR_MAP } from './data.js';
import { makeHeroSprite, makeMonsterSprite, makeCompanionSprite, visualEquip } from './sprites.js';
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

// ---------- 지면 텍스처 ----------
function groundTexture(THREE, theme, zoneId, rnd) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = theme.ground2;
  g.fillRect(0, 0, S, S);
  const col = '#' + theme.ground.toString(16).padStart(6, '0');
  // 바탕 얼룩
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 16;
    g.globalAlpha = 0.06 + rnd() * 0.14;
    g.fillStyle = rnd() > 0.45 ? col : theme.grass;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd() * 0.6), rnd() * 3.14, 0, 6.283);
    g.fill();
  }
  // 잔풀 결
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.globalAlpha = 0.12 + rnd() * 0.22;
    g.strokeStyle = rnd() > 0.5 ? theme.grass : theme.ground2;
    g.lineWidth = 1 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 5, y - 2 - rnd() * 5);
    g.stroke();
  }
  g.globalAlpha = 1;
  // 길
  const pathW = 34;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.10)';
  g.lineWidth = pathW + 12;
  g.beginPath();
  g.moveTo(S * 0.5, S * 1.02);
  g.bezierCurveTo(S * 0.46, S * 0.78, S * 0.58, S * 0.62, S * 0.5, S * 0.45);
  g.bezierCurveTo(S * 0.42, S * 0.3, S * 0.52, S * 0.16, S * 0.5, S * -0.02);
  g.stroke();
  g.strokeStyle = zoneId === 3 ? '#e6cd93' : zoneId === 4 ? '#5b93a0' : zoneId === 2 ? '#5c6b52' : '#9c8a63';
  g.lineWidth = pathW;
  g.stroke();
  // 길 위 돌 / 자갈
  for (let i = 0; i < 900; i++) {
    const t = rnd();
    const x = S * 0.5 + Math.sin(t * 9) * 26 + (rnd() - 0.5) * pathW * 0.85;
    const y = S * (1 - t);
    g.globalAlpha = 0.10 + rnd() * 0.18;
    g.fillStyle = rnd() > 0.5 ? '#f2e6c8' : '#5a4a2e';
    g.beginPath();
    g.ellipse(x, y, 1 + rnd() * 4, 1 + rnd() * 3, rnd() * 3, 0, 6.283);
    g.fill();
  }
  // 길 돌 테두리
  g.globalAlpha = 0.5;
  for (let i = 0; i < 80; i++) {
    const t = i / 80;
    const y = S * (1 - t);
    for (const side of [-1, 1]) {
      const x = S * 0.5 + Math.sin(t * 9) * 26 + side * pathW * 0.52;
      g.fillStyle = rnd() > 0.5 ? '#9c8f74' : '#7a6f58';
      g.beginPath();
      g.ellipse(x, y, 3 + rnd() * 3, 2 + rnd() * 3, rnd() * 3, 0, 6.283);
      g.fill();
    }
  }
  // 길 가장자리
  g.globalAlpha = 0.18; g.strokeStyle = '#000'; g.lineWidth = 6;
  g.beginPath();
  g.moveTo(S * 0.5, S * 1.02);
  g.bezierCurveTo(S * 0.46, S * 0.78, S * 0.58, S * 0.62, S * 0.5, S * 0.45);
  g.bezierCurveTo(S * 0.42, S * 0.3, S * 0.52, S * 0.16, S * 0.5, S * -0.02);
  g.stroke();
  g.globalAlpha = 1;
  if (zoneId === 2) {
    for (let i = 0; i < 16; i++) {
      const x = rnd() * S, y = rnd() * S, r = 26 + rnd() * 60;
      g.globalAlpha = 0.5;
      g.fillStyle = '#2b4a45';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 6.283);
      g.fill();
      g.globalAlpha = 0.25;
      g.strokeStyle = '#9bd6bf';
      g.lineWidth = 2;
      g.stroke();
    }
  }
  if (zoneId === 4) {
    g.globalAlpha = 0.22;
    g.strokeStyle = '#a8e8ee';
    g.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.stroke();
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// ---------- 캐릭터 ----------
// 2.5D 탑뷰 도트 스프라이트. 장착 무기·방어구가 외형에 반영된다.
export function makePlayer(THREE, family = 'sword', av = null, equip = null, appearance = null) {
  const A = av || AVATAR_MAP.boyA;
  const eq = visualEquip(equip, appearance);
  if (!equip && family && family !== 'slash') return makeHeroSprite(THREE, A, { weapon: { fam: family, grade: 0 }, armor: null });
  return makeHeroSprite(THREE, A, eq);
}
// ---------- 몬스터 · 동료 외형 ----------
// 2.5D 도트 빌보드 스프라이트 (카메라 정면 + 바닥 그림자)
export function makeMonster(THREE, def) {
  return makeMonsterSprite(THREE, def);
}

export function makeCompanion(THREE, cls, gradeColor = 0xffffff) {
  return makeCompanionSprite(THREE, cls, gradeColor);
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

export function buildZone(THREE, zone, openedChests = []) {
  const rnd = rand(zone.id * 7919 + 13);
  const group = new THREE.Group();
  const props = [];
  const chests = [];

  // 지면
  const gtex = groundTexture(THREE, zone.theme, zone.id, rnd);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 96, 1, 1),
    new THREE.MeshLambertMaterial({ map: gtex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // 보스 영역은 바닥 그림 없이 내부 좌표/반경으로만 인식한다 (지형이 그대로 보이게)

  // ---------- 소품 배치 (인스턴싱) ----------
  const scatter = [];
  const protoCache = {};
  function protoFor(kind) {
    if (!protoCache[kind]) {
      const r2 = rand(zone.id * 31 + kind.length * 17 + 5);
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

  // 테두리
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const rad = 43 + rnd() * 3;
    const kind = zone.theme.prop[Math.floor(rnd() * zone.theme.prop.length)];
    addProp(rnd() > 0.55 ? kind : 'rock', Math.cos(a) * rad, Math.sin(a) * rad, 2.4 + rnd() * 1.4, rnd() * 6.28);
  }
  // 내부 (길·시작점·제단·NPC 주변은 비움)
  const WEIGHT = { tree: 4, deadTree: 4, rock: 3, bush: 3, grass: 4, flower: 1.4, reed: 3, cactus: 3, sandRock: 3.4, pillar: 2.4, ruinPillar: 2.6, coral: 3, bubbleRock: 2.4, wall: 1.4 };
  function pickKind() {
    const pool = zone.theme.prop;
    let total = 0; for (const k of pool) total += WEIGHT[k] || 1;
    let r = rnd() * total;
    for (const k of pool) { r -= WEIGHT[k] || 1; if (r <= 0) return k; }
    return pool[0];
  }
  function freeSpot(minR, maxR) {
    for (let t = 0; t < 10; t++) {
      const a = rnd() * Math.PI * 2;
      const r = minR + Math.sqrt(rnd()) * (maxR - minR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x + Math.sin(z * 0.08) * 2.5) < 3.2) continue;
      if (Math.hypot(x - zone.spawn.x, z - zone.spawn.z) < 3.6) continue;
      if (Math.hypot(x - zone.boss.x, z - zone.boss.z) < 9) continue;
      if (zone.field && Math.hypot(x - zone.field.x, z - zone.field.z) < 10.5) continue;
      if (Math.hypot(x - zone.npc.x, z - zone.npc.z) < 3.6) continue;
      if (Math.hypot(x - (zone.spawn.x - 6), z - (zone.spawn.z + 5)) < 3.2) continue;
      return { x, z };
    }
    return null;
  }
  for (let i = 0; i < 430; i++) {
    const spot = freeSpot(8, 42);
    if (!spot) continue;
    const kind = pickKind();
    const small = kind === 'grass' || kind === 'flower';
    const big = kind === 'tree' || kind === 'deadTree' || kind === 'pillar' || kind === 'ruinPillar' || kind === 'cactus';
    const scl = small ? 1.7 + rnd() * 1.1 : big ? 1.05 + rnd() * 0.8 : 1.0 + rnd() * 0.9;
    addProp(kind, spot.x, spot.z, scl, rnd() * 6.28);
    // 가끔 무리지어 자라기
    if (rnd() < 0.3) {
      const k2 = small ? kind : pickKind();
      addProp(k2, spot.x + (rnd() - 0.5) * 2.2, spot.z + (rnd() - 0.5) * 2.2, scl * (0.75 + rnd() * 0.3), rnd() * 6.28);
    }
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
      dummy.position.set(t.x, 0, t.z);
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

  // 숨겨진 보관함 (소품 뒤 그늘에 배치)
  zone.chests.forEach((spec, idx) => {
    const chest = makeChest(THREE);
    chest.position.set(spec.x, 0, spec.z);
    chest.rotation.y = -0.4 + rnd() * 0.8;
    group.add(chest);
    // 가리는 소품: 카메라(+z, 위) 쪽에 크게
    const hide = propMesh(THREE, spec.hide, rnd);
    const hd = 1.15 + rnd() * 0.5;
    hide.position.set(spec.x + (rnd() - 0.5) * 0.5, 0, spec.z + hd);
    hide.scale.setScalar(spec.hide === 'rock' || spec.hide === 'sandRock' || spec.hide === 'bubbleRock' ? 1.9 : spec.hide === 'wall' ? 1.25 : 1.5);
    hide.rotation.y = rnd() * 6.28;
    group.add(hide);
    props.push({ x: hide.position.x, z: hide.position.z, r: hide.userData.r * 1.2 || 1, kind: spec.hide });
    const opened = openedChests.includes(`${zone.id}:${idx}`);
    if (opened) { chest.userData.lid.rotation.x = -1.9; chest.userData.lid.position.z = -0.3; }
    chests.push({ id: `${zone.id}:${idx}`, mesh: chest, x: spec.x, z: spec.z, opened });
  });

  // NPC
  const npc = makeNpc(THREE, zone.npc.icon);
  npc.position.set(zone.npc.x, 0, zone.npc.z);
  npc.rotation.y = Math.PI;
  group.add(npc);

  // 귀환 포탈
  const portal = new THREE.Group();
  const pr = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.85 }));
  pr.rotation.x = -Math.PI / 2; pr.position.y = 0.16; portal.add(pr);
  const pd = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), new THREE.MeshBasicMaterial({ color: 0x4ab0ff, transparent: true, opacity: 0.35 }));
  pd.rotation.x = -Math.PI / 2; pd.position.y = 0.1; portal.add(pd);
  portal.position.set(zone.spawn.x - 6, 0, zone.spawn.z + 5);
  group.add(portal);

  // 보스 문
  const gateL = propMesh(THREE, 'pillar', rnd); gateL.position.set(zone.boss.x - 4.2, 0, zone.boss.z + 5.5); gateL.scale.setScalar(1.3);
  const gateR = propMesh(THREE, 'pillar', rnd); gateR.position.set(zone.boss.x + 4.2, 0, zone.boss.z + 5.5); gateR.scale.setScalar(1.3);
  group.add(gateL, gateR);
  props.push({ x: gateL.position.x, z: gateL.position.z, r: 0.7, kind: 'pillar' }, { x: gateR.position.x, z: gateR.position.z, r: 0.7, kind: 'pillar' });

  // 대기 입자
  const pc = zone.theme.ambient === 'bubble' ? 90 : 70;
  const pos = new Float32Array(pc * 3);
  const seeds = [];
  for (let i = 0; i < pc; i++) {
    pos[i * 3] = (rnd() - 0.5) * 80;
    pos[i * 3 + 1] = 0.4 + rnd() * 5;
    pos[i * 3 + 2] = (rnd() - 0.5) * 80;
    seeds.push(0.2 + rnd() * 0.8);
  }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pmat = new THREE.PointsMaterial({
    color: zone.theme.ambientColor, size: zone.theme.ambient === 'bubble' ? 0.22 : 0.16,
    map: dotTexture(THREE), transparent: true, opacity: 0.75, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(pgeo, pmat);
  group.add(points);

  const npcPos = { x: zone.npc.x, z: zone.npc.z };
  const spawnPoints = [];
  for (let i = 0; i < 26; i++) {
    const x = (rnd() - 0.5) * 74, z = (rnd() - 0.5) * 74;
    if (Math.hypot(x - zone.spawn.x, z - zone.spawn.z) < 10) continue;
    if (Math.hypot(x - zone.boss.x, z - zone.boss.z) < 10) continue;
    if (zone.field && Math.hypot(x - zone.field.x, z - zone.field.z) < 11) continue;
    if (Math.hypot(x - npcPos.x, z - npcPos.z) < 4) continue;
    spawnPoints.push({ x, z });
  }

  return {
    group, props, chests, npc, portal, spawnPoints, particles: points, fieldRing: null,
    update(dt, t) {
      const arr = pgeo.attributes.position.array;
      for (let i = 0; i < pc; i++) {
        if (zone.theme.ambient === 'bubble') {
          arr[i * 3 + 1] += dt * seeds[i] * 1.2;
          if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = 0.3;
        } else {
          arr[i * 3 + 1] += Math.sin(t * seeds[i] + i) * dt * 0.25;
          arr[i * 3] += Math.cos(t * 0.4 + i) * dt * 0.15;
        }
      }
      pgeo.attributes.position.needsUpdate = true;
      npc.userData.marker.position.y = 2.3 + Math.sin(t * 2.2) * 0.12;
      portal.rotation.y = t * 0.8;
    },
  };
}
