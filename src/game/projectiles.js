// 스쿨히어로 — 투사체·픽업·보관함·포탈·이펙트/리스폰 업데이트 (game.js에서 분리)
// buildProjectileMesh / spawnProjectile / explodeAt / fireZone / healFx /
// skillHealFx / updateProjectiles / addPoisonPool / updatePickups / collect /
// gradeCss / updateChests / updatePortals / enterPortal / openChest /
// giveChestReward / updateEffects / updateRespawn.
// respawnT(일반 몹 젠 타이머)는 이 모듈의 로컬 상태다.
import { clamp, TAU, groundY } from './util.js';
import {
  PLAYABLE, GRADES, EARTH_GATE, GYEONGGI_GATE, SECRET_TOTAL,
  SKILLS, SOUL_KINDS,
} from '../data.js';

export function installProjectiles(ctx) {
  const { game, THREE, scene, camera } = ctx;

// ---------- 원거리 ----------
function buildProjectileMesh(style, color) {
  const g = new THREE.Group();
  // 풀 메시로 만든다 (투사체는 매 발사마다 생겼다 사라진다 — 핫 패스 무할당)
  const basic = (c, op = 1) => (geo) => ctx.fxAlloc(geo, c, op, { blending: THREE.NormalBlending, depthWrite: false, transparent: op < 1, side: THREE.FrontSide, tag: 'proj' });
  const add = (c, op = 1) => (geo) => ctx.fxAlloc(geo, c, op, { side: THREE.FrontSide, tag: 'proj' });
  if (style === 'arrow' || style === 'pierce') {
    // 화살: 길고 밝은 화살 + 비행 궤적이 보이는 꼬리 (폰에서도 보여야 한다)
    const shaft = basic(0xe8cf9e)(ctx.fxGeo('cyl', 0.035, 0.035, 1.1, 6));
    shaft.rotation.x = Math.PI / 2; g.add(shaft);
    const tip = basic(0xe9f2ff)(ctx.fxGeo('cone', 0.1, 0.3, 4));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.66; g.add(tip);
    for (const s of [-.07, .07]) {
      const f = basic(0xffffff)(ctx.fxGeo('box', 0.03, 0.16, 0.26));
      f.position.set(0, s, -0.44); f.rotation.x = 0.3; g.add(f);
    }
    const glowM = add(style === 'pierce' ? (color || 0xbfe6ff) : 0xfff0c0, 0.5)(ctx.fxGeo('sphere', 0.13, 6, 5));
    glowM.position.z = 0.1; g.add(glowM);
    const trail = add(style === 'pierce' ? (color || 0xbfe6ff) : 0xffe9a8, 0.5)(ctx.fxGeo('box', 0.09, 0.09, 1.9));
    trail.position.z = -0.75; g.add(trail);
  } else if (style === 'bolt') {
    // 석궁 볼트: 짧고 두껍고 빠르게 보이는 탄환 + 꼬리
    const shaft = basic(0xd7e2f0)(ctx.fxGeo('box', 0.07, 0.07, 0.56));
    shaft.position.z = 0.0; g.add(shaft);
    const tip = basic(0xffffff)(ctx.fxGeo('cone', 0.09, 0.22, 4));
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.36; g.add(tip);
    const fletch = basic(0x8fb8e0)(ctx.fxGeo('box', 0.17, 0.17, 0.09));
    fletch.position.z = -0.3; g.add(fletch);
    const trail = add(0xcfe4ff, 0.5)(ctx.fxGeo('box', 0.08, 0.08, 1.1));
    trail.position.z = -0.5; g.add(trail);
  } else if (style === 'fireball') {
    const core = add(0xff8a3c, 0.95)(ctx.fxGeo('sphere', 0.26, 10, 8));
    g.add(core);
    const inner = add(0xffe08a, 1)(ctx.fxGeo('sphere', 0.14, 8, 6));
    g.add(inner);
    for (let i = 0; i < 3; i++) {
      const fl = add(0xff5a2a, 0.6)(ctx.fxGeo('sphere', 0.1, 6, 5));
      fl.position.z = -0.3 - i * 0.16; fl.position.x = (Math.random() - 0.5) * 0.1;
      g.add(fl);
    }
  } else if (style === 'ice') {
    const shard = add(0x9fe8ff, 0.95)(ctx.fxGeo('oct', 0.2));
    shard.scale.set(0.8, 1.3, 0.8); g.add(shard);
    const halo = add(0xdff6ff, 0.8)(ctx.fxGeo('torus', 0.22, 0.02, 4, 10));
    g.add(halo);
  } else {
    // 마법 오브 (지팡이/책): 크고 밝은 구체 + 후광 + 빛나는 꼬리
    const orb = add(color || 0x9fd8ff, 0.95)(ctx.fxGeo('sphere', 0.3, 9, 7));
    g.add(orb);
    const core = add(0xffffff, 0.9)(ctx.fxGeo('sphere', 0.16, 8, 6));
    g.add(core);
    const halo = add(color || 0x9fd8ff, 0.8)(ctx.fxGeo('torus', 0.38, 0.035, 4, 12));
    g.add(halo);
    const glowM = add(color || 0x9fd8ff, 0.28)(ctx.fxGeo('sphere', 0.48, 8, 6));
    g.add(glowM);
    for (let i = 0; i < 3; i++) {
      const sp = add(color || 0x9fd8ff, 0.55)(ctx.fxGeo('sphere', 0.09, 6, 5));
      sp.position.z = -0.35 - i * 0.22;
      sp.position.x = (Math.random() - 0.5) * 0.16;
      sp.position.y = (Math.random() - 0.5) * 0.16;
      g.add(sp);
    }
  }
  return g;
}

function spawnProjectile(o) {
  const style = o.style || 'orb';
  const m = buildProjectileMesh(style, o.color);
  // o.y는 지면 위 높이 (1.0~1.1). 지형 높이를 더한다.
  const h = o.y || 0.9;
  m.position.set(o.x, groundY(o.x, o.z) + h, o.z);
  const dx = o.targetX - o.x, dz = o.targetZ - o.z;
  const dd = Math.max(0.001, Math.hypot(dx, dz));
  m.rotation.y = Math.atan2(dx, dz);
  scene.add(m);
  game.projectiles.push({
    mesh: m, x: o.x, z: o.z, y: h, vx: (dx / dd) * o.speed, vz: (dz / dd) * o.speed,
    life: 0, max: o.range / o.speed, from: o.from, dmg: o.dmg, color: o.color,
    style, skill: o.skill || null, pierce: o.pierce || 0, hits: new Set(), radius: o.radius || 0.4,
    targetTank: !!o.targetTank, targetComp: o.targetComp || null, source: o.source || null,
  });
}

function explodeAt(x, z, radius, dmg, attacker) {
  const disk = ctx.fxAlloc(ctx.fxGeo('circle', 1, 26), 0xff6a2a, 0.72, { tag: 'fire:disk' });
  disk.rotation.x = -Math.PI / 2;
  disk.position.set(x, groundY(x, z) + 0.11, z);
  ctx.addFx(disk, 0.4, (fx, k) => {
    disk.scale.setScalar(radius * (0.35 + (1 - k) * 0.85));
    disk.material.opacity = 0.7 * k;
  }, 'fire:disk');
  const ring = ctx.flatRing(x, z, 0.3, 1.0, 0xffa040, 0.95, 0.12);
  ctx.addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * radius * 1.6); ring.material.opacity = k * 0.9; }, 'fire:explode');
  const core = ctx.fxAlloc(ctx.fxGeo('sphere', 0.4, 10, 8), 0xffcc66, 0.9, { tag: 'fire:core' });
  core.position.set(x, groundY(x, z) + 0.9, z);
  ctx.addFx(core, 0.32, (fx, k) => { core.scale.setScalar(1 + (1 - k) * 3.2); core.material.opacity = k * 0.85; }, 'fire:core');
  ctx.dustBurst(x, z, 0xff8a3c, 8);
  game.camShake = Math.max(game.camShake, 0.34);
  for (const e of [...game.enemies]) {
    if (!e.alive) continue;
    if (Math.hypot(e.x - x, e.z - z) <= radius + e.radius) game.dealDamage(e, dmg, { heavy: true, attacker });
  }
}

