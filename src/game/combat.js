// 스쿨히어로 — 전투·몹 스폰·전리품·관리자 (game.js에서 분리)
// enemyLevel / scaledMobLevel / spawnEnemy / rollGrade / itemName /
// addItem / gradeOf / mobStats / isAdmin / enableAdmin / disableAdmin /
// setBalance / resetBalance / dropLoot / pickKind / pickFam / addPickup /
// elemMult / dealDamage / hitSpark / killEnemy / bossDefeated / questKill / gainXp.
import { clamp, groundY, fmtNum } from './util.js';
import { makeMonster } from '../world.js';
import {
  PLAYABLE, GRADES, WEAPONS, WEAPON_BASE, ARMOR_KINDS, ACCESSORY_KINDS,
  GRADE_ADJ, MOB_REWARD, ELEM_BEATS, BOSS_TIMER,
} from '../data.js';
import { fmtRemain } from './util.js';

export function installCombat(ctx) {
  const { game, THREE, scene } = ctx;

function enemyLevel(def, zone) {
  return Math.max(1, zone.scale.lvl + (def.boss === 'field' ? 5 : def.boss === 'boss' ? 3 : def.boss === 'mid' ? 1 : def.elite ? 1 : 0));
}

// 필드몹 동적 레벨 — 일반/정예만 주인공 레벨을 따라간다 (보스는 고정 레벨)
// effective = max(구역 기본 레벨, 주인공 레벨 - 3). 구역 기본보다 낮아지지는 않는다.
const MOB_SCALE_GAP = 3;            // 주인공보다 최대 3레벨 아래까지만
const MOB_SCALE_HP_PER_LV = 0.08;   // 레벨당 체력 +8%
const MOB_SCALE_ATK_PER_LV = 0.06;  // 레벨당 공격력 +6%
const MOB_SCALE_REWARD_PER_LV = 0.10; // 레벨당 경험치·골드 +10%
function scaledMobLevel(def, zone) {
  const base = enemyLevel(def, zone);
  if (def.boss) return base; // 중간/에픽/필드 보스는 고정 레벨
  const heroLv = (game.state && game.state.level) || 1;
  return Math.max(base, heroLv - MOB_SCALE_GAP);
}
game.scaledMobLevel = scaledMobLevel;

function spawnEnemy(def, x, z, fixed = false) {
  const zone = game.zone;
  const mesh = makeMonster(THREE, def);
  mesh.position.set(x, groundY(x, z), z);
  scene.add(mesh);
  const lvl = scaledMobLevel(def, zone);
  const ov = game.mobStats(zone.id, def);
  const hp = Math.round(ov.hp);
  const e = {
    def, mesh, x, z, home: { x, z }, hp, maxHp: hp,
    atk: ov.atk, speed: def.speed, radius: mesh.userData.radius || 0.5,
    stunT: 0, slowT: 0, tauntT: 0, heroHit: false, reward: { xp: ov.xp, gold: ov.gold },
    headY: mesh.userData.headY || 1, state: 'idle', wanderT: Math.random() * 2,
    wander: { x, z }, atkCd: 1 + Math.random(), hitFlash: 0, alive: true,
    isBoss: def.boss === 'boss', isMid: def.boss === 'mid', isField: def.boss === 'field',
    elite: !!def.elite,
    level: lvl, tag: null, floatT: Math.random() * 6, telegraphT: 9 + Math.random() * 4,
    skillCd: 2.5 + Math.random() * 2.5,
    summonDone: false, splitDone: false, chargeCd: 5 + Math.random() * 3, charge: null,
    pattern: def.pattern || (def.boss ? (ctx.BOSS_PATTERN[def.shape] || 'nova') : null),
    timerType: def.timerType || null,
    group: def.group || null,
    statue: !!def.statue,
    shielded: false, shieldMesh: null, flyY: 0, dragonPhase: null, dragonT: 0,
    baseAtk: ov.atk, baseSpeed: def.speed, enrageStacks: 0, enrageT: 0,
    patternCd: 6 + Math.random() * 4, weaponCd: 5 + Math.random() * 3,
    splitStage: 0, necroWave: 0, necroT: 9, portalAdds: null, portalT: 0, buffOn: false,
    twinSwapT: 8,
    deadT: 0, facing: Math.PI, fixed,
    targetType: 'player', targetComp: null, leashing: false, knockT: 0,
  };
  mesh.userData.ref = e;
  // 쌍둥이는 보호막 구체를 달고 다닌다 (켜진 쪽만 보인다)
  if (def.group === 'twins') {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0.22, depthWrite: false }));
    sh.position.y = 1.3;
    sh.visible = false;
    mesh.add(sh);
    e.shieldMesh = sh;
  }
  // 석상 상태의 3형제는 돌빛으로 보인다
  if (e.statue && mesh.userData.setColorTint) mesh.userData.setColorTint(0x8f8f8f);
  // 탱커가 근처에 있으면 등장 순간부터 탱커가 어그로를 잡는다
  if (game.tank && game.tank.hp > 0 && !def.boss && Math.hypot(x - game.tank.x, z - game.tank.z) < 9) e.targetType = 'tank';
  game.enemies.push(e);
  if (game.ui) game.ui.attachEnemyTag(e);
  return e;
}
game.spawnEnemy = spawnEnemy;

