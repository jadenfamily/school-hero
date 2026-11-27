// 스쿨히어로 — 이펙트 풀·공격 연출 (game.js에서 분리)
// ATTACK_FX / FX_GEO_CACHE / fxGeo / fxAlloc / fxAllocImpact / fxFree /
// disposeObj / addFx / flatRing / weaponSwingFx / SPECIAL / specialHit /
// dustBurst / stunStars / hitBurst.
// 풀(고정 메시 재사용)이라 createGame마다 새로 만든다.
import { TAU, groundY } from './util.js';
import { ASSET_URL, getTexture } from '../assets.js';

export function installEffects(ctx) {
  const { game, THREE, scene, camera } = ctx;

// ---------- 무기별 3D 공격 연출 ----------
const ATTACK_FX = {
  sword: { anim: 0.24, kind: 'slash' },
  dagger: { anim: 0.15, kind: 'thrust' },
  axe: { anim: 0.34, kind: 'chop' },
  mace: { anim: 0.36, kind: 'slam' },
  bow: { anim: 0.2, kind: 'shot' },
  crossbow: { anim: 0.14, kind: 'rapid' },
  staff: { anim: 0.22, kind: 'cast' },
  book: { anim: 0.18, kind: 'cast' },
};

// ---------- 이펙트 풀 (전투 렉 방지) ----------
// 매 타격마다 새 지오메트리·재질을 만들면 할당+GC가 치명타 순간에 몰려 아이폰에서 끊긴다.
// 지오메트리는 공유 캐시, 메시는 고정 풀(96개)에서 빌려 쓰고 반납한다 — 핫 패스 무할당.
const FX_GEO_CACHE = new Map();
function fxGeo(type, ...params) {
  const key = type + ':' + params.map((v) => Math.round(v * 1000) / 1000).join(',');
  let g = FX_GEO_CACHE.get(key);
  if (!g) {
    if (type === 'sphere') g = new THREE.SphereGeometry(params[0], params[1] || 8, params[2] || 6);
    else if (type === 'box') g = new THREE.BoxGeometry(params[0], params[1], params[2]);
    else if (type === 'oct') g = new THREE.OctahedronGeometry(params[0], 0);
    else if (type === 'ring') g = new THREE.RingGeometry(params[0], params[1], params[2] || 30);
    else if (type === 'circle') g = new THREE.CircleGeometry(params[0], params[1] || 24);
    else if (type === 'torus') g = new THREE.TorusGeometry(params[0], params[1], params[2] || 6, params[3] || 24, params[4] || Math.PI * 2);
    else if (type === 'cyl') g = new THREE.CylinderGeometry(params[0], params[1], params[2], params[3] || 8, 1, !!params[4]);
    else if (type === 'cone') g = new THREE.ConeGeometry(params[0], params[1], params[2] || 8);
    else if (type === 'plane') g = new THREE.PlaneGeometry(params[0] || 1, params[1] || 1);
    if (g) FX_GEO_CACHE.set(key, g);
  }
  return g;
}
const FX_POOL_SIZE = 192; // 동시 이펙트 메시 상한 (5연속 치명타 ~75 + 타격·보관함 ~20 + 진행 중 전투·투사체 여유)
const fxPool = [];
// 버릴 수 있는 이펙트 태그 (풀이 가득 차면 가장 오래된 것부터 회수한다 — 치명타·투사체·텔레그래프는 절대 회수하지 않는다)
const FX_DROPPABLE = ['dust', 'cast:spark', 'sword:motion', 'dagger:motion', 'heal:spark', 'compskill:healspark', 'fire:flame'];
function stealFxMesh() {
  for (const fx of game.effects) {
    const m = fx.mesh;
    if (m && m.isMesh && m.userData.pooled && fx.tag && FX_DROPPABLE.some((d) => fx.tag.indexOf(d) === 0)) {
      fx.mesh = null; fx.life = 0; // 이 이펙트는 끝낸다 (필터가 치운다)
      if (m.parent) m.parent.remove(m);
      return m;
    }
  }
  return null;
}
function fxAlloc(geo, color, opacity = 0.9, opts = {}) {
  let m = fxPool.pop();
  if (!m) {
    m = stealFxMesh();
    if (!m) {
      // 극단적 버스트 (풀 96개가 전부 치명타·투사체로 찬 경우) — 한 개만 1회용으로 만든다 (지오메트리는 공유, 재질만 1회용)
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.userData.pooled = false;
      m.userData.tag = opts.tag || '';
      return m;
    }
  }
  m.geometry = geo;
  const mat = m.material;
  mat.color.setHex(color);
  mat.opacity = opacity;
  mat.blending = opts.blending !== undefined ? opts.blending : THREE.AdditiveBlending;
  mat.transparent = opts.transparent !== undefined ? opts.transparent : opacity < 1;
  mat.depthWrite = opts.depthWrite !== undefined ? opts.depthWrite : false;
  mat.depthTest = opts.depthTest !== undefined ? opts.depthTest : true;
  mat.side = opts.side !== undefined ? opts.side : THREE.DoubleSide;
  m.renderOrder = opts.renderOrder || 0;
  m.position.set(0, 0, 0);
  m.rotation.set(0, 0, 0);
  m.scale.set(1, 1, 1);
  m.visible = true;
  m.userData.pooled = true;
  m.userData.tag = opts.tag || '';
  return m;
}
// 치명타 충격파 평면 전용 풀 (텍스처가 있는 유일한 이펙트 메시 — 일반 풀의 재질에는 map을 쓰지 않는다)
const impactPool = [];
function fxAllocImpact() {
  let m = impactPool.pop();
  if (!m) {
    if (!impactTex) impactTex = getTexture(THREE, ASSET_URL.fx('impact'));
    m = new THREE.Mesh(fxGeo('plane', 1, 1), new THREE.MeshBasicMaterial({ map: impactTex, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.userData.pooled = 'impact';
  }
  m.position.set(0, 0, 0);
  m.rotation.set(0, 0, 0);
  m.scale.set(1, 1, 1);
  m.visible = true;
  return m;
}
function fxFree(obj) {
  if (!obj) return;
  if (obj.parent) obj.parent.remove(obj);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.pooled === true) {
      o.visible = false;
      o.renderOrder = 0;
      if (fxPool.length < FX_POOL_SIZE * 2) fxPool.push(o);
    } else if (o.userData.pooled === 'impact') {
      o.visible = false;
      o.renderOrder = 0;
      if (impactPool.length < 8) impactPool.push(o);
    } else {
      // 풀 밖에서 만든 1회용 메시 (극단적 버스트) — 재질만 해제, 지오메트리는 공유 캐시라 건드리지 않는다
      if (o.material && o.material.dispose) o.material.dispose();
    }
  });
}
// 풀을 미리 채운다 (게임 시작 시 한 번만 — 전투 중에는 할당하지 않는다)
for (let i = 0; i < FX_POOL_SIZE; i++) {
  const m = new THREE.Mesh(fxGeo('sphere', 1, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  m.visible = false;
  m.userData.pooled = true;
  fxPool.push(m);
}

// 효과·투사체용 임시 메시 정리.
// 풀 메시와 공유 지오메트리는 해제하지 않는다 — 반납만 한다 (모바일 발광 이펙트 끊김 방지).
function disposeObj(obj) { fxFree(obj); }

function addFx(mesh, life, tick, tag) {
  if (mesh) scene.add(mesh);
  game.effects.push({ mesh, life, max: life, kind: 'custom', tick, tag });
}

function flatRing(x, z, r0, r1, color, opacity = 0.8, y = 0.13) {
  const m = fxAlloc(fxGeo('ring', r0, r1, 30), color, opacity, { tag: 'ring' });
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, groundY(x, z) + y, z);
  return m;
}

// 무기 휘두르기: 바닥 부채꼴 잔상 없이 몸 동작 + 짧은 궤적만.
// — 무기마다 확실히 다르게 보이게 과장했다 (검 베기 호 · 단검 찌르기 궤적 · 도끼/둔기 충격파 ·
//   활/석궁 발사 섬광+궤적선 · 지팡이/책 시전 섬광). 데미지·쿨다운은 그대로, 연출만 바꾼다.
function weaponSwingFx(fam, p, a, W, hits) {
  const fx = Math.sin(a), fz = Math.cos(a);
  const gy = groundY(p.x, p.z);
  if (fam === 'dagger') {
    for (let i = 0; i < 3; i++) {
      const m = fxAlloc(fxGeo('box', 0.1, 0.08, W.range), 0xdff4ff, 0.75, { tag: 'dagger:motion' });
      m.position.set(p.x + fx * W.range * 0.45, gy + 1.05 + i * 0.1, p.z + fz * W.range * 0.45);
      m.rotation.y = a;
      addFx(m, 0.16, (f, k) => { m.material.opacity = k * 0.7; }, 'dagger:motion');
    }
    dustBurst(p.x + fx * 0.6, p.z + fz * 0.6, 0xdff4ff, 4);
  } else if (fam === 'axe' || fam === 'mace') {
    const col = fam === 'axe' ? 0xffcf8a : 0xffe0a0;
    const tip = fxAlloc(fxGeo('sphere', 0.17, 6, 5), col, 0.9, { tag: 'melee:tip' });
    const y0 = fam === 'axe' ? 2.3 : 2.0;
    tip.position.set(p.x + fx * 0.9, gy + y0, p.z + fz * 0.9);
    addFx(tip, 0.24, (f, k) => { tip.position.y = gy + 0.25 + (1 - k) * y0 * 0.75; tip.material.opacity = k * 0.9; }, 'melee:tip');
    // 내려찍는 지점에 충격파 링 + 먼지
    const ring = flatRing(p.x + fx * 1.1, p.z + fz * 1.1, 0.25, 0.8, col, 0.85, 0.12);
    addFx(ring, 0.35, (f, k) => { ring.scale.setScalar(1 + (1 - k) * 2.0); ring.material.opacity = k * 0.8; }, 'melee:shock');
    dustBurst(p.x + fx * 1.1, p.z + fz * 1.1, fam === 'axe' ? 0xffd6a0 : 0xfff0c0, 8);
  } else if (fam === 'crossbow') {
    // 석궁: 하얀 오브·궤적선 없이 볼트만 보이게 — 총구에서 아주 작은 불꽃만 0.1초 (손의 석궁을 가리지 않게)
    const spark = fxAlloc(fxGeo('sphere', 0.09, 6, 5), 0xffe0a0, 0.9, { tag: 'ranged:muzzle' });
    spark.position.set(p.x + fx * 0.7, gy + 1.1, p.z + fz * 0.7);
    addFx(spark, 0.1, (f, k) => { spark.scale.setScalar(1 + (1 - k) * 0.6); spark.material.opacity = k; }, 'ranged:muzzle');
  } else if (fam === 'bow') {
    const flash = fxAlloc(fxGeo('sphere', 0.22, 6, 5), 0xffe0a0, 0.9, { tag: 'ranged:muzzle' });
    flash.position.set(p.x + fx * 0.6, gy + 1.1, p.z + fz * 0.6);
    addFx(flash, 0.16, (f, k) => { flash.scale.setScalar(1 + (1 - k) * 1.8); flash.material.opacity = k; }, 'ranged:muzzle');
    // 발사 궤적선 (활은 길게)
    const streak = fxAlloc(fxGeo('box', 0.06, 0.06, 2.0), 0xfff0c0, 0.8, { tag: 'ranged:streak' });
    streak.position.set(p.x + fx * 1.6, gy + 1.1, p.z + fz * 1.6);
    streak.rotation.y = a;
    addFx(streak, 0.14, (f, k) => { streak.material.opacity = k * 0.75; }, 'ranged:streak');
  } else if (fam === 'staff' || fam === 'book') {
    const col = fam === 'staff' ? 0xb58cff : 0x9ff0ff;
    const orb = fxAlloc(fxGeo('sphere', 0.3, 7, 6), col, 0.95, { tag: 'cast:orb' });
    orb.position.set(p.x + fx * 0.7, gy + 1.25, p.z + fz * 0.7);
    addFx(orb, 0.3, (f, k) => { orb.scale.setScalar(0.6 + (1 - k) * 1.8); orb.material.opacity = k; }, 'cast:orb');
    // 지팡이 끝 섬광 + 위로 솟는 마법 불꽃
    const flash = fxAlloc(fxGeo('sphere', 0.34, 8, 6), col, 0.85, { tag: 'cast:flash' });
    flash.position.set(p.x + fx * 0.7, gy + 1.5, p.z + fz * 0.7);
    addFx(flash, 0.2, (f, k) => { flash.scale.setScalar(1 + (1 - k) * 2.0); flash.material.opacity = k * 0.8; }, 'cast:flash');
    for (let i = 0; i < 4; i++) {
      const sp = fxAlloc(fxGeo('sphere', 0.09, 6, 5), col, 0.9, { tag: 'cast:spark' });
      sp.position.set(p.x + fx * 0.7, gy + 1.3, p.z + fz * 0.7);
      addFx(sp, 0.35, (f, k) => {
        const t = 1 - k;
        sp.position.set(p.x + fx * 0.7 + Math.cos(i * 1.7) * t * 0.5, gy + 1.3 + t * 0.9, p.z + fz * 0.7 + Math.sin(i * 1.7) * t * 0.5);
        sp.material.opacity = k * 0.85;
      }, 'cast:spark');
    }
  } else {
    // 검: 앞에 큰 베기 호 (토러스 조각) + 궤적 점들 + 먼지
    const arcG = new THREE.Group();
    const arc = fxAlloc(fxGeo('torus', W.range * 0.8, 0.07, 6, 24, 2.2), 0xdff2ff, 0.85, { tag: 'sword:arc' });
    arc.rotation.x = -Math.PI / 2;
    arcG.add(arc);
    arcG.position.set(p.x, gy + 1.0, p.z);
    arcG.rotation.y = a - (Math.PI / 2 + 1.1);
    addFx(arcG, 0.18, (f, k) => { arcG.scale.setScalar(0.85 + (1 - k) * 0.3); arc.material.opacity = k * 0.8; }, 'sword:arc');
    for (let i = 0; i < 3; i++) {
      const st = fxAlloc(fxGeo('sphere', 0.12, 6, 5), 0xdff2ff, 0.8, { tag: 'sword:motion' });
      const sa = a + (i - 1) * 0.9;
      st.position.set(p.x + Math.sin(sa) * W.range * 0.8, gy + 1.0, p.z + Math.cos(sa) * W.range * 0.8);
      addFx(st, 0.16, (f, k) => { st.material.opacity = k * 0.7; }, 'sword:motion');
    }
    dustBurst(p.x + fx * 0.7, p.z + fz * 0.7, 0xeaf6ff, 3);
  }
}

// ---------- 특수 판정 타격 이펙트 (파박!) ----------
// 치명타 · 이중타격 · 스턴에만 PNG 임팩트가 크게 터진다.
let impactTex = null;
// 치명타 · 이중타격 · 스턴 — 폰에서도 한눈에 보이게 크게 (임팩트 + 파편 + 충격파 + 섬광)
const SPECIAL = {
  crit: { label: '치명타!', size: 3.6, shake: 0.34, color: 0xffd257 },
  double: { label: '이중타격!', size: 2.9, shake: 0.24, color: 0x9fe0ff },
  stun: { label: '스턴!', size: 3.0, shake: 0.26, color: 0xffe066 },
};
function specialHit(e, kind) {
  const c = SPECIAL[kind] || SPECIAL.crit;
  const m = fxAllocImpact();
  const y = groundY(e.x, e.z) + (e.headY || 1.2) * 0.72;
  m.position.set(e.x, y, e.z);
  m.renderOrder = 30;
  scene.add(m);
  const base = c.size * (e.isBoss || e.isField ? 1.35 : e.isMid ? 1.15 : 1);
  addFx(m, 0.45, (fx, k) => {
    m.rotation.set(0, Math.atan2(camera.position.x - e.x, camera.position.z - e.z), 0);
    m.scale.setScalar(base * (0.55 + (1 - k) * 0.75));
    m.material.opacity = Math.min(1, k * 1.8);
    m.position.y = y + (1 - k) * 0.15;
  }, 'special:impact');
  // 바닥 충격파 링 + 섬광 (치명타가 터졌다는 게 멀리서도 보이게)
  const burst = flatRing(e.x, e.z, 0.2, 0.6, c.color, 0.9, 0.14);
  addFx(burst, 0.4, (fx, k) => { burst.scale.setScalar(1 + (1 - k) * 3.2); burst.material.opacity = k * 0.85; }, 'special:ring');
  const flash = fxAlloc(fxGeo('sphere', 0.32, 8, 6), c.color, 0.9, { tag: 'special:flash' });
  flash.position.set(e.x, y, e.z);
  addFx(flash, 0.25, (fx, k) => { flash.scale.setScalar(1 + (1 - k) * 2.6); flash.material.opacity = k * 0.85; }, 'special:flash');
  for (let i = 0; i < 12; i++) {
    const sp = fxAlloc(fxGeo('oct', 0.13), c.color, 0.95, { tag: 'special:shard' });
    sp.position.set(e.x, y, e.z);
    const ang = (i / 12) * TAU + Math.random();
    const spd = 3.2 + Math.random() * 3.2;
    addFx(sp, 0.35 + Math.random() * 0.12, (fx, k) => {
      const t = 1 - k;
      sp.position.set(e.x + Math.cos(ang) * spd * t, y + Math.sin(ang * 2) * 0.5 * t, e.z + Math.sin(ang) * spd * t);
      sp.material.opacity = k;
      sp.rotation.x += 0.3; sp.rotation.y += 0.2;
    }, 'special:shard');
  }
  game.camShake = Math.max(game.camShake, c.shake);
  if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 1.2) + 0.85, e.z, c.label, 'crit special');
}
game.specialHit = specialHit;

