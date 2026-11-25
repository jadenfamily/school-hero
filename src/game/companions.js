// 스쿨히어로 — 동료·파티·동료 스킬 (game.js에서 분리)
// companionMaxHp / companionAtk / effectiveCompanionLv / makeCompanionObj /
// healTarget / pushOutOfProps / snapCompanions / castCompanionSkill /
// COMPANION_AGGRO / COMPANION_LEASH / updateCompanions / isHeroRecognized /
// nearestEnemyFrom / grantSkillBonus / companionSkillLevel / companionSkillDef /
// companionSkillState / compSkillCd / skillState / learnSkill / castSkill /
// canCastSkill / pullCompanion / toggleParty / refreshCompanions / dismissCompanion.
// 파티 최대 4명 (2026-11-26): toggleParty 상한 4, 대열은 (i-(n-1)/2)*1.6 대칭.
import { clamp, dist2, TAU, groundY } from './util.js';
import { makeCompanion } from '../world.js';
import {
  GRADES, COMPANION_CLASSES, COMPANION_NAMES, COMPANION_SKILLS,
  COMPANION_SKILL_POOLS, COMPANION_SKILL_MAX_LEVEL, SKILL_BOOK_SKILL,
  SKILLS, COMPANION_DMG_FACTOR, COMPANION_LV_PER, COMPANION_LV_HIGH_PER,
  COMPANION_LV_FLAT_AFTER, COMPANION_PULL_COST,
} from '../data.js';

