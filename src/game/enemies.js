// 스쿨히어로 — 몬스터 AI·보스 패턴·텔레그래프 (game.js에서 분리)
// placeEnemy / updateEnemies / moveEnemy / enemyAttack / damageCompanion /
// updateBossAI / trySplit / bossCharge / triggerBossPattern / bossNova /
// bossWhirlwind / bossCannon / bossPortal / updatePortalBuff / bossPoison /
// bossDragon / bossNecromancer / bossTwins / tryReleaseBrother /
// bossBrotherWeapon / updateEnrage / addTelegraph / updateTelegraphs.
import { clamp, dist2, angleDiff, TAU, groundY } from './util.js';
import { WORLD_BOUNDS } from '../world.js';

export function installEnemies(ctx) {
  const { game, THREE, scene, camera } = ctx;

// ---------- 몬스터 AI ----------
// 스프라이트/모델 모두 같은 자리에 그린다 (보스 몸체·이름표 동기화)
function placeEnemy(e) {
  if (!e.mesh) return;
  const jitter = e.knockT > 0 || e.hitFlash > 0 ? (Math.random() - 0.5) * 0.07 : 0;
  e.mesh.position.set(e.x + jitter, groundY(e.x, e.z) + (e.flyY || 0), e.z + jitter);
  if (e.mesh.userData.isSprite) {
    if (e.mesh.userData.update) e.mesh.userData.update(game.time, e, camera);
    if (e.tag) e.tag.style.opacity = '1';
  } else {
    e.mesh.rotation.y = e.facing;
    // 3D 몬스터 애니메이션 (걷기 바운스·슬라임 통통 튐·날개 등)
    if (e.mesh.userData.update) e.mesh.userData.update(game.time, e);
  }
}

function updateEnemies(dt) {
  const p = game.player;
  if (!p || !p.alive) return;
  for (const e of game.enemies) {
    if (!e.alive) {
      e.deadT += dt;
      if (e.deadT < 0.45) {
        if (e.mesh.userData.isSprite) {
          if (e.mesh.userData.update) e.mesh.userData.update(game.time, e, camera);
        } else {
          e.mesh.rotation.z = Math.min(1.4, e.deadT * 5);
          e.mesh.position.y = groundY(e.x, e.z) - Math.min(0.6, e.deadT * 1.2);
        }
        if (e.tag) e.tag.style.opacity = String(Math.max(0, 1 - e.deadT * 3));
      } else if (e.mesh.parent) {
        scene.remove(e.mesh);
        if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
        e.gone = true;
      }
      continue;
    }
    e.moving = false; // 매 프레임 초기화 — moveEnemy()가 실제 이동 시 true로 설정
    // 도발 지속시간이 끝나면 다시 플레이어를 노린다
    if (e.tauntT > 0) {
      e.tauntT -= dt;
      if (e.tauntT <= 0 && e.targetType === 'tank') e.targetType = 'player';
    }
    e.floatT += dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.skillCd > 0) e.skillCd -= dt;
    if (e.stunT > 0) {
      e.stunT -= dt;
      e.facing += dt * 6;
      placeEnemy(e);
      continue;
    }
    // 흰색 히트 플래시
    if (e.hitFlash > 0) {
      e.hitFlash -= dt;
      if (!e.mesh.userData.isSprite) e.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(e.hitFlash > 0 ? 0xffffff : 0x000000); });
    }
    // 탱커 어그로가 끊기면 플레이어로
    const tank = game.tank;
    const tankOk = tank && tank.hp > 0;
    if (e.targetType === 'tank' && !tankOk) e.targetType = 'player';
    // 목표 동료가 쓰러지면 다시 플레이어를 노린다
    if (e.targetType === 'comp' && (!e.targetComp || e.targetComp.hp <= 0)) { e.targetType = 'player'; e.targetComp = null; }
    const useTank = e.targetType === 'tank' && tankOk;
    const useComp = e.targetType === 'comp' && e.targetComp && e.targetComp.hp > 0;
    const txp = useTank ? tank.x : useComp ? e.targetComp.x : p.x;
    const tzp = useTank ? tank.z : useComp ? e.targetComp.z : p.z;
    const dx = txp - e.x, dz = tzp - e.z;
    const dd = Math.hypot(dx, dz);
    const homeD = Math.hypot(e.x - e.home.x, e.z - e.home.z);

    // 어그로 이탈: 스폰 지점에서 너무 멀어지면 복귀하며 체력을 회복한다
    if (!e.def.boss && e.state !== 'return' && homeD > game.leashRange) {
      e.state = 'return';
      e.targetType = 'player';
      e.targetComp = null;
    }
    if (e.state === 'return') {
      e.leashing = true;
      const hx = e.home.x - e.x, hz = e.home.z - e.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 0.6) {
        const spd = e.speed * (e.slowT > 0 ? 0.5 : 1) * 1.1;
        moveEnemy(e, (hx / hd) * spd * dt, (hz / hd) * spd * dt);
        e.facing = Math.atan2(hx, hz);
        if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.16 * dt);
      } else {
        e.state = 'idle';
        e.hp = e.maxHp;
        e.leashing = false;
      }
      placeEnemy(e);
      continue;
    }
    e.leashing = false;
    if (e.def.boss) { updateBossAI(e, dt, dd, dx, dz); placeEnemy(e); continue; }

    const spd = e.speed * (e.slowT > 0 ? 0.5 : 1);
    if (e.state === 'idle') {
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 2 + Math.random() * 3;
        e.wander.x = e.home.x + (Math.random() - 0.5) * 7;
        e.wander.z = e.home.z + (Math.random() - 0.5) * 7;
      }
      const wdx = e.wander.x - e.x, wdz = e.wander.z - e.z;
      const wd = Math.hypot(wdx, wdz);
      if (wd > 0.4) {
        moveEnemy(e, (wdx / wd) * spd * 0.42 * dt, (wdz / wd) * spd * 0.42 * dt);
        e.facing = Math.atan2(wdx, wdz);
      }
      if (dd < e.def.aggro && dd > 0.1) e.state = 'chase';
    } else if (e.state === 'chase') {
      if (dd > e.def.aggro * 1.6) { e.state = 'idle'; continue; }
      const stop = e.def.atkRange * 0.85 + e.radius * 0.4;
      if (dd > stop) {
        moveEnemy(e, (dx / dd) * spd * dt, (dz / dd) * spd * dt);
        e.facing = Math.atan2(dx, dz);
      }
      e.atkCd -= dt;
      if (dd <= e.def.atkRange + e.radius && e.atkCd <= 0) {
        enemyAttack(e);
        e.atkCd = e.def.atkCd;
      }
    }
    // 이동 애니메이션 (+ 피격 흔들림)
    if (e.knockT > 0) e.knockT -= dt;
    // 분열 자식도 체력이 줄면 다시 갈라진다 (1→2→4)
    if (e.pattern === 'split') trySplit(e);
    placeEnemy(e);
  }
  if (game.enemies.some((e) => e.gone)) game.enemies = game.enemies.filter((e) => !e.gone);
  // 서로 밀어내기
  for (let i = 0; i < game.enemies.length; i++) {
    const a = game.enemies[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < game.enemies.length; j++) {
      const b = game.enemies[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const dd = Math.hypot(dx, dz);
      const min = (a.radius + b.radius) * 0.85;
      if (dd < min && dd > 0.001) {
        const push = (min - dd) / 2;
        const ux = dx / dd, uz = dz / dd;
        if (!a.def.boss) moveEnemy(a, -ux * push, -uz * push);
        if (!b.def.boss) moveEnemy(b, ux * push, uz * push);
      }
    }
  }
}

