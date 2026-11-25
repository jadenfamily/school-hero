// 스쿨히어로 — 능력치·메달·퀘스트 정보 (game.js에서 분리)
// game.derived / game.weapon / game.itemStats / 코스튬 / 메달 / 퀘스트 조회.
// game.balance 초기화는 loadState() 뒤에 와야 해서 game.js에 남겨둔다.
import { clamp } from './util.js';
import {
  WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, GRADES,
  MEDAL_TIERS, MEDAL_STEP, TALENTS,
  COSTUMES, COSTUME_MAP, COSTUME_MAX_LEVEL, costumeLevelMult,
  itemOptions, PLAYABLE,
} from '../data.js';

export function installStats(ctx) {
  const { game } = ctx;

game.weapon = function (id) {
  const base = WEAPONS[id] || WEAPONS.sword;
  const ov = (game.balance.weapons || {})[base.id] || {};
  return { ...base, ...ov };
};

game.itemStats = function (it) {
  if (!it) return { atk: 0, def: 0, hp: 0 };
  if (it.kind === 'weapon') {
    const w = game.weapon(it.fam);
    return { atk: Math.round((game.balance.items.weaponAtk[it.grade] || 0) * (w.atkScale || 1)), def: 0, hp: 0 };
  }
  if (it.kind === 'armor') return { atk: 0, def: game.balance.items.armorDef[it.grade] || 0, hp: 0 };
  return { atk: 0, def: 0, hp: 0 };
};

game.itemOptions = function (it) {
  return it ? itemOptions(it.kind, it.fam, it.grade) : [];
};

game.optionTotals = function () {
  const eq = game.state.equip;
  const t = { atkPct: 0, defPct: 0, hpPct: 0, crit: 0, critDmg: 0, evade: 0, moveSpeed: 0, resist: 0 };
  for (const slot of ['weapon', 'armor', 'necklace', 'ring', 'earring']) {
    for (const o of game.itemOptions(eq[slot])) if (t[o.k] !== undefined) t[o.k] += o.v;
  }
  return t;
};

// 코스튬 레벨 (미보유 0, 보유 시 1~5)
game.costumeLevel = function (id) {
  const ap = game.state.appearance || {};
  if (!(ap.unlocked || []).includes(id)) return 0;
  return Math.min(COSTUME_MAX_LEVEL, Math.max(1, (ap.costumeLv && ap.costumeLv[id]) || 1));
};
// 해당 레벨에서의 코스튬 스탯 (미보유면 Lv.1 미리보기 수치)
game.costumeScaledStats = function (id) {
  const c = COSTUME_MAP[id];
  const out = {};
  if (!c || !c.stats) return out;
  const m = costumeLevelMult(game.costumeLevel(id) || 1);
  for (const [k, v] of Object.entries(c.stats)) out[k] = Math.max(1, Math.round(v * m));
  return out;
};
// 보유한 코스튬의 수집 보너스 (착용 여부와 무관하게 영구 합산, 레벨별 배율 적용)
game.costumeBonus = function () {
  const t = { atkPct: 0, defPct: 0, hpPct: 0, crit: 0, critDmg: 0, evade: 0, moveSpeed: 0, mpPct: 0, cdr: 0 };
  const ap = game.state.appearance || { unlocked: [] };
  for (const id of ap.unlocked || []) {
    const st = game.costumeScaledStats(id);
    for (const [k, v] of Object.entries(st)) if (t[k] !== undefined) t[k] += v;
  }
  return t;
};
// 뽑기 가능 여부: 최대 레벨이 아닌 코스튬이 하나라도 있으면 뽑을 수 있다
game.costumePoolStatus = function () {
  const eligible = COSTUMES.filter((c) => game.costumeLevel(c.id) < COSTUME_MAX_LEVEL);
  return { eligible: eligible.length, total: COSTUMES.length, allMaxed: eligible.length === 0 };
};

game.derived = function () {
  const s = game.state;
  const eq = s.equip;
  const w = game.weapon(eq.weapon ? eq.weapon.fam : 'sword');
  const wa = game.itemStats(eq.weapon).atk;
  const ad = game.itemStats(eq.armor).def;
  const opt = game.optionTotals();
  const cos = game.costumeBonus();
  const cls = eq.weapon ? (WEAPONS[eq.weapon.fam] || WEAPONS.sword).cls : 'melee';
  let baseAtk;
  if (cls === 'magic') baseAtk = 9 + s.stats.int * 2.0;
  else if (cls === 'ranged') baseAtk = 8 + s.stats.dex * 1.7 + s.stats.str * 0.5;
  else if (eq.weapon) baseAtk = 10 + s.stats.str * 1.9 + s.stats.dex * 0.6;
  else baseAtk = 6 + s.stats.str * 0.8;
  // 특성 보너스: 해금한 특성의 effect를 키별로 합산 (10페이지 특성)
  const tal = { atkPct: 0, maxHpPct: 0, crit: 0, critDmg: 0, atkSpeedPct: 0, moveSpeedPct: 0, magnetPct: 0, regen: 0, lootPct: 0, defPct: 0, evade: 0, mpPct: 0 };
  let talAutoloot = false;
  for (const id of s.talents) {
    const t = TALENTS.find((x) => x.id === id);
    if (!t || !t.effect) continue;
    if (t.effect.key === 'autoloot') talAutoloot = true;
    else if (tal[t.effect.key] !== undefined) tal[t.effect.key] += t.effect.value;
  }
  const atkBonus = (1 + tal.atkPct / 100) * (1 + (opt.atkPct + cos.atkPct) / 100);
  const hpMul = (1 + tal.maxHpPct / 100) * (1 + (opt.hpPct + cos.hpPct) / 100);
  const maxHp = Math.round((100 + s.stats.vit * 9 + s.level * 12) * hpMul);
  const attack = Math.round((baseAtk + wa) * atkBonus);
  const defense = Math.round((2 + s.stats.vit * 0.55 + ad) * (1 + (opt.defPct + cos.defPct + tal.defPct) / 100));
  return {
    maxHp,
    maxMp: Math.round((40 + s.stats.int * 7) * (1 + (cos.mpPct + tal.mpPct) / 100)),
    attack,
    baseAtk: Math.round(baseAtk),
    weaponAtk: wa,
    cls,
    weapon: w,
    attackRange: w.range,
    attackCd: w.cd,
    defense,
    critChance: Math.min(0.85, 0.05 + s.stats.dex * 0.003 + tal.crit / 100 + (opt.crit + cos.crit + (w.crit ? w.crit * 100 : 0)) / 100),
    critDmg: 1.5 + s.stats.dex * 0.004 + tal.critDmg / 100 + (opt.critDmg + cos.critDmg) / 100,
    evade: Math.min(0.45, s.stats.dex * 0.0022 + (opt.evade + cos.evade + tal.evade) / 100),
    atkSpeed: (1 + s.stats.dex * 0.004) * (1 + tal.atkSpeedPct / 100),
    moveSpeed: 4.6 * (1 + tal.moveSpeedPct / 100) * (1 + (opt.moveSpeed + cos.moveSpeed) / 100) * (s.zone === 4 ? 0.92 : 1),
    magnet: 3.2 * (1 + tal.magnetPct / 100),
    autoloot: talAutoloot,
    regen: tal.regen,
    lootBonus: 1 + tal.lootPct / 100,
    armorResist: eq.armor ? eq.armor.fam : null,
    resist: opt.resist,
    opt,
    costume: cos,
    cdr: cos.cdr || 0,
  };
};

game.xpNeed = (lv) => Math.floor(16 * Math.pow(lv, 1.35)) + 12;
game.data = { WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, GRADES };

// ---------- 메달 ----------
game.medalInfo = function (zoneId) {
  const kills = game.state.zoneKills[zoneId] || 0;
  let tier = 0;
  for (let i = 0; i < MEDAL_TIERS.length; i++) if (kills >= MEDAL_TIERS[i]) tier = i + 1;
  const prev = tier === 0 ? 0 : MEDAL_TIERS[tier - 1];
  const next = tier >= MEDAL_TIERS.length ? null : MEDAL_TIERS[tier];
  const last = MEDAL_TIERS[MEDAL_TIERS.length - 1];
  const ratio = tier >= MEDAL_TIERS.length ? 1 : clamp(kills / last, 0, 1);
  return { kills, tier, bonus: +(tier * MEDAL_STEP).toFixed(2), ratio, next, max: MEDAL_TIERS.length };
};

game.chestInfo = function (zoneId) {
  const zone = PLAYABLE.find((z) => z.id === zoneId);
  const total = zone ? zone.chests.length : 0;
  const found = game.state.chestOpened.filter((k) => k.startsWith(zoneId + ':')).length;
  return { found, total };
};

game.questInfo = function (zoneId) {
  const zone = PLAYABLE.find((z) => z.id === zoneId);
  if (!zone) return null;
  const q = game.state.quests[zoneId] || { step: 0, progress: 0, accepted: false, done: false };
  return { def: zone.quests, ...q, zone };
};

// 현재 구역의 활성 보스 처치 퀘스트가 가리키는 보스 (월드 좌표)
// 'boss'/'mid' 단계만 해당. 단계 텍스트가 보스 이름을 포함하면 그 보스,
// 없으면 단계 타입과 같은 보스, 그래도 없으면 구역 에픽 보스.
// 보스가 죽어 리스폰 대기 중이어도 스폰 위치를 가리킨다 (거기서 다시 나타난다).
game.questBossTarget = function () {
  const zone = game.zone;
  if (!zone) return null;
  const q = game.questInfo(zone.id);
  if (!q || !q.accepted || q.done) return null;
  const step = q.def.steps[q.step];
  if (!step || (step.type !== 'boss' && step.type !== 'mid')) return null;
  if (q.progress >= step.n) return null; // 단계 완료 — 보상 받으러 NPC에게
  const defs = ctx.allBossDefs(zone);
  const name = step.text.replace(/\s*처치\s*$/, '');
  const hit = defs.find((b) => b.name === name)
    || defs.find((b) => b.type === step.type)
    || defs.find((b) => b.type === 'boss')
    || defs[0];
  if (!hit) return null;
  return { name: hit.name, x: hit.x, z: hit.z, type: hit.type };
};
}