export function installCompanions(ctx) {
  const { game, THREE, scene } = ctx;

// ---------- 동료 레벨·피해 ----------
// 동료 레벨 = 주인공 레벨. 동료를 바꾸면 새로 들어온 동료도 즉시 주인공 레벨로 싸운다.
// 동료 기록에 남는 lv/xp는 쓰지 않는다 (기록용으로만 유지).
function companionMaxHp(cls, grade, lv) {
  return Math.round(cls.hp * (1 + (grade || 0) * 0.15) * (1 + ((lv || 1) - 1) * 0.08));
}
// 동료 피해: 레벨 성장에 체감을 둔다 (50레벨까지 0.18/레벨, 이후 0.05/레벨) + 전체 계수 0.42.
// 기본 공격·스킬 모두 이 함수를 거치므로 피해만 줄고, 체력·치유·도발은 그대로다.
// (선형 0.18로는 Lv.197에서 레벨 배율이 36배가 되어 동료가 주인공을 앞질렀다)
function companionAtk(cls, grade, lv) {
  const L = Math.max(1, Math.floor(lv || 1));
  const fac = 1 + COMPANION_LV_PER * Math.min(L - 1, COMPANION_LV_FLAT_AFTER - 1)
    + COMPANION_LV_HIGH_PER * Math.max(0, L - COMPANION_LV_FLAT_AFTER);
  return cls.atk * fac * (1 + (grade || 0) * 0.20) * COMPANION_DMG_FACTOR;
}
game.companionMaxHp = companionMaxHp;
game.companionAtk = companionAtk;
// 동료 레벨 = 주인공 레벨. 동료는 따로 경험치를 얻지 않는다 (슬롯 레벨 폐지, 2026-11-25).
// 동료를 바꾸면 새 동료도 즉시 주인공 레벨로 싸운다.
game.effectiveCompanionLv = function () {
  return Math.max(1, Math.floor(Number(game.state && game.state.level) || 1));
};

// ---------- 동료 ----------
function makeCompanionObj(c, cls, mesh, x, z) {
  // 동료 레벨 = 주인공 레벨 (슬롯 레벨 폐지). 교체해도 즉시 주인공 레벨로 싸운다.
  const lv = game.effectiveCompanionLv();
  const maxHp = companionMaxHp(cls, c.grade, lv);
  return {
    data: c, cls, mesh, x, z, atkCd: Math.random(), healCd: 2, skillCd: 4, skillCheckT: 0,
    lv,
    maxHp, hp: maxHp, tauntCd: 0.2, downT: 0, hitT: 0,
  };
}

function healTarget(target, pct, flat) {
  const maxHp = target === 'player' ? null : target.maxHp;
  if (target === 'player' || target === game.player) {
    const d = game.derived();
    const before = game.player.hp;
    game.player.hp = Math.min(d.maxHp, game.player.hp + d.maxHp * pct + flat);
    ctx.healFx(game.player.x, game.player.z);
    return Math.round(game.player.hp - before);
  }
  const before = target.hp;
  target.hp = Math.min(maxHp, target.hp + maxHp * pct + flat);
  ctx.healFx(target.x, target.z);
  return Math.round(target.hp - before);
}
game.healTarget = healTarget;

// 소품 충돌 밀어내기 (플레이어·적과 같은 방식). 이미 소품 안에 있으면 가장 가까운 밖으로 밀어낸다.
function pushOutOfProps(x, z, pad = 0.35) {
  if (!game.world) return { x, z };
  for (const pr of game.world.propsNear(x, z, 5)) {
    let dx = x - pr.x, dz = z - pr.z;
    let dd = Math.hypot(dx, dz);
    const min = pr.r + pad;
    if (dd < min) {
      if (dd < 0.0001) { dx = 1; dz = 0; dd = 1; }
      x = pr.x + (dx / dd) * min;
      z = pr.z + (dz / dd) * min;
    }
  }
  return { x, z };
}

// 동료 순간이동 (귀환·부활·스폰 이동 시 플레이어와 함께 자리로 붙인다)
function snapCompanions() {
  if (!game.player || !game.compObjects) return;
  game.compObjects.forEach((c, i) => {
    const fixed = pushOutOfProps(game.player.x + (i - (game.compObjects.length - 1) / 2) * 1.6, game.player.z + 1.8, 0.35);
    c.x = fixed.x; c.z = fixed.z;
    c.engageT = null; // 순간이동하면 쫓던 적은 잊고 대열부터 잡는다
    if (c.mesh) {
      c.mesh.position.set(c.x, groundY(c.x, c.z), c.z);
      c.mesh.rotation.y = Math.PI;
    }
  });
}

// ---------- 동료 고유 스킬 (동료 개편) ----------
// 주인공은 스킬을 쓰지 않는다. 동료마다 직업 풀에서 받은 고유 스킬 하나를 전투 중에 자동 사용한다.
// 조건이 안 맞으면(사거리 안에 적이 없거나, 아군이 안 다쳤거나) 쿨다운을 태우지 않고 0.5초 뒤 다시 확인한다.
// 성공하면 true, 조건이 안 맞아서 안 썼으면 false를 돌려준다.
function castCompanionSkill(c, skillLv) {
  const def = COMPANION_SKILLS[c.data.skillId] || COMPANION_SKILLS[(COMPANION_SKILL_POOLS[c.cls.id] || [])[0]];
  if (!def) return false;
  const p = game.player;
  const atk = companionAtk(c.cls, c.data.grade, c.lv);
  const dmgOf = (mult) => atk * mult;
  // 주변 AoE: 주인공이 인식한 몹만 맞힌다. 맞힌 수를 돌려준다.
  const aoeHit = (radius, dmg, onHit) => {
    let hit = 0;
    for (const e of [...game.enemies]) {
      if (!e.alive || !isHeroRecognized(e) || Math.hypot(e.x - c.x, e.z - c.z) > radius + e.radius) continue;
      game.dealDamage(e, dmg, { heavy: true, elem: def.elem, canCrit: false, attacker: c });
      if (onHit) onHit(e);
      hit++;
    }
    return hit;
  };
  // 힐러 스킬 3종이 함께 쓰는 아군 목록
  const allyList = () => [{ obj: 'player', hp: p.hp, max: game.derived().maxHp, x: p.x, z: p.z },
    ...game.companions.filter((x) => x.hp > 0).map((x) => ({ obj: x, hp: x.hp, max: x.maxHp, x: x.x, z: x.z }))];
  const skillText = (name, cls) => { if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.0, c.z, name, `skill ${cls}`); };
  if (def.id === 'shieldSlam') {
    // 방패 강타: 주변 적에게 피해 + 맞은 적을 3초간 탱커에게 붙잡아 둔다 (보스급 제외)
    // 주인공이 인식한 몹이 근처에 있을 때만 발동한다
    if (!nearestEnemyFrom(c.x, c.z, def.radius + 1.4, false, true)) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    let hit = 0;
    for (const e of [...game.enemies]) {
      if (!e.alive || !isHeroRecognized(e) || Math.hypot(e.x - c.x, e.z - c.z) > def.radius + e.radius) continue;
      game.dealDamage(e, dmg, { heavy: true, elem: def.elem, canCrit: false, attacker: c });
      if (!e.def.boss) { e.targetType = 'tank'; e.state = 'chase'; e.tauntT = def.tauntT; }
      hit++;
    }
    if (!hit) return false;
    const ring = ctx.flatRing(c.x, c.z, 0.4, def.radius, 0x9fc4ff, 0.85, 0.12);
    ctx.addFx(ring, 0.4, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'compskill:slam');
    // 두 번째 충격파 + 섬광 + 먼지 — 방패 강타가 멀리서도 한눈에 보이게
    const ring2 = ctx.flatRing(c.x, c.z, 0.6, def.radius * 1.5, 0x9fc4ff, 0.7, 0.14);
    ctx.addFx(ring2, 0.55, (fx, k) => { ring2.scale.setScalar(0.6 + (1 - k) * 1.4); ring2.material.opacity = k * 0.75; }, 'compskill:slam2');
    const flash = ctx.fxAlloc(ctx.fxGeo('sphere', 0.35, 8, 6), 0xbfe0ff, 0.9, { tag: 'compskill:flash' });
    flash.position.set(c.x, groundY(c.x, c.z) + 0.9, c.z);
    ctx.addFx(flash, 0.28, (fx, k) => { flash.scale.setScalar(1 + (1 - k) * 2.4); flash.material.opacity = k * 0.85; }, 'compskill:slamflash');
    ctx.dustBurst(c.x, c.z, 0x9fc4ff, 8);
    game.camShake = Math.max(game.camShake, 0.22);
    if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.0, c.z, '방패 강타!', 'skill skill-tank');
    return true;
  }
  if (def.id === 'tauntRoar') {
    // 도발의 포효: 6m 안의 적을 전부 4초간 탱커에게 붙잡아 둔다 (보스급 제외) + 작은 피해
    if (!nearestEnemyFrom(c.x, c.z, def.radius + 1.4, false, true)) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    const hit = aoeHit(def.radius, dmg, (e) => { if (!e.def.boss) { e.targetType = 'tank'; e.state = 'chase'; e.tauntT = def.tauntT; } });
    if (!hit) return false;
    const ring = ctx.flatRing(c.x, c.z, 0.4, def.radius, 0x9fc4ff, 0.85, 0.12);
    ctx.addFx(ring, 0.5, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'compskill:roar');
    const flash = ctx.fxAlloc(ctx.fxGeo('sphere', 0.35, 8, 6), 0xbfe0ff, 0.9, { tag: 'compskill:flash' });
    flash.position.set(c.x, groundY(c.x, c.z) + 0.9, c.z);
    ctx.addFx(flash, 0.28, (fx, k) => { flash.scale.setScalar(1 + (1 - k) * 2.4); flash.material.opacity = k * 0.85; }, 'compskill:roarflash');
    game.camShake = Math.max(game.camShake, 0.18);
    skillText('도발의 포효!', 'skill-tank');
    return true;
  }
  if (def.id === 'stunSlam') {
    // 내려찍기: 주변 적에게 피해 + 1.5초 기절 (보스급은 피해만)
    if (!nearestEnemyFrom(c.x, c.z, def.radius + 1.4, false, true)) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    const hit = aoeHit(def.radius, dmg, (e) => {
      if (!e.def.boss) { e.stunT = def.stunT; ctx.stunStars(e.x, groundY(e.x, e.z) + (e.headY || 1) + 0.4, e.z, def.stunT); }
    });
    if (!hit) return false;
    const ring = ctx.flatRing(c.x, c.z, 0.4, def.radius, 0xffe066, 0.85, 0.12);
    ctx.addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'compskill:stunslam');
    ctx.dustBurst(c.x, c.z, 0xffe066, 8);
    game.camShake = Math.max(game.camShake, 0.22);
    skillText('내려찍기!', 'skill-tank');
    return true;
  }
  if (def.id === 'whirlwind') {
    // 회전 베기: 주변 모든 적에게 피해 (주인공이 인식한 몹만)
    if (!nearestEnemyFrom(c.x, c.z, def.radius + 1.4, false, true)) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    let hit = 0;
    for (const e of [...game.enemies]) {
      if (!e.alive || !isHeroRecognized(e) || Math.hypot(e.x - c.x, e.z - c.z) > def.radius + e.radius) continue;
      game.dealDamage(e, dmg, { heavy: true, elem: def.elem, canCrit: false, attacker: c });
      hit++;
    }
    if (!hit) return false;
    const ring = ctx.flatRing(c.x, c.z, 0.4, def.radius, 0xbfe6ff, 0.85, 0.12);
    ctx.addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'compskill:whirl');
    const ring2 = ctx.flatRing(c.x, c.z, 0.5, def.radius * 1.4, 0xbfe6ff, 0.7, 0.13);
    ctx.addFx(ring2, 0.5, (fx, k) => { ring2.scale.setScalar(0.6 + (1 - k) * 1.3); ring2.material.opacity = k * 0.8; }, 'compskill:whirl2');
    for (let i = 0; i < 5; i++) {
      const blade = ctx.fxAlloc(ctx.fxGeo('box', 0.14, 0.1, def.radius * 1.05), 0xeaf6ff, 0.8, { tag: 'compskill:blade' });
      blade.position.y = 0.7; blade.rotation.y = (i / 5) * TAU;
      const g = new THREE.Group(); g.add(blade); g.position.set(c.x, groundY(c.x, c.z), c.z);
      const off = (i / 5) * TAU;
      ctx.addFx(g, 0.55, (fx) => { g.rotation.y = off + (fx.max - fx.life) * 18; blade.material.opacity = Math.min(0.85, fx.life * 2.2); }, 'compskill:blade');
    }
    if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.0, c.z, '회전 베기!', 'skill skill-melee');
    return true;
  }
  if (def.id === 'swordwave') {
    // 검기 날리기: 일직선의 적을 베는 참격파 (꿰뚫는 투사체)
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    ctx.spawnProjectile({
      from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 16,
      color: 0xbfe6ff, dmg, range: def.range, style: 'pierce', skill: null, pierce: 99, radius: 0.5, source: c,
    });
    skillText('검기 날리기!', 'skill-melee');
    return true;
  }
  if (def.id === 'multishot') {
    // 멀티샷: 가까운 적 3명에게 화살을 한 발씩 동시에 쏜다
    const targets = [...game.enemies].filter((e) => e.alive && isHeroRecognized(e) && Math.hypot(e.x - c.x, e.z - c.z) <= def.range + e.radius)
      .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, def.shots);
    if (!targets.length) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    for (const t of targets) {
      ctx.spawnProjectile({
        from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 16,
        color: 0xd6ffd6, dmg, range: def.range, style: 'arrow', radius: 0.4, source: c,
      });
    }
    skillText('멀티샷!', 'skill-melee');
    return true;
  }
  if (def.id === 'pierce') {
    // 관통 사격: 고속 화살이 일직선의 적을 꿰뚫고 지나간다 (최대 5명)
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    ctx.spawnProjectile({
      from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 20,
      color: 0xffffff, dmg, range: def.range, style: 'pierce', skill: null, pierce: 5, radius: 0.4, source: c,
    });
    skillText('관통 사격!', 'skill-melee');
    return true;
  }
  if (def.id === 'stunStrike') {
    // 스턴 강타: 가장 가까운 적에게 큰 피해 + 1.5초 기절 (보스급은 피해만)
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    game.dealDamage(t, dmg, { heavy: true, elem: def.elem, canCrit: false, attacker: c });
    if (!t.def.boss) { t.stunT = def.stunT; ctx.stunStars(t.x, groundY(t.x, t.z) + (t.headY || 1) + 0.4, t.z, def.stunT); }
    ctx.hitBurst(t.x, t.z, 0xffe066);
    game.camShake = Math.max(game.camShake, 0.2);
    skillText('스턴 강타!', 'skill-melee');
    return true;
  }
  if (def.id === 'fireball') {
    // 파이어볼: 가장 가까운 적에게 불덩이 발사 (맞으면 폭발) — 주인공이 인식한 몹만 노린다
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    const flash = ctx.fxAlloc(ctx.fxGeo('sphere', 0.3, 8, 6), 0xff8a3c, 0.9, { tag: 'compskill:firecast' });
    flash.position.set(c.x, groundY(c.x, c.z) + 1.1, c.z);
    ctx.addFx(flash, 0.25, (fx, k) => { flash.scale.setScalar(1 + (1 - k) * 2.2); flash.material.opacity = k * 0.85; }, 'compskill:firecast');
    if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.0, c.z, '파이어볼!', 'skill skill-mage');
    ctx.spawnProjectile({
      from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 14,
      color: 0xff8a3c, dmg, range: def.range, style: 'fireball', skill: 'fireball', radius: 0.5, source: c,
    });
    return true;
  }
  if (def.id === 'icebolt') {
    // 아이스볼트: 얼음 화살 한 발 (둔화 없음 — 얼음 연출 + 피해만)
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    const flash = ctx.fxAlloc(ctx.fxGeo('sphere', 0.3, 8, 6), 0x9fe8ff, 0.9, { tag: 'compskill:icecast' });
    flash.position.set(c.x, groundY(c.x, c.z) + 1.1, c.z);
    ctx.addFx(flash, 0.25, (fx, k) => { flash.scale.setScalar(1 + (1 - k) * 2.2); flash.material.opacity = k * 0.85; }, 'compskill:icecast');
    skillText('아이스볼트!', 'skill-mage');
    ctx.spawnProjectile({
      from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 16,
      color: 0x9fe8ff, dmg, range: def.range, style: 'ice', skill: 'compIcebolt', radius: 0.4, source: c,
    });
    return true;
  }
  if (def.id === 'firewall') {
    // 파이어월: 적 위치에 4초간 타오르는 불길 장판
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const tick = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    ctx.fireZone(t.x, t.z, def.radius, tick, def.duration, c);
    skillText('파이어월!', 'skill-mage');
    return true;
  }
  if (def.id === 'blizzard') {
    // 블리자드: 적 위치에 큰 눈보라 — 넓은 범위의 적에게 냉기 피해
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const targets = [...game.enemies].filter((e) => e.alive && isHeroRecognized(e) && Math.hypot(e.x - t.x, e.z - t.z) <= def.radius + e.radius);
    if (!targets.length) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    const disk = ctx.fxAlloc(ctx.fxGeo('circle', 1, 26), 0x9fe8ff, 0.72, { tag: 'compskill:blizzard' });
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(t.x, groundY(t.x, t.z) + 0.11, t.z);
    ctx.addFx(disk, 0.45, (fx, k) => { disk.scale.setScalar(def.radius * (0.35 + (1 - k) * 0.85)); disk.material.opacity = 0.7 * k; }, 'compskill:blizzard');
    const ring = ctx.flatRing(t.x, t.z, 0.3, 1.0, 0xbfe6ff, 0.95, 0.12);
    ctx.addFx(ring, 0.5, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * def.radius * 1.6); ring.material.opacity = k * 0.9; }, 'compskill:blizzardring');
    for (let i = 0; i < 8; i++) {
      const m = ctx.fxAlloc(ctx.fxGeo('oct', 0.16), 0xd6f4ff, 0.95, { tag: 'compskill:blizzardshard' });
      const sx = t.x + (Math.random() - 0.5) * def.radius * 1.4;
      const sz = t.z + (Math.random() - 0.5) * def.radius * 1.4;
      const sgy = groundY(sx, sz);
      m.position.set(sx, sgy + 2.2, sz);
      ctx.addFx(m, 0.5, (fx, k) => { m.position.y = sgy + 0.1 + 2.1 * k; m.material.opacity = k; m.rotation.y += 0.3; }, 'compskill:blizzardshard');
    }
    for (const e of targets) game.dealDamage(e, dmg, { heavy: true, elem: def.elem, canCrit: false, attacker: c });
    game.camShake = Math.max(game.camShake, 0.2);
    skillText('블리자드!', 'skill-mage');
    return true;
  }
  if (def.id === 'thunderbolt') {
    // 썬더볼트: 벼락 한 방 — 가장 가까운 적에게 큰 피해
    const t = nearestEnemyFrom(c.x, c.z, def.range, false, true);
    if (!t) return false;
    const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
    const tgy = groundY(t.x, t.z);
    const beam = ctx.fxAlloc(ctx.fxGeo('cyl', 0.22, 0.3, 3.2, 8, 1), 0xfff2a8, 0.85, { tag: 'compskill:thunder' });
    beam.position.set(t.x, tgy + 1.6, t.z);
    ctx.addFx(beam, 0.35, (fx, k) => { beam.material.opacity = 0.85 * k; beam.scale.x = beam.scale.z = 1 + (1 - k) * 1.6; }, 'compskill:thunder');
    const flash = ctx.fxAlloc(ctx.fxGeo('sphere', 0.4, 8, 6), 0xfff2a8, 0.95, { tag: 'compskill:thunderflash' });
    flash.position.set(t.x, tgy + 0.9, t.z);
    ctx.addFx(flash, 0.3, (fx, k) => { flash.scale.setScalar(1 + (1 - k) * 3); flash.material.opacity = k; }, 'compskill:thunderflash');
    game.dealDamage(t, dmg, { heavy: true, elem: def.elem, canCrit: false, attacker: c });
    game.camShake = Math.max(game.camShake, 0.18);
    skillText('썬더볼트!', 'skill-mage');
    return true;
  }
  if (def.id === 'heal') {
    // 치유의 빛: 전투 중에만 쓴다 (12m 안에 주인공이 인식한 적이 있을 때). 아군이 다쳤을 때만 발동.
    if (!nearestEnemyFrom(c.x, c.z, 12, false, true)) return false;
    const d = game.derived();
    const allies = [{ obj: 'player', hp: p.hp, max: d.maxHp, x: p.x, z: p.z },
      ...game.companions.filter((x) => x.hp > 0).map((x) => ({ obj: x, hp: x.hp, max: x.maxHp, x: x.x, z: x.z }))];
    allies.sort((a, b) => a.hp / a.max - b.hp / b.max);
    const low = allies[0];
    // 기본 치유(0.85에서 발동)와 같은 기준이어야 실전에서 스킬이 나간다.
    // 예전 0.7 기준은 기본 치유·재생이 체력을 그 위로 유지해서 필드전에선 거의 안 터졌다.
    if (!low || low.hp / low.max >= 0.85) return false;
    // Lv.4부터 두 명, Lv.7부터 파티 전체를 회복한다
    const targets = skillLv >= 7 ? allies.filter((a) => a.hp / a.max < 0.95)
      : skillLv >= 4 ? allies.filter((a) => a.hp / a.max < 0.95).slice(0, 2) : [low];
    const pct = def.healPct + def.healPctPerLv * (skillLv - 1);
    const flat = def.healFlat + def.healFlatPerLv * (skillLv - 1);
    let healed = 0;
    for (const a of targets) {
      const h = healTarget(a.obj, pct, flat);
      healed += h;
      if (h > 0) ctx.skillHealFx(a.x, a.z);
      if (h > 0 && game.ui) game.ui.damageNumber(a.x, groundY(a.x, a.z) + 1.8, a.z, `+${h}`, 'heal');
    }
    if (!healed) return false;
    // Lv.3부터는 주인공이 회복될 때 독도 함께 풀어준다
    if (skillLv >= 3 && targets.some((a) => a.obj === 'player')) {
      p.poisonT = 0; p.poisonStacks = 0;
      game.state.cleanseT = 4;
    }
    if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.1, c.z, '치유의 빛!', 'skill skill-heal');
    return true;
  }
  if (def.id === 'groupHeal') {
    // 단체 힐: 전투 중에만 쓴다 (12m 안에 주인공이 인식한 적이 있을 때). 다친 아군이 있을 때 파티 전체 회복.
    if (!nearestEnemyFrom(c.x, c.z, 12, false, true)) return false;
    const hurt = allyList().filter((a) => a.hp / a.max < 0.95);
    if (!hurt.length) return false;
    const pct = def.healPct + def.healPctPerLv * (skillLv - 1);
    const flat = def.healFlat + def.healFlatPerLv * (skillLv - 1);
    let healed = 0;
    for (const a of hurt) {
      const h = healTarget(a.obj, pct, flat);
      healed += h;
      if (h > 0) ctx.skillHealFx(a.x, a.z);
      if (h > 0 && game.ui) game.ui.damageNumber(a.x, groundY(a.x, a.z) + 1.8, a.z, `+${h}`, 'heal');
    }
    if (!healed) return false;
    if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.1, c.z, '단체 힐!', 'skill skill-heal');
    return true;
  }
  if (def.id === 'cleanse') {
    // 독 해제: 전투 중에만 쓴다. 주인공이 독에 걸렸거나 아군이 다쳤을 때 쓴다.
    if (!nearestEnemyFrom(c.x, c.z, 12, false, true)) return false;
    const poisoned = (p.poisonT || 0) > 0;
    const hurt = allyList().filter((a) => a.hp / a.max < 0.95);
    if (!poisoned && !hurt.length) return false;
    const pct = def.healPct + def.healPctPerLv * (skillLv - 1);
    const flat = def.healFlat + def.healFlatPerLv * (skillLv - 1);
    let healed = 0;
    for (const a of hurt) {
      const h = healTarget(a.obj, pct, flat);
      healed += h;
      if (h > 0) ctx.skillHealFx(a.x, a.z);
      if (h > 0 && game.ui) game.ui.damageNumber(a.x, groundY(a.x, a.z) + 1.8, a.z, `+${h}`, 'heal');
    }
    if (poisoned) {
      p.poisonT = 0; p.poisonStacks = 0;
      game.state.cleanseT = 4;
    }
    if (!healed && !poisoned) return false;
    if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.1, c.z, '독 해제!', 'skill skill-heal');
    return true;
  }
  return false;
}