// ---------- 전투 ----------
function rollGrade(zone, minGrade = 0) {
  const w = zone.dropW;
  let total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total, g = 0;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { g = i; break; } }
  return Math.max(minGrade, Math.min(5, g));
}

function itemName(kind, fam, grade) {
  if (kind === 'weapon') return `${GRADE_ADJ[grade]} ${WEAPON_BASE[fam] || '무기'}`;
  if (kind === 'armor') return `${GRADE_ADJ[grade]} ${ARMOR_KINDS[fam] ? ARMOR_KINDS[fam].name : '방어구'}`;
  if (kind === 'accessory') return `${GRADE_ADJ[grade]} ${ACCESSORY_KINDS[fam] ? ACCESSORY_KINDS[fam].name : '악세서리'}`;
  return `${GRADE_ADJ[grade]} 수호 부적`;
}
game.itemName = itemName;

game.addItem = function (kind, fam, grade, n = 1) {
  // 방어: 종류에 없는 fam이면 가방에 절대 넣지 않는다 (잘못된 드롭이 생겨도 무효 처리)
  const table = kind === 'weapon' ? WEAPONS : kind === 'armor' ? ARMOR_KINDS : kind === 'accessory' ? ACCESSORY_KINDS : null;
  if (!table || !table[fam]) return null;
  const key = `${kind}:${fam}:${grade}`;
  game.state.bag[key] = (game.state.bag[key] || 0) + n;
  return key;
};

game.gradeOf = (key) => GRADES[parseInt(key.split(':')[2], 10)];

game.mobStats = function (zoneId, def) {
  const zone = PLAYABLE.find((z) => z.id === zoneId) || game.zone;
  const role = def.boss === 'boss' ? 'boss' : def.boss === 'mid' ? 'mid' : def.elite ? 'elite' : 'normal';
  const r = MOB_REWARD[role];
  const ov = (game.balance.mobs || {})[`${zoneId}:${def.key}`] || {};
  const base = {
    hp: typeof ov.hp === 'number' ? ov.hp : def.hp,
    atk: typeof ov.atk === 'number' ? ov.atk : def.atk,
    xp: typeof ov.xp === 'number' ? ov.xp : Math.round(r.xp * zone.scale.xp),
    gold: typeof ov.gold === 'number' ? ov.gold : Math.round(r.gold * zone.scale.gold),
  };
  // 필드몹(일반/정예)은 주인공 레벨을 따라 강해진다 — 보스는 dLvl 0이라 그대로.
  // 스폰·처치 보상·드롭 골드가 모두 이 함수를 거치므로 한 번만 적용하면 일관된다.
  const dLvl = scaledMobLevel(def, zone) - enemyLevel(def, zone);
  if (dLvl <= 0) return base;
  return {
    hp: Math.round(base.hp * (1 + MOB_SCALE_HP_PER_LV * dLvl)),
    atk: Math.round(base.atk * (1 + MOB_SCALE_ATK_PER_LV * dLvl)),
    xp: Math.round(base.xp * (1 + MOB_SCALE_REWARD_PER_LV * dLvl)),
    gold: Math.round(base.gold * (1 + MOB_SCALE_REWARD_PER_LV * dLvl)),
  };
};