function moveEnemy(e, dx, dz) {
  if (dx || dz) e.moving = true;
  e.x = clamp(e.x + dx, WORLD_BOUNDS.minX + 2, WORLD_BOUNDS.maxX - 2);
  e.z = clamp(e.z + dz, WORLD_BOUNDS.minZ + 2, WORLD_BOUNDS.maxZ - 2);
  for (const pr of game.world.propsNear(e.x, e.z, 5)) {
    const dd = Math.hypot(e.x - pr.x, e.z - pr.z);
    const min = pr.r + e.radius * 0.7;
    if (dd < min && dd > 0.001) {
      e.x = pr.x + ((e.x - pr.x) / dd) * min;
      e.z = pr.z + ((e.z - pr.z) / dd) * min;
    }
  }
}

function enemyAttack(e) {
  const p = game.player;
  const style = e.def.style;
  const tank = game.tank;
  const useTank = e.targetType === 'tank' && tank && tank.hp > 0;
  const useComp = e.targetType === 'comp' && e.targetComp && e.targetComp.hp > 0;
  const tx = useTank ? tank.x : useComp ? e.targetComp.x : p.x;
  const tz = useTank ? tank.z : useComp ? e.targetComp.z : p.z;
  if (style === 'ranged' || style === 'poison') {
    ctx.spawnProjectile({
      from: 'enemy', x: e.x, y: 1.0, z: e.z, targetX: tx, targetZ: tz,
      speed: style === 'poison' ? 8 : 9.5, color: style === 'poison' ? 0x9bff6a : 0xc58fff,
      dmg: e.atk, range: Math.hypot(tx - e.x, tz - e.z) + 2, style, targetTank: useTank, targetComp: useComp ? e.targetComp : null,
    });
    return;
  }
  if (style === 'aoe') {
    // 일반 몹은 텔레그래프 광역기를 쓰지 않는다 (보스급 전용) — 근접 타격으로 대체
    if (!e.isMid && !e.isBoss && !e.isField) {
      const ddm = Math.hypot(tx - e.x, tz - e.z);
      if (ddm < e.def.atkRange + e.radius + 0.6) {
        if (useTank) damageCompanion(tank, e.atk * 0.7);
        else if (useComp) damageCompanion(e.targetComp, e.atk * 0.7);
        else game.damagePlayer(e.atk * 0.7, e);
      }
      return;
    }
    // 스킬 쿨다운을 두어 광역기를 너무 자주 쓰지 않게 한다
    if ((e.skillCd || 0) > 0) {
      const ddm = Math.hypot(tx - e.x, tz - e.z);
      if (ddm < e.def.atkRange + e.radius + 0.6) {
        if (useTank) damageCompanion(tank, e.atk * 0.7);
        else if (useComp) damageCompanion(e.targetComp, e.atk * 0.7);
        else game.damagePlayer(e.atk * 0.7, e);
      }
      return;
    }
    e.skillCd = e.isField ? 13 : e.isBoss ? 11 : e.isMid ? 9 : 8 + Math.random() * 3;
    addTelegraph(tx, tz, e.def.boss === 'field' ? 5.4 : e.def.boss === 'boss' ? 4.2 : 3.2, 1.35, e.atk * 1.5, e);
    return;
  }
  // 근접
  const dd = Math.hypot(tx - e.x, tz - e.z);
  if (dd < e.def.atkRange + e.radius + 0.5) {
    if (useTank) damageCompanion(tank, e.atk);
    else if (useComp) damageCompanion(e.targetComp, e.atk);
    else game.damagePlayer(e.atk, e);
  }
  game.effects.push({ mesh: null, kind: 'lunge', e, life: 0.15, max: 0.15 });
}