// 동료 전투 AI — 탱커/근접이 달라붙는 범위 (주인공 기준)
const COMPANION_AGGRO = 12; // 적 발견 범위
const COMPANION_LEASH = 14; // 최대 추격 거리 (이보다 멀어지면 대열로 복귀)
function updateCompanions(dt) {
  const p = game.player;
  if (!p) return;
  const d = game.derived();
  game.companions.forEach((c, i) => {
    if (c.hitT > 0) c.hitT -= dt;
    if (c.hp <= 0) {
      c.downT -= dt;
      c.mesh.rotation.z = 1.2;
      c.mesh.position.y = groundY(c.x, c.z) - 0.3;
      if (c.downT <= 0) { c.hp = Math.round(c.maxHp * 0.5); c.mesh.rotation.z = 0; }
      return;
    }
    c.mesh.rotation.z = 0;
    if (c.hitT <= 0) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.02 * dt);
    const off = [[-1.8, 2.2], [1.8, 2.2], [0, 3.2]][i] || [0, 3];
    // 직업별 전투 행동 — 탱커/근접은 달라붙고, 마법/힐러는 대열 자리를 지킨다
    let tx = p.x + off[0], tz = p.z + off[1];
    let stopDist = 1.2;
    if (c.cls.id === 'tank' || c.cls.id === 'melee') {
      // 이미 쫓던 적은 14m 리시까지 유지 (단, 주인공이 인식한 몹일 때만),
      // 없으면 주인공 12m 안에서 주인공이 인식한 몹만 새로 찾는다 (석상은 제외)
      let t = (c.engageT && c.engageT.alive) ? c.engageT : null;
      if (t && !isHeroRecognized(t)) t = null;
      if (t && Math.hypot(t.x - p.x, t.z - p.z) > COMPANION_LEASH) t = null;
      if (!t) t = nearestEnemyFrom(p.x, p.z, COMPANION_AGGRO, true, true);
      c.engageT = t || null;
      if (t) {
        tx = t.x; tz = t.z;
        stopDist = c.cls.range + 0.6; // 공격 사거리 안에서 멈춘다
      }
    }
    const dx = tx - c.x, dz = tz - c.z;
    const dd = Math.hypot(dx, dz);
    const moving = dd > stopDist;
    if (moving) {
      const sp = 4.4;
      c.x += (dx / dd) * sp * dt;
      c.z += (dz / dd) * sp * dt;
      c.mesh.rotation.y = Math.atan2(dx, dz);
    }
    // 소품 충돌 (플레이어와 같은 방식 — 바위·나무를 뚫지 않고 돌아간다)
    const fixed = pushOutOfProps(c.x, c.z, 0.35);
    c.x = fixed.x; c.z = fixed.z;
    c.mesh.position.set(c.x, groundY(c.x, c.z) + Math.abs(Math.sin(game.time * 7 + i)) * 0.05, c.z);
    // 3D 동료 걷기 모션
    if (c.mesh.userData.legL) {
      const swing = moving ? Math.sin(game.time * 9 + i) * 0.5 : 0;
      c.mesh.userData.legL.rotation.x = swing;
      c.mesh.userData.legR.rotation.x = -swing;
    }
    // 탱커 도발: 12초마다 10m 안의 적을 4초간 탱커에게 붙잡아 둔다 (보스급 제외)
    if (c.cls.id === 'tank') {
      c.tauntCd -= dt;
      if (c.tauntCd <= 0) {
        c.tauntCd = 12;
        let taunted = 0;
        for (const e of game.enemies) {
          if (!e.alive || e.def.boss) continue;
          if (Math.hypot(e.x - c.x, e.z - c.z) > 10) continue;
          if (e.targetType !== 'tank') { e.targetType = 'tank'; e.state = 'chase'; taunted++; }
          e.tauntT = 4;
        }
        if (taunted && game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 1.95, c.z, '도발!', 'heal');
      }
    }
    // 전투
    c.atkCd -= dt;
    c.skillCd -= dt;
    c.healCd -= dt;
    c.skillCheckT = (c.skillCheckT || 0) - dt;
    const scale = 1 + ((c.lv || 1) - 1) * 0.22;
    const atk = companionAtk(c.cls, c.data.grade, c.lv);
    // 동료 고유 스킬 (자동 사용, 전투 중에만 — castCompanionSkill이 조건을 본다)
    // skillCd는 진짜 쿨다운만 담는다. 조건이 안 맞아 못 쓰면 재확인 타이머만 따로 돈다
    // (예전엔 재확인 0.5초를 skillCd에 넣어 하단 바에 "1"이 영원히 떴다).
    if (c.skillCd <= 0 && c.skillCheckT <= 0) {
      const lv = game.companionSkillLevel(c.data);
      const def = COMPANION_SKILLS[c.data.skillId] || COMPANION_SKILLS[(COMPANION_SKILL_POOLS[c.cls.id] || [])[0]];
      if (def && castCompanionSkill(c, lv)) c.skillCd = compSkillCd(def, lv);
      else c.skillCheckT = 0.5; // 조건이 안 맞으면 쿨다운을 태우지 않고 0.5초 뒤 다시 확인
    }
    if (c.cls.id === 'healer') {
      // 기본 치유 (작은 지속 회복 — 대표 스킬 '치유의 빛'과 별개로 항상 돌아간다)
      if (c.healCd <= 0) {
        const allies = [{ obj: 'player', hp: p.hp, max: d.maxHp, x: p.x, z: p.z }, ...game.companions.filter((x) => x.hp > 0).map((x) => ({ obj: x, hp: x.hp, max: x.maxHp, x: x.x, z: x.z }))];
        allies.sort((a, b) => a.hp / a.max - b.hp / b.max);
        const low = allies[0];
        if (low && low.hp / low.max < 0.85) {
          c.healCd = 3.4;
          const healed = healTarget(low.obj, 0.12, Math.round(c.cls.heal * scale));
          if (game.ui && healed > 0) game.ui.damageNumber(low.x, groundY(low.x, low.z) + 1.8, low.z, `+${healed}`, 'heal');
        }
      }
      if (c.atkCd <= 0) {
        const t = nearestEnemyFrom(c.x, c.z, 6.5, false, true);
        if (t) { c.atkCd = c.cls.cd; game.dealDamage(t, atk, { attacker: c }); } }
      return;
    }
    if (c.atkCd <= 0) {
      const t = nearestEnemyFrom(c.x, c.z, c.cls.range + 1.4, false, true);
      if (t) {
        c.atkCd = c.cls.cd;
        c.mesh.rotation.y = Math.atan2(t.x - c.x, t.z - c.z);
        if (c.cls.projectile) {
          ctx.spawnProjectile({ from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 13, color: c.cls.color, dmg: atk, range: c.cls.range + 1.6, source: c });
        } else {
          game.dealDamage(t, atk, { attacker: c });
        }
      }
    }
  });
}

