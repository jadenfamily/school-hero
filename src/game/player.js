// 스쿨히어로 — 플레이어 이동·공격 (game.js에서 분리)
// movePlayer / animateArm / nearestEnemy / playerAttack.
// 이동 차단(canEnter)·키프레임(kf)은 각 함수 안의 로컬 헬퍼다.
import { clamp, angleDiff, groundY } from './util.js';
import { PLAYABLE } from '../data.js';
import { WORLD_BOUNDS, districtAt } from '../world.js';

export function installPlayer(ctx) {
  const { game, THREE, scene, camera } = ctx;

// ---------- 플레이어 ----------
function movePlayer(dt) {
  const p = game.player;
  if (!p || !p.alive) return;
  const d = game.derived();
  let mx = game.input.mx, mz = game.input.mz;
  const k = game.input.keys;
  if (k.has('w') || k.has('arrowup')) mz -= 1;
  if (k.has('s') || k.has('arrowdown')) mz += 1;
  if (k.has('a') || k.has('arrowleft')) mx -= 1;
  if (k.has('d') || k.has('arrowright')) mx += 1;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  if (p.stunT > 0) { p.stunT -= dt; mx = 0; mz = 0; } // 기절 중에는 움직이지 않는다
  p.moving = len > 0.06;
  const beforeX = p.x, beforeZ = p.z;
  if (p.moving) {
    const sp = d.moveSpeed * Math.min(1, Math.hypot(mx, mz));
    let nx = p.x + mx * sp * dt;
    let nz = p.z + mz * sp * dt;
    // 소품 충돌 (근처 셀만 본다)
    for (const pr of game.world.propsNear(nx, nz, 5)) {
      const dd = Math.hypot(nx - pr.x, nz - pr.z);
      const min = pr.r + 0.35;
      if (dd < min && dd > 0.0001) {
        nx = pr.x + ((nx - pr.x) / dd) * min;
        nz = pr.z + ((nz - pr.z) / dd) * min;
      }
    }
    nx = clamp(nx, WORLD_BOUNDS.minX + 2, WORLD_BOUNDS.maxX - 2); nz = clamp(nz, WORLD_BOUNDS.minZ + 2, WORLD_BOUNDS.maxZ - 2);
    // 잠긴 구역으로는 들어갈 수 없다 (방벽) — 경계에서 막고, 갈 수 있는 방향으로는 미끄러지듯 이동
    const target = districtAt(nx, nz);
    const blockedMsg = (msg) => {
      const now = game.time;
      if (!game._gateToastT || now - game._gateToastT > 3) {
        game._gateToastT = now;
        if (game.ui) game.ui.toast(msg, 'bad');
      }
    };
    const canEnter = (dx, dz) => {
      const d = districtAt(dx, dz);
      if (!game.state.unlocked.includes(d.id)) return false;
      if (d.id === 4 && !(game.state.equip.charm && game.state.equip.charm.fam === 'aqua')) return false;
      return true;
    };
    if (!canEnter(nx, nz)) {
      const prev = PLAYABLE.find((z) => z.id === target.id - 1);
      // 포탈로만 가는 구역(10 마계 인천항·13 수원 화성)은 방벽 메시지가 따로 있다
      const portalMsg = target.id === 10
        ? '마계 인천항은 걸어서 갈 수 없어요. 지구 귀환 게이트(북한산 정상 북쪽 끝)로 가야 해요.'
        : target.id === 13
          ? '수원 화성은 걸어서 갈 수 없어요. 마계 관문(영종 마계섬 북쪽 끝)으로 가야 해요.'
          : null;
      blockedMsg(!game.state.unlocked.includes(target.id)
        ? (portalMsg || (prev ? `${prev.name} 보스를 처치해야 방벽이 열려요.` : '아직 갈 수 없는 구역이에요.'))
        : '한강 심해 유적에 들어가려면 수중호흡 아티팩트가 필요해요.');
      if (canEnter(nx, p.z)) p.x = nx;
      if (canEnter(p.x, nz)) p.z = nz;
    } else {
      p.x = nx; p.z = nz;
    }
    p.facing = Math.atan2(mx, mz);
    p.walkT += dt * 9;
  } else {
    p.walkT += dt * 2;
  }
  // 전투 중에는 이동 방향과 무관하게 교전 대상을 바라본다 (스트레이프)
  const W = game.weapon(game.state.equip.weapon ? game.state.equip.weapon.fam : 'sword');
  const watchRange = Math.max(4.2, W.range + 1.6);
  const foe = nearestEnemy(watchRange, 6.28, p.facing);
  if (foe) {
    p.target = foe;
    p.combatT = Math.max(p.combatT || 0, 0.5);
    p.facing = Math.atan2(foe.x - p.x, foe.z - p.z);
  }
  if (p.combatT > 0) p.combatT -= dt;
  if (game.tutorialHook && Math.hypot(p.x - beforeX, p.z - beforeZ) > 0.02) game.tutorialHook('move');
  // 캐릭터 애니메이션 (탑뷰 도트 프레임 · 무기 계열별 모션)
  const m = game.playerMesh;
  p.__cam = camera;
  m.position.set(p.x, groundY(p.x, p.z), p.z);
  if (!m.userData.isHeroSprite) m.rotation.y = p.facing;
  if (m.userData.animate) m.userData.animate(p, dt);
  else animateArm(p, m, dt);
}

// 무기별 공격 모션: 검 가로 베기 · 단검 찌르기 · 도끼/둔기 내려찍기 · 활/석궁 조준 · 지팡이/책 시전
// — 모션이 작아 폰에서 안 보인다는 피드백을 받아, 무기마다 크게 다르게 과장했다.
// — 무기를 바꿔 들면 0.45초간 플러리시(무기 들어올려 한 바퀴 돌리기)가 뜬다 (p.switchT).
//
// 휘두르기 재설계 (2026-11-25): 예전 모션은 세 가지가 어색했다.
//  1) 시작·끝 자세가 휴식 자세(0,0)가 아니라서 휘두르기 첫 프레임과 마지막 프레임에 팔이 텔레포트했다
//     (검 rx -0.3/rz -1.1, 도끼 rx -2.9, 지팡이 rx -1.2, 활 rx -1.45에서 시작).
//  2) Math.sin(k*PI) 대칭 범프라 나갔다가 정확히 같은 길을 되돌아왔다 — 팔로우스루가 없어 휘두른 게 아니라
//     휘젓는 것처럼 보였다.
//  3) 데미지·이펙트는 k=0에 나가는데 시각적 타격은 k=0.5에 정점을 찍어 어긋났다.
// 그래서 모든 곡선은 휴식 자세에서 시작해 휴식 자세로 끝나고,
// 타격 → 팔로우스루(같은 방향으로 계속) → 회복 순서의 3단계 키프레임으로 바꿨다.
// 데미지·이펙트가 k=0에 나가므로 타격 단계는 앞쪽에 몰아 빠르게 친다.
// 공격 중에는 다리를 멈추고 디딤 자세를 잡는다 (걷기 스윙이 휘두르는 동안 계속되지 않게).
function animateArm(p, m, dt) {
  const armR = m.userData.armR;
  const armL = m.userData.armL;
  if (!armR) return;
  const fam = p.atkFam || 'sword';
  const k = p.atkAnim > 0 ? 1 - p.atkAnim / (p.atkAnimMax || 0.22) : 1;
  const on = p.atkAnim > 0;
  const sw = p.switchT > 0 ? 1 - p.switchT / 0.45 : 0; // 무기 교체 플러리시 진행도 (0→1)
  const swOn = sw > 0 && sw < 1;
  // 구간 이징: eoc 빠르게 시작해 느리게 끝 (타격), eiq 느리게 시작해 가속 (내려찍기), sm 부드러운 회복
  const eoc = (t) => 1 - Math.pow(1 - t, 3);
  const eiq = (t) => t * t;
  const sm = (t) => t * t * (3 - 2 * t);
  // 키프레임 보간: stops = [진행도, 값, 구간 이징]. 첫 값과 마지막 값은 항상 0(휴식 자세)이다.
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
  let rx = 0, rz = 0, lx = 0;
  if (swOn) {
    // 플러리시: 오른팔을 높이 들고 무기를 한 바퀴 돌린다 (그대로 유지)
    rx = -2.3 * Math.sin(sw * Math.PI);
    rz = -0.6 * Math.sin(sw * Math.PI);
    lx = -0.5 * Math.sin(sw * Math.PI);
  } else if (on) {
    if (fam === 'dagger') {
      // 찌르기: 빠르게 전진 찌르기 → 뻗은 채 잠깐 유지 → 거두기
      rx = kf([[0, 0], [0.28, -0.5, eoc], [0.55, -0.5, sm], [1, 0, sm]]);
      rz = kf([[0, 0], [0.28, 0.15, eoc], [0.55, 0.15, sm], [1, 0, sm]]);
    } else if (fam === 'axe' || fam === 'mace') {
      // 내려찍기: 빠르게 들어올리기 → 가속하며 내리찍기 → 팔로우스루 → 회복
      rx = kf([[0, 0], [0.18, -2.4, eoc], [0.45, 0.9, eiq], [0.7, 0.5, sm], [1, 0, sm]]);
      rz = 0;
    } else if (fam === 'bow') {
      // 활: 빠르게 당기기 → 놓는 반동 → 내리기 (화살은 k=0에 이미 나간다)
      rx = kf([[0, 0], [0.2, -1.45, eoc], [0.35, -1.25, eoc], [1, 0, sm]]);
      lx = kf([[0, 0], [0.2, -1.15, eoc], [0.35, -1.0, eoc], [1, 0, sm]]);
    } else if (fam === 'crossbow') {
      // 석궁: 활보다 빠르게 당기고 놓기 (연사)
      rx = kf([[0, 0], [0.25, -1.3, eoc], [0.4, -1.05, eoc], [1, 0, sm]]);
      lx = kf([[0, 0], [0.25, -1.0, eoc], [0.4, -0.9, eoc], [1, 0, sm]]);
    } else if (fam === 'staff' || fam === 'book') {
      // 시전: 지팡이/책을 빠르게 들어올리기 → 시전 맥박 → 내리기
      rx = kf([[0, 0], [0.25, -1.6, eoc], [0.45, -1.2, eoc], [1, 0, sm]]);
      rz = kf([[0, 0], [0.25, 0.35, eoc], [0.45, 0.15, eoc], [1, 0, sm]]);
    } else {
      // 검: 빠르게 가로 베기 → 반대쪽으로 더 넘어가는 팔로우스루 → 회복
      rx = kf([[0, 0], [0.32, -1.1, eoc], [0.62, -0.7, sm], [1, 0, sm]]);
      rz = kf([[0, 0], [0.32, 1.5, eoc], [0.62, 1.75, sm], [1, 0, sm]]);
    }
  }
  armR.rotation.x = rx + (p.moving && !on ? Math.sin(p.walkT) * 0.2 : 0);
  armR.rotation.z = rz;
  if (armL) armL.rotation.x = lx + (p.moving && !on ? -Math.sin(p.walkT) * 0.2 : 0);
  // 3D 휴머노이드 걷기·공격 모션 (userData에 다리·몸통·무기그룹이 있을 때만)
  const legL = m.userData.legL, legR = m.userData.legR;
  const body = m.userData.body, weaponGroup = m.userData.weaponGroup;
  // 공격 중에는 다리를 디딤 자세로 고정한다 (휘두르는 동안 걷기 스윙이 계속되면 어색하다)
  const walkSwing = (p.moving && !on) ? Math.sin(p.walkT) * 0.6 : 0;
  if (legL) legL.rotation.x = on ? 0.12 : walkSwing;
  if (legR) legR.rotation.x = on ? -0.12 : -walkSwing;
  let bobY = (p.moving && !on) ? Math.abs(Math.sin(p.walkT)) * 0.05 : Math.sin(game.time * 2.1) * 0.012;
  let lungeZ = 0, leanX = 0, wgX = 0, wgZ = 0, wgY = 0, twistY = 0, wgSpin = 0, dropY = 0;
  if (swOn && weaponGroup) {
    wgY = Math.sin(sw * Math.PI) * 0.3;
    wgSpin = sw * Math.PI * 2;
  } else if (on && weaponGroup) {
    if (fam === 'dagger') {
      // 찌르기: 몸통 깊게 돌진 + 무기 전진 + 몸 비틀기 (타격 → 유지 → 회복)
      lungeZ = kf([[0, 0], [0.28, 0.45, eoc], [0.55, 0.45, sm], [1, 0, sm]]);
      wgZ = kf([[0, 0], [0.28, 0.6, eoc], [0.55, 0.6, sm], [1, 0, sm]]);
      twistY = kf([[0, 0], [0.28, 0.3, eoc], [0.55, 0.3, sm], [1, 0, sm]]);
    } else if (fam === 'axe' || fam === 'mace') {
      // 내려찍기: 무기 뒤로 젖혔다 앞으로 휘두르기 + 몸통 깊게 숙이기 + 내려앉기
      wgX = kf([[0, 0], [0.18, 0.9, eoc], [0.45, -1.2, eiq], [0.7, -0.6, sm], [1, 0, sm]]);
      leanX = kf([[0, 0], [0.18, -0.12, eoc], [0.45, 0.3, eiq], [0.7, 0.15, sm], [1, 0, sm]]);
      dropY = kf([[0, 0], [0.18, 0, sm], [0.45, 0.09, eiq], [0.7, 0.04, sm], [1, 0, sm]]);
    } else if (fam === 'staff' || fam === 'book') {
      // 시전: 무기 높이 들어올리기
      wgY = kf([[0, 0], [0.25, 0.35, eoc], [0.45, 0.2, eoc], [1, 0, sm]]);
    } else if (fam === 'sword') {
      // 베기: 무기 크게 가로 휘두르기 + 몸통 비틀기 + 살짝 돌진 (팔로우스루까지)
      wgZ = kf([[0, 0], [0.32, 0.95, eoc], [0.62, 1.1, sm], [1, 0, sm]]);
      twistY = kf([[0, 0], [0.32, 0.55, eoc], [0.62, 0.35, sm], [1, 0, sm]]);
      lungeZ = kf([[0, 0], [0.32, 0.15, eoc], [0.62, 0.05, sm], [1, 0, sm]]);
    }
  }
  if (body) {
    body.position.y = (body.userData.baseY || 0) + bobY - dropY;
    body.position.z = lungeZ;
    body.rotation.x = leanX;
    body.rotation.y = twistY;
  }
  if (weaponGroup) {
    weaponGroup.rotation.x = wgX;
    weaponGroup.rotation.z = wgZ;
    weaponGroup.rotation.y = wgSpin;
    weaponGroup.position.y = -0.48 + wgY;
  }
}

function nearestEnemy(range, arc, facing) {
  let best = null, bestD = 1e9;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    if (e.statue || (e.flyY || 0) > 1) continue; // 석상·비행 중인 보스는 노리지 않는다
    const dx = e.x - game.player.x, dz = e.z - game.player.z;
    const dd = Math.hypot(dx, dz);
    if (dd > range + e.radius) continue;
    if (arc < 6) {
      const a = Math.atan2(dx, dz);
      if (angleDiff(a, facing) > arc / 2 + 0.25) continue;
    }
    if (dd < bestD) { bestD = dd; best = e; }
  }
  return best;
}