function damageCompanion(c, amount) {
  if (!c || c.hp <= 0) return 0;
  const dmg = Math.max(1, Math.round(amount * 0.62));
  c.hp = Math.max(0, c.hp - dmg);
  c.hitT = 0.2;
  if (game.ui) game.ui.damageNumber(c.x, groundY(c.x, c.z) + 1.55, c.z, `-${dmg}`, 'hurt');
  if (c.hp <= 0) {
    c.downT = 6;
    if (game.ui) game.ui.toast(`${c.data.name}이(가) 쓰러졌어요. 잠시 뒤 다시 일어납니다.`, 'bad');
    for (const e of game.enemies) {
      if (e.targetType === 'tank') e.targetType = 'player';
      if (e.targetType === 'comp' && e.targetComp === c) { e.targetType = 'player'; e.targetComp = null; }
    }
  }
  return dmg;
}
game.damageCompanion = damageCompanion;

function updateBossAI(e, dt, dd, dx, dz) {
  const p = game.player;
  const homeDist = Math.hypot(e.x - e.home.x, e.z - e.home.z);
  // 보스·중간보스도 어그로 범위 밖에서는 제자리를 지킨다 (멀리서 광역기가 날아오지 않게)
  const engage = Math.max(e.def.aggro + 3, 13);
  if (dd > engage || homeDist > 20) {
    e.leashing = homeDist > 20;
    const hx = e.home.x - e.x, hz = e.home.z - e.z;
    const hd = Math.hypot(hx, hz) || 1;
    if (hd > 1) {
      moveEnemy(e, (hx / hd) * e.speed * dt, (hz / hd) * e.speed * dt);
      e.facing = Math.atan2(hx, hz);
    }
    if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06 * dt);
    e.state = 'idle';
    return;
  }
  e.leashing = false;
  e.telegraphT -= dt;
  // 석상 상태의 3형제는 깨질 때까지 가만히 있다
  if (e.statue) { tryReleaseBrother(e); return; }
  // 쌍둥이 보호막 교대 (보호막이 켜진 쪽이 시간을 잰다)
  if (e.pattern === 'twins') bossTwins(e, dt);
  if (e.shielded) return; // 보호막이 켜진 쌍둥이는 가만히 서 있다
  // 광폭화 (필드보스 + enrage 지정 보스): 30초마다 공격력 +10% · 속도 +5% (최대 10단계)
  if (e.isField || e.def.enrage) updateEnrage(e, dt);
  // 드래곤 비행 시퀀스 (날아오르는 동안은 다른 행동을 쉰다)
  if (e.pattern === 'dragon' && bossDragon(e, dt, dx, dz)) return;
  // 돌진 패턴 (오우거·골렘·아누비스 계열)
  if (e.pattern === 'charge' && bossCharge(e, dt, dx, dz)) return;
  // 네크로맨서: 도망치며 해골 소환 (도망치는 동안은 추격·공격을 쉰다)
  const fleeing = e.pattern === 'necromancer' && bossNecromancer(e, dt, dx, dz);
  // 포탈 버프 관리 (쫄을 다 잡으면 강화 해제)
  if (e.portalAdds) updatePortalBuff(e, dt);
  if (!fleeing) {
    if (dd > e.def.atkRange * 0.9 + e.radius) {
      moveEnemy(e, (dx / dd) * e.speed * dt, (dz / dd) * e.speed * dt);
      e.facing = Math.atan2(dx, dz);
    } else {
      e.facing = Math.atan2(dx, dz);
      e.atkCd -= dt;
      if (e.atkCd <= 0) { enemyAttack(e); e.atkCd = e.def.atkCd; }
    }
  }
  // 강공격 텔레그래프 — 보스급만 사용, 빈도 완화 (필드 26초 / 보스 22초 / 중간보스 18초)
  if (e.telegraphT <= 0 && dd < 15) {
    e.telegraphT = e.isField ? 26 : e.isBoss ? 22 : 18;
    addTelegraph(p.x, p.z, e.isField ? 5.6 : e.isBoss ? 4.6 : 3.6, 1.5, e.atk * 1.9, e);
  }
  // 보스 패턴 발동 (텔레그래프와 같은 최소 간격)
  e.patternCd -= dt;
  if (e.patternCd <= 0 && dd < 16) {
    if (triggerBossPattern(e, dx, dz)) {
      e.patternCd = e.isField ? 26 : e.isBoss ? 22 : 18;
      e.telegraphT = Math.max(e.telegraphT, 4);
    }
  }
  // 3형제 무기 스킬 (도끼 회전 베기 · 활 화살비 · 둔기 스턴 내려찍기)
  if (e.pattern === 'brothers') bossBrotherWeapon(e, dt);
  // 분열 패턴 (히드라 계열): 체력이 줄면 1→2→4로 갈라진다
  trySplit(e);
  // 50% 이하 소환
  if (e.isBoss && !e.summonDone && e.hp < e.maxHp * 0.5) {
    e.summonDone = true;
    for (let i = 0; i < 3; i++) {
      const def = game.zone.mobs.normal[i % game.zone.mobs.normal.length];
      const a = (i / 3) * TAU;
      ctx.spawnEnemy(def, e.x + Math.cos(a) * 3.5, e.z + Math.sin(a) * 3.5, true);
    }
    if (game.ui) game.ui.toast(`${e.def.name}이(가) 부하를 불러냈어요!`, 'bad');
  }
}