// 주인공이 "인식한" 몹 — 동료는 이 몹만 공격한다.
// (a) 파티원을 쫓고 있는 몹 (어그로·도발로 달려드는 중)
// (b) 주인공이 직접 때린 몹 (heroHit)
// (c) 보스급 (미드/에픽/필드 — 보스전은 주인공이 직접 들어가는 싸움)
// 셋 다 아니면 동료는 대열을 지키고 손대지 않는다.
function isHeroRecognized(e) {
  if (!e || !e.alive) return false;
  if (e.def.boss) return true;
  if (e.state === 'chase') return true;
  if (e.heroHit) return true;
  return false;
}

function nearestEnemyFrom(x, z, range, skipStatue, onlyRecognized) {
  let best = null, bd = 69420;
  for (const e of game.enemies) {
    if (!e.alive || (skipStatue && e.statue)) continue;
    if (onlyRecognized && !isHeroRecognized(e)) continue;
    const dd = Math.hypot(e.x - x, e.z - z);
    if (dd < range && dd < bd) { bd = dd; best = e; }
  }
  return best;
}

// ---------- 스킬 보너스 지급 규칙 (마이그레이션·스킬북 사용 공통, 1가지) ----------
// 스킬북은 같은 스킬을 쓰는 동료에게만 보너스를 준다.
// 1) 그 스킬을 쓰는 동료가 있으면 전원에게 +n (동행·대기 가리지 않는다)
// 2) 그 스킬을 쓰는 동료가 아예 없으면 pendingBonus[스킬]에 쌓아두고,
//    나중에 그 스킬을 가진 동료를 뽑으면 시작 보너스로 준다
// 보너스를 받은 동료 목록을 돌려준다 (빈 배열 = 동료가 없어서 pendingBonus에 쌓였다는 뜻).
function grantSkillBonus(s, skillId, n = 1) {
  const targets = s.companions.filter((c) => c.skillId === skillId);
  if (targets.length) {
    for (const c of targets) c.skillBonus = (c.skillBonus || 0) + n;
    return targets;
  }
  if (!s.skills.pendingBonus) s.skills.pendingBonus = {};
  s.skills.pendingBonus[skillId] = (s.skills.pendingBonus[skillId] || 0) + n;
  return [];
}

