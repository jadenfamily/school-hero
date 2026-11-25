// 스쿨히어로 — 저장 데이터·세이브/로드 (game.js에서 분리)
// defaultState / loadState / mergeState / mergeBalance / serialize /
// applyState / heroName / setHeroName / save / flushSave / resetSave / setAvatar.
// game.state 초기화(game.state = ctx.loadState())는 game.js에 남겨둔다
// (loadState 뒤에 game.balance 초기화가 와야 해서).
import {
  defaultBalance, AVATAR_MAP, avatarOf,
  WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, CHARMS,
  SKILLS, COMPANION_SKILLS, COMPANION_SKILL_POOLS, SKILL_BOOK_SKILL,
  COSTUME_MAP, COSTUME_MAX_LEVEL,
} from '../data.js';

export function installState(ctx) {
  const { game } = ctx;

// ---------- 저장 데이터 ----------
const defaultState = () => ({
  v: 2,
  level: 1, xp: 0, statPts: 0, gold: 60,
  stats: { str: 5, dex: 5, vit: 5, int: 5 },
  hp: 0,
  avatar: 'boyA',
  avatarPicked: false,
  heroName: '',
  bag: {},      // "kind:fam:grade": count
  equip: { weapon: null, armor: null, necklace: null, ring: null, earring: null, charm: null },
  charms: [], // 보유한 부적 fam 목록 ('antidote' | 'aqua') — 장착 슬롯은 1개지만 얻은 부적은 전부 보관하고 교체할 수 있다
  balance: defaultBalance(),
  souls: { gray: 0, green: 0, blue: 0, purple: 0, gold: 0 },
  talents: [],
  companions: [],
  party: [],
  unlocked: [1],
  zoneKills: {},
  chestOpened: [],
  chestsFound: 0,
  quests: {},
  zone: 1,
  kills: 0,
  pulls: 0,
  skillbooks: {},   // 아직 쓰지 않은 스킬북: "fireball": 1
  // skills.learned는 이제 "주인공의 스킬"이 아니라 배운 스킬북 기록이다 (삭제하지 않는다).
  // slots/auto/cds는 주인공 스킬 시절의 저장본 호환용으로만 남기고, 게임에서는 쓰지 않는다.
  skills: { learned: [], slots: [null, null, null, null], auto: true, cds: {}, skillMigrationV1: false, pendingBonus: {} },
  tutorial: { step: 1, done: false },
  introSeen: false,
  bossTimers: {},   // "1:boss": Date.now() + 간격(남은 시간 계산용)
  appearance: { mode: 'armor', costumeId: null, unlocked: [], costumeLv: {} },
  bossKills: { mid: 0, boss: 0, field: 0 },
  evolutions: 0,
  achClaimed: [],
  achBonusGranted: 0, // 이미 스탯 보너스를 지급한 업적 수 (중복 지급 방지)
  earthGateOpen: false, // 지구 귀환 게이트 열림 여부 (9구역 보스 처치 시)
  gyeonggiGateOpen: false, // 마계 관문 열림 여부 (12구역 보스 처치 시)
});

function loadState() {
  return defaultState();
}

function mergeState(saved) {
  const s = defaultState();
  if (!saved || typeof saved !== 'object') return s;
  Object.assign(s, saved);
  s.stats = Object.assign({ str: 5, dex: 5, vit: 5, int: 5 }, saved.stats || {});
  s.souls = Object.assign({ gray: 0, green: 0, blue: 0, purple: 0, gold: 0 }, saved.souls || {});
  s.equip = Object.assign({ weapon: null, armor: null, necklace: null, ring: null, earring: null, charm: null }, saved.equip || {});
  // 저장본의 장착 무기가 현재 WEAPONS에 없는 fam이면 derived()가 터져서
  // 부팅/게임 루프가 멈춘다. 이상한 무기는 기본 검으로 바꾸지 않고 삭제한다.
  if (s.equip.weapon && !WEAPONS[s.equip.weapon.fam]) s.equip.weapon = null;
  if (s.equip.armor && !ARMOR_KINDS[s.equip.armor.fam]) s.equip.armor = null;
  for (const slot of ['necklace', 'ring', 'earring']) {
    if (s.equip[slot] && !ACCESSORY_KINDS[s.equip[slot].fam]) s.equip[slot] = null;
  }
  // 가방에 있는 이상한 무기도 삭제한다. 나중에 다시 장착해서 터지는 것을 막기 위해서다.
  // (정리 전에 s.bag을 저장본으로 먼저 채워야 정리 결과가 남는다)
  s.bag = saved.bag || {};
  for (const key of Object.keys(s.bag)) {
    const [kind, fam] = String(key).split(':');
    if (kind === 'weapon' && !WEAPONS[fam]) delete s.bag[key];
    else if (kind === 'armor' && !ARMOR_KINDS[fam]) delete s.bag[key];
    else if (kind === 'accessory' && !ACCESSORY_KINDS[fam]) delete s.bag[key];
  }
  s.talents = saved.talents || [];
  s.companions = saved.companions || [];
  // 동료 스킬북 보너스 (없으면 0). 등급+1이 기본 레벨이고 여기에 더해진다.
  for (const c of s.companions) c.skillBonus = Math.max(0, Math.floor(Number(c.skillBonus) || 0));
  // 동료 고유 스킬 지정: 스킬이 없는 동료(개편 전 저장본)는 직업 풀에서 랜덤으로 하나 받는다.
  // 한 번 지정되면 저장되어 다시 바뀌지 않는다. (스킬 마이그레이션보다 먼저 실행한다)
  for (const c of s.companions) {
    const pool = COMPANION_SKILL_POOLS[c.cls] || [];
    if (!c.skillId || !COMPANION_SKILLS[c.skillId]) {
      c.skillId = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'shieldSlam';
    }
  }
  s.party = saved.party || [];
  s.unlocked = saved.unlocked && saved.unlocked.length ? saved.unlocked : [1];
  // 3차 개편 마이그레이션 (v1 → v2, 분리 맵 → 하나의 서울 지도) +
  // 확장 마이그레이션 (v2 → v3, 서울 9구역 → 서울+인천+경기 18구역):
  // 구역 id 1~9는 그대로 유지되므로 해금·보스 타이머·상자·퀘스트 키가 그대로 이어진다.
  // 위치는 저장하지 않으므로(항상 구역 스폰에서 시작) 현재 구역만 유효성 검사한다.
  s.unlocked = s.unlocked.filter((id) => Number.isInteger(id) && id >= 1 && id <= 18);
  if (!s.unlocked.includes(1)) s.unlocked.unshift(1);
  s.unlocked.sort((a, b) => a - b);
  if (!Number.isInteger(s.zone) || s.zone < 1 || s.zone > 18 || !s.unlocked.includes(s.zone)) s.zone = 1;
  s.earthGateOpen = !!saved.earthGateOpen;
  s.gyeonggiGateOpen = !!saved.gyeonggiGateOpen;
  s.zoneKills = saved.zoneKills || {};
  s.chestOpened = saved.chestOpened || [];
  s.achClaimed = Array.isArray(saved.achClaimed) ? saved.achClaimed.filter((id) => typeof id === 'string') : [];
  // 업적 스탯 보너스 마이그레이션 (Phase 1): 패치 전 이미 수령한 업적 중
  // 보너스를 아직 못 받은 개수만큼 스탯 포인트를 지급한다. achBonusGranted가
  // 저장되므로 이 지급은 최초 1회만 일어나고, 새로고침해도 중복되지 않는다.
  const achPaid = Number(s.achBonusGranted) || 0;
  const achOwed = Math.max(0, s.achClaimed.length - achPaid);
  if (achOwed > 0) s.statPts = (Number(s.statPts) || 0) + achOwed;
  s.achBonusGranted = s.achClaimed.length;
  s.quests = saved.quests || {};
  // 부적 소유 목록 + 분실 복구 (UI 묶음): 예전에는 퀘스트 보상으로 새 부적을
  // 받으면 장착 슬롯이 덮어씌워져 이전 부적이 사라졌다. 이제 얻은 부적은 전부
  // charms 목록에 보관하고, 이미 받아서 잃어버린 부적은 퀘스트 진행도를 보고
  // 되찾아준다. (멱등: 이미 보유 중이면 아무 일도 안 한다)
  s.charms = Array.isArray(saved.charms) ? saved.charms.filter((f) => CHARMS[f]) : [];
  if (s.equip.charm && CHARMS[s.equip.charm.fam] && !s.charms.includes(s.equip.charm.fam)) s.charms.push(s.equip.charm.fam);
  const recovered = [];
  const q2 = s.quests[2];
  if (q2 && (q2.done || (q2.step || 0) >= 1) && !s.charms.includes('antidote')) { s.charms.push('antidote'); recovered.push('antidote'); }
  const q3 = s.quests[3];
  if (q3 && (q3.done || (q3.step || 0) >= 3) && !s.charms.includes('aqua')) { s.charms.push('aqua'); recovered.push('aqua'); }
  // 저장되지 않는 임시 표시 (serialize에 안 들어간다). game.start()에서 토스트로 알려준다.
  if (recovered.length) s._charmRecovered = recovered;
  s.balance = mergeBalance(defaultBalance(), saved.balance || {});
  s.avatar = AVATAR_MAP[saved.avatar] ? saved.avatar : 'boyA';
  s.avatarPicked = !!saved.avatarPicked;
  s.heroName = typeof saved.heroName === 'string' ? saved.heroName.slice(0, 12) : '';
  s.bossTimers = saved.bossTimers && typeof saved.bossTimers === 'object' ? saved.bossTimers : {};
  s.bossKills = Object.assign({ mid: 0, boss: 0, field: 0 }, saved.bossKills || {});
  s.evolutions = Number(saved.evolutions) || 0;
  const ap = saved.appearance || {};
  const unlockedCostumes = Array.isArray(ap.unlocked) ? ap.unlocked.filter((id) => COSTUME_MAP[id]) : [];
  // 이미 해금한 코스튬은 레벨이 없으면 Lv.1로 마이그레이션
  const costumeLv = {};
  for (const id of unlockedCostumes) {
    const lv = ap.costumeLv && Number(ap.costumeLv[id]);
    costumeLv[id] = lv >= 1 && lv <= COSTUME_MAX_LEVEL ? Math.floor(lv) : 1;
  }
  s.appearance = {
    mode: ap.mode === 'uniform' || ap.mode === 'costume' ? ap.mode : 'armor',
    costumeId: COSTUME_MAP[ap.costumeId] ? ap.costumeId : null,
    unlocked: unlockedCostumes,
    costumeLv,
  };
  if (s.appearance.mode === 'costume' && !s.appearance.costumeId) s.appearance.mode = 'armor';
  s.skillbooks = saved.skillbooks && typeof saved.skillbooks === 'object' ? saved.skillbooks : {};
  const sk = saved.skills || {};
  s.skills = {
    learned: Array.isArray(sk.learned) ? sk.learned.filter((id) => SKILLS[id]) : [],
    slots: [0, 1, 2, 3].map((i) => (Array.isArray(sk.slots) && SKILLS[sk.slots[i]] ? sk.slots[i] : null)),
    auto: sk.auto !== false,
    cds: sk.cds && typeof sk.cds === 'object' ? sk.cds : {},
    skillMigrationV1: !!sk.skillMigrationV1,
    pendingBonus: sk.pendingBonus && typeof sk.pendingBonus === 'object' ? sk.pendingBonus : {},
  };
  // 배운 스킬만 슬롯에 남긴다 (슬롯은 저장 호환용으로만 유지한다)
  s.skills.slots = s.skills.slots.map((id) => (id && s.skills.learned.includes(id) ? id : null));
  for (const k of Object.keys(s.skills.pendingBonus)) {
    const v = Math.max(0, Math.floor(Number(s.skills.pendingBonus[k]) || 0));
    if (v > 0) s.skills.pendingBonus[k] = v; else delete s.skills.pendingBonus[k];
  }
  // 예전 직업 기준 pendingBonus(직업 키)는 스킬 기준으로 한 번만 바꾼다.
  // (직업 풀에서 스킬 하나를 골라 그 스킬의 보너스로 옮긴다. 이후엔 스킬 키만 남는다)
  for (const k of Object.keys(s.skills.pendingBonus)) {
    if (COMPANION_SKILL_POOLS[k]) {
      const pool = COMPANION_SKILL_POOLS[k];
      const sk = pool[Math.floor(Math.random() * pool.length)];
      s.skills.pendingBonus[sk] = (s.skills.pendingBonus[sk] || 0) + s.skills.pendingBonus[k];
      delete s.skills.pendingBonus[k];
    }
  }
  // 스킬 개편 마이그레이션 (최초 1회만): 주인공이 이미 배운 스킬은
  // 같은 직업 동료의 대표 스킬 보너스 +1로 전환한다. 배운 목록 자체는 기록으로 남긴다.
  // (skillMigrationV1이 저장되므로 새로고침해도 다시 지급되지 않는다)
  if (!s.skills.skillMigrationV1) {
    for (const id of s.skills.learned) {
      const skillId = SKILL_BOOK_SKILL[id];
      if (skillId) ctx.grantSkillBonus(s, skillId, 1);
    }
    s.skills.skillMigrationV1 = true;
  }
  // 동료 중복 정리 (가챠 개편 전 저장본 마이그레이션): 개편 전 뽑기는 같은 동료를
  // 새로 만들었기 때문에 저장본에 같은 이름+직업이 여러 개 있을 수 있다.
  // 스킬 마이그레이션 뒤에 실행한다 (마이그레이션이 준 스킬북 보너스가 사라지지 않게
  // 그룹 중 가장 큰 보너스를 생존자에게 승계한다). 정리 후에는 중복이 없어
  // 다시 로드해도 아무 일도 일어나지 않는다 (멱등).
  // 생존자: 가장 높은 레벨 (동점이면 가장 높은 등급, 그래도 동점이면 목록의 첫 번째).
  // 복사본마다 가챠 중복 규칙을 적용한다: 생존자 등급이 5 미만이면 등급 +1,
  // 스킬 보너스도 +1. 이미 신화(5등급)면 스킬 보너스만 +1 (동료 레벨은 주인공 레벨을
  // 따라가므로 레벨 보상은 없다 — 생존자 lv는 기록용으로만 남는다).
  // 파티에 있던 복사본 자리는 생존자가 한 번만 이어받는다.
  {
    const groups = new Map();
    for (const c of s.companions) {
      const k = `${c.name}:${c.cls}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    let merged = 0;
    const dead = new Set();
    const survivorOf = new Map();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const sorted = list.slice().sort((a, b) => (b.lv || 1) - (a.lv || 1) || (b.grade || 0) - (a.grade || 0));
      const survivor = sorted[0];
      survivor.lv = Math.max(...list.map((c) => c.lv || 1));
      survivor.skillBonus = Math.max(...list.map((c) => c.skillBonus || 0));
      for (const extra of sorted.slice(1)) {
        if ((survivor.grade || 0) < 5) survivor.grade = (survivor.grade || 0) + 1;
        survivor.skillBonus = (survivor.skillBonus || 0) + 1;
        dead.add(extra.id);
        survivorOf.set(extra.id, survivor.id);
        merged++;
      }
    }
    if (merged > 0) {
      s.companions = s.companions.filter((c) => !dead.has(c.id));
      const newParty = [];
      for (const pid of s.party) {
        const keep = survivorOf.has(pid) ? survivorOf.get(pid) : pid;
        if (!newParty.includes(keep)) newParty.push(keep);
      }
      s.party = newParty.slice(0, 4);
      // 저장되지 않는 임시 표시 (serialize에 안 들어간다). game.start()에서 토스트로 알려준다.
      s._dedupMerged = merged;
    }
  }
  const tu = saved.tutorial || {};
  s.tutorial = { step: Math.max(1, Math.min(3, Number(tu.step) || 1)), done: !!tu.done };
  s.introSeen = !!saved.introSeen;
  // 이번 개편 전 저장본(아바타·튜토리얼 항목 없음)은 이미 진행 중인 모험이므로
  // 졸업식 인트로와 시작 가이드를 다시 보여주지 않는다.
  const migrated = saved.tutorial === undefined;
  if (migrated && (saved.level > 1 || (saved.kills || 0) > 0 || (saved.unlocked || []).length > 1)) {
    s.tutorial = { step: 3, done: true };
    s.introSeen = true;
  }
  // (동료 레벨은 주인공 레벨을 그대로 따라간다 — 슬롯 레벨은 2026-11-25에 폐지.
  //  예전 저장본의 slotLv/slotXp는 읽지 않고 버린다.)
  return s;
}

game.setAvatar = function (id) {
  if (!AVATAR_MAP[id]) return false;
  game.state.avatar = id;
  if (game.player) game.rebuildPlayerMesh();
  game.save();
  if (game.ui) game.ui.markDirty(true);
  return true;
};

game.applyState = function (saved) {
  game.state = mergeState(saved);
  game.balance = game.state.balance;
  if (game.ui) game.ui.markDirty(true);
};

function mergeBalance(base, saved) {
  const out = base;
  if (saved.weapons) for (const [id, w] of Object.entries(saved.weapons)) {
    if (!out.weapons[id]) continue;
    for (const k of ['range', 'cd', 'mult']) if (typeof w[k] === 'number' && w[k] > 0) out.weapons[id][k] = w[k];
  }
  if (saved.items) {
    for (const k of ['weaponAtk', 'armorDef']) {
      if (Array.isArray(saved.items[k])) saved.items[k].forEach((v, i) => {
        if (typeof v === 'number' && i < out.items[k].length) out.items[k][i] = v;
      });
    }
  }
  if (saved.mobs) for (const [key, v] of Object.entries(saved.mobs)) {
    if (!out.mobs[key]) continue;
    for (const f of ['hp', 'atk', 'xp', 'gold']) if (typeof v[f] === 'number' && v[f] >= 0) out.mobs[key][f] = v[f];
  }
  return out;
}


game.serialize = function () {
  const s = game.state;
  return {
    v: 2, level: s.level, xp: s.xp, statPts: s.statPts, gold: s.gold, stats: s.stats,
    hp: Math.round(game.player ? game.player.hp : 0),
    avatar: s.avatar, avatarPicked: s.avatarPicked, heroName: s.heroName,
    bag: s.bag, equip: s.equip, charms: s.charms || [], souls: s.souls, talents: s.talents,
    companions: s.companions, party: s.party, unlocked: s.unlocked,
    zoneKills: s.zoneKills, chestOpened: s.chestOpened, chestsFound: s.chestsFound,
    quests: s.quests, zone: s.zone, kills: s.kills, pulls: s.pulls, balance: s.balance,
    skillbooks: s.skillbooks, skills: s.skills, tutorial: s.tutorial, introSeen: s.introSeen,
    bossTimers: s.bossTimers, bossKills: s.bossKills, evolutions: s.evolutions, appearance: s.appearance,
    achClaimed: s.achClaimed, achBonusGranted: s.achBonusGranted || 0,
    earthGateOpen: !!s.earthGateOpen,
    gyeonggiGateOpen: !!s.gyeonggiGateOpen,
  };
};

// ---------- 캐릭터 이름 ----------
game.heroName = function () {
  const s = game.state;
  if (s && s.heroName) return s.heroName;
  const av = avatarOf(s ? s.avatar : 'boyA');
  return (av && av.defaultName) || '스쿨히어로';
};
game.setHeroName = function (name) {
  const clean = String(name || '').trim().replace(/[<>]/g, '').slice(0, 12);
  game.state.heroName = clean;
  game.save();
  if (game.ui) game.ui.markDirty(true);
  return clean;
};

// 저장은 SaveAdapter를 통해서만 (게임 본체는 저장소를 모른다)
game.save = function () {
  game._dirty = true;
};

game.flushSave = async function () {
  if (!game.store || !game.store.keys) return false;
  game._dirty = false;
  try {
    const r = await game.store.save(game.serialize());
    if (r.ok) {
      game.lastSave = game.time;
      game.lastSaveInfo = r;
    } else if (game.ui && String(r.reason).startsWith('anomaly')) {
      game.ui.toast('비정상 수치가 감지되어 저장을 거부했어요.', 'bad');
    }
    return r.ok;
  } catch (e) { return false; }
};

game.resetSave = async function () {
  if (game.store && game.store.clearLocal) await game.store.clearLocal();
  game.applyState(null);
  try { await game.flushSave(); } catch (e) { /* 다음 저장 때 다시 시도 */ }
};
  // 다른 모듈에서 부른다 (game.js 초기화, applyState 경유)
  ctx.loadState = loadState;
  ctx.mergeState = mergeState;
  ctx.defaultState = defaultState;
}