// 분열: 체력 60%에서 2마리로, 그 자식들은 체력 50%에서 다시 2마리씩 (최대 1→2→4)
function trySplit(e) {
  if (e.pattern !== 'split' || e.splitDone) return;
  const stage = e.splitStage || 0;
  if (stage >= 2) return;
  const threshold = stage >= 1 ? 0.5 : 0.6;
  if (e.hp >= e.maxHp * threshold) return;
  e.splitDone = true;
  for (let i = 0; i < 2; i++) {
    const def = game.zone.mobs.normal[i % game.zone.mobs.normal.length];
    const ang = (i / 2) * TAU + 0.6;
    const child = ctx.spawnEnemy(def, e.x + Math.cos(ang) * 2.8, e.z + Math.sin(ang) * 2.8, true);
    child.pattern = 'split';
    child.splitStage = stage + 1;
    child.splitDone = stage + 1 >= 2;
  }
  ctx.dustBurst(e.x, e.z, 0x9fe0a0, 12);
  game.camShake = Math.max(game.camShake, 0.4);
  if (game.ui) game.ui.toast(`${e.def.name}이(가) 분열했어요!`, 'bad');
}

// 돌진: 바닥 예고선 → 빠르게 들이받기
function bossCharge(e, dt, dx, dz) {
  const p = game.player;
  if (!e.charge) {
    e.chargeCd -= dt;
    const dd = Math.hypot(dx, dz);
    if (e.chargeCd <= 0 && dd > 2.5 && dd < 16) {
      const len = 13;
      e.charge = { t: 0, dx: dx / dd, dz: dz / dd, hit: false };
      const run = ctx.fxAlloc(ctx.fxGeo('box', 1.8, 0.035, len), 0xff4d5e, 0.34, { tag: 'charge:trail' });
      run.position.set(e.x + e.charge.dx * len * 0.45, groundY(e.x + e.charge.dx * len * 0.45, e.z + e.charge.dz * len * 0.45) + 0.07, e.z + e.charge.dz * len * 0.45);
      run.rotation.y = Math.atan2(e.charge.dx, e.charge.dz);
      scene.add(run);
      e.charge.trail = run;
      if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '돌진!', 'hurt');
    }
    return false;
  }
  const c = e.charge;
  c.t += dt;
  if (c.trail) c.trail.material.opacity = 0.2 + Math.sin(c.t * 20) * 0.12;
  e.facing = Math.atan2(c.dx, c.dz);
  if (c.t < 0.8) { e.state = 'chase'; return true; }
  moveEnemy(e, c.dx * 20 * dt, c.dz * 20 * dt);
  if (!c.hit && p.alive && Math.hypot(p.x - e.x, p.z - e.z) < e.radius + 1.0) {
    c.hit = true;
    game.damagePlayer(e.atk * 1.5, e);
    game.camShake = 0.5;
  }
  if (c.t > 1.4) {
    if (c.trail) ctx.fxFree(c.trail);
    e.charge = null;
    e.chargeCd = 7 + Math.random() * 3;
  }
  return true;
}