// ---------- 동료 대표 스킬 ----------
// 스킬 레벨 = 등급 + 1 + 스킬북 보너스 (최대 10). 등급이 오르면 자동으로 강해진다.
game.companionSkillLevel = function (cData) {
  if (!cData) return 1;
  return Math.min(COMPANION_SKILL_MAX_LEVEL, (cData.grade || 0) + 1 + (cData.skillBonus || 0));
};
game.companionSkillDef = function (skillId) { return COMPANION_SKILLS[skillId] || null; };
game.companionSkillState = function () {
  return (game.companions || []).map((c) => {
    const def = COMPANION_SKILLS[c.data.skillId] || COMPANION_SKILLS[(COMPANION_SKILL_POOLS[c.cls.id] || [])[0]];
    const lv = game.companionSkillLevel(c.data);
    return {
      id: c.data.id, name: c.data.name, cls: c.cls.id,
      skillId: def ? def.id : null, skillName: def ? def.name : '', skillIcon: def ? def.icon : '',
      level: lv, cd: Math.max(0, c.skillCd || 0), cdMax: def ? compSkillCd(def, lv) : 0,
    };
  });
};
function compSkillCd(def, lv) { return Math.max(def.cdMin, def.cd - def.cdPerLv * (lv - 1)); }

// ---------- 스킬북 ----------
game.skillState = function () {
  const s = game.state.skills;
  return {
    learned: s.learned.slice(),
    slots: s.slots.slice(),
    auto: !!s.auto,
    cds: { ...s.cds },
    books: { ...game.state.skillbooks },
    mp: game.player ? (game.player.mp || 0) : 0,
  };
};

