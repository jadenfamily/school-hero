// 3D 월드 · 캐릭터 생성 (로우폴리)
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
// av: data.js 의 AVATARS 항목 (없으면 남학생 A 기본값)
export function makePlayer(THREE, family = 'slash', av = null) {
  const g = new THREE.Group();
  const A = av || {
    id: 'boyA', skin: 0xf2c9a0, uniform: 0x3a5288, accent: 0x4864a8, pants: 0x3f4859,
    hair: 0x1b1b22, hairStyle: 'short', ribbon: 0, skirt: false,
  };
  const skin = A.skin;
  const uniform = A.uniform, pants = A.pants, hair = A.hair;
  const accent = A.accent || uniform;
  const shoe = 0x23262e;
  const legL = box(THREE, 0.16, 0.5, 0.18, A.skirt ? skin : pants); legL.position.set(-0.13, 0.25, 0);
  const legR = box(THREE, 0.16, 0.5, 0.18, A.skirt ? skin : pants); legR.position.set(0.13, 0.25, 0);
  const shoeL = box(THREE, 0.2, 0.1, 0.28, shoe); shoeL.position.set(-0.13, 0.05, 0.03);
  const shoeR = box(THREE, 0.2, 0.1, 0.28, shoe); shoeR.position.set(0.13, 0.05, 0.03);
  const body = box(THREE, 0.5, 0.58, 0.3, uniform); body.position.y = 0.79;
  const shirt = box(THREE, 0.16, 0.36, 0.02, 0xf4f7ff); shirt.position.set(0, 0.87, 0.16);
  const tie = box(THREE, 0.06, 0.2, 0.02, A.skirt ? (A.ribbon || 0xd04848) : 0xd04848); tie.position.set(0, 0.9, 0.18);
  // 스커트(여학생) · 후드(남학생 B)
  const extras = [];
  if (A.skirt) {
    const skirt = cyl(THREE, 0.27, 0.4, 0.34, uniform, 8); skirt.position.y = 0.46; extras.push(skirt);
    const skirtTrim = cyl(THREE, 0.395, 0.405, 0.05, accent, 8); skirtTrim.position.y = 0.31; extras.push(skirtTrim);
  }
  if (A.hood) {
    const hood = sphere(THREE, 0.3, uniform, 8); hood.position.set(0, 1.04, -0.14); hood.scale.set(1.15, 0.7, 0.85); extras.push(hood);
    const string = box(THREE, 0.02, 0.22, 0.02, 0xf2e6cc); string.position.set(0.06, 0.92, 0.17); extras.push(string);
    const string2 = box(THREE, 0.02, 0.22, 0.02, 0xf2e6cc); string2.position.set(-0.06, 0.92, 0.17); extras.push(string2);
  }
  const head = sphere(THREE, 0.22, skin); head.position.y = 1.24;
  const hairTop = sphere(THREE, 0.235, hair); hairTop.position.set(0, 1.3, -0.01); hairTop.scale.set(1, 0.8, 1);
  const fringe = box(THREE, 0.4, 0.12, 0.1, hair); fringe.position.set(0, 1.34, 0.15);
  const eyeL = sphere(THREE, 0.035, 0x1a1a22); eyeL.position.set(-0.08, 1.26, 0.19);
  const eyeR = sphere(THREE, 0.035, 0x1a1a22); eyeR.position.set(0.08, 1.26, 0.19);
  const collar = box(THREE, 0.36, 0.07, 0.26, 0xf7faff); collar.position.set(0, 1.04, 0.03);
  const pack = box(THREE, 0.36, 0.32, 0.16, 0xb06a34); pack.position.set(0, 0.85, -0.23);
  const packTrim = box(THREE, 0.38, 0.07, 0.18, 0xffd257); packTrim.position.set(0, 0.96, -0.23);
  const shoulderL = box(THREE, 0.13, 0.1, 0.24, accent); shoulderL.position.set(-0.26, 1.03, 0);
  const shoulderR = box(THREE, 0.13, 0.1, 0.24, accent); shoulderR.position.set(0.26, 1.03, 0);
  // 헤어 스타일별 추가 머리
  if (A.hairStyle === 'long') {
    const backHair = box(THREE, 0.42, 0.6, 0.14, hair); backHair.position.set(0, 1.05, -0.17); extras.push(backHair);
    const sideL = box(THREE, 0.1, 0.46, 0.2, hair); sideL.position.set(-0.23, 1.12, 0); extras.push(sideL);
    const sideR = box(THREE, 0.1, 0.46, 0.2, hair); sideR.position.set(0.23, 1.12, 0); extras.push(sideR);
    const ribbonL = box(THREE, 0.1, 0.08, 0.06, A.ribbon || 0x8fd0ff); ribbonL.position.set(-0.2, 1.34, 0.06); extras.push(ribbonL);
  } else if (A.hairStyle === 'bob') {
    const sideL = box(THREE, 0.11, 0.3, 0.22, hair); sideL.position.set(-0.22, 1.19, -0.02); extras.push(sideL);
    const sideR = box(THREE, 0.11, 0.3, 0.22, hair); sideR.position.set(0.22, 1.19, -0.02); extras.push(sideR);
    const backHair = box(THREE, 0.36, 0.24, 0.1, hair); backHair.position.set(0, 1.16, -0.16); extras.push(backHair);
    const bowL = sphere(THREE, 0.075, A.ribbon || 0xff9ec4, 6); bowL.position.set(-0.24, 1.32, 0.06); bowL.scale.set(1.4, 1, 0.6); extras.push(bowL);
    const bowR = sphere(THREE, 0.075, A.ribbon || 0xff9ec4, 6); bowR.position.set(0.24, 1.32, 0.06); bowR.scale.set(1.4, 1, 0.6); extras.push(bowR);
  } else if (A.hairStyle === 'messy') {
    for (let i = 0; i < 4; i++) {
      const spike = cone(THREE, 0.06, 0.16, hair, 4);
      spike.position.set((i - 1.5) * 0.1, 1.44, (i % 2 ? 0.06 : -0.06));
      spike.rotation.z = (i - 1.5) * 0.25;
      extras.push(spike);
    }
  }
  const armL = box(THREE, 0.14, 0.46, 0.16, uniform); armL.position.set(-0.32, 0.86, 0);
  const armR = new THREE.Group(); armR.position.set(0.32, 0.9, 0);
  const armRBox = box(THREE, 0.14, 0.44, 0.16, uniform); armRBox.position.y = -0.2; armR.add(armRBox);
  const hand = sphere(THREE, 0.09, skin); hand.position.y = -0.44; armR.add(hand);
  const wgroup = new THREE.Group(); wgroup.position.set(0, -0.44, 0.06); armR.add(wgroup);
  let weapon = new THREE.Group();
  switch (family) {
    case 'dagger': {
      const blade = box(THREE, 0.06, 0.36, 0.02, 0xe6eefb); blade.position.y = 0.24; weapon.add(blade);
      const guard = box(THREE, 0.18, 0.04, 0.05, 0xc9a13a); guard.position.y = 0.06; weapon.add(guard);
      const grip = cyl(THREE, 0.03, 0.03, 0.14, 0x4a3a2a, 6); grip.position.y = -0.03; weapon.add(grip);
      weapon.rotation.x = -0.3; break;
    }
    case 'axe': {
      const handle = cyl(THREE, 0.035, 0.035, 0.95, 0x6b4a2a, 6); handle.position.y = 0.3; weapon.add(handle);
      const head = box(THREE, 0.08, 0.42, 0.36, 0xc9d2e0); head.position.set(0, 0.72, 0.13); weapon.add(head);
      const edge = box(THREE, 0.05, 0.44, 0.1, 0xf0f6ff); edge.position.set(0, 0.72, 0.3); weapon.add(edge);
      weapon.rotation.x = -0.28; break;
    }
    case 'mace': {
      const handle = cyl(THREE, 0.04, 0.04, 0.95, 0x7a5a36, 6); handle.position.y = 0.2; weapon.add(handle);
      const headM = box(THREE, 0.34, 0.3, 0.3, 0x9aa4b4); headM.position.y = 0.7; weapon.add(headM);
      for (const s2 of [-1, 1]) {
        const spike = cone(THREE, 0.07, 0.2, 0xd8e2f0, 4); spike.position.set(0.2 * s2, 0.7, 0); spike.rotation.z = -s2 * 1.57; weapon.add(spike);
      }
      weapon.rotation.x = -0.22; break;
    }
    case 'bow': {
      const curve = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 5, 12, Math.PI * 1.15), mat(THREE, 0x9a7040));
      curve.rotation.z = -0.55; curve.position.y = 0.42; weapon.add(curve);
      const string = cyl(THREE, 0.007, 0.007, 0.78, 0xf0f0e0, 3); string.position.set(0.36, 0.42, 0); weapon.add(string);
      weapon.rotation.y = 0.2; break;
    }
    case 'crossbow': {
      const stock = box(THREE, 0.12, 0.5, 0.16, 0x7a5a36); stock.position.y = 0.2; weapon.add(stock);
      const bowArm = box(THREE, 0.7, 0.06, 0.08, 0xb9c4d2); bowArm.position.y = 0.5; weapon.add(bowArm);
      const bolt = box(THREE, 0.03, 0.03, 0.4, 0xe8eef8); bolt.position.set(0, 0.45, 0.2); weapon.add(bolt);
      weapon.rotation.x = -0.5; break;
    }
    case 'staff': {
      const shaft = cyl(THREE, 0.03, 0.03, 1.15, 0x6b4a8a, 6); shaft.position.y = 0.2; weapon.add(shaft);
      const orb = glow(THREE, 0x9fd8ff, 0.14); orb.position.y = 0.85; weapon.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.02, 4, 10), new THREE.MeshBasicMaterial({ color: 0xc9a1ff }));
      ring.position.y = 0.85; ring.rotation.x = 1.2; weapon.add(ring);
      weapon.rotation.x = -0.3; break;
    }
    case 'book': {
      const cover = box(THREE, 0.34, 0.06, 0.42, 0x8a3a6a); cover.position.y = 0.1; weapon.add(cover);
      const pages = box(THREE, 0.3, 0.08, 0.36, 0xf4ecd8); pages.position.y = 0.15; weapon.add(pages);
      const rune = box(THREE, 0.12, 0.02, 0.12, 0x9fd8ff); rune.position.y = 0.2; weapon.add(rune);
      weapon.position.y = 0.15; weapon.rotation.x = -0.9; break;
    }
    default: {
      const blade = box(THREE, 0.07, 0.72, 0.02, 0xd7e2f0); blade.position.y = 0.42; weapon.add(blade);
      const guard = box(THREE, 0.26, 0.05, 0.06, 0xffcc55); guard.position.y = 0.07; weapon.add(guard);
      const grip = cyl(THREE, 0.035, 0.035, 0.18, 0x6b4a2a, 6); weapon.add(grip);
      weapon.rotation.x = -0.25;
    }
  }
  wgroup.add(weapon);
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 22), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.05;
  g.add(legL, legR, shoeL, shoeR, body, shirt, tie, head, hairTop, fringe, eyeL, eyeR, armL, armR, collar, pack, packTrim, shoulderL, shoulderR, aura, blobShadow(THREE, 0.62));
  for (const e of extras) g.add(e);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { armR, armL, weapon, body, head, hairTop, family, avatar: A, aura };
  g.scale.setScalar(1.0);
  return g;
}