// ---------- 보스 특수 패턴 (2차) ----------
function triggerBossPattern(e, dx, dz) {
  switch (e.pattern) {
    case 'nova': return bossNova(e);
    case 'whirlwind': return bossWhirlwind(e);
    case 'cannon': return bossCannon(e);
    case 'portal': return bossPortal(e);
    case 'poison': return bossPoison(e);
    case 'dragon': e.dragonPhase = 'rise'; e.dragonT = 0; return true;
    default: return false;
  }
}

// 나무 내려찍기: 빨간원이 다 차면 내려찍기 (기존 1.9배 광역기에 연출 추가)
function bossNova(e) {
  const p = game.player;
  addTelegraph(p.x, p.z, e.isField ? 6.0 : e.isBoss ? 5.0 : 4.0, 1.6, e.atk * 1.9, e);
  ctx.dustBurst(e.x, e.z, 0x8a6a3a, 10);
  if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '내려찍기!', 'hurt');
  return true;
}

// 회오리 소환: 플레이어를 향해 천천히 이동하며 닿으면 피해를 주는 회오리
function bossWhirlwind(e) {
  const p = game.player;
  const dx = p.x - e.x, dz = p.z - e.z;
  const dd = Math.hypot(dx, dz) || 1;
  const sx = e.x + (dx / dd) * 3, sz = e.z + (dz / dd) * 3;
  const cone = ctx.fxAlloc(ctx.fxGeo('cone', 1.1, 2.8, 10), 0xdff4ff, 0.5, { tag: 'whirlwind' });
  cone.position.set(sx, groundY(sx, sz) + 1.4, sz);
  scene.add(cone);
  game.effects.push({ mesh: cone, kind: 'whirlwind', x: sx, z: sz, r: 1.9, life: 5, max: 5, tick: 0, dmg: e.atk * 0.8 });
  if (game.ui) game.ui.toast('회오리가 나타났어요! 피하세요!', 'bad');
  return true;
}

// 대포 소환 폭격: 보스 양옆에 대포 2문이 나타나 작은 빨간원 폭격을 3번씩 쏜다
function bossCannon(e) {
  for (const s of [-1, 1]) {
    const cx = e.x + s * 3.2, cz = e.z + 1.5;
    const grp = new THREE.Group();
    const base = ctx.fxAlloc(ctx.fxGeo('box', 1.1, 0.7, 1.1), 0x4a3a2a, 1, { blending: THREE.NormalBlending, depthWrite: true, transparent: false, tag: 'cannon:base' });
    base.position.y = 0.35; grp.add(base);
    const barrel = ctx.fxAlloc(ctx.fxGeo('cyl', 0.28, 0.34, 1.6, 8), 0x2a2a30, 1, { blending: THREE.NormalBlending, depthWrite: true, transparent: false, tag: 'cannon:barrel' });
    barrel.rotation.x = Math.PI / 2.6; barrel.position.set(0, 0.9, 0.3); grp.add(barrel);
    grp.position.set(cx, groundY(cx, cz), cz);
    scene.add(grp);
    game.effects.push({ mesh: grp, kind: 'cannon', x: cx, z: cz, life: 6, max: 6, fireT: 0.4 + Math.random() * 0.4, shots: 0, boss: e });
  }
  if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '포격!', 'hurt');
  return true;
}