function fireZone(x, z, radius, dmg, duration, attacker) {
  const ring = ctx.flatRing(x, z, radius * 0.2, radius, 0xff6a2a, 0.5, 0.09);
  ctx.addFx(ring, duration, (fx, k, dt2) => {
    ring.material.opacity = 0.25 + Math.sin(game.time * 8) * 0.12;
    ring.scale.setScalar(1 + Math.sin(game.time * 5) * 0.04);
    fx.tickT = (fx.tickT || 0) - (dt2 || 0);
    if (fx.tickT <= 0) {
      fx.tickT = 0.5;
      for (const e of [...game.enemies]) if (e.alive && Math.hypot(e.x - x, e.z - z) <= radius + e.radius) game.dealDamage(e, dmg, attacker ? { attacker } : undefined);
    }
  }, 'fire:zone');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const fl = ctx.fxAlloc(ctx.fxGeo('cone', 0.28, 0.9, 5), 0xffb055, 0.7, { tag: 'fire:flame' });
    const fgy = groundY(x + Math.cos(a) * radius * 0.7, z + Math.sin(a) * radius * 0.7);
    fl.position.set(x + Math.cos(a) * radius * 0.7, fgy + 0.45, z + Math.sin(a) * radius * 0.7);
    ctx.addFx(fl, duration, (fx) => {
      fl.position.y = fgy + 0.45 + Math.sin(game.time * 9 + i) * 0.14;
      fl.material.opacity = 0.45 + Math.sin(game.time * 7 + i) * 0.22;
    }, 'fire:flame');
  }
}