function playerAttack() {
  const s = game.state;
  const fam = s.equip.weapon ? s.equip.weapon.fam : 'sword';
  const W = game.weapon(fam);
  const d = game.derived();
  const p = game.player;
  if (p.stunT > 0) return false; // 기절 중에는 공격하지 않는다
  let target = nearestEnemy(W.range + 1.2, 6.28, p.facing) || nearestEnemy(W.range, W.arc, p.facing);
  if (!target) return false;
  const a = Math.atan2(target.x - p.x, target.z - p.z);
  p.facing = a;
  p.target = target;
  p.combatT = 1.4;
  const F = ctx.ATTACK_FX[fam] || ctx.ATTACK_FX.sword;
  p.atkAnimMax = F.anim;
  p.atkAnim = F.anim;
  p.atkKind = F.kind;
  p.atkFam = fam;
  const dmgBase = d.attack * W.mult;
  game.lastAttack = { fam, kind: F.kind, at: game.time };
  if (game.tutorialHook) game.tutorialHook('attack');
  if (W.projectile) {
    const style = fam === 'bow' ? 'arrow' : fam === 'crossbow' ? 'bolt' : fam === 'staff' ? 'orb' : 'orb';
    ctx.spawnProjectile({
      from: 'player', x: p.x, y: 1.1, z: p.z, targetX: target.x, targetZ: target.z,
      speed: fam === 'crossbow' ? 22 : fam === 'bow' ? 19 : 15,
      color: fam === 'staff' ? 0xb58cff : fam === 'book' ? 0x9ff0ff : 0xffd27f,
      dmg: dmgBase, range: W.range + 1, style,
    });
    ctx.weaponSwingFx(fam, p, a, W, []);
  } else {
    const hits = [];
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const dd = Math.hypot(e.x - p.x, e.z - p.z);
      if (dd > W.range + e.radius) continue;
      if (angleDiff(Math.atan2(e.x - p.x, e.z - p.z), a) > W.arc / 2 + 0.22 && W.arc < 6) continue;
      hits.push(e);
      game.dealDamage(e, dmgBase, { heavy: fam === 'axe' || fam === 'mace' });
    }
    ctx.weaponSwingFx(fam, p, a, W, hits);
    // 검: 확률 추가타 (두 번째 휘두르기 모션과 함께 0.15초 뒤에 들어간다) / 둔기: 확률 기절
    if (hits.length) {
      if (W.extra && Math.random() < W.extra) {
        const t = hits[0];
        if (t.alive) p.extraSwing = { t, dmg: dmgBase * 0.6, fam, at: game.time + 0.15 };
      }
      if (W.stun && Math.random() < W.stun) {
        for (const t of hits) if (t.alive) { t.stunT = 1.2; ctx.stunStars(t.x, groundY(t.x, t.z) + t.headY + 0.4, t.z, 1.2); ctx.specialHit(t, 'stun'); }
      }
    }
  }
  p.atkCd = W.cd / d.atkSpeed;
  return true;
}
  // 다른 모듈에서 부른다 (systems step/frame, enemies)
  ctx.movePlayer = movePlayer;
  ctx.animateArm = animateArm;
  ctx.nearestEnemy = nearestEnemy;
  ctx.playerAttack = playerAttack;
}