// 중앙 포탈 + 대각선 쫄 4마리: 15초 안에 못 잡으면 보스 강화
function bossPortal(e) {
  const cx = e.home.x, cz = e.home.z;
  const ring = ctx.flatRing(cx, cz, 1.2, 3.4, 0xb46cff, 0.85, 0.15);
  ctx.addFx(ring, 3, (fx, k) => { ring.scale.setScalar(0.6 + (1 - k) * 0.8); ring.material.opacity = k * 0.85; ring.rotation.z += 0.05; }, 'portal:ring');
  const core = ctx.fxAlloc(ctx.fxGeo('circle', 2.6, 24), 0x7a3fd0, 0.5, { depthTest: false, renderOrder: 11, tag: 'portal:core' });
  core.rotation.x = -Math.PI / 2; core.position.set(cx, groundY(cx, cz) + 0.14, cz); core.renderOrder = 11;
  ctx.addFx(core, 3, (fx, k) => { core.material.opacity = k * 0.5; core.scale.setScalar(0.4 + (1 - k) * 0.7); }, 'portal:core');
  const adds = [];
  for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    const def = game.zone.mobs.normal[adds.length % game.zone.mobs.normal.length];
    adds.push(ctx.spawnEnemy(def, cx + ox, cz + oz, true));
  }
  e.portalAdds = adds;
  e.portalT = 15;
  e.buffOn = false;
  if (game.ui) game.ui.toast('포탈이 열렸어요! 쫄 4마리를 빨리 잡으세요!', 'bad');
  return true;
}

function updatePortalBuff(e, dt) {
  const adds = e.portalAdds;
  if (!adds) return;
  if (!adds.some((a) => a.alive)) {
    if (e.buffOn) {
      e.buffOn = false;
      e.atk = e.baseAtk;
      if (e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(e.enrageStacks > 0 ? 0xff8080 : 0xffffff);
      if (game.ui) game.ui.toast(`${e.def.name}의 강화가 풀렸어요!`, 'good');
    }
    e.portalAdds = null;
    return;
  }
  if (!e.buffOn) {
    e.portalT -= dt;
    if (e.portalT <= 0) {
      e.buffOn = true;
      e.atk = Math.round(e.baseAtk * 1.35);
      if (e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(0xff7070);
      if (game.ui) game.ui.toast('쫄을 못 잡아서 보스가 강화됐어요!', 'bad');
    }
  }
}

// 독버섯: 플레이어 주변에 독장판 3개
function bossPoison(e) {
  const p = game.player;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.random();
    ctx.addPoisonPool(p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2, e.atk * 0.8);
  }
  if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '독장판!', 'hurt');
  return true;
}

// 드래곤: 날아올라 부채꼴 브레스 (날아오르는 동안은 맞지 않는다)
function bossDragon(e, dt, dx, dz) {
  if (!e.dragonPhase) return false;
  e.dragonT += dt;
  const p = game.player;
  if (e.dragonPhase === 'rise') {
    e.flyY = Math.min(3.5, e.flyY + dt * 4);
    if (e.dragonT >= 1.0) { e.dragonPhase = 'hover'; e.dragonT = 0; }
  } else if (e.dragonPhase === 'hover') {
    if (e.dragonT >= 0.6) {
      e.dragonPhase = 'breath'; e.dragonT = 0;
      const bx = p.x - e.x, bz = p.z - e.z;
      const base = Math.atan2(bx, bz);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.35;
        ctx.spawnProjectile({ from: 'enemy', x: e.x, y: 3.2, z: e.z, targetX: e.x + Math.sin(a) * 12, targetZ: e.z + Math.cos(a) * 12, speed: 11, color: 0x66c2ff, dmg: e.atk * 1.1, range: 12, style: 'orb' });
      }
      if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + 4, e.z, '브레스!', 'hurt');
      game.camShake = Math.max(game.camShake, 0.4);
    }
  } else if (e.dragonPhase === 'breath') {
    if (e.dragonT >= 0.4) { e.dragonPhase = 'fall'; e.dragonT = 0; }
  } else if (e.dragonPhase === 'fall') {
    e.flyY = Math.max(0, e.flyY - dt * 4.5);
    if (e.flyY <= 0) {
      e.flyY = 0; e.dragonPhase = null;
      ctx.dustBurst(e.x, e.z, 0x9fc8e8, 12);
      game.camShake = Math.max(game.camShake, 0.4);
    }
  }
  return true;
}