function healFx(x, z, color = 0x7dffb0) {
  const ring = ctx.flatRing(x, z, 0.2, 0.7, color, 0.9, 0.1);
  ctx.addFx(ring, 0.7, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 1.8); ring.material.opacity = k * 0.9; }, 'heal:ring');
  for (let i = 0; i < 4; i++) {
    const m = ctx.fxAlloc(ctx.fxGeo('sphere', 0.08, 5, 4), color, 0.9, { tag: 'heal:spark' });
    const hgy = groundY(x, z);
    m.position.set(x + (Math.random() - 0.5) * 0.5, hgy + 0.4, z + (Math.random() - 0.5) * 0.5);
    ctx.addFx(m, 0.8, (fx, k) => { m.position.y = hgy + 0.4 + (1 - k) * 1.4; m.material.opacity = k; }, 'heal:spark');
  }
}

// 동료 대표 스킬 '치유의 빛' 전용 연출: 대상 위에 빛기둥 + 큰 링 + 솟는 빛방울.
// 기본 치유(healFx)보다 훨씬 크게 해서 힐러 스킬이 썼다는 게 한눈에 보이게 한다.
function skillHealFx(x, z) {
  const gy = groundY(x, z);
  const beam = ctx.fxAlloc(ctx.fxGeo('cyl', 0.55, 0.75, 2.4, 10, 1), 0x7dffb0, 0.35, { tag: 'compskill:healbeam' });
  beam.position.set(x, gy + 1.2, z);
  ctx.addFx(beam, 0.7, (fx, k) => { beam.material.opacity = 0.35 * k; beam.scale.x = beam.scale.z = 1 + (1 - k) * 0.5; }, 'compskill:healbeam');
  const ring = ctx.flatRing(x, z, 0.3, 1.4, 0x7dffb0, 0.95, 0.12);
  ctx.addFx(ring, 0.7, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 1.6); ring.material.opacity = k * 0.9; }, 'compskill:healring');
  for (let i = 0; i < 8; i++) {
    const m = ctx.fxAlloc(ctx.fxGeo('sphere', 0.1, 5, 4), 0xbfffd9, 0.95, { tag: 'compskill:healspark' });
    m.position.set(x + (Math.random() - 0.5) * 0.8, gy + 0.3, z + (Math.random() - 0.5) * 0.8);
    ctx.addFx(m, 0.9, (fx, k) => { m.position.y = gy + 0.3 + (1 - k) * 2.2; m.material.opacity = k; }, 'compskill:healspark');
  }
}