function dustBurst(x, z, color, n = 6) {
  n = Math.min(n, 6); // 한 번에 6개까지 — 치명타+폭발이 겹쳐도 먼지가 풀을 넘치지 않게
  const gy = groundY(x, z);
  for (let i = 0; i < n; i++) {
    const m = fxAlloc(fxGeo('sphere', 0.1, 5, 4), color, 0.85, { tag: 'dust' });
    m.position.set(x, gy + 0.2, z);
    const a = Math.random() * TAU, sp = 1.2 + Math.random() * 1.6;
    addFx(m, 0.32 + Math.random() * 0.1, (fx, k) => {
      const t = 1 - k;
      m.position.x = x + Math.cos(a) * sp * t;
      m.position.z = z + Math.sin(a) * sp * t;
      m.position.y = gy + 0.2 + t * 0.8;
      m.material.opacity = k * 0.8;
    }, 'dust');
  }
}

// 기절 별: 머리 위에서 기절 시간 내내 크게 돈다
// (주인공이 둔기로 적을 기절시킬 때 + 바바리안 둔기가 주인공을 기절시킬 때)
function stunStars(x, y, z, dur = 1.2) {
  for (let i = 0; i < 5; i++) {
    const m = fxAlloc(fxGeo('oct', 0.16), 0xffe066, 0.95, { tag: 'mace:stars' });
    m.position.set(x, y, z);
    addFx(m, dur, (fx) => {
      const t = (fx.max - fx.life) * 5 + (i / 5) * TAU;
      m.position.set(x + Math.cos(t) * 0.5, y + Math.sin(t * 2) * 0.14, z + Math.sin(t) * 0.5);
      m.rotation.y += 0.25;
      m.material.opacity = Math.min(1, fx.life * 2);
    }, 'mace:stars');
  }
}

