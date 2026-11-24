// 스쿨히어로 — 게임 엔진
import {
  PLAYABLE, ZONES, GRADES, WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, GRADE_ADJ, WEAPON_BASE, ITEM_STATS,
  MEDAL_TIERS, MEDAL_STEP, TALENTS, COMPANION_CLASSES, COMPANION_NAMES, CHARMS, SECRET_TOTAL,
  itemOptions, defaultBalance, MOB_REWARD, OPT_LABEL,
  AVATARS, AVATAR_MAP, avatarOf, SKILLS, SKILL_IDS, HEAL_SKILL_IDS,
  COMPANION_SKILLS, SKILL_BOOK_CLASS, COMPANION_SKILL_MAX_LEVEL,
  BOSS_TIMER, BOSS_LABEL, EVOLVE_NEED, SOUL_KINDS, COSTUMES, COSTUME_MAP, COSTUME_PULL_COST, COSTUME_MAX_LEVEL, COSTUME_LEVEL_MULT, COMPANION_PULL_COST,
  ELEMENTS, ELEM_BEATS, EARTH_GATE,
} from './data.js';
import { buildWorld, makePlayer, makeMonster, makeCompanion, groundHeight, districtAt, worldPos, WORLD_HALF } from './world.js';
import { ASSET_URL, getTexture, aspectOf } from './assets.js';

const SAVE_KEY = 'school-hero.save.v1';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const TAU = Math.PI * 2;

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