// ---------- 투사체 ----------
function updateProjectiles(dt) {
  const p = game.player;
  for (const pr of game.projectiles) {
    pr.life += dt;
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    pr.mesh.position.set(pr.x, groundY(pr.x, pr.z) + pr.y + Math.sin(pr.life * 10) * 0.05, pr.z);
    if (pr.from === 'player' || pr.from === 'ally') {
      for (const e of game.enemies) {
        if (!e.alive || pr.hits.has(e)) continue;
        if (Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + (pr.radius || 0.35)) {
          pr.hits.add(e);
          if (pr.skill === 'fireball') {
            explodeAt(pr.x, pr.z, SKILLS.fireball.radius, pr.dmg, pr.source);
            pr.dead = true;
            break;
          }
          if (pr.skill === 'icebolt') {
            game.dealDamage(e, pr.dmg, { attacker: pr.source });
            e.slowT = SKILLS.icebolt.slowT;
            ctx.hitBurst(pr.x, pr.z, 0x9fe8ff);
            pr.dead = true;
            break;
          }
          game.dealDamage(e, pr.dmg, { attacker: pr.source });
          ctx.hitBurst(pr.x, pr.z, pr.color || 0xffffff);
          if (!pr.pierce || pr.hits.size >= pr.pierce) { pr.dead = true; break; }
        }
      }
    } else {
      if (pr.targetTank) {
        const tank = game.tank;
        if (tank && tank.hp > 0 && Math.hypot(tank.x - pr.x, tank.z - pr.z) < 0.9) {
          ctx.damageCompanion(tank, pr.dmg);
          pr.dead = true;
        }
      } else if (pr.targetComp && pr.targetComp.hp > 0 && Math.hypot(pr.targetComp.x - pr.x, pr.targetComp.z - pr.z) < 0.9) {
        ctx.damageCompanion(pr.targetComp, pr.dmg);
        pr.dead = true;
      } else if (p.alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 0.75) {
        game.damagePlayer(pr.dmg, null);
        pr.dead = true;
        if (pr.style === 'poison') addPoisonPool(pr.x, pr.z, pr.dmg);
      }
    }
    if (pr.life > pr.max || Math.abs(pr.x) > 46 || Math.abs(pr.z) > 46) pr.dead = true;
    if (pr.dead) ctx.disposeObj(pr.mesh);
  }
  game.projectiles = game.projectiles.filter((x) => !x.dead);
}

function addPoisonPool(x, z, dmg) {
  const pool = ctx.fxAlloc(ctx.fxGeo('circle', 2.2, 20), 0x7ad64a, 0.42, { depthTest: false, renderOrder: 10, tag: 'pool' });
  pool.rotation.x = -Math.PI / 2; pool.position.set(x, groundY(x, z) + 0.26, z); pool.renderOrder = 10; scene.add(pool);
  game.effects.push({ mesh: pool, kind: 'pool', x, z, r: 2.2, life: 4.5, max: 4.5, tick: 0, dmg: dmg * 0.6 });
}

// ---------- 픽업 ----------
function updatePickups(dt) {
  const p = game.player;
  if (!p) return;
  const d = game.derived();
  for (const it of game.pickups) {
    if (!it.alive) continue;
    it.t += dt;
    const dd = Math.hypot(p.x - it.x, p.z - it.z);
    const magnet = d.autoloot ? 14 : d.magnet;
    if (dd < magnet) {
      if (dd > 0.001) {
        const sp = 9 + (magnet - dd) * 1.4;
        it.x += ((p.x - it.x) / dd) * sp * dt;
        it.z += ((p.z - it.z) / dd) * sp * dt;
      }
    } else {
      it.x += it.vx * dt * 0.4;
      it.z += it.vz * dt * 0.4;
      it.vx *= 0.92; it.vz *= 0.92;
    }
    if (!it.mesh) {
      let color = 0xffd257;
      if (it.type === 'soul') color = it.data === 'purple' ? 0xb46cff : it.data === 'blue' ? 0x5aa9ff : it.data === 'green' ? 0x5fe08d : 0xc9d2e0;
      if (it.type === 'item') color = parseInt(GRADES[it.data.grade].color.slice(1), 16);
      if (it.type === 'book') color = 0xc9a1ff;
      const geo = it.type === 'gold' ? ctx.fxGeo('cyl', 0.14, 0.14, 0.05, 8)
        : it.type === 'book' ? ctx.fxGeo('box', 0.3, 0.24, 0.07)
          : ctx.fxGeo('sphere', 0.15, 7, 5);
      it.mesh = ctx.fxAlloc(geo, color, 1, { blending: THREE.NormalBlending, depthWrite: true, transparent: false, side: THREE.FrontSide, tag: 'pickup' });
      if (it.type === 'book') {
        const halo = ctx.fxAlloc(ctx.fxGeo('torus', 0.3, 0.02, 4, 12), 0xe8d8ff, 0.8, { tag: 'pickup:halo' });
        halo.rotation.x = -Math.PI / 2;
        it.mesh.add(halo);
      }
      scene.add(it.mesh);
    }
    it.mesh.position.set(it.x, groundY(it.x, it.z) + 0.5 + Math.sin(it.t * 4) * 0.1, it.z);
    it.mesh.rotation.y += dt * 3;
    const nd = Math.hypot(p.x - it.x, p.z - it.z);
    if (nd < 0.75) { collect(it); it.alive = false; ctx.fxFree(it.mesh); }
  }
  game.pickups = game.pickups.filter((x) => x.alive);
}