export function makeCompanion(THREE, cls, gradeColor = 0xffffff) {
  const g = new THREE.Group();
  const skin = 0xf2c9a0;
  const robe = cls.color;
  const legL = box(THREE, 0.14, 0.42, 0.16, 0x2c3140); legL.position.set(-0.11, 0.21, 0);
  const legR = box(THREE, 0.14, 0.42, 0.16, 0x2c3140); legR.position.set(0.11, 0.21, 0);
  const body = box(THREE, 0.44, 0.5, 0.28, robe); body.position.y = 0.68;
  const trim = box(THREE, 0.46, 0.08, 0.3, gradeColor); trim.position.y = 0.46;
  const head = sphere(THREE, 0.2, skin); head.position.y = 1.08;
  const hair = sphere(THREE, 0.21, cls.id === 'healer' ? 0xf3d78a : cls.id === 'mage' ? 0x6f5aa8 : 0x3a2b22); hair.position.y = 1.13; hair.scale.set(1, 0.85, 1);
  const armL = box(THREE, 0.12, 0.4, 0.14, robe); armL.position.set(-0.29, 0.74, 0);
  const armR = box(THREE, 0.12, 0.4, 0.14, robe); armR.position.set(0.29, 0.74, 0);
  g.add(legL, legR, body, trim, head, hair, armL, armR, blobShadow(THREE, 0.45));
  if (cls.id === 'tank') {
    const shield = cyl(THREE, 0.28, 0.28, 0.06, 0xcfd8e6, 10); shield.rotation.z = Math.PI / 2; shield.position.set(-0.36, 0.72, 0.12); g.add(shield);
    const sword = box(THREE, 0.05, 0.55, 0.02, 0xdfe7f2); sword.position.set(0.4, 0.85, 0.1); g.add(sword);
  } else if (cls.id === 'healer') {
    const staff = cyl(THREE, 0.03, 0.03, 0.9, 0xe8d8a0, 6); staff.position.set(0.38, 0.75, 0.05); g.add(staff);
    const orb = glow(THREE, 0x8dffc0, 0.11); orb.position.set(0.38, 1.22, 0.05); g.add(orb);
  } else if (cls.id === 'melee') {
    for (const s of [-1, 1]) {
      const sw = box(THREE, 0.05, 0.5, 0.02, 0xdfe7f2);
      sw.position.set(0.36 * s, 0.8, 0.08);
      g.add(sw);
    }
  } else {
    const staff = cyl(THREE, 0.03, 0.03, 0.95, 0x5a4a8a, 6); staff.position.set(0.38, 0.75, 0.05); g.add(staff);
    const orb = glow(THREE, 0xb58cff, 0.12); orb.position.set(0.38, 1.26, 0.05); g.add(orb);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { cls, armR, body, head };
  return g;
}

// ---------- 몬스터 외형 ----------
export function makeMonster(THREE, def) {
  const g = new THREE.Group();
  const C = def.color, D = def.dark;
  const S = def.boss === 'boss' ? 1.75 : def.boss === 'mid' ? 1.35 : def.elite ? 1.18 : 1.0;
  let headY =  0.9, radius = 0.55;

  switch (def.shape) {
    case 'slime': {
      const b = sphere(THREE, 0.55, C); b.scale.set(1, 0.82, 1); b.position.y = 0.45; g.add(b);
      const shine = sphere(THREE, 0.12, 0xffffff); shine.position.set(-0.16, 0.62, 0.34); g.add(shine);
      for (const s of [-1, 1]) {
        const e = sphere(THREE, 0.09, 0xffffff); e.position.set(0.16 * s, 0.5, 0.44); g.add(e);
        const p = sphere(THREE, 0.045, 0x101418); p.position.set(0.16 * s, 0.5, 0.5); g.add(p);
      }
      headY = 1.05; radius = 0.55; break;
    }
    case 'goblin': {
      const body = sphere(THREE, 0.32, C); body.scale.set(0.9, 1, 0.75); body.position.y = 0.5; g.add(body);
      const head = sphere(THREE, 0.25, C); head.position.y = 0.86; g.add(head);
      const snout = box(THREE, 0.16, 0.1, 0.16, D); snout.position.set(0, 0.82, 0.22); g.add(snout);
      for (const s of [-1, 1]) {
        const ear = cone(THREE, 0.08, 0.28, D, 4); ear.position.set(0.24 * s, 0.93, 0); ear.rotation.z = s * 1.1; g.add(ear);
        const eye = sphere(THREE, 0.045, 0xffe066); eye.position.set(0.09 * s, 0.9, 0.21); g.add(eye);
        const leg = box(THREE, 0.12, 0.3, 0.14, D); leg.position.set(0.12 * s, 0.15, 0); g.add(leg);
      }
      const club = box(THREE, 0.1, 0.55, 0.1, 0x8a6a3a); club.position.set(0.38, 0.55, 0.1); club.rotation.z = -0.3; g.add(club);
      headY = 1.12; radius = 0.45; break;
    }
    case 'orc': {
      const body = box(THREE, 0.62, 0.62, 0.4, C); body.position.y = 0.72; g.add(body);
      const head = sphere(THREE, 0.3, C); head.position.y = 1.2; g.add(head);
      const jaw = box(THREE, 0.3, 0.12, 0.18, D); jaw.position.set(0, 1.1, 0.2); g.add(jaw);
      for (const s of [-1, 1]) {
        const tusk = cone(THREE, 0.045, 0.16, 0xfff0d0, 4); tusk.position.set(0.11 * s, 1.13, 0.26); tusk.rotation.x = 0.2; g.add(tusk);
        const leg = box(THREE, 0.2, 0.42, 0.22, D); leg.position.set(0.17 * s, 0.21, 0); g.add(leg);
        const eye = sphere(THREE, 0.05, 0xff6b4a); eye.position.set(0.1 * s, 1.24, 0.27); g.add(eye);
      }
      const axeH = cyl(THREE, 0.045, 0.045, 1.0, 0x6b4a2a, 5); axeH.position.set(0.48, 0.8, 0.06); g.add(axeH);
      const axeB = box(THREE, 0.06, 0.34, 0.42, 0xb9c4d2); axeB.position.set(0.48, 1.2, 0.16); g.add(axeB);
      headY = 1.6; radius = 0.55; break;
    }
    case 'ogre': {
      const body = sphere(THREE, 0.78, C); body.scale.set(1, 1.1, 0.85); body.position.y = 1.05; g.add(body);
      const head = sphere(THREE, 0.42, C); head.position.y = 1.95; g.add(head);
      const belly = sphere(THREE, 0.6, 0xd8b98a); belly.scale.set(0.9, 0.8, 0.5); belly.position.set(0, 0.95, 0.42); g.add(belly);
      for (const s of [-1, 1]) {
        const leg = box(THREE, 0.34, 0.6, 0.4, D); leg.position.set(0.3 * s, 0.3, 0); g.add(leg);
        const arm = box(THREE, 0.26, 0.8, 0.3, C); arm.position.set(0.86 * s, 1.15, 0); arm.rotation.z = s * 0.18; g.add(arm);
        const tusk = cone(THREE, 0.06, 0.24, 0xfff2d8, 4); tusk.position.set(0.16 * s, 1.92, 0.36); g.add(tusk);
        const eye = sphere(THREE, 0.06, 0xffe066); eye.position.set(0.15 * s, 2.02, 0.36); g.add(eye);
      }
      const club = cyl(THREE, 0.13, 0.16, 1.3, 0x7a5a38, 6); club.position.set(1.05, 1.0, 0.2); club.rotation.z = 0.3; g.add(club);
      headY = 2.5; radius = 0.95; break;
    }
    case 'ent': {
      const trunk = cyl(THREE, 0.5, 0.75, 2.6, C, 7); trunk.position.y = 1.3; g.add(trunk);
      for (const s of [-1, 1]) {
        const arm = cyl(THREE, 0.13, 0.2, 1.8, D, 5); arm.position.set(0.95 * s, 1.7, 0); arm.rotation.z = s * 0.9; g.add(arm);
        const claw = cone(THREE, 0.12, 0.5, D, 4); claw.position.set(1.6 * s, 2.2, 0); claw.rotation.z = s * 1.4; g.add(claw);
      }
      for (let i = 0; i < 5; i++) {
        const leaf = sphere(THREE, 0.55 + (i % 2) * 0.16, i % 2 ? 0x4f9a3e : D, 7);
        leaf.position.set(Math.cos(i * 1.4) * 0.65, 2.85 + (i % 3) * 0.22, Math.sin(i * 1.4) * 0.5);
        g.add(leaf);
      }
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.1, 0x9bffb0); eye.position.set(0.2 * s, 1.85, 0.55); g.add(eye);
      }
      const mouth = box(THREE, 0.34, 0.12, 0.1, 0x241a12); mouth.position.set(0, 1.62, 0.6); g.add(mouth);
      headY = 3.9; radius = 1.05; break;
    }
    case 'frog': {
      const body = sphere(THREE, 0.58, C); body.scale.set(1.15, 0.8, 1); body.position.y = 0.45; g.add(body);
      const belly = sphere(THREE, 0.42, 0xd9f0a8); belly.scale.set(1, 0.55, 0.6); belly.position.set(0, 0.35, 0.32); g.add(belly);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.15, 0xffffff); eye.position.set(0.26 * s, 0.78, 0.24); g.add(eye);
        const pupil = sphere(THREE, 0.07, 0x1a2818); pupil.position.set(0.26 * s, 0.8, 0.36); g.add(pupil);
        const leg = box(THREE, 0.3, 0.18, 0.42, D); leg.position.set(0.4 * s, 0.13, -0.05); leg.rotation.y = s * 0.3; g.add(leg);
      }
      const mouth = box(THREE, 0.4, 0.05, 0.06, 0x2b4a24); mouth.position.set(0, 0.42, 0.5); g.add(mouth);
      headY = 1.1; radius = 0.6; break;
    }
    case 'lizard': {
      const body = box(THREE, 0.44, 0.56, 0.3, C); body.position.y = 0.78; g.add(body);
      const head = box(THREE, 0.3, 0.24, 0.42, C); head.position.set(0, 1.18, 0.12); g.add(head);
      const snout = box(THREE, 0.2, 0.12, 0.24, D); snout.position.set(0, 1.12, 0.36); g.add(snout);
      const tail = cone(THREE, 0.16, 0.9, D, 5); tail.position.set(0, 0.55, -0.5); tail.rotation.x = 1.2; g.add(tail);
      for (const s of [-1, 1]) {
        const leg = box(THREE, 0.13, 0.42, 0.16, D); leg.position.set(0.17 * s, 0.21, 0); g.add(leg);
        const eye = sphere(THREE, 0.045, 0xffe066); eye.position.set(0.1 * s, 1.24, 0.3); g.add(eye);
      }
      const spear = cyl(THREE, 0.03, 0.03, 1.4, 0x8a6a3a, 5); spear.position.set(0.4, 0.85, 0.2); spear.rotation.x = 0.5; g.add(spear);
      const tip = cone(THREE, 0.06, 0.24, 0xcfe0d0, 5); tip.position.set(0.4, 1.45, 0.62); tip.rotation.x = 0.5; g.add(tip);
      headY = 1.55; radius = 0.5; break;
    }
    case 'wraith': {
      const cloak = cone(THREE, 0.52, 1.3, D, 7); cloak.position.y = 0.85; cloak.rotation.x = Math.PI; g.add(cloak);
      const hood = sphere(THREE, 0.28, C); hood.position.y = 1.35; g.add(hood);
      const face = sphere(THREE, 0.2, 0x120c1c); face.position.set(0, 1.32, 0.14); g.add(face);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.05, 0x9bffd0); eye.position.set(0.08 * s, 1.35, 0.28); g.add(eye);
        const arm = cone(THREE, 0.08, 0.7, C, 4); arm.position.set(0.5 * s, 1.1, 0.1); arm.rotation.z = s * 1.1; g.add(arm);
      }
      g.userData.float = true;
      headY = 1.95; radius = 0.5; break;
    }
    case 'hydra': {
      const body = sphere(THREE, 0.9, C); body.scale.set(1.3, 0.8, 1); body.position.y = 0.7; g.add(body);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.55;
        const neck = cyl(THREE, 0.14, 0.2, 1.3, D, 6);
        neck.position.set(x * 0.8, 1.5, -0.1); neck.rotation.z = -x * 0.35; neck.rotation.x = -0.12; g.add(neck);
        const head = sphere(THREE, 0.24, C); head.position.set(x * 1.05, 2.1, 0.12); g.add(head);
        const snout = box(THREE, 0.2, 0.14, 0.3, D); snout.position.set(x * 1.05, 2.06, 0.3); g.add(snout);
        for (const s of [-1, 1]) {
          const eye = sphere(THREE, 0.04, 0xff5a5a); eye.position.set(x * 1.05 + 0.1 * s, 2.16, 0.24); g.add(eye);
        }
      }
      for (const s of [-1, 1]) {
        const leg = box(THREE, 0.3, 0.5, 0.4, D); leg.position.set(0.85 * s, 0.25, 0); g.add(leg);
      }
      headY = 2.9; radius = 1.1; break;
    }
    case 'witch': {
      const robe = cone(THREE, 0.62, 1.6, C, 7); robe.position.y = 0.85; g.add(robe);
      const head = sphere(THREE, 0.24, 0xd8c8b0); head.position.y = 1.78; g.add(head);
      const hat = new THREE.Group();
      const brim = cyl(THREE, 0.55, 0.55, 0.06, D, 10); hat.add(brim);
      const top = cone(THREE, 0.3, 0.55, D, 8); top.position.y = 0.28; hat.add(top);
      hat.position.y = 1.98; hat.rotation.z = -0.12; g.add(hat);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.045, 0x9bff9b); eye.position.set(0.09 * s, 1.82, 0.21); g.add(eye);
      }
      const staff = cyl(THREE, 0.04, 0.05, 1.7, 0x4b3550, 6); staff.position.set(0.72, 1.0, 0.1); staff.rotation.z = 0.12; g.add(staff);
      const orb = glow(THREE, 0x9bff6a, 0.16); orb.position.set(0.83, 1.86, 0.1); g.add(orb);
      g.userData.float = true;
      headY = 2.6; radius = 0.7; break;
    }
    case 'scorpion': {
      const body = sphere(THREE, 0.5, C); body.scale.set(1.2, 0.6, 1.5); body.position.y = 0.45; g.add(body);
      const head = sphere(THREE, 0.32, D); head.position.set(0, 0.45, 0.6); g.add(head);
      for (const s of [-1, 1]) {
        const claw = new THREE.Group();
        const base = box(THREE, 0.18, 0.16, 0.4, D); base.position.z = 0.25; claw.add(base);
        const jawA = box(THREE, 0.08, 0.14, 0.3, C); jawA.position.set(0.08, 0, 0.5); jawA.rotation.y = 0.3; claw.add(jawA);
        const jawB = box(THREE, 0.08, 0.14, 0.3, C); jawB.position.set(-0.08, 0, 0.5); jawB.rotation.y = -0.3; claw.add(jawB);
        claw.position.set(0.5 * s, 0.5, 0.45); claw.rotation.y = s * 0.5; g.add(claw);
        for (let i = 0; i < 3; i++) {
          const leg = box(THREE, 0.08, 0.28, 0.08, D);
          leg.position.set(0.42 * s, 0.14, 0.2 - i * 0.28); leg.rotation.z = s * 0.5; g.add(leg);
        }
      }
      let px = 0, pz = -0.6, py = 0.55;
      for (let i = 0; i < 4; i++) {
        const seg = sphere(THREE, 0.17 - i * 0.02, i % 2 ? C : D, 6);
        seg.position.set(px, py + i * 0.22, pz - i * 0.08); g.add(seg);
      }
      const sting = cone(THREE, 0.09, 0.3, 0xff5a4a, 5);
      sting.position.set(0, 1.55, -0.95); sting.rotation.x = -1.1; g.add(sting);
      headY = 1.0; radius = 0.75; break;
    }
    case 'mummy': {
      const body = box(THREE, 0.5, 0.9, 0.34, C); body.position.y = 0.85; g.add(body);
      const head = box(THREE, 0.34, 0.34, 0.32, C); head.position.y = 1.5; g.add(head);
      for (let i = 0; i < 4; i++) {
        const wrap = box(THREE, 0.52, 0.05, 0.36, D); wrap.position.y = 0.55 + i * 0.22; g.add(wrap);
      }
      for (const s of [-1, 1]) {
        const arm = box(THREE, 0.13, 0.7, 0.14, C); arm.position.set(0.32 * s, 0.95, 0.18); arm.rotation.x = -0.9; g.add(arm);
        const leg = box(THREE, 0.16, 0.42, 0.18, D); leg.position.set(0.13 * s, 0.21, 0); g.add(leg);
        const eye = sphere(THREE, 0.045, 0xff7a3a); eye.position.set(0.08 * s, 1.52, 0.18); g.add(eye);
      }
      headY = 1.9; radius = 0.5; break;
    }
    case 'scarab': {
      const shell = sphere(THREE, 0.6, C); shell.scale.set(1.1, 0.65, 1.35); shell.position.y = 0.5; g.add(shell);
      const split = box(THREE, 0.06, 0.05, 1.0, D); split.position.set(0, 0.78, 0); g.add(split);
      const head = sphere(THREE, 0.28, D); head.position.set(0, 0.45, 0.75); g.add(head);
      const horn = cone(THREE, 0.1, 0.42, 0xffe08a, 5); horn.position.set(0, 0.78, 0.95); horn.rotation.x = -0.7; g.add(horn);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const leg = box(THREE, 0.06, 0.3, 0.08, D);
          leg.position.set(0.5 * s, 0.16, 0.35 - i * 0.3); leg.rotation.z = s * 0.6; g.add(leg);
        }
        const eye = sphere(THREE, 0.05, 0x9be0ff); eye.position.set(0.11 * s, 0.55, 0.88); g.add(eye);
      }
      headY = 1.15; radius = 0.65; break;
    }
    case 'anubis': {
      const body = box(THREE, 0.5, 0.62, 0.32, C); body.position.y = 0.85; g.add(body);
      const chest = box(THREE, 0.54, 0.2, 0.34, D); chest.position.y = 1.02; g.add(chest);
      const head = box(THREE, 0.3, 0.3, 0.4, C); head.position.set(0, 1.4, 0.06); g.add(head);
      const snout = box(THREE, 0.18, 0.16, 0.24, D); snout.position.set(0, 1.34, 0.34); g.add(snout);
      for (const s of [-1, 1]) {
        const ear = cone(THREE, 0.07, 0.3, D, 4); ear.position.set(0.12 * s, 1.62, 0); g.add(ear);
        const eye = sphere(THREE, 0.04, 0xffd257); eye.position.set(0.08 * s, 1.44, 0.24); g.add(eye);
        const leg = box(THREE, 0.16, 0.55, 0.18, C); leg.position.set(0.14 * s, 0.27, 0); g.add(leg);
        const arm = box(THREE, 0.13, 0.5, 0.15, C); arm.position.set(0.33 * s, 0.95, 0.05); g.add(arm);
      }
      const khopesh = box(THREE, 0.07, 0.85, 0.03, 0xe8d48a); khopesh.position.set(0.44, 1.0, 0.2); khopesh.rotation.z = -0.35; g.add(khopesh);
      const curve = box(THREE, 0.2, 0.16, 0.03, 0xe8d48a); curve.position.set(0.56, 1.38, 0.2); g.add(curve);
      headY = 2.0; radius = 0.6; break;
    }
    case 'golem': {
      const core = box(THREE, 0.9, 0.9, 0.7, C); core.position.y = 1.2; g.add(core);
      const coreGlow = glow(THREE, 0x8fe0ff, 0.22); coreGlow.position.set(0, 1.25, 0.38); g.add(coreGlow);
      const head = box(THREE, 0.42, 0.4, 0.42, D); head.position.y = 1.95; g.add(head);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.06, 0x9fe8ff); eye.position.set(0.11 * s, 2.0, 0.24); g.add(eye);
        const shoulder = box(THREE, 0.42, 0.42, 0.5, D); shoulder.position.set(0.72 * s, 1.6, 0); g.add(shoulder);
        const arm = box(THREE, 0.34, 1.1, 0.4, C); arm.position.set(0.84 * s, 0.9, 0.06); arm.rotation.z = s * 0.1; g.add(arm);
        const leg = box(THREE, 0.38, 0.7, 0.44, D); leg.position.set(0.28 * s, 0.35, 0); g.add(leg);
      }
      for (let i = 0; i < 5; i++) {
        const rock = sphere(THREE, 0.16 + (i % 3) * 0.06, i % 2 ? C : D, 5);
        rock.position.set((i - 2) * 0.2, 2.25 + (i % 2) * 0.12, 0.1); g.add(rock);
      }
      headY = 2.75; radius = 1.0; break;
    }
    case 'merfolk': {
      const body = box(THREE, 0.42, 0.55, 0.28, C); body.position.y = 0.95; g.add(body);
      const tail = cone(THREE, 0.34, 0.9, D, 6); tail.position.y = 0.35; tail.rotation.x = Math.PI; g.add(tail);
      const fin = cone(THREE, 0.35, 0.5, 0x7fe0d0, 3); fin.position.set(0, 0.05, -0.1); fin.rotation.x = Math.PI; fin.scale.set(1, 0.3, 1); g.add(fin);
      const head = sphere(THREE, 0.23, C); head.position.y = 1.48; g.add(head);
      const crest = cone(THREE, 0.16, 0.3, 0x7fe0d0, 4); crest.position.set(0, 1.68, -0.05); crest.rotation.x = -0.3; g.add(crest);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.045, 0xffe066); eye.position.set(0.09 * s, 1.5, 0.18); g.add(eye);
        const arm = box(THREE, 0.12, 0.45, 0.14, C); arm.position.set(0.3 * s, 1.0, 0.06); g.add(arm);
        const ear = cone(THREE, 0.09, 0.22, 0x7fe0d0, 3); ear.position.set(0.24 * s, 1.5, -0.02); ear.rotation.z = s * 1.4; g.add(ear);
      }
      const trident = cyl(THREE, 0.035, 0.035, 1.5, 0xd8c890, 5); trident.position.set(0.4, 1.1, 0.2); g.add(trident);
      for (let i = -1; i <= 1; i++) {
        const prong = cone(THREE, 0.05, 0.3, 0xd8c890, 4); prong.position.set(0.4 + i * 0.11, 1.95, 0.2); g.add(prong);
      }
      headY = 1.95; radius = 0.55; break;
    }
    case 'naga': {
      const tail = cone(THREE, 0.42, 1.2, D, 7); tail.position.y = 0.55; tail.rotation.x = Math.PI; g.add(tail);
      for (let i = 0; i < 3; i++) {
        const ring = cyl(THREE, 0.42 - i * 0.08, 0.46 - i * 0.08, 0.12, i % 2 ? C : D, 8);
        ring.position.y = 0.25 + i * 0.3; g.add(ring);
      }
      const body = box(THREE, 0.44, 0.56, 0.28, C); body.position.y = 1.25; g.add(body);
      const head = sphere(THREE, 0.23, C); head.position.y = 1.72; g.add(head);
      const hood = cone(THREE, 0.42, 0.36, D, 7); hood.position.set(0, 1.8, -0.08); hood.rotation.x = Math.PI; hood.scale.set(1, 0.7, 0.5); g.add(hood);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.045, 0x9fff6a); eye.position.set(0.09 * s, 1.74, 0.19); g.add(eye);
        const arm = box(THREE, 0.12, 0.45, 0.14, C); arm.position.set(0.3 * s, 1.25, 0.06); g.add(arm);
      }
      const staff = cyl(THREE, 0.035, 0.035, 1.4, 0x3f4a8a, 5); staff.position.set(0.42, 1.2, 0.16); g.add(staff);
      const orb = glow(THREE, 0x6fc8ff, 0.13); orb.position.set(0.42, 1.95, 0.16); g.add(orb);
      headY = 2.2; radius = 0.65; break;
    }
    case 'crab': {
      const shell = sphere(THREE, 0.75, C); shell.scale.set(1.35, 0.7, 1.1); shell.position.y = 0.6; g.add(shell);
      const belly = sphere(THREE, 0.6, D); belly.scale.set(1.2, 0.4, 1); belly.position.y = 0.35; g.add(belly);
      for (const s of [-1, 1]) {
        const claw = new THREE.Group();
        const arm = box(THREE, 0.16, 0.16, 0.5, D); arm.position.set(0, 0, 0.2); claw.add(arm);
        const pincer = sphere(THREE, 0.26, C); pincer.scale.set(1, 0.7, 1.3); pincer.position.set(0, 0.05, 0.6); claw.add(pincer);
        const tip = box(THREE, 0.1, 0.1, 0.34, D); tip.position.set(0.04, 0.18, 0.8); claw.add(tip);
        claw.position.set(0.9 * s, 0.55, 0.35); claw.rotation.y = s * 0.4; g.add(claw);
        for (let i = 0; i < 3; i++) {
          const leg = box(THREE, 0.09, 0.36, 0.1, D);
          leg.position.set(0.72 * s, 0.2, -0.05 - i * 0.3); leg.rotation.z = s * 0.7; g.add(leg);
        }
        const stalk = cyl(THREE, 0.04, 0.04, 0.35, D, 5); stalk.position.set(0.25 * s, 1.0, 0.55); g.add(stalk);
        const eye = sphere(THREE, 0.08, 0xffffff); eye.position.set(0.25 * s, 1.2, 0.55); g.add(eye);
      }
      headY = 1.55; radius = 0.9; break;
    }
    case 'siren': {
      const tail = cone(THREE, 0.34, 1.0, C, 7); tail.position.y = 0.6; tail.rotation.x = Math.PI; tail.scale.set(1, 1, 0.7); g.add(tail);
      const body = box(THREE, 0.38, 0.5, 0.26, 0xd8c8b0); body.position.y = 1.25; g.add(body);
      const head = sphere(THREE, 0.22, 0xd8c8b0); head.position.y = 1.68; g.add(head);
      const hair = sphere(THREE, 0.26, 0x4ad0c0); hair.position.set(0, 1.74, -0.05); hair.scale.set(1, 1.1, 0.9); g.add(hair);
      for (const s of [-1, 1]) {
        const wing = cone(THREE, 0.34, 0.9, 0x9ff0e8, 4); wing.position.set(0.48 * s, 1.4, -0.2); wing.rotation.z = s * 1.9; wing.scale.set(1, 1, 0.25); g.add(wing);
        const arm = box(THREE, 0.1, 0.42, 0.12, 0xd8c8b0); arm.position.set(0.26 * s, 1.3, 0.08); g.add(arm);
        const eye = sphere(THREE, 0.04, 0x1a6a7a); eye.position.set(0.08 * s, 1.7, 0.18); g.add(eye);
      }
      g.userData.float = true;
      headY = 2.1; radius = 0.6; break;
    }
    case 'kraken': {
      const head = sphere(THREE, 0.9, C); head.scale.set(1, 1.15, 1); head.position.y = 2.1; g.add(head);
      const mantle = cone(THREE, 0.85, 1.2, D, 8); mantle.position.y = 3.0; g.add(mantle);
      for (const s of [-1, 1]) {
        const eye = sphere(THREE, 0.24, 0xfff2c0); eye.position.set(0.42 * s, 2.2, 0.7); g.add(eye);
        const pupil = sphere(THREE, 0.1, 0x1a0a20); pupil.position.set(0.44 * s, 2.2, 0.9); g.add(pupil);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const t = new THREE.Group();
        let px = 0, py = 0;
        for (let k = 0; k < 4; k++) {
          const r = 0.26 - k * 0.045;
          const seg = cyl(THREE, r * 0.8, r, 0.55, k % 2 ? C : D, 6);
          seg.position.set(px, py, 0);
          t.add(seg);
          px += Math.cos(a) * 0.28;
          py -= 0.42;
        }
        t.position.set(Math.cos(a) * 0.5, 1.4, Math.sin(a) * 0.5);
        t.rotation.y = -a;
        g.add(t);
      }
      headY = 4.0; radius = 1.4; break;
    }
    default: {
      const b = sphere(THREE, 0.5, C); b.position.y = 0.5; g.add(b); headY = 1.0; radius = 0.5;
    }
  }
  g.add(blobShadow(THREE, Math.max(0.5, radius * 1.05)));

  g.scale.setScalar(S);
  g.userData.headY = headY * S;
  g.userData.radius = radius * S;
  g.userData.baseY = def.shape === 'wraith' || def.shape === 'witch' || def.shape === 'siren' ? 0.25 : 0;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeChest(THREE) {
  const g = new THREE.Group();
  const base = box(THREE, 0.8, 0.5, 0.6, 0x8a5a2e); base.position.y = 0.25; g.add(base);
  const lid = new THREE.Group();
  const lidBox = box(THREE, 0.84, 0.24, 0.64, 0xa06a34); lidBox.position.y = 0.12; lid.add(lidBox);
  lid.position.set(0, 0.5, -0.3); g.add(lid);
  for (const x of [-0.28, 0.28]) {
    const band = box(THREE, 0.09, 0.56, 0.64, 0xd9b45a); band.position.set(x, 0.28, 0); g.add(band);
  }
  const lock = box(THREE, 0.16, 0.2, 0.08, 0xffd257); lock.position.set(0, 0.34, 0.32); g.add(lock);
  const glowS = glow(THREE, 0xffe08a, 0.18); glowS.position.set(0, 0.6, 0); glowS.visible = false; g.add(glowS);
  g.userData = { lid, glowS };
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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

  // 보스 제단
  const altar = cyl(THREE, 9, 9.4, 0.14, zone.id === 3 ? 0xd8bc86 : zone.id === 4 ? 0x3f7f8c : 0x6d7a5a, 32);
  altar.position.set(zone.boss.x, 0.07, zone.boss.z); altar.receiveShadow = true; group.add(altar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(8.6, 9.1, 40), new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(zone.boss.x, 0.16, zone.boss.z); group.add(ring);

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
    props.push({ x, z, r: p.r * scl * 0.92 });
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
    props.push({ x: hide.position.x, z: hide.position.z, r: hide.userData.r * 1.2 || 1 });
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
  props.push({ x: gateL.position.x, z: gateL.position.z, r: 0.7 }, { x: gateR.position.x, z: gateR.position.z, r: 0.7 });

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
    if (Math.hypot(x - npcPos.x, z - npcPos.z) < 4) continue;
    spawnPoints.push({ x, z });
  }

  return {
    group, props, chests, npc, portal, spawnPoints, particles: points,
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
      ring.rotation.z = t * 0.15;
      portal.rotation.y = t * 0.8;
    },
  };
}