// ---------- 관리자(밸런스 편집 권한) ----------
// 계정 아이디가 관리자 목록에 있거나, 설정 → 계정에서 관리자 코드를 등록한 경우에만
// 무기·아이템·몬스터 밸런스 수치를 수정할 수 있다. 게임 진행에는 영향이 없다.
const ADMIN_IDS = ['jaden', 'admin', 'parent'];
const ADMIN_CODE = 'jaden-family';
game.adminIds = ADMIN_IDS;
game.adminCode = ADMIN_CODE;
game.isAdmin = function () {
  const store = game.store || {};
  const id = String(store.userId || '').toLowerCase();
  if (store.mode === 'account' && ADMIN_IDS.includes(id)) return true;
  try {
    if (localStorage.getItem('sh.admin') === ADMIN_CODE) return true;
  } catch (e) { /* 저장 공간을 못 쓰면 계정 기준으로만 판단 */ }
  return false;
};
game.enableAdmin = function (code) {
  if (String(code || '').trim() !== ADMIN_CODE) return false;
  try { localStorage.setItem('sh.admin', ADMIN_CODE); } catch (e) { return false; }
  if (game.ui) game.ui.markDirty(true);
  return true;
};
game.disableAdmin = function () {
  try { localStorage.removeItem('sh.admin'); } catch (e) { /* 무시 */ }
  if (game.ui) game.ui.markDirty(true);
  return true;
};

game.setBalance = function (next) {
  if (!game.isAdmin()) return false;
  game.balance = next;
  game.state.balance = next;
  game.save();
  game.flushSave();
  if (game.ui) game.ui.markDirty(true);
  return true;
};
game.resetBalance = function () {
  if (!game.isAdmin()) return false;
  game.balance = defaultBalance();
  game.state.balance = game.balance;
  game.save();
  game.flushSave();
  if (game.ui) game.ui.markDirty(true);
  return true;
};

function dropLoot(e) {
  const zone = game.zone;
  // 등급별 보상 개편
  // 일반: 경험치 + 일반 영혼 / 정예(녹색): 녹색 등급 장비 1개 + 정예 영혼
  // 중간보스(파랑): 파란 영혼 + 파란 등급 장비 1개 / 에픽보스(보라): 보라 영혼 + 보라 등급 장비 1개
  // 지역 필드보스(노랑): 특수(지역 보스) 영혼 + 노란 등급 장비 1개
  if (!e.elite && !e.isMid && !e.isBoss && !e.isField) {
    addPickup('soul', e.x, e.z, 'gray');
    return;
  }
  addPickup('gold', e.x, e.z, Math.max(1, Math.round(game.mobStats(zone.id, e.def).gold * (0.85 + Math.random() * 0.3))));
  // 종류는 한 번만 뽑아서 fam도 같은 종류에서 뽑는다 (두 번 뽑으면 종류·fam이 어긋나 무효 아이템이 된다)
  const kind = pickKind();
  const fam = pickFam(kind);
  if (e.isField) {
    addPickup('soul', e.x, e.z, 'gold');
    addPickup('item', e.x, e.z, { kind, fam, grade: 4 });
  } else if (e.isBoss) {
    addPickup('soul', e.x, e.z, 'purple');
    addPickup('item', e.x, e.z, { kind, fam, grade: 3 });
  } else if (e.isMid) {
    addPickup('soul', e.x, e.z, 'blue');
    addPickup('item', e.x, e.z, { kind, fam, grade: 2 });
  } else if (e.elite) {
    addPickup('soul', e.x, e.z, 'green');
    // 반복 처치해도 항상 녹색(고급) 등급 장비 1개
    addPickup('item', e.x, e.z, { kind, fam, grade: 1 });
  }
  // 스킬북은 더 이상 떨어지지 않는다 (동료 개편: 스킬 레벨은 중복 뽑기로 올린다).
  // 이미 가진 책은 가방에서 쓸 수 있고, 바닥에 남은 책도 계속 주울 수 있다.
}

function pickKind() {
  const r = Math.random();
  return r < 0.45 ? 'weapon' : r < 0.8 ? 'armor' : 'accessory';
}
function pickFam(kind) {
  if (kind === 'weapon') { const k = Object.keys(WEAPONS); return k[Math.floor(Math.random() * k.length)]; }
  if (kind === 'armor') { const k = Object.keys(ARMOR_KINDS); return k[Math.floor(Math.random() * k.length)]; }
  const k = Object.keys(ACCESSORY_KINDS); return k[Math.floor(Math.random() * k.length)];
}