function collect(it) {
  const s = game.state;
  if (it.type === 'gold') {
    s.gold += it.data;
  } else if (it.type === 'soul') {
    s.souls[it.data] = (s.souls[it.data] || 0) + 1;
    if (it.data === 'purple' && game.ui) game.ui.toast('보스 영혼을 얻었어요!', 'gold');
  } else if (it.type === 'item') {
    game.addItem(it.data.kind, it.data.fam, it.data.grade);
    if (game.ui) game.ui.toast(`${ctx.itemName(it.data.kind, it.data.fam, it.data.grade)} 획득`, gradeCss(it.data.grade));
  } else if (it.type === 'book') {
    const id = it.data;
    game.state.skillbooks[id] = (game.state.skillbooks[id] || 0) + 1;
    const def = SKILLS[id];
    if (game.ui) game.ui.toast(`스킬북 획득: ${def ? def.name : id} · 가방에서 쓸 수 있어요`, 'gold');
  }
  game.save();
  if (game.ui) game.ui.markDirty();
}

function gradeCss(g) { return g >= 4 ? 'gold' : g >= 2 ? 'good' : ''; }

// ---------- 보관함 ----------
// 가까이 가면 [열기] 버튼이 뜨고, 눌러야 열린다.
// 반경 3.5m: 상자는 소품 뒤에 숨겨져 있어서, 소품 충돌 때문에 가장 가까이
// 다가가도 2.6m 밖에 머무는 경우가 있다 (기둥 뒤 상자는 최악 2.6m).
function updateChests(dt) {
  const p = game.player;
  if (!p) return;
  let near = null, best = 3.5;
  for (const c of game.world.chests) {
    if (c.opened) continue;
    const dd = Math.hypot(p.x - c.x, p.z - c.z);
    if (dd < 3.5 && dd < best) { best = dd; near = c; }
  }
  if (near !== game.nearChest) {
    game.nearChest = near;
    if (game.ui) game.ui.updateChestPrompt(near);
  }
  // 여는 연출
  for (const c of game.world.chests) {
    if (c.opening == null || c.opening >= 1) continue;
    c.opening = Math.min(1, c.opening + dt * 3.4);
    const k = c.opening;
    const ud = c.mesh.userData;
    if (ud.art) {
      ud.art.rotation.z = -0.14 * Math.sin(k * Math.PI);
      ud.art.scale.setScalar(1 + 0.14 * Math.sin(k * Math.PI));
    }
    if (ud.lid) ud.lid.rotation.x = -1.9 * k; // 3D 상자 뚜껑이 뒤로 젖혀진다
    if (ud.mesh) ud.mesh.material.opacity = 1 - 0.25 * k;
    c.mesh.position.y = Math.sin(k * Math.PI) * 0.12;
  }
}