// 네크로맨서: 플레이어에게서 도망치며 해골 소환 (웨이브마다 강해진다)
function bossNecromancer(e, dt, dx, dz) {
  const p = game.player;
  const dd = Math.hypot(dx, dz);
  let fleeing = false;
  if (dd < 5 && dd > 0.01) {
    moveEnemy(e, (-dx / dd) * e.speed * 1.15 * dt, (-dz / dd) * e.speed * 1.15 * dt);
    e.facing = Math.atan2(-dx, -dz);
    fleeing = true;
  }
  e.necroT -= dt;
  const aliveSkels = game.enemies.filter((x) => x.alive && x.def.key === 'skeleton').length;
  if (e.necroT <= 0 && aliveSkels < 6) {
    e.necroT = 12;
    e.necroWave++;
    const wave = e.necroWave;
    const zone = game.zone;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + Math.random();
      const def = {
        key: 'skeleton', name: '해골 전사', shape: 'skeleton', color: 0xe8e8e0, dark: 0x8a8a7a,
        hp: Math.round((80 + zone.scale.lvl * 12) * (1 + 0.15 * (wave - 1))),
        atk: Math.round((12 + zone.scale.lvl * 2) * (1 + 0.15 * (wave - 1))),
        speed: 2.0, atkRange: 1.8, atkCd: 1.3, aggro: 10, style: 'melee', soul: 'gray', elem: 'shadow',
      };
      ctx.spawnEnemy(def, e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, true);
    }
    ctx.dustBurst(e.x, e.z, 0xcfcfe8, 10);
    if (game.ui) game.ui.toast(`해골 ${wave}번째 무리가 일어났어요! 점점 강해져요!`, 'bad');
  }
  return fleeing;
}

// 쌍둥이 보호막 교대 (8초마다 — 보호막이 켜진 쪽이 시간을 잰다)
function bossTwins(e, dt) {
  if (!e.shielded) return;
  e.twinSwapT -= dt;
  if (e.twinSwapT <= 0) {
    const grp = game.bossGroups.twins || [];
    const other = grp.find((m) => m !== e && m.alive);
    if (!other) { e.shielded = false; ctx.setShieldVisual(e, false); return; }
    e.shielded = false; ctx.setShieldVisual(e, false);
    other.shielded = true; ctx.setShieldVisual(other, true);
    other.twinSwapT = 8;
    if (game.ui) game.ui.toast('쌍둥이의 보호막이 바뀌었어요!', 'bad');
  }
}

// 3형제 석상 해제: 앞 형제가 반피 이하이거나 죽으면 다음 석상이 깨어난다
function tryReleaseBrother(e) {
  const order = ['barbAxe', 'barbBow', 'barbMace'];
  const idx = order.indexOf(e.def.key);
  if (idx < 0) return;
  const p = game.player;
  const dd = Math.hypot(p.x - e.x, p.z - e.z);
  const grp = game.bossGroups.brothers || [];
  let ok = false;
  if (idx === 0) ok = dd < 9;
  else {
    const prev = grp.find((m) => m.def.key === order[idx - 1]);
    ok = !prev || !prev.alive || prev.hp < prev.maxHp * 0.5;
  }
  if (!ok) return;
  e.statue = false;
  if (e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(0xffffff);
  ctx.dustBurst(e.x, e.z, 0xd8d8d8, 12);
  game.camShake = Math.max(game.camShake, 0.3);
  if (game.ui) game.ui.toast(`${e.def.name}의 석상이 깨어났어요!`, 'bad');
}

// 3형제 무기 스킬 (도끼 회전 베기 · 활 화살비 · 둔기 스턴 내려찍기)
function bossBrotherWeapon(e, dt) {
  e.weaponCd -= dt;
  if (e.weaponCd > 0) return;
  const p = game.player;
  const w = e.def.weapon;
  if (w === 'axe') {
    e.weaponCd = 9;
    const ring = ctx.flatRing(e.x, e.z, 0.4, 3.5, 0xffd257, 0.9, 0.12);
    ctx.addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 1.4); ring.material.opacity = k * 0.9; }, 'brother:spin');
    ctx.dustBurst(e.x, e.z, 0xffd257, 8);
    if (Math.hypot(p.x - e.x, p.z - e.z) < 4.0) game.damagePlayer(e.atk * 1.3, e);
    if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '회전 베기!', 'hurt');
  } else if (w === 'bow') {
    e.weaponCd = 10;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, r = 1 + Math.random() * 3.4;
      addTelegraph(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 1.6, 1.2, e.atk * 0.9, e);
    }
    if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '화살비!', 'hurt');
  } else if (w === 'mace') {
    e.weaponCd = 11;
    addTelegraph(p.x, p.z, 3.0, 1.4, e.atk * 1.4, e, { stun: 1.5 });
    if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '스턴 내려찍기!', 'hurt');
  }
}