function addPickup(type, x, z, data) {
  game.pickups.push({ type, x: x + (Math.random() - 0.5) * 1.2, z: z + (Math.random() - 0.5) * 1.2, data, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, t: 0, alive: true });
}

// 속성 상성: 유리 1.5배 · 불리 0.5배
game.elemMult = function (elem, targetElem) {
  if (!elem || !targetElem || elem === targetElem) return 1;
  const beat = ELEM_BEATS[elem] || [];
  const beaten = ELEM_BEATS[targetElem] || [];
  if (beat.includes(targetElem)) return 1.5;
  if (beaten.includes(elem)) return 0.5;
  return 1;
};
game.dealDamage = function (e, baseDmg, opts = {}) {
  if (!e.alive) return 0;
  if (e.statue) return 0; // 석상은 깨지기 전에는 맞지 않는다
  if (e.shielded) {
    if (Math.random() < 0.3 && game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 1) + 0.3, e.z, '보호막!', 'hurt');
    return 0;
  }
  if ((e.flyY || 0) > 1) {
    if (Math.random() < 0.3 && game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 1) + 0.3, e.z, '닿지 않아요', 'hurt');
    return 0;
  }
  const d = game.derived();
  const medal = game.medalInfo(game.zone.id).bonus;
  let dmg = baseDmg * (1 + medal) * (1 + (game.state.level - 1) * 0.02);
  const atkElem = opts.elem || (opts.noElem ? null : (d.weapon && d.weapon.elem)) || null;
  const em = game.elemMult(atkElem, e.def.elem);
  dmg *= em;
  let crit = false;
  if (opts.canCrit !== false && Math.random() < d.critChance) { crit = true; dmg *= d.critDmg; }
  dmg = Math.max(1, Math.round(dmg * (0.9 + Math.random() * 0.2)));
  e.hp -= dmg;
  e.hitFlash = 0.14;
  if (e.mesh && e.mesh.userData.isSprite && e.mesh.userData.hit) e.mesh.userData.hit();
  e.state = 'chase';
  e.leashing = false;
  // 동료가 때린 몹은 그 동료를 노린다 (도발 중이거나 보스급이면 제외 — 보스는 주인공/탱커를 본다)
  if (!e.def.boss && e.tauntT <= 0) {
    const at = opts.attacker;
    if (at && at.hp > 0) {
      if (at === game.tank) { e.targetType = 'tank'; e.targetComp = null; }
      else { e.targetType = 'comp'; e.targetComp = at; }
    } else if (!at) {
      e.targetType = 'player'; e.targetComp = null;
    }
  }
  // 주인공이 직접 때린 몹은 "인식" 상태가 된다 (동료 공격 판단용).
  // opts.attacker가 없으면 주인공 공격이다 (주인공 근접타격·주인공 투사체).
  if (!opts.attacker) e.heroHit = true;
  // 타격감: 짧은 넉백 + 흔들림 + 카메라 진동
  const pl = game.player;
  if (pl && !e.fixed) {
    const kdx = e.x - pl.x, kdz = e.z - pl.z;
    const kd = Math.hypot(kdx, kdz) || 1;
    const kb = e.isBoss ? 0.03 : e.isMid ? 0.09 : 0.3;
    e.x += (kdx / kd) * kb;
    e.z += (kdz / kd) * kb;
    e.knockT = 0.14;
  }
  game.camShake = Math.max(game.camShake, crit ? 0.24 : opts.heavy ? 0.2 : 0.08);
  hitSpark(e.x, (e.headY || 1) * 0.75, e.z, crit ? 0xffd257 : 0xffffff);
  if (crit) ctx.specialHit(e, 'crit');
  game.lastHit = { dmg, crit, at: game.time, heavy: !!opts.heavy, enemy: e.def.key, elem: em };
  if (em !== 1 && game.ui && Math.random() < 0.35) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 1) + 0.3, e.z, em > 1 ? '약점!' : '내성', em > 1 ? 'crit' : 'hurt');
  if (game.ui) {
    game.ui.damageNumber(e.x, groundY(e.x, e.z) + e.headY, e.z, crit ? `${dmg}!` : dmg, crit ? 'crit' : '');
    if (e.isBoss || e.isMid || e.isField) game.ui.updateBossBar(e);
  }
  if (e.hp <= 0) killEnemy(e);
  return dmg;
};