// 포탈 근접 감지 (상자 "📦 열기" 버튼과 같은 방식) — 열린 게이트에 다가가면 [들어가기] 버튼이 뜬다.
// 지구 귀환 게이트(9구역) → 마계 인천항(10구역), 마계 관문(12구역) → 수원 화성(13구역).
// 닫힌 게이트에는 버튼이 뜨지 않는다 (안내 문구도 없이 그냥 회색 고리만 보인다).
function updatePortals(dt) {
  const p = game.player;
  if (!p || !game.world) return;
  let near = null;
  if (game.state.earthGateOpen && game.world.earthGate) {
    const dd = Math.hypot(p.x - EARTH_GATE.x, p.z - EARTH_GATE.z);
    if (dd < 3.5) near = { gate: 'earth', x: EARTH_GATE.x, z: EARTH_GATE.z, target: 10 };
  }
  if (!near && game.state.gyeonggiGateOpen && game.world.gyeonggiGate) {
    const dd = Math.hypot(p.x - GYEONGGI_GATE.x, p.z - GYEONGGI_GATE.z);
    if (dd < 3.5) near = { gate: 'gyeonggi', x: GYEONGGI_GATE.x, z: GYEONGGI_GATE.z, target: 13 };
  }
  if (near !== game.nearPortal) {
    game.nearPortal = near;
    if (game.ui) game.ui.updatePortalPrompt(near);
  }
}

// 포탈 진입: 스토리 한 장면 → 다음 지역 1구역 스폰으로 순간이동 (+ 해금)
game.enterPortal = function () {
  const near = game.nearPortal;
  if (!near) return false;
  const target = PLAYABLE.find((z) => z.id === near.target);
  if (!target) return false;
  if (near.gate === 'earth') {
    game.unlockDistrict(10, true);
    if (game.ui) game.ui.showPortalStory('earth', () => game.returnToStart(10));
  } else {
    game.unlockDistrict(13, true);
    if (game.ui) game.ui.showPortalStory('gyeonggi', () => game.returnToStart(13));
  }
  return true;
};

game.openChest = function (c) {
  if (!c || c.opened) return false;
  c.opened = true;
  c.opening = 0;
  if (!game.state.chestOpened.includes(c.id)) {
    game.state.chestOpened.push(c.id);
    game.state.chestsFound = Math.min(SECRET_TOTAL, (game.state.chestsFound || 0) + 1);
    const reward = giveChestReward();
    // 보상 연출
    const gold = ctx.fxAlloc(ctx.fxGeo('sphere', 0.16, 8, 6), 0xffd257, 0.95, { tag: 'chest:gold' });
    const cgy = groundY(c.x, c.z);
    gold.position.set(c.x, cgy + 0.7, c.z);
    ctx.addFx(gold, 0.75, (fx, k) => {
      gold.position.y = cgy + 0.7 + (1 - k) * 1.5;
      gold.position.x = c.x + Math.sin((1 - k) * 6) * 0.4;
      gold.material.opacity = k;
    }, 'chest:gold');
    const ring = ctx.flatRing(c.x, c.z, 0.4, 1.0, 0xffe08a, 0.95, 0.12);
    ctx.addFx(ring, 0.6, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 2.6); ring.material.opacity = k * 0.9; }, 'chest:ring');
    ctx.dustBurst(c.x, c.z, 0xffd257, 10);
    for (let i = 0; i < 8; i++) {
      const coin = ctx.fxAlloc(ctx.fxGeo('cyl', 0.09, 0.09, 0.03, 8), 0xffcf4d, 0.95, { tag: 'chest:coin' });
      const a = (i / 8) * TAU;
      coin.position.set(c.x, cgy + 0.7, c.z);
      ctx.addFx(coin, 0.9, (fx, k) => {
        const t = 1 - k;
        coin.position.set(c.x + Math.cos(a) * t * 1.6, cgy + 0.7 + t * 1.4 - t * t * 2.2, c.z + Math.sin(a) * t * 1.6);
        coin.rotation.x += 0.2;
        coin.material.opacity = Math.min(1, k * 1.4);
      }, 'chest:coin');
    }
    if (game.ui) {
      game.ui.updateChestPrompt(null);
      game.ui.showChestBubble(game.state.chestsFound, SECRET_TOTAL);
      game.ui.toast(reward.msg, reward.grade >= 3 ? 'gold' : 'good');
      game.ui.markDirty(true);
    }
  }
  game.save();
  game.flushSave();
  return true;
};