// 광폭화 (필드보스 + enrage 지정 보스): 30초마다 공격력 +10% · 속도 +5% (최대 10단계)
function updateEnrage(e, dt) {
  e.enrageT += dt;
  if (e.enrageStacks >= 10) return;
  if (e.enrageT >= 30) {
    e.enrageT = 0;
    e.enrageStacks++;
    e.atk = Math.round(e.baseAtk * (1 + 0.1 * e.enrageStacks));
    e.speed = e.baseSpeed * (1 + 0.05 * e.enrageStacks);
    if (e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(0xff8080);
    if (game.ui) game.ui.toast(`${e.def.name} 광폭화 ${e.enrageStacks}단계! 공격력이 올랐어요`, 'bad');
  }
}

function addTelegraph(x, z, r, time, dmg, source, opts = {}) {
  // 지형·풀에 가려지지 않도록 바닥 위로 띄우고 깊이검사를 끈다
  const mesh = ctx.fxAlloc(ctx.fxGeo('circle', r, 30), 0xff2f45, 0.34, { depthTest: false, renderOrder: 12, tag: 'telegraph' });
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, groundY(x, z) + 0.3, z);
  scene.add(mesh);
  const ring = ctx.fxAlloc(ctx.fxGeo('ring', r * 0.92, r, 34), 0xff8a8a, 0.95, { depthTest: false, renderOrder: 13, tag: 'telegraph:ring' });
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, groundY(x, z) + 0.31, z); scene.add(ring);
  const mark = ctx.fxAlloc(ctx.fxGeo('ring', r * 0.12, r * 0.2, 20), 0xffd0d0, 0.9, { depthTest: false, renderOrder: 13, tag: 'telegraph:mark' });
  mark.rotation.x = -Math.PI / 2; mark.position.set(x, groundY(x, z) + 0.31, z); scene.add(mark);
  game.telegraphs.push({ mesh, ring, mark, x, z, r, t: 0, max: time, dmg, source, done: false, stun: opts.stun || 0 });
}

function updateTelegraphs(dt) {
  const p = game.player;
  for (const t of game.telegraphs) {
    t.t += dt;
    const k = t.t / t.max;
    t.mesh.material.opacity = 0.16 + Math.sin(k * Math.PI) * 0.28;
    t.mesh.scale.setScalar(0.35 + k * 0.65);
    if (!t.done && t.t >= t.max) {
      t.done = true;
      if (p.alive && Math.hypot(p.x - t.x, p.z - t.z) < t.r) game.damagePlayer(t.dmg, t.source);
      if (t.stun && p.alive && Math.hypot(p.x - t.x, p.z - t.z) < t.r) game.stunPlayer(t.stun);
      const tank = game.tank;
      if (tank && tank.hp > 0 && t.source && t.source.targetType === 'tank' && Math.hypot(tank.x - t.x, tank.z - t.z) < t.r) damageCompanion(tank, t.dmg);
      game.effects.push({ mesh: null, kind: 'shockwave', x: t.x, z: t.z, r: t.r, life: 0.4, max: 0.4 });
      game.camShake = 0.32;
    }
    if (t.t >= t.max + 0.18) {
      ctx.fxFree(t.mesh); ctx.fxFree(t.ring); if (t.mark) ctx.fxFree(t.mark);
      t.remove = true;
    }
  }
  game.telegraphs = game.telegraphs.filter((t) => !t.remove);
}
  // 다른 모듈에서 부른다 (systems step/frame, zones, combat)
  ctx.placeEnemy = placeEnemy;
  ctx.updateEnemies = updateEnemies;
  ctx.moveEnemy = moveEnemy;
  ctx.enemyAttack = enemyAttack;
  ctx.damageCompanion = damageCompanion;
  ctx.updateBossAI = updateBossAI;
  ctx.trySplit = trySplit;
  ctx.bossCharge = bossCharge;
  ctx.triggerBossPattern = triggerBossPattern;
  ctx.bossNova = bossNova;
  ctx.bossWhirlwind = bossWhirlwind;
  ctx.bossCannon = bossCannon;
  ctx.bossPortal = bossPortal;
  ctx.updatePortalBuff = updatePortalBuff;
  ctx.bossPoison = bossPoison;
  ctx.bossDragon = bossDragon;
  ctx.bossNecromancer = bossNecromancer;
  ctx.bossTwins = bossTwins;
  ctx.tryReleaseBrother = tryReleaseBrother;
  ctx.bossBrotherWeapon = bossBrotherWeapon;
  ctx.updateEnrage = updateEnrage;
  ctx.addTelegraph = addTelegraph;
  ctx.updateTelegraphs = updateTelegraphs;
}