function hitBurst(x, z, color) {
  // 투사체 명중 섬광 — 지팡이/활/석궁이 닿았다는 게 보이게 크게 + 충격파 링
  const m = fxAlloc(fxGeo('sphere', 0.28, 7, 5), color, 0.95, { tag: 'hit:burst' });
  m.position.set(x, groundY(x, z) + 0.9, z);
  addFx(m, 0.24, (fx, k) => { m.scale.setScalar(1 + (1 - k) * 2.6); m.material.opacity = k; }, 'hit:burst');
  const ring = flatRing(x, z, 0.15, 0.5, color, 0.85, 0.14);
  addFx(ring, 0.3, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 2.4); ring.material.opacity = k * 0.8; }, 'hit:ring');
}
  // 다른 모듈에서 부른다 (zones clearFieldEntities, combat, player, enemies, projectiles, companions)
  ctx.ATTACK_FX = ATTACK_FX;
  ctx.SPECIAL = SPECIAL;
  ctx.fxGeo = fxGeo;
  ctx.fxAlloc = fxAlloc;
  ctx.fxAllocImpact = fxAllocImpact;
  ctx.fxFree = fxFree;
  ctx.disposeObj = disposeObj;
  ctx.addFx = addFx;
  ctx.flatRing = flatRing;
  ctx.weaponSwingFx = weaponSwingFx;
  ctx.specialHit = specialHit;
  ctx.dustBurst = dustBurst;
  ctx.stunStars = stunStars;
  ctx.hitBurst = hitBurst;
}