function giveChestReward() {
  const s = game.state;
  const r = Math.random();
  if (r < 0.4) {
    const g = 80 + Math.round(Math.random() * 120) * game.zone.id;
    s.gold += g;
    return { msg: `보관함: 골드 +${g}`, grade: 1 };
  }
  if (r < 0.72) {
    const kind = ctx.pickKind();
    const fam = ctx.pickFam(kind);
    const g = Math.min(4, 1 + Math.floor(Math.random() * 3) + (game.zone.id > 2 ? 1 : 0));
    game.addItem(kind, fam, g);
    return { msg: `보관함: ${ctx.itemName(kind, fam, g)} 획득!`, grade: g };
  }
  if (r < 0.9) {
    const kinds = ['gray', 'green', 'blue', 'purple'];
    const k = kinds[Math.min(3, Math.floor(Math.random() * (2 + game.zone.id)))];
    const n = 1 + Math.floor(Math.random() * 2);
    s.souls[k] = (s.souls[k] || 0) + n;
    return { msg: `보관함: ${SOUL_KINDS[k].name} +${n}`, grade: 2 };
  }
  s.statPts += 1;
  return { msg: '보관함: 영구 스탯 포인트 +1!', grade: 2 };
}

// ---------- 이펙트 ----------
function updateEffects(dt) {
  for (const fx of game.effects) {
    fx.life -= dt;
    const k = Math.max(0, fx.life / fx.max);
    if (fx.kind === 'custom') {
      if (fx.tick) fx.tick(fx, k, dt);
      if (fx.life <= 0 && fx.mesh) ctx.disposeObj(fx.mesh);
    } else if (fx.kind === 'fadeScale' && fx.mesh) {
      fx.mesh.material.opacity = k * 0.9;
      fx.mesh.scale.setScalar((fx.from || 0.92) + (1 - k) * 0.16);
      if (fx.life <= 0) ctx.fxFree(fx.mesh);
    } else if (fx.kind === 'burst') {
      if (!fx.mesh) {
        const m = ctx.fxAlloc(ctx.fxGeo('sphere', 0.2, 8, 6), fx.color, 0.9, { tag: 'burst' });
        m.position.set(fx.x, groundY(fx.x, fx.z) + 0.8, fx.z); scene.add(m); fx.mesh = m;
      }
      fx.mesh.scale.setScalar(1 + (1 - k) * 4);
      fx.mesh.material.opacity = k;
      if (fx.life <= 0) ctx.fxFree(fx.mesh);
    } else if (fx.kind === 'shockwave') {
      if (!fx.mesh) {
        const m = ctx.fxAlloc(ctx.fxGeo('ring', 0.4, 0.9, 32), 0xff7070, 0.9, { tag: 'shockwave' });
        m.rotation.x = -Math.PI / 2; m.position.set(fx.x, groundY(fx.x, fx.z) + 0.12, fx.z); scene.add(m); fx.mesh = m;
      }
      fx.mesh.scale.setScalar(1 + (1 - k) * (fx.r || 4) * 1.2);
      fx.mesh.material.opacity = k * 0.85;
      if (fx.life <= 0) ctx.fxFree(fx.mesh);
    } else if (fx.kind === 'whirlwind') {
      // 회오리는 플레이어를 향해 천천히 이동하며 닿으면 피해를 준다
      const p = game.player;
      if (p && p.alive) {
        const dx = p.x - fx.x, dz = p.z - fx.z;
        const dd = Math.hypot(dx, dz) || 1;
        fx.x += (dx / dd) * 2.2 * dt;
        fx.z += (dz / dd) * 2.2 * dt;
      }
      fx.mesh.position.set(fx.x, groundY(fx.x, fx.z) + 1.4, fx.z);
      fx.mesh.rotation.y += dt * 6;
      fx.tick -= dt;
      if (fx.tick <= 0) {
        fx.tick = 0.7;
        const p2 = game.player;
        if (p2 && p2.alive && Math.hypot(p2.x - fx.x, p2.z - fx.z) < fx.r) game.damagePlayer(fx.dmg, null);
      }
      fx.mesh.material.opacity = 0.3 + Math.sin(game.time * 6) * 0.12;
      if (fx.life <= 0) ctx.fxFree(fx.mesh);
    } else if (fx.kind === 'cannon') {
      // 대포는 주기적으로 플레이어 주변에 작은 빨간원 폭격을 쏜다
      const boss = fx.boss;
      fx.fireT -= dt;
      if (fx.fireT <= 0 && fx.shots < 3 && boss && boss.alive) {
        fx.fireT = 1.0;
        fx.shots++;
        const p = game.player;
        if (p && p.alive) {
          ctx.addTelegraph(p.x + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3, 1.7, 1.2, boss.atk * 1.2, boss);
        }
        ctx.dustBurst(fx.x, fx.z, 0xffa040, 4);
      }
      if (fx.life <= 0) ctx.fxFree(fx.mesh);
    } else if (fx.kind === 'pool') {
      fx.tick -= dt;
      if (fx.tick <= 0) {
        fx.tick = 0.5;
        const p = game.player;
        if (p.alive && Math.hypot(p.x - fx.x, p.z - fx.z) < fx.r) game.damagePlayer(fx.dmg, null);
      }
      fx.mesh.material.opacity = 0.2 + Math.sin(game.time * 4) * 0.1;
      if (fx.life <= 0) ctx.fxFree(fx.mesh);
    }
  }
  game.effects = game.effects.filter((f) => f.life > 0);
}