export function createGame(THREE) {
  const canvas = document.getElementById('gl');
  // 웨일 일반 탭처럼 탭이 많거나 GPU 프로세스가 부족한 환경에서는
  // 고성능 WebGL 컨텍스트 생성이 실패할 수 있다. 그때는 저전력 설정으로 다시 시도한다.
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e1) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default' });
    } catch (e2) {
      throw new Error('webgl-unavailable');
    }
  }
  const lowPower = (window.innerWidth < 700) || (navigator.hardwareConcurrency || 4) <= 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.6 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 260);
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x3a4a30, 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e0, 0.92);
  sun.position.set(16, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34; sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0016;
  scene.add(sun);
  scene.add(sun.target);

  const game = {
    THREE, renderer, scene, camera,
    time: 0,
    running: false,
    input: { mx: 0, mz: 0, keys: new Set() },
    enemies: [], companions: [], projectiles: [], pickups: [], effects: [], telegraphs: [], graves: [], bossGroups: {},
    zone: null, world: null,
    player: null,
    ui: null,
    paused: false,
    camShake: 0,
    nearNpc: false,
    nearPortal: false,
    lastSave: 0,
    hiddenBubble: null,
    leashRange: 15,
    tutorialHook: null,
    tank: null,
    lastAttack: null,
  };

  // ---------- 지형 높이 ----------
  // 3D 지형 높이. 월드가 아직 없으면 평지(0)로 취급한다.
  function groundY(x, z) {
    try { return groundHeight(x, z); } catch (e) { return 0; }
  }
  game.groundY = groundY;

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
    s.party = saved.party || [];
    s.unlocked = saved.unlocked && saved.unlocked.length ? saved.unlocked : [1];
    // 3차 개편 마이그레이션 (v1 → v2, 분리 맵 → 하나의 서울 지도):
    // 구역 id 1~4는 그대로 유지되므로 해금·보스 타이머·상자·퀘스트 키가 그대로 이어진다.
    // 위치는 저장하지 않으므로(항상 구역 스폰에서 시작) 현재 구역만 유효성 검사한다.
    s.unlocked = s.unlocked.filter((id) => Number.isInteger(id) && id >= 1 && id <= 9);
    if (!s.unlocked.includes(1)) s.unlocked.unshift(1);
    s.unlocked.sort((a, b) => a - b);
    if (!Number.isInteger(s.zone) || s.zone < 1 || s.zone > 9 || !s.unlocked.includes(s.zone)) s.zone = 1;
    s.earthGateOpen = !!saved.earthGateOpen;
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
    // 스킬 개편 마이그레이션 (최초 1회만): 주인공이 이미 배운 스킬은
    // 같은 직업 동료의 대표 스킬 보너스 +1로 전환한다. 배운 목록 자체는 기록으로 남긴다.
    // (skillMigrationV1이 저장되므로 새로고침해도 다시 지급되지 않는다)
    if (!s.skills.skillMigrationV1) {
      for (const id of s.skills.learned) {
        const cls = SKILL_BOOK_CLASS[id];
        if (cls) grantClassSkillBonus(s, cls, 1);
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
    // 이미 신화(5등급)면 레벨 +5. 파티에 있던 복사본 자리는 생존자가 한 번만 이어받는다.
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
          else survivor.lv = (survivor.lv || 1) + 5;
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
        s.party = newParty.slice(0, 3);
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
    return s;
  }

  game.setAvatar = function (id) {
    if (!AVATAR_MAP[id]) return false;
    game.state.avatar = id;
    if (game.player) rebuildPlayerMesh();
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

  function rebuildPlayerMesh() {
    const p = game.player;
    if (!p) return;
    if (game.playerMesh) { scene.remove(game.playerMesh); disposeGroup(game.playerMesh); }
    game.playerMesh = makePlayer(THREE, 'sword', avatarOf(game.state.avatar), game.state.equip, game.state.appearance);
    game.playerMesh.position.set(p.x, groundY(p.x, p.z), p.z);
    game.playerMesh.rotation.y = p.facing;
    scene.add(game.playerMesh);
  }
  game.rebuildPlayerMesh = rebuildPlayerMesh;

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

  game.state = loadState();

  game.serialize = function () {
    const s = game.state;
    return {
      v: 2, level: s.level, xp: s.xp, statPts: s.statPts, gold: s.gold, stats: s.stats,
      hp: Math.round(game.player ? game.player.hp : 0),
      avatar: s.avatar, avatarPicked: s.avatarPicked, heroName: s.heroName,
      bag: s.bag, equip: s.equip, souls: s.souls, talents: s.talents,
      companions: s.companions, party: s.party, unlocked: s.unlocked,
      zoneKills: s.zoneKills, chestOpened: s.chestOpened, chestsFound: s.chestsFound,
      quests: s.quests, zone: s.zone, kills: s.kills, pulls: s.pulls, balance: s.balance,
      skillbooks: s.skillbooks, skills: s.skills, tutorial: s.tutorial, introSeen: s.introSeen,
      bossTimers: s.bossTimers, bossKills: s.bossKills, evolutions: s.evolutions, appearance: s.appearance,
      achClaimed: s.achClaimed, achBonusGranted: s.achBonusGranted || 0,
      earthGateOpen: !!s.earthGateOpen,
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

  // ---------- 능력치 ----------
  game.balance = game.state.balance || defaultBalance();

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
    const m = COSTUME_LEVEL_MULT[game.costumeLevel(id) || 1];
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
    const has = (id) => s.talents.includes(id);
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
    const atkBonus = (has('atk') ? 1.09 : 1) * (1 + (opt.atkPct + cos.atkPct) / 100);
    const hpMul = (has('maxhp') ? 1.15 : 1) * (1 + (opt.hpPct + cos.hpPct) / 100);
    const maxHp = Math.round((100 + s.stats.vit * 9 + s.level * 12) * hpMul);
    const attack = Math.round((baseAtk + wa) * atkBonus);
    const defense = Math.round((2 + s.stats.vit * 0.55 + ad) * (1 + (opt.defPct + cos.defPct) / 100));
    return {
      maxHp,
      maxMp: Math.round((40 + s.stats.int * 7) * (1 + cos.mpPct / 100)),
      attack,
      baseAtk: Math.round(baseAtk),
      weaponAtk: wa,
      cls,
      weapon: w,
      attackRange: w.range,
      attackCd: w.cd,
      defense,
      critChance: Math.min(0.85, 0.05 + s.stats.dex * 0.003 + (has('crit') ? 0.06 : 0) + (opt.crit + cos.crit + (w.crit ? w.crit * 100 : 0)) / 100),
      critDmg: 1.5 + s.stats.dex * 0.004 + (has('critdmg') ? 0.3 : 0) + (opt.critDmg + cos.critDmg) / 100,
      evade: Math.min(0.45, s.stats.dex * 0.0022 + (opt.evade + cos.evade) / 100),
      atkSpeed: (1 + s.stats.dex * 0.004) * (has('atkspeed') ? 1.12 : 1),
      moveSpeed: 4.6 * (has('speed') ? 1.1 : 1) * (1 + (opt.moveSpeed + cos.moveSpeed) / 100) * (s.zone === 4 ? 0.92 : 1),
      magnet: 3.2 * (has('magnet') ? 1.4 : 1),
      autoloot: has('autoloot'),
      regen: has('regen') ? 1.5 : 0,
      lootBonus: has('loot') ? 1.3 : 1,
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

  // ---------- 3D 준비 ----------
  function disposeGroup(g) {
    g.traverse((o) => {
      // 공유 지오메트리(몬스터 3D 캐시)는 해제하지 않는다 — 다른 인형이 쓰고 있다
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  // ---------- 하나의 서울 지도 ----------
  // 월드는 한 번만 짓는다. 구역 이동은 setDistrict로 — 월드·플레이어·동료를 유지한 채
  // 현재 구역(안개/배경/몬스터/NPC 기준)만 바꾼다. 포탈 이동은 없다.
  function clearFieldEntities() {
    for (const e of game.enemies) {
      if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
      if (e.mesh) { scene.remove(e.mesh); disposeGroup(e.mesh); }
    }
    if (game.ui) game.ui.clearTags();
    for (const pr of game.projectiles) scene.remove(pr.mesh);
    for (const it of game.pickups) if (it.mesh) scene.remove(it.mesh);
    for (const fx of game.effects) if (fx.mesh) disposeObj(fx.mesh);
    for (const t of game.telegraphs) { scene.remove(t.mesh); scene.remove(t.ring); if (t.mark) scene.remove(t.mark); }
    game.enemies = []; game.projectiles = []; game.pickups = []; game.effects = []; game.telegraphs = []; game.bossGroups = {};
  }

  function spawnDistrictMobs(zone) {
    game.clearGraves();
    spawnZoneMobs(zone);
    for (const t of [...new Set(allBossDefs(zone).map((b) => b.type))]) if (game.bossRemain(zone.id, t) > 0) game.addGrave(t);
  }

  function applyDistrictAtmosphere(zone) {
    scene.fog = new THREE.FogExp2(zone.theme.fog, zone.theme.fogDensity);
    scene.background = new THREE.Color(zone.theme.sky);
    if (game.world && game.world.particles) game.world.particles.material.color.setHex(zone.theme.ambientColor);
  }

  game.buildWorld = function (opts = {}) {
    const zone = PLAYABLE.find((z) => z.id === game.state.zone) || PLAYABLE[0];
    game.state.zone = zone.id;
    game.zone = zone;
    game.enemies = []; game.companions = []; game.projectiles = []; game.pickups = []; game.effects = []; game.telegraphs = []; game.bossGroups = {};
    if (game.world) { scene.remove(game.world.group); disposeGroup(game.world.group); }
    game.world = buildWorld(THREE, PLAYABLE, game.state.chestOpened, !!game.state.earthGateOpen);
    scene.add(game.world.group);
    applyDistrictAtmosphere(zone);

    // 플레이어
    if (game.playerMesh) { scene.remove(game.playerMesh); disposeGroup(game.playerMesh); }
    game.playerMesh = makePlayer(THREE, 'sword', avatarOf(game.state.avatar), game.state.equip, game.state.appearance);
    scene.add(game.playerMesh);
    const d = game.derived();
    const sp = worldPos(zone, zone.spawn.x, zone.spawn.z);
    game.player = {
      x: sp.x, z: sp.z, facing: Math.PI, vy: 0,
      hp: clamp(game.state.hp || d.maxHp, 1, d.maxHp),
      mp: d.maxMp,
      atkCd: 0.2, regenT: 0, alive: true, respawnT: 0, stunT: 0,
      walkT: 0, moving: false, atkAnim: 0, poisonT: 0, poisonStacks: 0,
      combatT: 0, target: null, atkKind: null, castT: 0,
    };
    game.playerMesh.position.set(game.player.x, groundY(game.player.x, game.player.z), game.player.z);

    // 동료
    game.compObjects = [];
    game.tank = null;
    game.state.party.forEach((cid, i) => {
      const c = game.state.companions.find((x) => x.id === cid);
      if (!c) return;
      const cls = COMPANION_CLASSES[c.cls];
      const mesh = makeCompanion(THREE, cls, GRADES[c.grade].color);
      scene.add(mesh);
      const o = makeCompanionObj(c, cls, mesh, game.player.x - 1.6 + i * 1.6, game.player.z + 1.8);
      game.compObjects.push(o);
      game.companions.push(o);
      if (cls.id === 'tank' && !game.tank) game.tank = o;
    });

    spawnDistrictMobs(zone);

    // 카메라 즉시 이동 (플레이어 지형 높이 기준)
    const aspect0 = window.innerWidth / Math.max(1, window.innerHeight);
    const vis0 = Math.min(15.5, Math.max(11, 9.6 / aspect0));
    const gy0 = groundY(game.player.x, game.player.z);
    camera.position.set(game.player.x, gy0 + vis0 * 1.22, game.player.z + vis0 * 1.08);
    camera.lookAt(camera.position.x, gy0, camera.position.z - vis0 * 1.08);

    if (game.ui) {
      game.ui.onZoneEnter(zone);
      game.ui.closeAll();
    }
    if (!opts.silent) { game.save(); game.flushSave(); }
    return true;
  };

  // 구역 이동 (걸어서 경계를 넘을 때 호출) — 월드는 유지, 몬스터만 교체
  game.setDistrict = function (zoneId, opts = {}) {
    const zone = PLAYABLE.find((z) => z.id === zoneId);
    if (!zone || !game.world) return false;
    clearFieldEntities();
    game.state.zone = zoneId;
    game.zone = zone;
    if (opts.spawn) {
      const sp = worldPos(zone, zone.spawn.x, zone.spawn.z);
      game.player.x = sp.x; game.player.z = sp.z; game.player.facing = Math.PI;
      game.playerMesh.position.set(sp.x, groundY(sp.x, sp.z), sp.z);
      snapCompanions();
    }
    applyDistrictAtmosphere(zone);
    spawnDistrictMobs(zone);
    if (game.ui) game.ui.onZoneEnter(zone);
    if (!opts.silent) { game.save(); game.flushSave(); }
    return true;
  };

  // 구역 해금 (보스 처치·퀘스트 보상 공용) — 방벽 게이트도 함께 연다
  game.unlockDistrict = function (zoneId, silent) {
    const s = game.state;
    if (zoneId < 1 || zoneId > 9 || s.unlocked.includes(zoneId)) return false;
    s.unlocked.push(zoneId);
    s.unlocked.sort((a, b) => a - b);
    if (game.world) game.world.openGate(zoneId);
    if (!silent && game.ui) {
      const z = PLAYABLE.find((x) => x.id === zoneId);
      game.ui.toast(`새 구역 해금: ${z ? z.name : zoneId} · 방벽이 열렸어요!`, 'good');
    }
    game.save();
    return true;
  };

  // 처음 소환 지점(1구역 스폰)으로 귀환
  game.returnToStart = function () {
    const z1 = PLAYABLE[0];
    const sp = worldPos(z1, z1.spawn.x, z1.spawn.z);
    game.player.x = sp.x; game.player.z = sp.z; game.player.facing = Math.PI;
    game.setDistrict(1, { spawn: true });
    snapCompanions();
    if (game.ui) game.ui.toast('처음 소환 지점으로 돌아왔어요. 체력이 모두 회복되었습니다.', 'good');
    return true;
  };

  // 예전 enterZone 호출 자리 (디버그·호환용) — 이제는 구역만 바꾼다
  game.enterZone = function (zoneId, opts = {}) {
    if (!game.world) return game.buildWorld(opts);
    return game.setDistrict(zoneId, opts);
  };

  function spawnZoneMobs(zone) {
    const pts = (game.world.spawnPointsByDistrict && game.world.spawnPointsByDistrict[zone.id]) || game.world.spawnPoints;
    let pi = 0;
    const pick = () => pts[(pi++) % pts.length];
    const sp = worldPos(zone, zone.spawn.x, zone.spawn.z);
    for (let i = 0; i < 6; i++) {
      const def = zone.mobs.normal[i % zone.mobs.normal.length];
      const ang = (i / 6) * Math.PI * 2 + 0.4;
      const rad = 11 + (i % 2) * 4;
      spawnEnemy(def, sp.x + Math.cos(ang) * rad, sp.z + Math.sin(ang) * rad * 0.9);
    }
    for (let i = 0; i < 9; i++) {
      const def = zone.mobs.normal[i % zone.mobs.normal.length];
      const p = pick();
      spawnEnemy(def, p.x, p.z);
    }
    for (let i = 0; i < 4; i++) {
      const def = zone.mobs.elite[0];
      const p = pick();
      spawnEnemy(def, p.x, p.z);
    }
    // 보스는 리스폰 타이머가 지난 경우에만 등장 (중간보스 4시간 · 에픽보스 6시간 · 필드보스 24시간)
    const midP = worldPos(zone, zone.mid.x, zone.mid.z);
    const bossP = worldPos(zone, zone.boss.x, zone.boss.z);
    if (bossReady(zone.id, 'mid')) spawnEnemy(zone.mobs.mid, midP.x, midP.z, true);
    if (bossReady(zone.id, 'boss')) spawnEnemy(zone.mobs.boss, bossP.x, bossP.z, true);
    if (zone.field && bossReady(zone.id, 'field')) {
      const fP = worldPos(zone, zone.field.x, zone.field.z);
      spawnEnemy(zone.mobs.field, fP.x, fP.z, true);
    }
    // 추가 보스 (드래곤·쌍둥이·3형제·독버섯) — 각자 타이머가 지난 경우에만 등장
    for (const ex of (zone.extraBosses || [])) {
      if (!bossReady(zone.id, ex.type)) continue;
      const defs = ex.defs || [ex.def];
      const exP = worldPos(zone, ex.x, ex.z);
      const spawned = defs.map((d, i) => spawnEnemy(d, exP.x + (i - (defs.length - 1) / 2) * 3.2, exP.z + (i % 2) * 2, true));
      if (defs[0].group) linkBossGroup(defs[0].group, spawned);
    }
  }

  // ---------- 보스 리스폰 ----------
  game.bossRemain = function (zoneId, type) {
    const at = (game.state.bossTimers || {})[`${zoneId}:${type}`];
    if (!at) return 0;
    return Math.max(0, at - Date.now());
  };
  game.bossReady = bossReady;
  function bossReady(zoneId, type) {
    return game.bossRemain(zoneId, type) <= 0;
  }
  // 구역의 모든 보스(기본 3종 + 추가 보스) 정의 목록 — 타이머/묘비/리스폰 공용
  // 보스 좌표는 구역-로컬 좌표이므로, 모든 사용처(묘비·리스폰·지도 마커)가
  // 월드 좌표로 쓰도록 여기서 한 번만 변환한다 (spawnZoneMobs와 같은 worldPos).
  function allBossDefs(zone) {
    const midP = worldPos(zone, zone.mid.x, zone.mid.z);
    const bossP = worldPos(zone, zone.boss.x, zone.boss.z);
    const list = [
      { type: 'mid', def: zone.mobs.mid, x: midP.x, z: midP.z, label: BOSS_LABEL.mid, name: zone.mobs.mid.name },
      { type: 'boss', def: zone.mobs.boss, x: bossP.x, z: bossP.z, label: BOSS_LABEL.boss, name: zone.mobs.boss.name },
    ];
    if (zone.field) {
      const fP = worldPos(zone, zone.field.x, zone.field.z);
      list.push({ type: 'field', def: zone.mobs.field, x: fP.x, z: fP.z, label: BOSS_LABEL.field, name: zone.mobs.field.name });
    }
    for (const ex of (zone.extraBosses || [])) {
      const defs = ex.defs || [ex.def];
      const exP = worldPos(zone, ex.x, ex.z);
      for (const d of defs) list.push({ type: ex.type, def: d, x: exP.x, z: exP.z, label: ex.label || BOSS_LABEL[ex.type] || '보스', name: ex.label || d.name });
    }
    return list;
  }
  game.bossStatus = function (zoneId) {
    const zone = PLAYABLE.find((z) => z.id === zoneId);
    if (!zone) return [];
    const seen = new Set();
    return allBossDefs(zone).filter((b) => { if (seen.has(b.type)) return false; seen.add(b.type); return true; })
      .map((b) => ({ type: b.type, name: b.name, lv: enemyLevel(b.def, zone), remain: game.bossRemain(zoneId, b.type), total: BOSS_TIMER[b.type] || 0, label: b.label }));
  };

  // ---------- 보스 특수 패턴 ----------
  const BOSS_PATTERN = {
    ogre: 'charge', golem: 'cannon', anubis: 'whirlwind',
    ent: 'nova', witch: 'necromancer', kraken: 'portal', siren: 'nova',
    hydra: 'split',
  };

  // 쌍둥이 보호막 표시 (쌍둥이 중 한 명에게만 씌우는 파란 구체)
  function setShieldVisual(e, on) {
    if (e.shieldMesh) e.shieldMesh.visible = on;
  }
  // 쌍둥이·3형제처럼 여러 개체가 하나의 타이머·보상을 공유하는 보스 그룹 연결
  function linkBossGroup(group, members) {
    game.bossGroups[group] = members.filter(Boolean);
    if (group === 'twins' && game.bossGroups.twins[0]) {
      const first = game.bossGroups.twins[0];
      first.shielded = true;
      setShieldVisual(first, true);
      first.twinSwapT = 8;
    }
  }

  // ---------- 보스 묘비 + 리스폰 카운트다운 ----------
  function graveSpot(type) {
    const z = game.zone;
    if (!z) return null;
    const hit = allBossDefs(z).find((b) => b.type === type);
    return hit ? { x: hit.x, z: hit.z } : null;
  }
  function bossTimerKey(type) { return `${game.zone.id}:${type}`; }
  game.addGrave = function (type) {
    const spot = graveSpot(type);
    if (!spot || !type) return;
    const existing = game.graves.find((x) => x.type === type);
    if (existing) { existing.until = (game.state.bossTimers || {})[bossTimerKey(type)] || existing.until; return; }
    const url = ASSET_URL.prop('gravestone');
    const h = type === 'field' ? 2.4 : 2.0;
    const w = h * (aspectOf(THREE, url) || 0.75);
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: getTexture(THREE, url), transparent: true, alphaTest: 0.4, depthWrite: true, side: THREE.DoubleSide }));
    mesh.scale.set(w, h, 1);
    mesh.position.y = h / 2;
    const art = new THREE.Group(); art.add(mesh); grp.add(art);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(w * 0.85, 18), new THREE.MeshBasicMaterial({ color: 0x9f7bff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; grp.add(glow);
    grp.position.set(spot.x, groundY(spot.x, spot.z), spot.z);
    scene.add(grp);
    const defHit = allBossDefs(game.zone).find((b) => b.type === type);
    const g = { type, name: defHit ? defHit.name : type, x: spot.x, z: spot.z, mesh: grp, art, glow, el: null, until: (game.state.bossTimers || {})[bossTimerKey(type)] || 0 };
    game.graves.push(g);
    if (game.ui) game.ui.attachGrave(g);
  };
  game.removeGrave = function (type) {
    const i = game.graves.findIndex((x) => x.type === type);
    if (i < 0) return;
    const g = game.graves[i];
    if (g.el && g.el.parentNode) g.el.parentNode.removeChild(g.el);
    scene.remove(g.mesh);
    g.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    game.graves.splice(i, 1);
  };
  game.clearGraves = function () { for (const g of [...game.graves]) game.removeGrave(g.type); };
  function updateGraves(dt) {
    for (const g of [...game.graves]) {
      if (g.art) { g.art.rotation.y = Math.atan2(camera.position.x - g.x, camera.position.z - g.z); g.glow.material.opacity = 0.12 + Math.sin(game.time * 2.6) * 0.06; }
      const until = (game.state.bossTimers || {})[bossTimerKey(g.type)];
      if (until) g.until = until;
      if (g.until - Date.now() <= 0) {
        game.removeGrave(g.type);
        const zone = game.zone;
        const defs = allBossDefs(zone).filter((b) => b.type === g.type);
        if (defs.length) {
          const spawned = defs.map((b, i) => spawnEnemy(b.def, b.x + (i - (defs.length - 1) / 2) * 3.2, b.z + (i % 2) * 2, true));
          if (defs[0].def.group) linkBossGroup(defs[0].def.group, spawned);
          if (game.ui) game.ui.toast(`${defs[0].name}이(가) 다시 나타났어요!`, 'bad');
        }
      }
    }
  }

  function enemyLevel(def, zone) {
    return Math.max(1, zone.scale.lvl + (def.boss === 'field' ? 5 : def.boss === 'boss' ? 3 : def.boss === 'mid' ? 1 : def.elite ? 1 : 0));
  }

  function spawnEnemy(def, x, z, fixed = false) {
    const zone = game.zone;
    const mesh = makeMonster(THREE, def);
    mesh.position.set(x, groundY(x, z), z);
    scene.add(mesh);
    const lvl = enemyLevel(def, zone);
    const ov = game.mobStats(zone.id, def);
    const hp = Math.round(ov.hp);
    const e = {
      def, mesh, x, z, home: { x, z }, hp, maxHp: hp,
      atk: ov.atk, speed: def.speed, radius: mesh.userData.radius || 0.5,
      stunT: 0, slowT: 0, reward: { xp: ov.xp, gold: ov.gold },
      headY: mesh.userData.headY || 1, state: 'idle', wanderT: Math.random() * 2,
      wander: { x, z }, atkCd: 1 + Math.random(), hitFlash: 0, alive: true,
      isBoss: def.boss === 'boss', isMid: def.boss === 'mid', isField: def.boss === 'field',
      elite: !!def.elite,
      level: lvl, tag: null, floatT: Math.random() * 6, telegraphT: 9 + Math.random() * 4,
      skillCd: 2.5 + Math.random() * 2.5,
      summonDone: false, splitDone: false, chargeCd: 5 + Math.random() * 3, charge: null,
      pattern: def.pattern || (def.boss ? (BOSS_PATTERN[def.shape] || 'nova') : null),
      timerType: def.timerType || null,
      group: def.group || null,
      statue: !!def.statue,
      shielded: false, shieldMesh: null, flyY: 0, dragonPhase: null, dragonT: 0,
      baseAtk: ov.atk, baseSpeed: def.speed, enrageStacks: 0, enrageT: 0,
      patternCd: 6 + Math.random() * 4, weaponCd: 5 + Math.random() * 3,
      splitStage: 0, necroWave: 0, necroT: 9, portalAdds: null, portalT: 0, buffOn: false,
      twinSwapT: 8,
      deadT: 0, facing: Math.PI, fixed,
      targetType: 'player', leashing: false, knockT: 0,
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
    return {
      hp: typeof ov.hp === 'number' ? ov.hp : def.hp,
      atk: typeof ov.atk === 'number' ? ov.atk : def.atk,
      xp: typeof ov.xp === 'number' ? ov.xp : Math.round(r.xp * zone.scale.xp),
      gold: typeof ov.gold === 'number' ? ov.gold : Math.round(r.gold * zone.scale.gold),
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
    // 스킬북: 구역 보스는 확정, 중간보스는 확률
    const bookChance = e.isBoss ? 1 : e.isMid ? 0.45 : 0;
    if (bookChance && Math.random() < bookChance) dropSkillBook(e.x, e.z);
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

  function unlearnedSkills() {
    return SKILL_IDS.filter((id) => !game.state.skills.learned.includes(id));
  }

  function dropSkillBook(x, z) {
    const pool = unlearnedSkills().filter((id) => !(game.state.skillbooks[id] > 0));
    if (!pool.length) {
      // 모든 스킬을 배웠거나 이미 책이 남아 있으면 골드로 대체
      addPickup('gold', x, z, 120);
      return null;
    }
    const id = pool[Math.floor(Math.random() * pool.length)];
    addPickup('book', x, z, id);
    return id;
  }
  game.dropSkillBook = dropSkillBook;

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
    if (crit) specialHit(e, 'crit');
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
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 7, 5),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    m.position.set(x, y, z);
    addFx(m, 0.18, (fx, k) => {
      m.scale.setScalar(1 + (1 - k) * 2.6);
      m.material.opacity = k;
    });
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
      if (alive.length === 1 && alive[0].shielded) { alive[0].shielded = false; setShieldVisual(alive[0], false); }
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
    game.gainCompanionXp(Math.round(xp * 0.6));
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

  function fmtRemain(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`;
    return `${h}시간 ${String(m).padStart(2, '0')}분`;
  }
  game.fmtRemain = fmtRemain;

  function fmtNum(n) { return Math.round(n).toLocaleString('ko-KR'); }

  function bossDefeated() {
    const s = game.state;
    const zone = game.zone;
    const next = zone.id + 1;
    if (next <= 9) game.unlockDistrict(next);
    else if (zone.id === 9 && !s.earthGateOpen) {
      // 마지막 구역 보스 처치 — 지구 귀환 게이트가 열린다
      s.earthGateOpen = true;
      if (game.world) game.world.setEarthGate(true);
      if (game.ui) game.ui.toast('지구 귀환 게이트가 열렸어요! 북한산 정상으로 가 보세요.', 'gold');
    }
    game.save();
  }

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

  game.gainCompanionXp = function (n) {
    // 동행 중인 파티원(최대 3명)에게만 경험치를 나눈다 — 파티 밖 동료는 성장하지 않는다
    const party = new Set(game.state.party || []);
    for (const c of game.state.companions) {
      if (!party.has(c.id)) continue;
      c.xp = (c.xp || 0) + n;
      let need = 60 + (c.lv || 1) * 40;
      while (c.xp >= need) { c.xp -= need; c.lv = (c.lv || 1) + 1; need = 60 + c.lv * 40; }
    }
  };

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
      nx = clamp(nx, -WORLD_HALF + 2, WORLD_HALF - 2); nz = clamp(nz, -WORLD_HALF + 2, WORLD_HALF - 2);
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
        if (d.id === 4 && !game.state.equip.charm) return false;
        return true;
      };
      if (!canEnter(nx, nz)) {
        const prev = PLAYABLE.find((z) => z.id === target.id - 1);
        blockedMsg(!game.state.unlocked.includes(target.id)
          ? (prev ? `${prev.name} 보스를 처치해야 방벽이 열려요.` : '아직 갈 수 없는 구역이에요.')
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
  function animateArm(p, m, dt) {
    const armR = m.userData.armR;
    const armL = m.userData.armL;
    if (!armR) return;
    const fam = p.atkFam || 'sword';
    const k = p.atkAnim > 0 ? 1 - p.atkAnim / (p.atkAnimMax || 0.22) : 1;
    const on = p.atkAnim > 0;
    let rx = 0, rz = 0, lx = 0;
    if (on) {
      if (fam === 'dagger') {
        rx = -0.2 - Math.sin(k * Math.PI) * 1.1;
        rz = Math.sin(k * Math.PI) * 0.15;
      } else if (fam === 'axe' || fam === 'mace') {
        rx = k < 0.45 ? -2.5 + k * 1.2 : 1.0 - (k - 0.45) * 1.4;
        rz = 0;
      } else if (fam === 'bow' || fam === 'crossbow') {
        rx = -1.45;
        lx = -1.15;
      } else if (fam === 'staff' || fam === 'book') {
        rx = -1.2 - Math.sin(k * Math.PI) * 0.5;
        rz = Math.sin(k * Math.PI) * 0.3;
      } else {
        rx = -0.3 - Math.sin(k * Math.PI) * 1.7;
        rz = -1.1 + Math.sin(k * Math.PI) * 1.9;
      }
    }
    armR.rotation.x = rx + (p.moving ? Math.sin(p.walkT) * 0.2 : 0);
    armR.rotation.z = rz;
    if (armL) armL.rotation.x = lx + (p.moving ? -Math.sin(p.walkT) * 0.2 : 0);
    // 3D 휴머노이드 걷기·공격 모션 (userData에 다리·몸통·무기그룹이 있을 때만)
    const legL = m.userData.legL, legR = m.userData.legR;
    const body = m.userData.body, weaponGroup = m.userData.weaponGroup;
    const walkSwing = p.moving ? Math.sin(p.walkT) * 0.6 : 0;
    if (legL) legL.rotation.x = walkSwing;
    if (legR) legR.rotation.x = -walkSwing;
    let bobY = p.moving ? Math.abs(Math.sin(p.walkT)) * 0.05 : Math.sin(game.time * 2.1) * 0.012;
    let lungeZ = 0, leanX = 0, wgX = 0, wgZ = 0, wgY = 0;
    if (on && weaponGroup) {
      if (fam === 'dagger') {
        // 찌르기: 몸통 돌진 + 무기 전진
        const lunge = Math.sin(k * Math.PI);
        lungeZ = lunge * 0.22; wgZ = lunge * 0.3;
      } else if (fam === 'axe' || fam === 'mace') {
        // 들어올렸다 내리찍기: 무기 뒤로 젖혔다 앞으로 휘두르기 + 몸통 숙이기
        if (k < 0.45) { wgX = 0.7 * (1 - k / 0.45); leanX = -0.1; }
        else { const s = (k - 0.45) / 0.55; wgX = -0.9 * Math.sin(s * Math.PI); leanX = 0.16 * Math.sin(s * Math.PI); }
      } else if (fam === 'staff' || fam === 'book') {
        // 시전: 무기 들어올리기
        wgY = Math.sin(k * Math.PI) * 0.15;
      } else if (fam === 'sword') {
        // 베기: 무기 가로 휘두르기
        wgZ = Math.sin(k * Math.PI) * 0.5;
      }
    }
    if (body) {
      body.position.y = (body.userData.baseY || 0) + bobY;
      body.position.z = lungeZ;
      body.rotation.x = leanX;
    }
    if (weaponGroup) {
      weaponGroup.rotation.x = wgX;
      weaponGroup.rotation.z = wgZ;
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
    const F = ATTACK_FX[fam] || ATTACK_FX.sword;
    p.atkAnimMax = F.anim;
    p.atkAnim = F.anim;
    p.atkKind = F.kind;
    p.atkFam = fam;
    const dmgBase = d.attack * W.mult;
    game.lastAttack = { fam, kind: F.kind, at: game.time };
    if (game.tutorialHook) game.tutorialHook('attack');
    if (W.projectile) {
      const style = fam === 'bow' ? 'arrow' : fam === 'crossbow' ? 'bolt' : fam === 'staff' ? 'orb' : 'orb';
      spawnProjectile({
        from: 'player', x: p.x, y: 1.1, z: p.z, targetX: target.x, targetZ: target.z,
        speed: fam === 'crossbow' ? 22 : fam === 'bow' ? 19 : 15,
        color: fam === 'staff' ? 0xb58cff : fam === 'book' ? 0x9ff0ff : 0xffd27f,
        dmg: dmgBase, range: W.range + 1, style,
      });
      weaponSwingFx(fam, p, a, W, []);
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
      weaponSwingFx(fam, p, a, W, hits);
      // 검: 확률 추가타 / 둔기: 확률 기절
      if (hits.length) {
        if (W.extra && Math.random() < W.extra) {
          const t = hits[0];
          specialHit(t, 'double');
          game.dealDamage(t, dmgBase * 0.6, { canCrit: false });
        }
        if (W.stun && Math.random() < W.stun) {
          for (const t of hits) if (t.alive) { t.stunT = 1.2; stunStars(t.x, groundY(t.x, t.z) + t.headY + 0.4, t.z); specialHit(t, 'stun'); }
        }
      }
    }
    p.atkCd = W.cd / d.atkSpeed;
    return true;
  }

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

  function fxMat(color, opacity = 0.85) {
    return new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
  }

  // 효과·투사체용 임시 메시 정리.
  // 재질은 남겨 두어 셰이더 프로그램이 매번 삭제·재컴파일되지 않게 한다(모바일 발광 이펙트 끊김 방지).
  function disposeObj(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  function addFx(mesh, life, tick, tag) {
    if (mesh) scene.add(mesh);
    game.effects.push({ mesh, life, max: life, kind: 'custom', tick, tag });
  }

  function flatRing(x, z, r0, r1, color, opacity = 0.8, y = 0.13) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 30), fxMat(color, opacity));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, groundY(x, z) + y, z);
    return m;
  }

  // 무기 휘두르기: 바닥 부채꼴 잔상 없이 몸 동작 + 짧은 궤적만.
  // 이중타격 · 치명타 · 스턴 같은 특수 판정에서만 화려한 타격 이펙트가 터진다.
  function weaponSwingFx(fam, p, a, W, hits) {
    const fx = Math.sin(a), fz = Math.cos(a);
    const gy = groundY(p.x, p.z);
    if (fam === 'dagger') {
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, W.range * 0.8), fxMat(0xdff4ff, 0.5));
        m.position.set(p.x + fx * W.range * 0.45, gy + 1.05 + i * 0.12, p.z + fz * W.range * 0.45);
        m.rotation.y = a;
        addFx(m, 0.13, (f, k) => { m.material.opacity = k * 0.45; }, 'dagger:motion');
      }
      dustBurst(p.x + fx * 0.6, p.z + fz * 0.6, 0xdff4ff, 2);
    } else if (fam === 'axe' || fam === 'mace') {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), fxMat(fam === 'axe' ? 0xffcf8a : 0xffe0a0, 0.8));
      const y0 = fam === 'axe' ? 2.3 : 2.0;
      tip.position.set(p.x + fx * 0.9, gy + y0, p.z + fz * 0.9);
      addFx(tip, 0.24, (f, k) => { tip.position.y = gy + 0.25 + (1 - k) * y0 * 0.75; tip.material.opacity = k * 0.8; }, 'melee:tip');
      dustBurst(p.x + fx * 1.1, p.z + fz * 1.1, fam === 'axe' ? 0xffd6a0 : 0xfff0c0, 3);
    } else if (fam === 'bow' || fam === 'crossbow') {
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), fxMat(0xffe0a0, 0.85));
      flash.position.set(p.x + fx * 0.6, gy + 1.1, p.z + fz * 0.6);
      addFx(flash, 0.12, (f, k) => { flash.scale.setScalar(1 + (1 - k) * 1.6); flash.material.opacity = k; }, 'ranged:muzzle');
    } else if (fam === 'staff' || fam === 'book') {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), fxMat(fam === 'staff' ? 0xb58cff : 0x9ff0ff, 0.9));
      orb.position.set(p.x + fx * 0.7, gy + 1.25, p.z + fz * 0.7);
      addFx(orb, 0.22, (f, k) => { orb.scale.setScalar(0.6 + (1 - k) * 1.5); orb.material.opacity = k; }, 'cast:orb');
    } else {
      dustBurst(p.x + fx * 0.7, p.z + fz * 0.7, 0xeaf6ff, 2);
      for (let i = 0; i < 2; i++) {
        const st = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), fxMat(0xdff2ff, 0.7));
        const sa = a + (i - 0.5) * 1.3;
        st.position.set(p.x + Math.sin(sa) * W.range * 0.75, gy + 1.0, p.z + Math.cos(sa) * W.range * 0.75);
        addFx(st, 0.15, (f, k) => { st.material.opacity = k * 0.6; st.position.y += 0.01; }, 'sword:motion');
      }
    }
  }

  // ---------- 특수 판정 타격 이펙트 (파박!) ----------
  // 치명타 · 이중타격 · 스턴에만 PNG 임팩트가 크게 터진다.
  let impactTex = null;
  const SPECIAL = {
    crit: { label: '치명타!', size: 2.5, shake: 0.34, color: 0xffd257 },
    double: { label: '이중타격!', size: 2.0, shake: 0.24, color: 0x9fe0ff },
    stun: { label: '스턴!', size: 2.2, shake: 0.26, color: 0xffe066 },
  };
  function specialHit(e, kind) {
    const c = SPECIAL[kind] || SPECIAL.crit;
    if (!impactTex) impactTex = getTexture(THREE, ASSET_URL.fx('impact'));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: impactTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
    const y = groundY(e.x, e.z) + (e.headY || 1.2) * 0.72;
    m.position.set(e.x, y, e.z);
    m.renderOrder = 30;
    scene.add(m);
    const base = c.size * (e.isBoss || e.isField ? 1.35 : e.isMid ? 1.15 : 1);
    addFx(m, 0.34, (fx, k) => {
      m.rotation.set(0, Math.atan2(camera.position.x - e.x, camera.position.z - e.z), 0);
      m.scale.setScalar(base * (0.55 + (1 - k) * 0.75));
      m.material.opacity = Math.min(1, k * 1.8);
      m.position.y = y + (1 - k) * 0.15;
    }, 'special:impact');
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), fxMat(c.color, 0.95));
      sp.position.set(e.x, y, e.z);
      const ang = (i / 7) * TAU + Math.random();
      const spd = 2.4 + Math.random() * 2.6;
      addFx(sp, 0.3 + Math.random() * 0.12, (fx, k) => {
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
    const gy = groundY(x, z);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), fxMat(color, 0.85));
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

  function stunStars(x, y, z) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), fxMat(0xffe066, 0.95));
      m.position.set(x, y, z);
      addFx(m, 1.0, (fx) => {
        const t = (fx.max - fx.life) * 4 + (i / 3) * TAU;
        m.position.set(x + Math.cos(t) * 0.42, y + Math.sin(t * 2) * 0.12, z + Math.sin(t) * 0.42);
        m.rotation.y += 0.2;
        m.material.opacity = Math.min(1, fx.life * 2);
      }, 'mace:stars');
    }
  }

  function hitBurst(x, z, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), fxMat(color, 0.9));
    m.position.set(x, groundY(x, z) + 0.9, z);
    addFx(m, 0.2, (fx, k) => { m.scale.setScalar(1 + (1 - k) * 2.2); m.material.opacity = k; }, 'hit:burst');
  }

  // ---------- 원거리 ----------
  function buildProjectileMesh(style, color) {
    const g = new THREE.Group();
    const basic = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op, depthWrite: false });
    const add = (c, op = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    if (style === 'arrow' || style === 'pierce') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.86, 6), basic(0xdcc39a));
      shaft.rotation.x = Math.PI / 2; g.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), basic(0xe9f2ff));
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.52; g.add(tip);
      for (const s of [-.06, .06]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.2), basic(0xffffff));
        f.position.set(0, s, -0.34); f.rotation.x = 0.3; g.add(f);
      }
      const glowM = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), add(style === 'pierce' ? (color || 0xbfe6ff) : 0xfff0c0, 0.35));
      glowM.position.z = 0.1; g.add(glowM);
      if (style === 'pierce') {
        const trail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.7), add(color || 0xbfe6ff, 0.45));
        trail.position.z = -0.6; g.add(trail);
      }
    } else if (style === 'bolt') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.46), basic(0xd7e2f0));
      shaft.position.z = 0.0; g.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), basic(0xffffff));
      tip.rotation.x = Math.PI / 2; tip.position.z = 0.3; g.add(tip);
      const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.07), basic(0x8fb8e0));
      fletch.position.z = -0.25; g.add(fletch);
    } else if (style === 'fireball') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), add(0xff8a3c, 0.95));
      g.add(core);
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), add(0xffe08a, 1));
      g.add(inner);
      for (let i = 0; i < 3; i++) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), add(0xff5a2a, 0.6));
        fl.position.z = -0.3 - i * 0.16; fl.position.x = (Math.random() - 0.5) * 0.1;
        g.add(fl);
      }
    } else if (style === 'ice') {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), add(0x9fe8ff, 0.95));
      shard.scale.set(0.8, 1.3, 0.8); g.add(shard);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 4, 10), add(0xdff6ff, 0.8));
      g.add(halo);
    } else {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 9, 7), add(color || 0x9fd8ff, 0.95));
      g.add(orb);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 4, 12), add(color || 0x9fd8ff, 0.7));
      g.add(halo);
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
      targetTank: !!o.targetTank,
    });
  }

  function explodeAt(x, z, radius, dmg) {
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 26),
      new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(x, groundY(x, z) + 0.11, z);
    addFx(disk, 0.4, (fx, k) => {
      disk.scale.setScalar(radius * (0.35 + (1 - k) * 0.85));
      disk.material.opacity = 0.7 * k;
    }, 'fire:disk');
    const ring = flatRing(x, z, 0.3, 1.0, 0xffa040, 0.95, 0.12);
    addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * radius * 1.6); ring.material.opacity = k * 0.9; }, 'fire:explode');
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), fxMat(0xffcc66, 0.9));
    core.position.set(x, groundY(x, z) + 0.9, z);
    addFx(core, 0.32, (fx, k) => { core.scale.setScalar(1 + (1 - k) * 3.2); core.material.opacity = k * 0.85; }, 'fire:core');
    dustBurst(x, z, 0xff8a3c, 8);
    game.camShake = Math.max(game.camShake, 0.34);
    for (const e of [...game.enemies]) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - x, e.z - z) <= radius + e.radius) game.dealDamage(e, dmg, { heavy: true });
    }
  }

  function fireZone(x, z, radius, dmg, duration) {
    const ring = flatRing(x, z, radius * 0.2, radius, 0xff6a2a, 0.5, 0.09);
    addFx(ring, duration, (fx, k, dt2) => {
      ring.material.opacity = 0.25 + Math.sin(game.time * 8) * 0.12;
      ring.scale.setScalar(1 + Math.sin(game.time * 5) * 0.04);
      fx.tickT = (fx.tickT || 0) - (dt2 || 0);
      if (fx.tickT <= 0) {
        fx.tickT = 0.5;
        for (const e of [...game.enemies]) if (e.alive && Math.hypot(e.x - x, e.z - z) <= radius + e.radius) game.dealDamage(e, dmg);
      }
    }, 'fire:zone');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 5), fxMat(0xffb055, 0.7));
      const fgy = groundY(x + Math.cos(a) * radius * 0.7, z + Math.sin(a) * radius * 0.7);
      fl.position.set(x + Math.cos(a) * radius * 0.7, fgy + 0.45, z + Math.sin(a) * radius * 0.7);
      addFx(fl, duration, (fx) => {
        fl.position.y = fgy + 0.45 + Math.sin(game.time * 9 + i) * 0.14;
        fl.material.opacity = 0.45 + Math.sin(game.time * 7 + i) * 0.22;
      }, 'fire:flame');
    }
  }

  function healFx(x, z, color = 0x7dffb0) {
    const ring = flatRing(x, z, 0.2, 0.7, color, 0.9, 0.1);
    addFx(ring, 0.7, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 1.8); ring.material.opacity = k * 0.9; }, 'heal:ring');
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), fxMat(color, 0.9));
      const hgy = groundY(x, z);
      m.position.set(x + (Math.random() - 0.5) * 0.5, hgy + 0.4, z + (Math.random() - 0.5) * 0.5);
      addFx(m, 0.8, (fx, k) => { m.position.y = hgy + 0.4 + (1 - k) * 1.4; m.material.opacity = k; }, 'heal:spark');
    }
  }

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
      const useTank = e.targetType === 'tank' && tankOk;
      const txp = useTank ? tank.x : p.x;
      const tzp = useTank ? tank.z : p.z;
      const dx = txp - e.x, dz = tzp - e.z;
      const dd = Math.hypot(dx, dz);
      const homeD = Math.hypot(e.x - e.home.x, e.z - e.home.z);

      // 어그로 이탈: 스폰 지점에서 너무 멀어지면 복귀하며 체력을 회복한다
      if (!e.def.boss && e.state !== 'return' && homeD > game.leashRange) {
        e.state = 'return';
        e.targetType = 'player';
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
        if (dd > e.def.aggro * 2.4) { e.state = 'idle'; continue; }
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
    e.x = clamp(e.x + dx, -WORLD_HALF + 2, WORLD_HALF - 2);
    e.z = clamp(e.z + dz, -WORLD_HALF + 2, WORLD_HALF - 2);
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
    const tx = useTank ? tank.x : p.x;
    const tz = useTank ? tank.z : p.z;
    if (style === 'ranged' || style === 'poison') {
      spawnProjectile({
        from: 'enemy', x: e.x, y: 1.0, z: e.z, targetX: tx, targetZ: tz,
        speed: style === 'poison' ? 8 : 9.5, color: style === 'poison' ? 0x9bff6a : 0xc58fff,
        dmg: e.atk, range: Math.hypot(tx - e.x, tz - e.z) + 2, style, targetTank: useTank,
      });
      return;
    }
    if (style === 'aoe') {
      // 일반 몹은 텔레그래프 광역기를 쓰지 않는다 (보스급 전용) — 근접 타격으로 대체
      if (!e.isMid && !e.isBoss && !e.isField) {
        const ddm = Math.hypot(tx - e.x, tz - e.z);
        if (ddm < e.def.atkRange + e.radius + 0.6) {
          if (useTank) damageCompanion(tank, e.atk * 0.7);
          else game.damagePlayer(e.atk * 0.7, e);
        }
        return;
      }
      // 스킬 쿨다운을 두어 광역기를 너무 자주 쓰지 않게 한다
      if ((e.skillCd || 0) > 0) {
        const ddm = Math.hypot(tx - e.x, tz - e.z);
        if (ddm < e.def.atkRange + e.radius + 0.6) {
          if (useTank) damageCompanion(tank, e.atk * 0.7);
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
      for (const e of game.enemies) if (e.targetType === 'tank') e.targetType = 'player';
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
        spawnEnemy(def, e.x + Math.cos(a) * 3.5, e.z + Math.sin(a) * 3.5, true);
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
      const child = spawnEnemy(def, e.x + Math.cos(ang) * 2.8, e.z + Math.sin(ang) * 2.8, true);
      child.pattern = 'split';
      child.splitStage = stage + 1;
      child.splitDone = stage + 1 >= 2;
    }
    dustBurst(e.x, e.z, 0x9fe0a0, 12);
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
        const run = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.035, len), new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.34, depthWrite: false }));
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
      if (c.trail) { scene.remove(c.trail); c.trail.geometry.dispose(); c.trail.material.dispose(); }
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
    dustBurst(e.x, e.z, 0x8a6a3a, 10);
    if (game.ui) game.ui.floatText(e.x, groundY(e.x, e.z) + (e.headY || 2) + 0.4, e.z, '내려찍기!', 'hurt');
    return true;
  }

  // 회오리 소환: 플레이어를 향해 천천히 이동하며 닿으면 피해를 주는 회오리
  function bossWhirlwind(e) {
    const p = game.player;
    const dx = p.x - e.x, dz = p.z - e.z;
    const dd = Math.hypot(dx, dz) || 1;
    const sx = e.x + (dx / dd) * 3, sz = e.z + (dz / dd) * 3;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.8, 10), new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.5, depthWrite: false }));
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
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0x4a3a2a }));
      base.position.y = 0.35; grp.add(base);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0x2a2a30 }));
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
    const ring = flatRing(cx, cz, 1.2, 3.4, 0xb46cff, 0.85, 0.15);
    addFx(ring, 3, (fx, k) => { ring.scale.setScalar(0.6 + (1 - k) * 0.8); ring.material.opacity = k * 0.85; ring.rotation.z += 0.05; }, 'portal:ring');
    const core = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ color: 0x7a3fd0, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    core.rotation.x = -Math.PI / 2; core.position.set(cx, groundY(cx, cz) + 0.14, cz); core.renderOrder = 11;
    addFx(core, 3, (fx, k) => { core.material.opacity = k * 0.5; core.scale.setScalar(0.4 + (1 - k) * 0.7); }, 'portal:core');
    const adds = [];
    for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      const def = game.zone.mobs.normal[adds.length % game.zone.mobs.normal.length];
      adds.push(spawnEnemy(def, cx + ox, cz + oz, true));
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
      addPoisonPool(p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2, e.atk * 0.8);
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
          spawnProjectile({ from: 'enemy', x: e.x, y: 3.2, z: e.z, targetX: e.x + Math.sin(a) * 12, targetZ: e.z + Math.cos(a) * 12, speed: 11, color: 0x66c2ff, dmg: e.atk * 1.1, range: 12, style: 'orb' });
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
        dustBurst(e.x, e.z, 0x9fc8e8, 12);
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
        spawnEnemy(def, e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, true);
      }
      dustBurst(e.x, e.z, 0xcfcfe8, 10);
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
      if (!other) { e.shielded = false; setShieldVisual(e, false); return; }
      e.shielded = false; setShieldVisual(e, false);
      other.shielded = true; setShieldVisual(other, true);
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
    dustBurst(e.x, e.z, 0xd8d8d8, 12);
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
      const ring = flatRing(e.x, e.z, 0.4, 3.5, 0xffd257, 0.9, 0.12);
      addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 1.4); ring.material.opacity = k * 0.9; }, 'brother:spin');
      dustBurst(e.x, e.z, 0xffd257, 8);
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
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 30),
      new THREE.MeshBasicMaterial({ color: 0xff2f45, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, groundY(x, z) + 0.3, z);
    mesh.renderOrder = 12;
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 34), new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, groundY(x, z) + 0.31, z); ring.renderOrder = 13; scene.add(ring);
    const mark = new THREE.Mesh(new THREE.RingGeometry(r * 0.12, r * 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xffd0d0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.set(x, groundY(x, z) + 0.31, z); mark.renderOrder = 13; scene.add(mark);
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
        scene.remove(t.mesh); scene.remove(t.ring); scene.remove(t.mark);
        t.mesh.geometry.dispose(); t.mesh.material.dispose();
        t.ring.geometry.dispose(); t.ring.material.dispose();
        if (t.mark) { t.mark.geometry.dispose(); t.mark.material.dispose(); }
        t.remove = true;
      }
    }
    game.telegraphs = game.telegraphs.filter((t) => !t.remove);
  }

  game.damagePlayer = function (amount, source) {
    const p = game.player;
    if (!p || !p.alive) return;
    const d = game.derived();
    const medal = game.medalInfo(game.zone.id).bonus;
    if (Math.random() < d.evade) {
      if (game.ui) game.ui.damageNumber(p.x, groundY(p.x, p.z) + 1.6, p.z, '회피', 'heal');
      return;
    }
    const mitigation = d.defense / (d.defense + 55 + game.state.level * 5);
    let dmg = amount * (1 - mitigation) * (1 - medal);
    // 방어구 상성
    const threat = game.zone.threat;
    if (d.armorResist === threat) dmg *= 0.7 * Math.max(0.4, 1 - d.resist / 100);
    dmg = Math.max(1, Math.round(dmg));
    p.hp -= dmg;
    if (game.ui) game.ui.damageNumber(p.x, groundY(p.x, p.z) + 1.7, p.z, `-${dmg}`, 'hurt');
    game.camShake = Math.max(game.camShake, 0.16);
    if (p.hp <= 0) playerDown();
  };

  // 둔기 보스 스턴 내려찍기용: 플레이어를 잠시 기절시킨다
  game.stunPlayer = function (sec) {
    const p = game.player;
    if (!p || !p.alive) return;
    p.stunT = Math.max(p.stunT || 0, sec);
    stunStars(p.x, groundY(p.x, p.z) + 1.6, p.z);
    if (game.ui) game.ui.floatText(p.x, groundY(p.x, p.z) + 1.9, p.z, '기절!', 'hurt');
  };

  function playerDown() {
    const p = game.player;
    p.alive = false;
    p.hp = 0;
    p.respawnT = 2.6;
    if (game.ui) game.ui.showDeath(true);
    // 보스 HP·어그로 초기화
    for (const e of game.enemies) {
      if (!e.alive) continue;
      if (e.isBoss || e.isMid) {
        e.hp = e.maxHp;
        e.x = e.home.x; e.z = e.home.z;
        e.state = 'idle'; e.atkCd = 1.5; e.summonDone = false; e.telegraphT = 4;
        // 패턴 상태 초기화 (광폭화·포탈 강화·비행·보호막·석상)
        e.patternCd = 6; e.weaponCd = 5; e.flyY = 0; e.dragonPhase = null; e.dragonT = 0;
        e.enrageStacks = 0; e.enrageT = 0; e.atk = e.baseAtk; e.speed = e.baseSpeed;
        e.portalAdds = null; e.portalT = 0; e.buffOn = false;
        e.necroWave = 0; e.necroT = 9; e.splitDone = false;
        if (e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(0xffffff);
        if (e.group === 'twins') { e.shielded = e.def.key === 'twinA'; setShieldVisual(e, e.shielded); e.twinSwapT = 8; }
        if (e.group === 'brothers') {
          e.statue = !!e.def.statue;
          if (e.statue && e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(0x8f8f8f);
        }
        e.mesh.position.set(e.x, groundY(e.x, e.z), e.z);
      }
    }
    for (const t of game.telegraphs) { scene.remove(t.mesh); scene.remove(t.ring); if (t.mark) scene.remove(t.mark); }
    game.telegraphs = [];
    // 회오리·대포 같은 보스 패턴 이펙트도 함께 정리한다
    for (const fx of game.effects) {
      if ((fx.kind === 'whirlwind' || fx.kind === 'cannon') && fx.mesh) { scene.remove(fx.mesh); disposeGroup(fx.mesh); }
    }
    game.effects = game.effects.filter((fx) => fx.kind !== 'whirlwind' && fx.kind !== 'cannon');
    for (const pr of game.projectiles) if (pr.from === 'enemy') scene.remove(pr.mesh);
    game.projectiles = game.projectiles.filter((pr) => pr.from !== 'enemy');
    if (game.ui) game.ui.updateBossBar(null);
  }

  // ---------- 동료 ----------
  function makeCompanionObj(c, cls, mesh, x, z) {
    const maxHp = Math.round(cls.hp * (1 + (c.grade || 0) * 0.15) * (1 + ((c.lv || 1) - 1) * 0.08));
    return {
      data: c, cls, mesh, x, z, atkCd: Math.random(), healCd: 2, skillCd: 4,
      maxHp, hp: maxHp, tauntCd: 0.2, downT: 0, hitT: 0,
    };
  }

  function healTarget(target, pct, flat) {
    const maxHp = target === 'player' ? null : target.maxHp;
    if (target === 'player' || target === game.player) {
      const d = game.derived();
      const before = game.player.hp;
      game.player.hp = Math.min(d.maxHp, game.player.hp + d.maxHp * pct + flat);
      healFx(game.player.x, game.player.z);
      return Math.round(game.player.hp - before);
    }
    const before = target.hp;
    target.hp = Math.min(maxHp, target.hp + maxHp * pct + flat);
    healFx(target.x, target.z);
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
      const fixed = pushOutOfProps(game.player.x - 1.6 + i * 1.6, game.player.z + 1.8, 0.35);
      c.x = fixed.x; c.z = fixed.z;
      if (c.mesh) {
        c.mesh.position.set(c.x, groundY(c.x, c.z), c.z);
        c.mesh.rotation.y = Math.PI;
      }
    });
  }

  // ---------- 동료 대표 스킬 (스킬 개편) ----------
  // 주인공은 스킬을 쓰지 않는다. 동료만 직업별 대표 스킬 하나를 전투 중에 자동 사용한다.
  // 조건이 안 맞으면(사거리 안에 적이 없거나, 아군이 안 다쳤거나) 쿨다운을 태우지 않고 0.5초 뒤 다시 확인한다.
  // 성공하면 true, 조건이 안 맞아서 안 썼으면 false를 돌려준다.
  function castCompanionSkill(c, skillLv) {
    const def = COMPANION_SKILLS[c.cls.id];
    if (!def) return false;
    const p = game.player;
    const atk = c.cls.atk * (1 + ((c.data.lv || 1) - 1) * 0.22) * (1 + (c.data.grade || 0) * 0.20);
    const dmgOf = (mult) => atk * mult;
    if (c.cls.id === 'tank') {
      // 방패 강타: 주변 적에게 피해 + 맞은 적을 3초간 탱커에게 붙잡아 둔다 (보스급 제외)
      if (!nearestEnemyFrom(c.x, c.z, def.radius + 1.4)) return false;
      const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
      let hit = 0;
      for (const e of [...game.enemies]) {
        if (!e.alive || Math.hypot(e.x - c.x, e.z - c.z) > def.radius + e.radius) continue;
        game.dealDamage(e, dmg, { heavy: true, elem: def.elem, canCrit: false });
        if (!e.def.boss) { e.targetType = 'tank'; e.state = 'chase'; e.tauntT = def.tauntT; }
        hit++;
      }
      if (!hit) return false;
      const ring = flatRing(c.x, c.z, 0.4, def.radius, 0x9fc4ff, 0.85, 0.12);
      addFx(ring, 0.4, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'compskill:slam');
      if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.0, c.z, '방패 강타!', 'heal');
      return true;
    }
    if (c.cls.id === 'melee') {
      // 회전 베기: 주변 모든 적에게 피해
      if (!nearestEnemyFrom(c.x, c.z, def.radius + 1.4)) return false;
      const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
      let hit = 0;
      for (const e of [...game.enemies]) {
        if (!e.alive || Math.hypot(e.x - c.x, e.z - c.z) > def.radius + e.radius) continue;
        game.dealDamage(e, dmg, { heavy: true, elem: def.elem, canCrit: false });
        hit++;
      }
      if (!hit) return false;
      const ring = flatRing(c.x, c.z, 0.4, def.radius, 0xbfe6ff, 0.85, 0.12);
      addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'compskill:whirl');
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, def.radius * 0.9), fxMat(0xeaf6ff, 0.8));
        blade.position.y = 0.7; blade.rotation.y = (i / 3) * TAU;
        const g = new THREE.Group(); g.add(blade); g.position.set(c.x, groundY(c.x, c.z), c.z);
        const off = (i / 3) * TAU;
        addFx(g, 0.4, (fx) => { g.rotation.y = off + (fx.max - fx.life) * 14; blade.material.opacity = Math.min(0.85, fx.life * 2.2); }, 'compskill:blade');
      }
      if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.0, c.z, '회전 베기!', 'heal');
      return true;
    }
    if (c.cls.id === 'mage') {
      // 파이어볼: 가장 가까운 적에게 불덩이 발사 (맞으면 폭발)
      const t = nearestEnemyFrom(c.x, c.z, def.range);
      if (!t) return false;
      const dmg = dmgOf(def.mult + def.multPerLv * (skillLv - 1));
      spawnProjectile({
        from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 14,
        color: 0xff8a3c, dmg, range: def.range, style: 'fireball', skill: 'fireball', radius: 0.5,
      });
      return true;
    }
    if (c.cls.id === 'healer') {
      // 치유의 빛: 전투 중에만 쓴다 (12m 안에 적이 있을 때). 아군이 다쳤을 때만 발동.
      if (!nearestEnemyFrom(c.x, c.z, 12)) return false;
      const d = game.derived();
      const allies = [{ obj: 'player', hp: p.hp, max: d.maxHp, x: p.x, z: p.z },
        ...game.companions.filter((x) => x.hp > 0).map((x) => ({ obj: x, hp: x.hp, max: x.maxHp, x: x.x, z: x.z }))];
      allies.sort((a, b) => a.hp / a.max - b.hp / b.max);
      const low = allies[0];
      if (!low || low.hp / low.max >= 0.7) return false;
      // Lv.4부터 두 명, Lv.7부터 파티 전체를 회복한다
      const targets = skillLv >= 7 ? allies.filter((a) => a.hp / a.max < 0.95)
        : skillLv >= 4 ? allies.filter((a) => a.hp / a.max < 0.95).slice(0, 2) : [low];
      const pct = def.healPct + def.healPctPerLv * (skillLv - 1);
      const flat = def.healFlat + def.healFlatPerLv * (skillLv - 1);
      let healed = 0;
      for (const a of targets) {
        const h = healTarget(a.obj, pct, flat);
        healed += h;
        if (h > 0 && game.ui) game.ui.damageNumber(a.x, groundY(a.x, a.z) + 1.8, a.z, `+${h}`, 'heal');
      }
      if (!healed) return false;
      // Lv.3부터는 주인공이 회복될 때 독도 함께 풀어준다
      if (skillLv >= 3 && targets.some((a) => a.obj === 'player')) {
        p.poisonT = 0; p.poisonStacks = 0;
        game.state.cleanseT = 4;
      }
      if (game.ui) game.ui.floatText(c.x, groundY(c.x, c.z) + 2.1, c.z, '치유의 빛!', 'heal');
      return true;
    }
    return false;
  }

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
      const tx = p.x + off[0], tz = p.z + off[1];
      const dx = tx - c.x, dz = tz - c.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 1.2) {
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
        const swing = dd > 1.2 ? Math.sin(game.time * 9 + i) * 0.5 : 0;
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
      const scale = 1 + ((c.data.lv || 1) - 1) * 0.22;
      const atk = c.cls.atk * scale * (1 + (c.data.grade || 0) * 0.20);
      // 동료 대표 스킬 (자동 사용, 전투 중에만 — castCompanionSkill이 조건을 본다)
      if (c.skillCd <= 0) {
        const lv = game.companionSkillLevel(c.data);
        const def = COMPANION_SKILLS[c.cls.id];
        if (def && castCompanionSkill(c, lv)) c.skillCd = compSkillCd(def, lv);
        else c.skillCd = 0.5; // 조건이 안 맞으면 쿨다운을 태우지 않고 0.5초 뒤 다시 확인
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
          const t = nearestEnemyFrom(c.x, c.z, 6.5);
          if (t) { c.atkCd = c.cls.cd; game.dealDamage(t, atk); } }
        return;
      }
      if (c.atkCd <= 0) {
        const t = nearestEnemyFrom(c.x, c.z, c.cls.range + 1.4);
        if (t) {
          c.atkCd = c.cls.cd;
          c.mesh.rotation.y = Math.atan2(t.x - c.x, t.z - c.z);
          if (c.cls.projectile) {
            spawnProjectile({ from: 'ally', x: c.x, y: 1.0, z: c.z, targetX: t.x, targetZ: t.z, speed: 13, color: c.cls.color, dmg: atk, range: c.cls.range + 1.6 });
          } else {
            game.dealDamage(t, atk);
          }
        }
      }
    });
  }

  function nearestEnemyFrom(x, z, range) {
    let best = null, bd = 69420;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const dd = Math.hypot(e.x - x, e.z - z);
      if (dd < range && dd < bd) { bd = dd; best = e; }
    }
    return best;
  }

  // ---------- 스킬북 보너스 지급 규칙 (마이그레이션·스킬북 사용 공통, 1가지) ----------
  // 1) 그 직업 동료가 동행 중이면 동행 중인 전원에게 +n
  // 2) 동행 중이 없으면 보유한 동료 중 첫 번째에게 +n
  // 3) 그 직업 동료가 아예 없으면 pendingBonus에 쌓아두고, 나중에 그 직업 동료를 뽑으면 시작 보너스로 준다
  // 보너스를 받은 동료 목록을 돌려준다 (빈 배열 = 동료가 없어서 pendingBonus에 쌓였다는 뜻).
  function grantClassSkillBonus(s, cls, n = 1) {
    const targets = s.companions.filter((c) => c.cls === cls && s.party.includes(c.id));
    if (targets.length) {
      for (const c of targets) c.skillBonus = (c.skillBonus || 0) + n;
      return targets;
    }
    const first = s.companions.find((c) => c.cls === cls);
    if (first) {
      first.skillBonus = (first.skillBonus || 0) + n;
      return [first];
    }
    if (!s.skills.pendingBonus) s.skills.pendingBonus = {};
    s.skills.pendingBonus[cls] = (s.skills.pendingBonus[cls] || 0) + n;
    return [];
  }

  // ---------- 동료 대표 스킬 ----------
  // 스킬 레벨 = 등급 + 1 + 스킬북 보너스 (최대 10). 등급이 오르면 자동으로 강해진다.
  game.companionSkillLevel = function (cData) {
    if (!cData) return 1;
    return Math.min(COMPANION_SKILL_MAX_LEVEL, (cData.grade || 0) + 1 + (cData.skillBonus || 0));
  };
  game.companionSkillDef = function (clsId) { return COMPANION_SKILLS[clsId] || null; };
  game.companionSkillState = function () {
    return (game.companions || []).map((c) => {
      const def = COMPANION_SKILLS[c.cls.id];
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

  // 스킬북 사용 (스킬 개편): 주인공은 스킬을 배우지 않는다.
  // 스킬북을 쓰면 해당 직업 동료의 대표 스킬 보너스가 +1 된다.
  // 이미 배운 스킬의 책을 다시 써도 보너스는 적용된다 (책은 소모된다).
  // 배운 스킬 목록(learned)은 기록으로 남기고 삭제하지 않는다.
  game.learnSkill = function (id) {
    const def = SKILLS[id];
    if (!def) return { ok: false, reason: 'unknown' };
    if (!(game.state.skillbooks[id] > 0)) return { ok: false, reason: 'nobook' };
    game.state.skillbooks[id] -= 1;
    if (!(game.state.skillbooks[id] > 0)) delete game.state.skillbooks[id];
    const s = game.state.skills;
    if (!s.learned.includes(id)) s.learned.push(id);
    const cls = SKILL_BOOK_CLASS[id];
    const targets = cls ? grantClassSkillBonus(game.state, cls, 1) : [];
    game.save();
    if (game.ui) { game.ui.markDirty(true); game.ui.renderSkillBar && game.ui.renderSkillBar(); }
    return { ok: true, cls: cls || null, granted: targets.map((c) => c.name), pending: !!cls && targets.length === 0 };
  };

  // 주인공 스킬 시전은 스킬 개편으로 제거됐다 (주인공은 무기 공격만 한다).
  // 스킬은 동료 대표 스킬로만 나간다 (castCompanionSkill).
  // 예전 디버그 API가 깨지지 않게 실패 결과만 돌려준다.
  game.castSkill = function () { return { ok: false, reason: 'companion-only' }; };
  game.canCastSkill = function () { return { ok: false, reason: 'companion-only' }; };

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
              explodeAt(pr.x, pr.z, SKILLS.fireball.radius, pr.dmg);
              pr.dead = true;
              break;
            }
            if (pr.skill === 'icebolt') {
              game.dealDamage(e, pr.dmg);
              e.slowT = SKILLS.icebolt.slowT;
              hitBurst(pr.x, pr.z, 0x9fe8ff);
              pr.dead = true;
              break;
            }
            game.dealDamage(e, pr.dmg);
            hitBurst(pr.x, pr.z, pr.color || 0xffffff);
            if (!pr.pierce || pr.hits.size >= pr.pierce) { pr.dead = true; break; }
          }
        }
      } else {
        if (pr.targetTank) {
          const tank = game.tank;
          if (tank && tank.hp > 0 && Math.hypot(tank.x - pr.x, tank.z - pr.z) < 0.9) {
            damageCompanion(tank, pr.dmg);
            pr.dead = true;
          }
        } else if (p.alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 0.75) {
          game.damagePlayer(pr.dmg, null);
          pr.dead = true;
          if (pr.style === 'poison') addPoisonPool(pr.x, pr.z, pr.dmg);
        }
      }
      if (pr.life > pr.max || Math.abs(pr.x) > 46 || Math.abs(pr.z) > 46) pr.dead = true;
      if (pr.dead) disposeObj(pr.mesh);
    }
    game.projectiles = game.projectiles.filter((x) => !x.dead);
  }

  function addPoisonPool(x, z, dmg) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), new THREE.MeshBasicMaterial({ color: 0x7ad64a, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
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
        const geo = it.type === 'gold' ? new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8)
          : it.type === 'book' ? new THREE.BoxGeometry(0.3, 0.24, 0.07)
            : new THREE.SphereGeometry(0.15, 7, 5);
        it.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
        if (it.type === 'book') {
          const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 4, 12), new THREE.MeshBasicMaterial({ color: 0xe8d8ff, transparent: true, opacity: 0.8, depthWrite: false }));
          halo.rotation.x = -Math.PI / 2;
          it.mesh.add(halo);
        }
        scene.add(it.mesh);
      }
      it.mesh.position.set(it.x, groundY(it.x, it.z) + 0.5 + Math.sin(it.t * 4) * 0.1, it.z);
      it.mesh.rotation.y += dt * 3;
      const nd = Math.hypot(p.x - it.x, p.z - it.z);
      if (nd < 0.75) { collect(it); it.alive = false; scene.remove(it.mesh); }
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
      if (game.ui) game.ui.toast(`${itemName(it.data.kind, it.data.fam, it.data.grade)} 획득`, gradeCss(it.data.grade));
    } else if (it.type === 'book') {
      const id = it.data;
      game.state.skillbooks[id] = (game.state.skillbooks[id] || 0) + 1;
      const def = SKILLS[id];
      if (game.ui) game.ui.toast(`스킬북 획득: ${def ? def.name : id} · 가방 → 스킬북에서 배울 수 있어요`, 'gold');
    }
    game.save();
    if (game.ui) game.ui.markDirty();
  }

  function gradeCss(g) { return g >= 4 ? 'gold' : g >= 2 ? 'good' : ''; }

  // ---------- 보관함 ----------
  // 가까이 가면 [열기] 버튼이 뜨고, 눌러야 열린다.
  function updateChests(dt) {
    const p = game.player;
    if (!p) return;
    let near = null, best = 3.0;
    for (const c of game.world.chests) {
      if (c.opened) continue;
      const dd = Math.hypot(p.x - c.x, p.z - c.z);
      if (dd < 2.6 && dd < best) { best = dd; near = c; }
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
      if (ud.mesh) ud.mesh.material.opacity = 1 - 0.25 * k;
      c.mesh.position.y = Math.sin(k * Math.PI) * 0.12;
    }
  }

  game.openChest = function (c) {
    if (!c || c.opened) return false;
    c.opened = true;
    c.opening = 0;
    if (!game.state.chestOpened.includes(c.id)) {
      game.state.chestOpened.push(c.id);
      game.state.chestsFound = Math.min(SECRET_TOTAL, (game.state.chestsFound || 0) + 1);
      const reward = giveChestReward();
      // 보상 연출
      const gold = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), fxMat(0xffd257, 0.95));
      const cgy = groundY(c.x, c.z);
      gold.position.set(c.x, cgy + 0.7, c.z);
      addFx(gold, 0.75, (fx, k) => {
        gold.position.y = cgy + 0.7 + (1 - k) * 1.5;
        gold.position.x = c.x + Math.sin((1 - k) * 6) * 0.4;
        gold.material.opacity = k;
      }, 'chest:gold');
      const ring = flatRing(c.x, c.z, 0.4, 1.0, 0xffe08a, 0.95, 0.12);
      addFx(ring, 0.6, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 2.6); ring.material.opacity = k * 0.9; }, 'chest:ring');
      dustBurst(c.x, c.z, 0xffd257, 10);
      for (let i = 0; i < 8; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 8), fxMat(0xffcf4d, 0.95));
        const a = (i / 8) * TAU;
        coin.position.set(c.x, cgy + 0.7, c.z);
        addFx(coin, 0.9, (fx, k) => {
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
      const kind = pickKind();
      const fam = pickFam(kind);
      const g = Math.min(4, 1 + Math.floor(Math.random() * 3) + (game.zone.id > 2 ? 1 : 0));
      game.addItem(kind, fam, g);
      return { msg: `보관함: ${itemName(kind, fam, g)} 획득!`, grade: g };
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
        if (fx.life <= 0 && fx.mesh) disposeObj(fx.mesh);
      } else if (fx.kind === 'fadeScale' && fx.mesh) {
        fx.mesh.material.opacity = k * 0.9;
        fx.mesh.scale.setScalar((fx.from || 0.92) + (1 - k) * 0.16);
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
      } else if (fx.kind === 'burst') {
        if (!fx.mesh) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: fx.color, transparent: true, opacity: 0.9 }));
          m.position.set(fx.x, groundY(fx.x, fx.z) + 0.8, fx.z); scene.add(m); fx.mesh = m;
        }
        fx.mesh.scale.setScalar(1 + (1 - k) * 4);
        fx.mesh.material.opacity = k;
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
      } else if (fx.kind === 'shockwave') {
        if (!fx.mesh) {
          const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.9, 32), new THREE.MeshBasicMaterial({ color: 0xff7070, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.set(fx.x, groundY(fx.x, fx.z) + 0.12, fx.z); scene.add(m); fx.mesh = m;
        }
        fx.mesh.scale.setScalar(1 + (1 - k) * (fx.r || 4) * 1.2);
        fx.mesh.material.opacity = k * 0.85;
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
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
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
      } else if (fx.kind === 'cannon') {
        // 대포는 주기적으로 플레이어 주변에 작은 빨간원 폭격을 쏜다
        const boss = fx.boss;
        fx.fireT -= dt;
        if (fx.fireT <= 0 && fx.shots < 3 && boss && boss.alive) {
          fx.fireT = 1.0;
          fx.shots++;
          const p = game.player;
          if (p && p.alive) {
            addTelegraph(p.x + (Math.random() - 0.5) * 3, p.z + (Math.random() - 0.5) * 3, 1.7, 1.2, boss.atk * 1.2, boss);
          }
          dustBurst(fx.x, fx.z, 0xffa040, 4);
        }
        if (fx.life <= 0) { scene.remove(fx.mesh); disposeGroup(fx.mesh); }
      } else if (fx.kind === 'pool') {
        fx.tick -= dt;
        if (fx.tick <= 0) {
          fx.tick = 0.5;
          const p = game.player;
          if (p.alive && Math.hypot(p.x - fx.x, p.z - fx.z) < fx.r) game.damagePlayer(fx.dmg, null);
        }
        fx.mesh.material.opacity = 0.2 + Math.sin(game.time * 4) * 0.1;
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
      }
    }
    game.effects = game.effects.filter((f) => f.life > 0);
  }

  let respawnT = 12;
  function updateRespawn(dt) {
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
      if (Math.hypot(p.x - game.player.x, p.z - game.player.z) > 15) { spawnEnemy(def, p.x, p.z); break; }
    }
  }

  // ---------- 카메라 ----------
  let camPos = new THREE.Vector3(0, 18, 26);
  // 카메라 각도 완전 고정(약 45도 쿼터뷰). 캐릭터가 움직여도 회전하지 않는다.
  function camRig() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const vis = Math.min(15.5, Math.max(11, 9.6 / aspect));
    return { back: vis * 1.08, height: vis * 1.22, vis };
  }
  function updateCamera(dt) {
    const p = game.player;
    const rig = camRig();
    const gy = groundY(p.x, p.z);
    const shake = game.camShake > 0 ? game.camShake : 0;
    const tx = p.x + (shake ? (Math.random() - 0.5) * shake : 0);
    const tz = p.z + rig.back + (shake ? (Math.random() - 0.5) * shake : 0);
    camPos.x = lerp(camPos.x, tx, 1 - Math.pow(0.0015, dt));
    camPos.z = lerp(camPos.z, tz, 1 - Math.pow(0.0015, dt));
    camPos.y = lerp(camPos.y || gy + rig.height, gy + rig.height, 1 - Math.pow(0.002, dt));
    camera.position.copy(camPos);
    // 시선도 카메라 위치 기준 → 이동해도 화면이 돌지 않는다
    camera.lookAt(camPos.x, gy, camPos.z - rig.back);
    if (game.camShake > 0) game.camShake = Math.max(0, game.camShake - dt * 2.4);
    sun.position.set(p.x + 16, 34, p.z + 14);
    sun.target.position.set(p.x, gy, p.z);
  }

  // ---------- 메인 루프 ----------
  let last = 0;
  function frame(now) {
    if (!game.running) return;
    const t = now / 1000;
    let dt = Math.min(0.05, t - last || 0.016);
    last = t;
    if (!game.paused) step(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function step(dt) {
    game.time += dt;
    const p = game.player;
    if (!p) return;
    if (p.alive) {
      movePlayer(dt);
      // 구역 경계를 걸어서 넘으면 현재 구역이 바뀐다
      const here = districtAt(p.x, p.z);
      if (here.id !== game.zone.id) game.setDistrict(here.id);
      if (p.atkAnim > 0) p.atkAnim -= dt;
      p.atkCd -= dt;
      if (p.atkCd <= 0) playerAttack();
      // 마나 재생
      const dd0 = game.derived();
      p.mp = Math.min(dd0.maxMp, (p.mp === undefined ? dd0.maxMp : p.mp) + 1.8 * dt);
      // (스킬 개편: 주인공 스킬 자동 시전 제거 — 스킬은 동료 대표 스킬로만 나간다)
      // 재생
      const d = game.derived();
      if (d.regen > 0) {
        p.regenT += dt;
        if (p.regenT > 1) { p.regenT = 0; p.hp = Math.min(d.maxHp, p.hp + d.regen); }
      }
      // 늪지 독
      if (game.state.cleanseT > 0) game.state.cleanseT = Math.max(0, game.state.cleanseT - dt);
      if (game.zone.id === 2 && !game.state.equip.charm && !(game.state.cleanseT > 0)) {
        p.poisonT = (p.poisonT || 0) + dt;
        p.poisonStacks = Math.min(3, 1 + Math.floor(p.poisonT / 3));
        if (p.poisonT > 1) { p.poisonT = 0; game.damagePlayer(4 + game.state.level * 0.8, null); }
      }
    } else {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        const d = game.derived();
        p.alive = true;
        p.hp = d.maxHp;
        p.mp = d.maxMp;
        // 죽으면 첫 소환 지점(1구역 스폰)으로 복귀
        game.returnToStart();
        if (game.ui) game.ui.showDeath(false);
        game.save();
      }
    }
    updateEnemies(dt);
    updateCompanions(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    updateTelegraphs(dt);
    updateEffects(dt);
    updateChests(dt);
    updateRespawn(dt);
    updateGraves(dt);
    updateCamera(dt);
    game.world.update(dt, game.time);
    // 보스 바: 가까운 보스가 없으면 숨긴다
    game._bossBarT = (game._bossBarT || 0) + dt;
    if (game._bossBarT > 0.4) {
      game._bossBarT = 0;
      let near = null, nd = 22;
      for (const e of game.enemies) {
        if (!e.alive || !(e.isBoss || e.isMid || e.isField)) continue;
        const dd = Math.hypot(e.x - p.x, e.z - p.z);
        if (dd < nd) { nd = dd; near = e; }
      }
      if (game.ui) game.ui.updateBossBar(near);
    }
    // NPC 근접 (현재 구역 NPC)
    const npcMesh = game.world.npcs[game.zone.id];
    const nnp = !!npcMesh && Math.hypot(p.x - npcMesh.position.x, p.z - npcMesh.position.z) < 3.2;
    if (nnp !== game.nearNpc) {
      game.nearNpc = nnp;
      if (game.ui) game.ui.updateTalkButtons();
    }
    // 자동 저장 (변경이 있을 때만)
    if (game._dirty && game.time - game.lastSave > 6) game.flushSave();
    if (game.ui) game.ui.update(dt);
  }

  game.start = function () {
    if (game.running) return;
    const zid = PLAYABLE.some((z) => z.id === game.state.zone) ? game.state.zone : 1;
    if (!game.state.unlocked.includes(zid)) game.state.zone = 1;
    game.buildWorld({ silent: true });
    game.running = true;
    // 중복 동료 정리 알림 (로드 시 1회): mergeState가 _dedupMerged에 개수를 남겨둔다
    if (game.ui && game.state._dedupMerged > 0) {
      game.ui.toast(`중복 동료 ${game.state._dedupMerged}명을 정리했어요`, 'gold');
      game.state._dedupMerged = 0;
    }
    requestAnimationFrame((t) => { last = t / 1000; frame(t); });
  };

  game.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', () => game.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden && game._dirty) game.flushSave(); });

  // ---------- 상점/성장 ----------
  game.equipItem = function (kind, fam, grade) {
    const key = `${kind}:${fam}:${grade}`;
    if (!game.state.bag[key]) return false;
    const slot = kind === 'accessory' ? fam : kind;
    game.state.bag[key]--;
    if (game.state.bag[key] <= 0) delete game.state.bag[key];
    const prev = game.state.equip[slot];
    if (prev) game.addItem(prev.kind, prev.fam, prev.grade);
    game.state.equip[slot] = { kind, fam, grade };
    // 장착한 무기·방어구가 탑뷰 캐릭터 외형에 바로 반영된다
    if (kind === 'weapon' || kind === 'armor') rebuildPlayerMesh();
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

  game.unequip = function (kind) {
    const it = game.state.equip[kind];
    if (!it) return;
    game.addItem(it.kind, it.fam, it.grade);
    game.state.equip[kind] = null;
    if (kind === 'weapon' || kind === 'armor') rebuildPlayerMesh();
    game.save();
    if (game.ui) game.ui.markDirty(true);
  };

  game.mergeGroups = function () {
    const groups = {};
    for (const key of Object.keys(game.state.bag)) {
      const [kind, fam, g] = key.split(':');
      const grade = parseInt(g, 10);
      if (grade >= 5) continue;
      const gk = `${kind}:${fam}:${grade}`;
      groups[gk] = groups[gk] || { kind, fam, grade, count: 0 };
      groups[gk].count += game.state.bag[key];
    }
    return Object.values(groups).filter((g) => g.count >= 3).sort((a, b) => a.grade - b.grade);
  };

  game.merge = function (kind, fam, grade, all = true) {
    let merged = 0;
    while (true) {
      const key = `${kind}:${fam}:${grade}`;
      if ((game.state.bag[key] || 0) < 3) break;
      game.state.bag[key] -= 3;
      if (game.state.bag[key] <= 0) delete game.state.bag[key];
      game.addItem(kind, fam, grade + 1);
      merged++;
      if (!all) break;
    }
    if (merged) {
      game.save();
      if (game.ui) { game.ui.markDirty(true); game.ui.toast(`합성 성공! ${GRADES[Math.min(5, grade + 1)].name} 등급 ${merged}개 획득`, 'gold'); }
    }
    return merged;
  };

  // ---------- 빨강(신화) 진화 ----------
  // 같은 등급·같은 아이템을 일정 개수 모으면 빨강 등급으로 진화한다.
  game.evolveNeed = EVOLVE_NEED;
  game.evoInfo = function (kind, fam, grade) {
    const key = `${kind}:${fam}:${grade}`;
    const count = game.state.bag[key] || 0;
    const need = grade >= 5 ? 0 : (EVOLVE_NEED[grade] || 0);
    return { key, count, need, can: need > 0 && count >= need, max: grade >= 5 };
  };
  game.evolve = function (kind, fam, grade) {
    if (grade >= 5) return 0;
    const info = game.evoInfo(kind, fam, grade);
    if (!info.can) return 0;
    const key = `${kind}:${fam}:${grade}`;
    const times = Math.floor((game.state.bag[key] || 0) / info.need);
    if (times <= 0) return 0;
    game.state.bag[key] -= info.need * times;
    if (game.state.bag[key] <= 0) delete game.state.bag[key];
    game.addItem(kind, fam, 5, times);
    game.state.evolutions = (game.state.evolutions || 0) + times;
    game.save();
    game.flushSave();
    if (game.ui) { game.ui.markDirty(true); game.ui.toast(`빨강 진화! ${itemName(kind, fam, 5)} ×${times} 획득`, 'gold'); }
    return times;
  };
  game.evolveReady = function () {
    const out = [];
    for (const [key, n] of Object.entries(game.state.bag)) {
      const [kind, fam, g] = key.split(':');
      const grade = parseInt(g, 10);
      if (grade >= 5) continue;
      const need = EVOLVE_NEED[grade];
      if (need && n >= need) out.push({ kind, fam, grade, count: n, need, times: Math.floor(n / need) });
    }
    return out.sort((a, b) => a.grade - b.grade);
  };

  // ---------- 외형(코스튬) ----------
  game.setAppearance = function (mode, costumeId) {
    const ap = game.state.appearance || (game.state.appearance = { mode: 'armor', costumeId: null, unlocked: [] });
    if (mode === 'costume') {
      if (!COSTUME_MAP[costumeId]) return { ok: false, msg: '없는 외형이에요.' };
      if (!ap.unlocked.includes(costumeId)) return { ok: false, msg: '아직 해금하지 않은 외형이에요. 외형 뽑기로 얻어 보세요.' };
      ap.mode = 'costume';
      ap.costumeId = costumeId;
    } else if (mode === 'uniform') {
      ap.mode = 'uniform';
    } else {
      ap.mode = 'armor';
    }
    game.save();
    rebuildPlayerMesh();
    if (game.ui) game.ui.markDirty(true);
    return { ok: true, mode: ap.mode, costumeId: ap.costumeId };
  };
  game.appearanceInfo = function () {
    const ap = game.state.appearance || { mode: 'armor', unlocked: [] };
    return { ...ap, costumes: COSTUMES.map((c) => ({ ...c, owned: ap.unlocked.includes(c.id), level: game.costumeLevel(c.id) })) };
  };
  // 외형 뽑기 (골드 소모 · 중복은 레벨업, 최대 레벨 코스튬은 뽑기 풀에서 제외)
  game.pullCostume = function () {
    const s = game.state;
    const ap = s.appearance || (s.appearance = { mode: 'armor', costumeId: null, unlocked: [], costumeLv: {} });
    ap.unlocked = ap.unlocked || [];
    ap.costumeLv = ap.costumeLv || {};
    // 최대 레벨(Lv.5) 코스튬은 뽑기 풀에서 제외 — 중복 뽑기가 나올 수 없다
    const eligible = COSTUMES.filter((c) => game.costumeLevel(c.id) < COSTUME_MAX_LEVEL);
    if (!eligible.length) return { ok: false, msg: '모든 외형이 최대 레벨이에요! 새 외형이 추가되면 뽑기가 다시 열려요.' };
    if (s.gold < COSTUME_PULL_COST) return { ok: false, msg: `골드가 부족해요 (${COSTUME_PULL_COST} 필요)` };
    s.gold -= COSTUME_PULL_COST;
    const roll = eligible[Math.floor(Math.random() * eligible.length)];
    let leveledUp = false;
    if (ap.unlocked.includes(roll.id)) {
      ap.costumeLv[roll.id] = Math.min(COSTUME_MAX_LEVEL, (ap.costumeLv[roll.id] || 1) + 1);
      leveledUp = true;
    } else {
      ap.unlocked.push(roll.id);
      ap.costumeLv[roll.id] = 1;
    }
    game.save();
    game.flushSave();
    if (game.ui) game.ui.markDirty(true);
    return { ok: true, costume: roll, level: ap.costumeLv[roll.id], leveledUp };
  };

  // ---------- 업적 도감 ----------
  const ACHS = [
    { id: 'first', icon: '🗡️', name: '첫 사냥', desc: '몬스터 1마리 처치', goal: 1, reward: 50, get: (s) => s.kills },
    { id: 'hunter100', icon: '🏹', name: '숙련된 사냥꾼', desc: '몬스터 100마리 처치', goal: 100, reward: 200, get: (s) => s.kills },
    { id: 'hunter1000', icon: '🔥', name: '전설의 사냥꾼', desc: '몬스터 1,000마리 처치', goal: 1000, reward: 800, get: (s) => s.kills },
    { id: 'boss1', icon: '👑', name: '구역 정복', desc: '구역 보스 처치', goal: 1, reward: 250, get: (s) => (s.bossKills || {}).boss || 0 },
    { id: 'field1', icon: '⚔️', name: '필드보스 사냥', desc: '지역 필드보스 처치', goal: 1, reward: 400, get: (s) => (s.bossKills || {}).field || 0 },
    { id: 'chest5', icon: '📦', name: '보물 사냥꾼', desc: '숨겨진 상자 5개 발견', goal: 5, reward: 200, get: (s) => s.chestsFound || 0 },
    { id: 'evo1', icon: '💎', name: '신화의 시작', desc: '빨강(신화) 진화 1회', goal: 1, reward: 300, get: (s) => s.evolutions || 0 },
    { id: 'lv10', icon: '🌟', name: '한 걸음 성장', desc: '레벨 10 달성', goal: 10, reward: 150, get: (s) => s.level },
    { id: 'lv20', icon: '✨', name: '숲을 넘어', desc: '레벨 20 달성', goal: 20, reward: 350, get: (s) => s.level },
    { id: 'party3', icon: '🤝', name: '좋은 동료', desc: '동료 3명과 동행', goal: 3, reward: 180, get: (s) => (s.party || []).length },
    { id: 'skill4', icon: '📖', name: '스킬 마스터', desc: '스킬 4개 습득', goal: 4, reward: 220, get: (s) => ((s.skills || {}).learned || []).length },
    { id: 'explorer', icon: '🗺️', name: '서울 탐험가', desc: '구역 4곳 해금', goal: 4, reward: 500, get: (s) => (s.unlocked || []).filter((u) => u <= 4).length },
  ];
  game.achList = function () {
    const s = game.state;
    return ACHS.map((a) => ({ id: a.id, icon: a.icon, name: a.name, desc: a.desc, goal: a.goal, reward: a.reward, progress: Math.floor(a.get(s) || 0), claimed: (s.achClaimed || []).includes(a.id) }));
  };
  game.claimAch = function (id) {
    const a = game.achList().find((x) => x.id === id);
    if (!a || a.claimed || a.progress < a.goal) return { ok: false };
    game.state.achClaimed = game.state.achClaimed || [];
    game.state.achClaimed.push(id);
    game.state.gold += a.reward;
    // 업적 달성 시 스탯 포인트 +1 (영구) — 지급 횟수를 기록해 중복 지급 방지
    game.state.statPts = (game.state.statPts || 0) + 1;
    game.state.achBonusGranted = (game.state.achBonusGranted || 0) + 1;
    game.save();
    game.flushSave();
    if (game.ui) game.ui.markDirty(true);
    return { ok: true, reward: a.reward, statPts: 1 };
  };

  game.learnTalent = function (id) {
    const node = TALENTS.find((t) => t.id === id);
    if (!node || game.state.talents.includes(id)) return false;
    if (node.req.some((r) => !game.state.talents.includes(r))) return false;
    const cost = node.cost;
    if ((game.state.souls[cost.kind] || 0) < cost.n) return false;
    game.state.souls[cost.kind] -= cost.n;
    game.state.talents.push(id);
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

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
      let upgraded;
      if ((dup.grade || 0) < 5) { dup.grade = (dup.grade || 0) + 1; upgraded = 'grade'; }
      else { dup.lv = (dup.lv || 1) + 5; upgraded = 'level'; }
      game.save();
      if (game.player && s.party.includes(dup.id)) refreshCompanions();
      return { ok: true, upgraded, companion: dup, cls: COMPANION_CLASSES[cls], grade: dup.grade };
    }
    // 새 동료는 항상 일반(0등급)으로 시작한다.
    // 그 직업 스킬북 보너스가 쌓여 있으면(pendingBonus) 시작 보너스로 가져간다.
    const pending = game.state.skills.pendingBonus[cls] || 0;
    if (pending > 0) delete game.state.skills.pendingBonus[cls];
    const c = { id: 'c' + Date.now() + Math.floor(Math.random() * 999), name, cls, grade: 0, lv: 1, xp: 0, skillBonus: pending };
    s.companions.push(c);
    game.save();
    return { ok: true, companion: c, cls: COMPANION_CLASSES[cls], grade: 0 };
  };

  game.toggleParty = function (id) {
    const s = game.state;
    const i = s.party.indexOf(id);
    if (i >= 0) s.party.splice(i, 1);
    else {
      if (s.party.length >= 3) return { ok: false, msg: '동행은 최대 3명까지 가능해요' };
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
      const o = makeCompanionObj(c, cls, mesh, game.player.x - 1.6 + i * 1.6, game.player.z + 1.8);
      game.compObjects.push(o); game.companions.push(o);
      if (cls.id === 'tank' && !game.tank) game.tank = o;
    });
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

  game.talkNpc = function () {
    const q = game.questInfo(game.zone.id);
    if (game.ui) game.ui.openQuestDialog(q);
  };
  // 퀘스트가 보스 처치를 요구할 때, 이미 잡아 둔 보스 때문에 몇 시간씩 막히지 않도록
  // 해당 보스의 리스폰을 90초 뒤로 앞당긴다.
  function readyQuestBoss(zone, step) {
    if (!step) return null;
    const type = step.type === 'mid' ? 'mid' : step.type === 'boss' ? 'boss' : null;
    if (!type) return null;
    const key = `${zone.id}:${type}`;
    const at = (game.state.bossTimers || {})[key];
    if (!at) return null;
    const soon = Date.now() + 90 * 1000;
    if (at > soon) {
      game.state.bossTimers[key] = soon;
      game.save();
      const nm = type === 'mid' ? zone.mobs.mid.name : zone.mobs.boss.name;
      return nm;
    }
    return null;
  }

  game.claimQuest = function () {
    const zone = game.zone;
    if (!zone || !zone.quests) return { ok: false, msg: '지금은 퀘스트를 받을 수 없어요.' };
    const q = game.state.quests[zone.id] || { step: 0, progress: 0, accepted: false, done: false };
    game.state.quests[zone.id] = q;
    if (q.done) return { ok: false, msg: '이 구역의 퀘스트는 모두 마쳤어요.' };
    const step = zone.quests.steps[q.step];
    if (!step) return { ok: false, msg: '이 구역의 퀘스트는 모두 마쳤어요.' };
    if (!q.accepted) {
      q.accepted = true;
      q.progress = 0;
      q._notified = false;
      const soon = readyQuestBoss(zone, step);
      game.save();
      if (game.ui) game.ui.markDirty(true);
      if (soon && game.ui) game.ui.toast(`퀘스트를 위해 ${soon}이(가) 90초 뒤 다시 나타납니다.`, 'good');
      return { ok: true, msg: `퀘스트 수락! ${step.text}`, accept: true };
    }
    if (q.progress < step.n) return { ok: false, msg: `아직 목표를 달성하지 못했어요. (${Math.min(q.progress, step.n)} / ${step.n})` };
    const r = step.reward || {};
    const got = [];
    const d = game.derived();
    const beforeLv = game.state.level;
    if (r.gold) { game.state.gold += r.gold; got.push(`골드 +${r.gold}`); }
    if (r.pt) { game.state.statPts += r.pt; got.push(`스탯 포인트 +${r.pt}`); }
    if (r.soul) {
      const n = r.soulN || 1;
      game.state.souls[r.soul] = (game.state.souls[r.soul] || 0) + n;
      got.push(`${(SOUL_KINDS[r.soul] || { name: '영혼' }).name} +${n}`);
    }
    if (r.item !== undefined) {
      const kind = pickKind();
      const fam = pickFam(kind);
      game.addItem(kind, fam, r.item);
      got.push(itemName(kind, fam, r.item));
    }
    if (r.charm) {
      game.state.equip.charm = { kind: 'charm', fam: r.charm, grade: 0 };
      got.push(CHARMS[r.charm].name);
    }
    if (r.xp) { game.gainXp(r.xp); got.push(`경험치 +${r.xp}${game.state.level > beforeLv ? ` (Lv.${game.state.level} 달성!)` : ''}`); }
    if (r.unlock) {
      const nz = PLAYABLE.find((z) => z.id === r.unlock);
      const opened = game.unlockDistrict(r.unlock, true);
      got.push(`새 구역 해금 · ${nz ? nz.name : r.unlock}`);
      if (opened && game.ui) game.ui.toast(`새 구역 해금 · ${nz ? nz.name : r.unlock} · 방벽이 열렸어요!`, 'good');
    }
    q.step++;
    q.progress = 0;
    q._notified = false;
    if (q.step >= zone.quests.steps.length) q.done = true;
    game.save();
    game.flushSave();
    if (game.ui) game.ui.markDirty(true);
    const nextStep = zone.quests.steps[q.step];
    if (nextStep) {
      const soon = readyQuestBoss(zone, nextStep);
      if (soon && game.ui) game.ui.toast(`다음 목표를 위해 ${soon}이(가) 90초 뒤 다시 나타납니다.`, 'good');
    }
    return {
      ok: true,
      msg: got.length ? `보상 획득: ${got.join(' · ')}` : '보상을 받았어요!',
      got,
      done: !!q.done,
      next: nextStep ? nextStep.text : null,
    };
  };

  game.spendPoint = function (key) {
    const s = game.state;
    if (s.statPts <= 0) return false;
    s.stats[key]++;
    s.statPts--;
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

  game.death = () => game.player && !game.player.alive;

  // 디버그/테스트용
  if (new URLSearchParams(location.search).has('debug')) {
    window.__SH__ = game;
    game.debug = {
      teleport(x, z) { game.player.x = x; game.player.z = z; snapCompanions(); },
      give(kind, fam, grade, n = 1) { game.addItem(kind, fam, grade, n); game.ui.markDirty(true); },
      giveAll(grade, n = 3) { for (const f of Object.keys(WEAPONS)) game.addItem('weapon', f, grade, n); for (const f of Object.keys(ARMOR_KINDS)) game.addItem('armor', f, grade, n); for (const f of Object.keys(ACCESSORY_KINDS)) game.addItem('accessory', f, grade, n); game.ui.markDirty(true); },
      equip(kind, fam, grade) { game.addItem(kind, fam, grade, 1); return game.equipItem(kind, fam, grade); },
      mob(type = 'mid') { const z = game.zone; const e = game.enemies.find((x) => x.alive && (type === 'boss' ? x.isBoss : x.isMid)); return e; },
      gold(n) { game.state.gold += n; },
      souls(kind, n) { game.state.souls[kind] = (game.state.souls[kind] || 0) + n; },
      heal() { game.player.hp = game.derived().maxHp; },
      spawn(key) { const z = game.zone; const all = [...z.mobs.normal, ...z.mobs.elite]; const d = all.find((m) => m.key === key) || all[0]; return spawnEnemy(d, game.player.x + 2, game.player.z - 2); },
      spawnBoss(type = 'mid') { const z = game.zone; const d = type === 'boss' ? z.mobs.boss : type === 'field' ? z.mobs.field : z.mobs.mid; return spawnEnemy(d, game.player.x + 1.5, game.player.z - 4.5, true); },
      killAll() { for (const e of [...game.enemies]) if (e.alive && !e.isBoss) game.dealDamage(e, 99999, { canCrit: false }); },
      state() { return { zone: game.zone.id, level: game.state.level, hp: game.player.hp, maxHp: game.derived().maxHp, attack: game.derived().attack, kills: game.state.kills, medal: game.medalInfo(game.zone.id), enemies: game.enemies.filter((e) => e.alive).length, chests: game.chestInfo(game.zone.id), pos: { x: +game.player.x.toFixed(2), z: +game.player.z.toFixed(2) } }; },
      avatar(id) { return game.setAvatar(id); },
      avatarInfo() { return { id: game.state.avatar, mesh: game.playerMesh && game.playerMesh.userData.avatar && game.playerMesh.userData.avatar.id, facing: game.player.facing, rot: game.playerMesh ? game.playerMesh.rotation.y : null }; },
      giveTank(grade = 2) {
        const c = { id: 'tank' + Date.now() + Math.floor(Math.random() * 999), name: '테스', cls: 'tank', grade, lv: 1, xp: 0 };
        game.state.companions.push(c);
        if (!game.state.party.includes(c.id)) game.state.party.push(c.id);
        refreshCompanions();
        return c.id;
      },
      giveHealer(grade = 2) {
        const c = { id: 'heal' + Date.now() + Math.floor(Math.random() * 999), name: '세라', cls: 'healer', grade, lv: 1, xp: 0 };
        game.state.companions.push(c);
        if (!game.state.party.includes(c.id)) game.state.party.push(c.id);
        refreshCompanions();
        return c.id;
      },
      tankInfo() { return game.tank ? { hp: game.tank.hp, maxHp: game.tank.maxHp, x: game.tank.x, z: game.tank.z, down: game.tank.hp <= 0 } : null; },
      giveBook(id) { game.state.skillbooks[id] = (game.state.skillbooks[id] || 0) + 1; game.ui && game.ui.markDirty(true); return id; },
      learn(id) { return game.learnSkill(id); },
      spawnBook(id) { addPickup('book', game.player.x + 1.0, game.player.z, id); return id; },
      cast(id) { return game.castSkill(id); },
      skills() { return game.skillState(); },
      auto() { return { ok: false, reason: 'companion-only', msg: '주인공 스킬 자동 사용은 없어요. 스킬은 동료만 씁니다.' }; },
      effects(tag) { return game.effects.filter((f) => !tag || (f.tag || '').startsWith(tag)).map((f) => f.tag || f.kind); },
      projectiles() { return game.projectiles.map((p) => ({ style: p.style, skill: p.skill, from: p.from })); },
      admin(on) { if (on === false) return game.disableAdmin(); if (on === true) return game.enableAdmin(game.adminCode); return game.isAdmin(); },
      giveMp(n = 999) { game.player.mp = Math.min(game.derived().maxMp, n); return game.player.mp; },
      chest(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 0.6; snapCompanions(); } },
      advance(sec, dt = 1 / 60) { const n = Math.min(3600, Math.round(sec / dt)); for (let i = 0; i < n; i++) step(dt); return game.time; },
      unlockAll() { game.state.unlocked = [1, 2, 3, 4, 5, 6, 7, 8, 9]; game.state.equip.charm = { kind: 'charm', fam: 'aqua', grade: 0 }; if (game.world) for (let i = 2; i <= 9; i++) game.world.openGate(i); game.ui.markDirty(true); },
      enter(id) { return game.enterZone(id); },
      killZone(n = 1) { const list = game.enemies.filter((e) => e.alive && !e.isBoss && !e.isMid); for (let i = 0; i < Math.min(n, list.length); i++) game.dealDamage(list[i], 999999, { canCrit: false }); },
      nearNpc() { const n = game.world.npcs[game.zone.id].position; game.player.x = n.x + 1.5; game.player.z = n.z + 0.5; snapCompanions(); },
      hitOnce() { return playerAttack(); },
      options(kind, fam, grade) { return itemOptions(kind, fam, grade); },
      bossReset(zoneId = game.zone.id, type) {
        const t = game.state.bossTimers || {};
        for (const k of Object.keys(t)) {
          const [z, ty] = k.split(':');
          if (Number(z) === zoneId && (!type || ty === type)) delete t[k];
        }
        game.save();
        return game.bossStatus(zoneId);
      },
      bossStatus(zoneId = game.zone.id) { return game.bossStatus(zoneId); },
      chestNear() { return game.nearChest ? { id: game.nearChest.id, x: game.nearChest.x, z: game.nearChest.z } : null; },
      chestGoto(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 1.2; snapCompanions(); return c.id; } return null; },
      openChest() { return game.openChest(game.nearChest); },
      evolve(kind, fam, grade) { return game.evolve(kind, fam, grade); },
      evolveReady() { return game.evolveReady(); },
      questAccept() { return game.claimQuest(); },
      questClaim() { return game.claimQuest(); },
      questInfo() { return game.questInfo(game.zone.id); },
      setName(n) { return game.setHeroName(n); },
      appearance(mode, id) { return game.setAppearance(mode, id); },
      pullCostume() { return game.pullCostume(); },
      unlockCostume(id) { const ap = game.state.appearance; if (!ap.unlocked.includes(id)) ap.unlocked.push(id); ap.costumeLv = ap.costumeLv || {}; if (!ap.costumeLv[id]) ap.costumeLv[id] = 1; game.save(); return game.state.appearance; },
      heroInfo() { return { name: game.heroName(), avatar: game.state.avatar, weapon: game.state.equip.weapon, armor: game.state.equip.armor }; },
      timer(type, sec) { game.state.bossTimers[`${game.zone.id}:${type}`] = Date.now() + sec * 1000; game.save(); return game.bossRemain(game.zone.id, type); },
    };
  }

  return game;
}