// 작은 충격 반짝임
function hitSpark(x, y, z, color) {
  const m = ctx.fxAlloc(ctx.fxGeo('sphere', 0.16, 7, 5), color, 0.95, { tag: 'hit:spark' });
  m.position.set(x, y, z);
  ctx.addFx(m, 0.18, (fx, k) => {
    m.scale.setScalar(1 + (1 - k) * 2.6);
    m.material.opacity = k;
  }, 'hit:spark');
}

function killEnemy(e) {
  if (!e.alive) return;
  e.alive = false;
  e.deadT = 0;
  // 쌍둥이·3형제처럼 그룹 보스는 전원이 죽어야 보상·타이머·해금이 나간다
  const grp = e.group ? (game.bossGroups[e.group] || []) : null;
  const lastOfGroup = !grp || !grp.some((m) => m.alive);
  if (grp) {
    const alive = grp.filter((m) => m.alive);
    if (alive.length === 1 && alive[0].shielded) { alive[0].shielded = false; ctx.setShieldVisual(alive[0], false); }
  }
  game.state.kills++;
  if (game.tutorialHook) game.tutorialHook('kill');
  const zone = game.zone;
  // 메달
  const before = game.medalInfo(zone.id);
  game.state.zoneKills[zone.id] = (game.state.zoneKills[zone.id] || 0) + 1;
  const after = game.medalInfo(zone.id);
  if (after.tier > before.tier && game.ui) {
    game.ui.toast(`${zone.name} 메달 ${after.tier}등급 달성! 피해·방어 +${Math.round(after.bonus * 100)}%`, 'gold');
    if (game.ui.medalFx) game.ui.medalFx();
  }
  // 퀘스트 진행 (그룹 보스는 전원 처치 시에만)
  if (lastOfGroup) questKill(e);
  // 보상 표기
  const ov = game.mobStats(zone.id, e.def);
  const xp = Math.round(ov.xp);
  game.gainXp(xp);
  game.save();
  const normal = !e.elite && !e.isMid && !e.isBoss && !e.isField;
  if (game.ui) game.ui.rewardText(e.x, e.headY + 0.3, e.z, (normal || !lastOfGroup) ? `+${fmtNum(xp)} XP` : `+${fmtNum(xp)} XP  +${fmtNum(ov.gold)} G`);
  if (lastOfGroup) dropLoot(e);
  // 보스 리스폰 타이머 기록
  const btype = e.timerType || (e.isField ? 'field' : e.isBoss ? 'boss' : e.isMid ? 'mid' : null);
  if (btype && lastOfGroup) {
    game.state.bossTimers = game.state.bossTimers || {};
    game.state.bossTimers[`${zone.id}:${btype}`] = Date.now() + (BOSS_TIMER[btype] || 0);
    game.state.bossKills[btype] = (game.state.bossKills[btype] || 0) + 1;
    game.save(); game.flushSave();
    if (game.ui) game.ui.toast(`${e.def.name} 처치! 다음 등장까지 ${fmtRemain(BOSS_TIMER[btype])}`, 'gold');
    game.addGrave(btype);
  }
  // 사망 연출
  if (e.isField) { game.camShake = 0.9; if (game.ui) game.ui.toast(`${zone.name} 지역 필드보스 처치!`, 'gold'); }
  if (e.isBoss && lastOfGroup) { game.camShake = 0.7; if (game.ui) game.ui.toast(`${e.def.name} 처치!`, 'gold'); }
  if (e.isMid && lastOfGroup && game.ui) game.ui.toast(`${e.def.name} 처치!`, 'gold');
  if (lastOfGroup && (e.isBoss || e.isField)) bossDefeated();
  if (game.ui) game.ui.updateBossBar(lastOfGroup ? null : (grp && grp.find((m) => m.alive)) || null);
}

game.fmtRemain = fmtRemain;