let respawnT = 12;
function updateRespawn(dt) {
  // 퀘스트 교체 몹 (10초) — 일반 12초 젠 사이클과 별개로 돈다
  for (let i = ctx.questRespawns.length - 1; i >= 0; i--) {
    const r = ctx.questRespawns[i];
    r.t -= dt;
    if (r.t > 0) continue;
    ctx.questRespawns.splice(i, 1);
    // 퀘스트가 아직 처치 단계를 진행 중이고, 같은 종류가 여전히 없을 때만 되돌린다
    const qz = game.zone;
    const qq = (game.state.quests || {})[qz.id];
    const qstep = qq && qq.accepted && !qq.done ? (qz.quests.steps || [])[qq.step] : null;
    if (!qstep || qstep.type !== 'kill' || qq.progress >= qstep.n) continue;
    if (game.enemies.some((m) => m.alive && !m.isBoss && !m.isMid && !m.isField && m.def === r.def)) continue;
    const qpts = (game.world.spawnPointsByDistrict && game.world.spawnPointsByDistrict[qz.id]) || game.world.spawnPoints;
    for (let tries = 0; tries < 12; tries++) {
      const qp = qpts[Math.floor(Math.random() * qpts.length)];
      if (Math.hypot(qp.x - game.player.x, qp.z - game.player.z) > 15) { ctx.spawnEnemy(r.def, qp.x, qp.z); break; }
    }
  }
  respawnT -= dt;
  if (respawnT > 0) return;
  respawnT = 12; // 몹 젠 완화: 4.5초 → 12초마다 체크 (생존 상한 13마리 유지)
  const alive = game.enemies.filter((e) => e.alive && !e.isBoss && !e.isMid).length;
  if (alive >= 13) return;
  const zone = game.zone;
  const pool = [...zone.mobs.normal, ...zone.mobs.normal, zone.mobs.elite[0]];
  const def = pool[Math.floor(Math.random() * pool.length)];
  const pts = (game.world.spawnPointsByDistrict && game.world.spawnPointsByDistrict[zone.id]) || game.world.spawnPoints;
  for (let tries = 0; tries < 12; tries++) {
    const p = pts[Math.floor(Math.random() * pts.length)];
    if (Math.hypot(p.x - game.player.x, p.z - game.player.z) > 15) { ctx.spawnEnemy(def, p.x, p.z); break; }
  }
}

  // 다른 모듈에서 부른다 (player playerAttack, enemies boss patterns, companions skills, systems step/frame)
  ctx.buildProjectileMesh = buildProjectileMesh;
  ctx.spawnProjectile = spawnProjectile;
  ctx.explodeAt = explodeAt;
  ctx.fireZone = fireZone;
  ctx.healFx = healFx;
  ctx.skillHealFx = skillHealFx;
  ctx.updateProjectiles = updateProjectiles;
  ctx.addPoisonPool = addPoisonPool;
  ctx.updatePickups = updatePickups;
  ctx.collect = collect;
  ctx.gradeCss = gradeCss;
  ctx.updateChests = updateChests;
  ctx.updatePortals = updatePortals;
  ctx.giveChestReward = giveChestReward;
  ctx.updateEffects = updateEffects;
  ctx.updateRespawn = updateRespawn;
}