// 스킬북 사용 (동료 개편): 주인공은 스킬을 배우지 않는다.
// 스킬북을 쓰면 같은 스킬을 쓰는 동료의 보너스가 +1 된다.
// 이미 배운 스킬의 책을 다시 써도 보너스는 적용된다 (책은 소모된다).
// 배운 스킬 목록(learned)은 기록으로 남기고 삭제하지 않는다.
// 스킬북은 더 이상 보스에게서 떨어지지 않는다 (이미 가진 책만 쓸 수 있다).
game.learnSkill = function (id) {
  const def = SKILLS[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (!(game.state.skillbooks[id] > 0)) return { ok: false, reason: 'nobook' };
  game.state.skillbooks[id] -= 1;
  if (!(game.state.skillbooks[id] > 0)) delete game.state.skillbooks[id];
  const s = game.state.skills;
  if (!s.learned.includes(id)) s.learned.push(id);
  const skillId = SKILL_BOOK_SKILL[id];
  const targets = skillId ? grantSkillBonus(game.state, skillId, 1) : [];
  game.save();
  if (game.ui) { game.ui.markDirty(true); game.ui.renderSkillBar && game.ui.renderSkillBar(); }
  return { ok: true, skillId: skillId || null, granted: targets.map((c) => c.name), pending: !!skillId && targets.length === 0 };
};

// 주인공 스킬 시전은 스킬 개편으로 제거됐다 (주인공은 무기 공격만 한다).
// 스킬은 동료 고유 스킬로만 나간다 (castCompanionSkill).
// 예전 디버그 API가 깨지지 않게 실패 결과만 돌려준다.
game.castSkill = function () { return { ok: false, reason: 'companion-only' }; };
game.canCastSkill = function () { return { ok: false, reason: 'companion-only' }; };

game.pullCompanion = function () {
  const s = game.state;
  if (s.gold < COMPANION_PULL_COST) return { ok: false, msg: `골드가 부족해요 (${COMPANION_PULL_COST} 필요)` };
  s.gold -= COMPANION_PULL_COST;
  s.pulls++;
  const clsIds = Object.keys(COMPANION_CLASSES);
  const cls = clsIds[Math.floor(Math.random() * clsIds.length)];
  const name = COMPANION_NAMES[Math.floor(Math.random() * COMPANION_NAMES.length)];
  // 같은 이름 + 같은 직업이 이미 있으면 새로 만들지 않고 업그레이드 (최대 신화 5등급)
  const dup = s.companions.find((x) => x.name === name && x.cls === cls);
  if (dup) {
    // 중복 뽑기 = 스킬 레벨 상승 (동료 개편).
    // 등급이 5 미만이면 등급 +1 AND 스킬 보너스 +1 (스킬 레벨이 두 단계 오른다).
    // 이미 신화(5등급)면 등급은 그대로, 스킬 보너스만 +1.
    // 스킬 레벨 = 등급 + 1 + 스킬 보너스 (최대 Lv.10).
    // 이미 완전히 최대(신화 + 스킬 Lv.10)면 더 줄 게 없어서 위로금 300골드를 준다.
    const wasMaxed = (dup.grade || 0) >= 5 && game.companionSkillLevel(dup) >= COMPANION_SKILL_MAX_LEVEL;
    let upgraded;
    if ((dup.grade || 0) < 5) { dup.grade = (dup.grade || 0) + 1; upgraded = 'grade'; }
    else upgraded = 'skill';
    dup.skillBonus = (dup.skillBonus || 0) + 1;
    const skillLv = game.companionSkillLevel(dup);
    let consolation = 0;
    if (wasMaxed) { consolation = 300; s.gold += consolation; }
    game.save();
    if (game.player && s.party.includes(dup.id)) refreshCompanions();
    return { ok: true, upgraded, companion: dup, cls: COMPANION_CLASSES[cls], grade: dup.grade, skillLv, consolation };
  }
  // 새 동료는 항상 일반(0등급)으로 시작한다. 직업 풀에서 고유 스킬을 하나 랜덤으로 받는다.
  // 그 스킬의 스킬북 보너스가 쌓여 있으면(pendingBonus) 시작 보너스로 가져간다.
  const pool = COMPANION_SKILL_POOLS[cls] || [];
  const skillId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'shieldSlam';
  const pending = game.state.skills.pendingBonus[skillId] || 0;
  if (pending > 0) delete game.state.skills.pendingBonus[skillId];
  const c = { id: 'c' + Date.now() + Math.floor(Math.random() * 999), name, cls, grade: 0, lv: 1, xp: 0, skillBonus: pending, skillId };
  s.companions.push(c);
  game.save();
  return { ok: true, companion: c, cls: COMPANION_CLASSES[cls], grade: 0, skillId };
};

game.toggleParty = function (id) {
  const s = game.state;
  const i = s.party.indexOf(id);
  if (i >= 0) s.party.splice(i, 1);
  else {
    if (s.party.length >= 4) return { ok: false, msg: '동행은 최대 4명까지 가능해요' };
    s.party.push(id);
  }
  game.save();
  // 즉시 갱신
  const zid = game.state.zone;
  game.state.zone = zid;
  refreshCompanions();
  return { ok: true };
};

function refreshCompanions() {
  game.compObjects && game.compObjects.forEach((c) => scene.remove(c.mesh));
  game.compObjects = []; game.companions = [];
  game.tank = null;
  game.state.party.forEach((cid, i) => {
    const c = game.state.companions.find((x) => x.id === cid);
    if (!c) return;
    const cls = COMPANION_CLASSES[c.cls];
    const mesh = makeCompanion(THREE, cls, GRADES[c.grade].color);
    scene.add(mesh);
    const o = makeCompanionObj(c, cls, mesh, game.player.x + (i - (game.state.party.length - 1) / 2) * 1.6, game.player.z + 1.8);
    game.compObjects.push(o); game.companions.push(o);
    if (cls.id === 'tank' && !game.tank) game.tank = o;
  });
  // GLB 동료 테스트: 준비된 GLB가 있으면 첫 탱커·근접·마법·힐러를 GLB로 바꾼다
  ctx.maybeSwapGlbTank();
  ctx.maybeSwapGlbMelee();
  ctx.maybeSwapGlbMage();
  ctx.maybeSwapGlbHealer();
}

// 안 쓰는 동료 보내기 (동행 중이면 동행에서도 제외, 환급 없음)
game.dismissCompanion = function (id) {
  const s = game.state;
  const i = s.companions.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false };
  const c = s.companions[i];
  s.companions.splice(i, 1);
  const pi = s.party.indexOf(id);
  if (pi >= 0) s.party.splice(pi, 1);
  game.save();
  if (game.player) refreshCompanions();
  if (game.ui) game.ui.markDirty(true);
  return { ok: true, name: c.name };
};
  // 다른 모듈에서 부른다 (zones buildWorld/setDistrict/returnTo*, systems step/frame, state mergeState, ui)
  ctx.companionMaxHp = companionMaxHp;
  ctx.companionAtk = companionAtk;
  ctx.makeCompanionObj = makeCompanionObj;
  ctx.healTarget = healTarget;
  ctx.pushOutOfProps = pushOutOfProps;
  ctx.snapCompanions = snapCompanions;
  ctx.castCompanionSkill = castCompanionSkill;
  ctx.updateCompanions = updateCompanions;
  ctx.isHeroRecognized = isHeroRecognized;
  ctx.nearestEnemyFrom = nearestEnemyFrom;
  ctx.grantSkillBonus = grantSkillBonus;
  ctx.compSkillCd = compSkillCd;
  ctx.refreshCompanions = refreshCompanions;
}