function bossDefeated() {
  const s = game.state;
  const zone = game.zone;
  const next = zone.id + 1;
  if (zone.id === 9 && !s.earthGateOpen) {
    // 9구역 보스 처치 — 지구 귀환 게이트가 열린다 (그 문은 집이 아니라 마계 인천으로 이어진다)
    s.earthGateOpen = true;
    if (game.world) game.world.setEarthGate(true);
    if (game.ui) game.ui.toast('지구 귀환 게이트가 열렸어요! 북한산 정상으로 가 보세요.', 'gold');
  } else if (zone.id === 12 && !s.gyeonggiGateOpen) {
    // 12구역 보스 처치 — 마계 관문이 열린다 (인천을 평정하고, 다음은 경기도)
    s.gyeonggiGateOpen = true;
    if (game.world) game.world.setGyeonggiGate(true);
    if (game.ui) game.ui.toast('마계 관문이 열렸어요! 영종 마계섬 북쪽 끝으로 가 보세요.', 'gold');
  } else if (zone.id === 18) {
    // 마지막 구역 보스 처치 — 더 열릴 구역이 없다 (다음 확장은 추후)
    if (game.ui) game.ui.toast('가평 산호수의 왕을 쓰러뜨렸어요! 판타지 대륙을 모두 평정했어요.', 'gold');
  } else if (next <= 18) {
    game.unlockDistrict(next);
  }
  game.save();
}

// 퀘스트 처치 단계용 교체 몹 타이머 — 같은 종류가 구역에 하나도 없을 때만 10초 뒤에 한 마리 되돌린다 (일반 12초 젠 사이클과 무관, 보스 타이머와 무관)
const questRespawns = [];
function questKill(e) {
  const s = game.state;
  const zone = game.zone;
  const q = s.quests[zone.id];
  if (!q || !q.accepted || q.done) return;
  const step = zone.quests.steps[q.step];
  if (!step) return;
  let advanced = false;
  if (step.type === 'kill') { q.progress = Math.min(step.n, q.progress + 1); advanced = true; }
  else if (step.type === 'mid' && e.isMid) { q.progress = step.n; advanced = true; }
  else if (step.type === 'boss' && e.isBoss) { q.progress = step.n; advanced = true; }
  if (advanced) game.save();
  // 처치 단계: 같은 종류의 몹이 구역에 하나도 남지 않았는데 아직 더 잡아야 하면, 같은 종류를 10초 뒤에 한 마리 되돌린다.
  // (일반 12초 젠 사이클은 건드리지 않는다 — 퀘스트 몹이 없을 때만 적용되는 교체다)
  if (advanced && step.type === 'kill' && q.progress < step.n) {
    const sameAlive = game.enemies.some((m) => m.alive && !m.isBoss && !m.isMid && !m.isField && m.def === e.def);
    if (!sameAlive && !questRespawns.some((r) => r.def === e.def)) {
      questRespawns.push({ def: e.def, t: 10 });
    }
  }
  if (q.progress >= step.n && !q._notified) {
    q._notified = true;
    if (game.ui) game.ui.toast('퀘스트 목표 달성! NPC에게 돌아가 보상을 받으세요.', 'good');
    if (game.ui) game.ui.markDirty(true);
  }
}

game.gainXp = function (n) {
  const s = game.state;
  s.xp += n;
  let leveled = false;
  while (s.xp >= game.xpNeed(s.level)) {
    s.xp -= game.xpNeed(s.level);
    s.level++;
    s.statPts += 2;
    leveled = true;
  }
  if (leveled) {
    const d = game.derived();
    if (game.player) { game.player.hp = d.maxHp; game.player.mp = d.maxMp; }
    if (game.ui) { game.ui.toast(`레벨 업! Lv.${s.level} · 스탯 포인트 +2`, 'gold'); game.ui.levelUpFx(); }
    game.save();
  }
  if (game.ui) game.ui.markDirty();
};
  // 퀘스트몹 리스폰 대기열 — projectiles.updateRespawn이 함께 쓴다
  ctx.questRespawns = questRespawns;
  // 다른 모듈에서 부른다 (zones spawnZoneMobs/updateGraves, enemies, player, companions, systems)
  ctx.enemyLevel = enemyLevel;
  ctx.scaledMobLevel = scaledMobLevel;
  ctx.spawnEnemy = spawnEnemy;
  ctx.rollGrade = rollGrade;
  ctx.itemName = itemName;
  ctx.dropLoot = dropLoot;
  ctx.pickKind = pickKind;
  ctx.pickFam = pickFam;
  ctx.addPickup = addPickup;
  ctx.hitSpark = hitSpark;
  ctx.killEnemy = killEnemy;
  ctx.bossDefeated = bossDefeated;
  ctx.questKill = questKill;
}
