// 스쿨히어로 — 게임 엔진
import {
  PLAYABLE, GRADES, WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, GRADE_ADJ, WEAPON_BASE, ITEM_STATS,
  MEDAL_TIERS, MEDAL_STEP, TALENTS, COMPANION_CLASSES, COMPANION_NAMES, CHARMS, SECRET_TOTAL,
  itemOptions, defaultBalance, MOB_REWARD, OPT_LABEL,
  AVATARS, AVATAR_MAP, avatarOf, SKILLS, SKILL_IDS, HEAL_SKILL_IDS,
  BOSS_TIMER, BOSS_LABEL, EVOLVE_NEED, SOUL_KINDS, COSTUMES, COSTUME_MAP, COSTUME_PULL_COST, COSTUME_REFUND,
  ELEMENTS, ELEM_BEATS,
} from './data.js';
import { buildZone, makePlayer, makeMonster, makeCompanion } from './world.js';
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
    enemies: [], companions: [], projectiles: [], pickups: [], effects: [], telegraphs: [], graves: [],
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

  // ---------- 저장 데이터 ----------
  const defaultState = () => ({
    v: 1,
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
    skillbooks: {},   // 아직 배우지 않은 스킬북: "fireball": 1
    skills: { learned: [], slots: [null, null, null, null], auto: true, cds: {} },
    tutorial: { step: 1, done: false },
    introSeen: false,
    bossTimers: {},   // "1:boss": Date.now() + 간격(남은 시간 계산용)
    appearance: { mode: 'armor', costumeId: null, unlocked: [] },
    bossKills: { mid: 0, boss: 0, field: 0 },
    evolutions: 0,
    achClaimed: [],
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
    s.bag = saved.bag || {};
    s.talents = saved.talents || [];
    s.companions = saved.companions || [];
    s.party = saved.party || [];
    s.unlocked = saved.unlocked && saved.unlocked.length ? saved.unlocked : [1];
    s.zoneKills = saved.zoneKills || {};
    s.chestOpened = saved.chestOpened || [];
    s.quests = saved.quests || {};
    s.balance = mergeBalance(defaultBalance(), saved.balance || {});
    s.avatar = AVATAR_MAP[saved.avatar] ? saved.avatar : 'boyA';
    s.avatarPicked = !!saved.avatarPicked;
    s.heroName = typeof saved.heroName === 'string' ? saved.heroName.slice(0, 12) : '';
    s.bossTimers = saved.bossTimers && typeof saved.bossTimers === 'object' ? saved.bossTimers : {};
    s.bossKills = Object.assign({ mid: 0, boss: 0, field: 0 }, saved.bossKills || {});
    s.evolutions = Number(saved.evolutions) || 0;
    const ap = saved.appearance || {};
    s.appearance = {
      mode: ap.mode === 'uniform' || ap.mode === 'costume' ? ap.mode : 'armor',
      costumeId: COSTUME_MAP[ap.costumeId] ? ap.costumeId : null,
      unlocked: Array.isArray(ap.unlocked) ? ap.unlocked.filter((id) => COSTUME_MAP[id]) : [],
    };
    if (s.appearance.mode === 'costume' && !s.appearance.costumeId) s.appearance.mode = 'armor';
    s.skillbooks = saved.skillbooks && typeof saved.skillbooks === 'object' ? saved.skillbooks : {};
    const sk = saved.skills || {};
    s.skills = {
      learned: Array.isArray(sk.learned) ? sk.learned.filter((id) => SKILLS[id]) : [],
      slots: [0, 1, 2, 3].map((i) => (Array.isArray(sk.slots) && SKILLS[sk.slots[i]] ? sk.slots[i] : null)),
      auto: sk.auto !== false,
      cds: sk.cds && typeof sk.cds === 'object' ? sk.cds : {},
    };
    // 배운 스킬만 슬롯에 남긴다
    s.skills.slots = s.skills.slots.map((id) => (id && s.skills.learned.includes(id) ? id : null));
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
    game.playerMesh.position.set(p.x, 0, p.z);
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
      v: 1, level: s.level, xp: s.xp, statPts: s.statPts, gold: s.gold, stats: s.stats,
      hp: Math.round(game.player ? game.player.hp : 0),
      avatar: s.avatar, avatarPicked: s.avatarPicked, heroName: s.heroName,
      bag: s.bag, equip: s.equip, souls: s.souls, talents: s.talents,
      companions: s.companions, party: s.party, unlocked: s.unlocked,
      zoneKills: s.zoneKills, chestOpened: s.chestOpened, chestsFound: s.chestsFound,
      quests: s.quests, zone: s.zone, kills: s.kills, pulls: s.pulls, balance: s.balance,
      skillbooks: s.skillbooks, skills: s.skills, tutorial: s.tutorial, introSeen: s.introSeen,
      bossTimers: s.bossTimers, bossKills: s.bossKills, evolutions: s.evolutions, appearance: s.appearance,
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

  // 보유한 코스튬의 수집 보너스 (착용 여부와 무관하게 영구 합산)
  game.costumeBonus = function () {
    const t = { atkPct: 0, defPct: 0, hpPct: 0, crit: 0, critDmg: 0, evade: 0, moveSpeed: 0, mpPct: 0, cdr: 0 };
    const ap = game.state.appearance || { unlocked: [] };
    for (const id of ap.unlocked || []) {
      const c = COSTUME_MAP[id];
      if (!c || !c.stats) continue;
      for (const [k, v] of Object.entries(c.stats)) if (t[k] !== undefined) t[k] += v;
    }
    return t;
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
    const cls = eq.weapon ? WEAPONS[eq.weapon.fam].cls : 'melee';
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
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }

  game.enterZone = function (zoneId, opts = {}) {
    const zone = PLAYABLE.find((z) => z.id === zoneId);
    if (!zone) return false;
    if (zoneId === 4 && !game.state.equip.charm) {
      if (game.ui) game.ui.toast('한강 심해 유적에 들어가려면 수중호흡 아티팩트가 필요해요.', 'bad');
      return false;
    }
    // 이전 구역 몬스터 메시·이름표 정리 (남아 있으면 새 구역에 유령처럼 보인다)
    for (const e of game.enemies) {
      if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
      if (e.mesh) { scene.remove(e.mesh); disposeGroup(e.mesh); }
    }
    if (game.ui) game.ui.clearTags();
    for (const pr of game.projectiles) scene.remove(pr.mesh);
    for (const it of game.pickups) if (it.mesh) scene.remove(it.mesh);
    for (const fx of game.effects) if (fx.mesh) disposeObj(fx.mesh);
    for (const t of game.telegraphs) { scene.remove(t.mesh); scene.remove(t.ring); if (t.mark) scene.remove(t.mark); }
    if (game.world) { scene.remove(game.world.group); disposeGroup(game.world.group); }
    game.compObjects && game.compObjects.forEach((c) => scene.remove(c.mesh));
    game.enemies = []; game.companions = []; game.projectiles = []; game.pickups = []; game.effects = []; game.telegraphs = [];
    game.state.zone = zoneId;
    game.zone = zone;
    game.world = buildZone(THREE, zone, game.state.chestOpened);

    scene.fog = new THREE.FogExp2(zone.theme.fog, zone.theme.fogDensity);
    scene.background = new THREE.Color(zone.theme.sky);

    scene.add(game.world.group);

    // 플레이어
    if (game.playerMesh) { scene.remove(game.playerMesh); disposeGroup(game.playerMesh); }
    game.playerMesh = makePlayer(THREE, 'sword', avatarOf(game.state.avatar), game.state.equip, game.state.appearance);
    scene.add(game.playerMesh);
    const d = game.derived();
    const sp = zone.spawn;
    game.player = {
      x: sp.x, z: sp.z, facing: Math.PI, vy: 0,
      hp: clamp(game.state.hp || d.maxHp, 1, d.maxHp),
      mp: d.maxMp,
      atkCd: 0.2, regenT: 0, alive: true, respawnT: 0,
      walkT: 0, moving: false, atkAnim: 0, poisonT: 0, poisonStacks: 0,
      combatT: 0, target: null, atkKind: null, castT: 0,
    };
    game.playerMesh.position.set(game.player.x, 0, game.player.z);

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

    // 몬스터 배치
    game.clearGraves();
    spawnZoneMobs(zone);
    for (const t of ['mid', 'boss', 'field']) if (game.bossRemain(zone.id, t) > 0) game.addGrave(t);

    // 카메라 즉시 이동
    const aspect0 = window.innerWidth / Math.max(1, window.innerHeight);
    const vis0 = Math.min(15.5, Math.max(11, 9.6 / aspect0));
    camera.position.set(game.player.x, vis0 * 1.22, game.player.z + vis0 * 1.08);
    camera.lookAt(camera.position.x, 0, camera.position.z - vis0 * 1.08);

    if (game.ui) {
      game.ui.onZoneEnter(zone);
      game.ui.closeAll();
    }
    if (!opts.silent) { game.save(); game.flushSave(); }
    return true;
  };

  function spawnZoneMobs(zone) {
    const pts = game.world.spawnPoints;
    let pi = 0;
    const pick = () => pts[(pi++) % pts.length];
    for (let i = 0; i < 6; i++) {
      const def = zone.mobs.normal[i % zone.mobs.normal.length];
      const ang = (i / 6) * Math.PI * 2 + 0.4;
      const rad = 11 + (i % 2) * 4;
      spawnEnemy(def, zone.spawn.x + Math.cos(ang) * rad, zone.spawn.z + Math.sin(ang) * rad * 0.9);
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
    if (bossReady(zone.id, 'mid')) spawnEnemy(zone.mobs.mid, zone.mid.x, zone.mid.z, true);
    if (bossReady(zone.id, 'boss')) spawnEnemy(zone.mobs.boss, zone.boss.x, zone.boss.z, true);
    if (zone.field && bossReady(zone.id, 'field')) spawnEnemy(zone.mobs.field, zone.field.x, zone.field.z, true);
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
  game.bossStatus = function (zoneId) {
    const zone = PLAYABLE.find((z) => z.id === zoneId);
    if (!zone) return [];
    const list = [
      { type: 'mid', name: zone.mobs.mid.name, lv: zone.scale.lvl + 1 },
      { type: 'boss', name: zone.mobs.boss.name, lv: zone.scale.lvl + 3 },
    ];
    if (zone.field) list.push({ type: 'field', name: zone.mobs.field.name, lv: zone.scale.lvl + 5 });
    return list.map((b) => ({ ...b, remain: game.bossRemain(zoneId, b.type), total: BOSS_TIMER[b.type] || 0, label: BOSS_LABEL[b.type] }));
  };

  // ---------- 보스 특수 패턴 ----------
  const BOSS_PATTERN = {
    ogre: 'charge', golem: 'charge', anubis: 'charge',
    ent: 'nova', witch: 'nova', kraken: 'nova', siren: 'nova',
    hydra: 'split',
  };

  // ---------- 보스 묘비 + 리스폰 카운트다운 ----------
  function graveSpot(type) {
    const z = game.zone;
    if (!z) return null;
    return type === 'mid' ? z.mid : type === 'field' ? z.field : z.boss;
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
    grp.position.set(spot.x, 0, spot.z);
    scene.add(grp);
    const g = { type, x: spot.x, z: spot.z, mesh: grp, art, glow, el: null, until: (game.state.bossTimers || {})[bossTimerKey(type)] || 0 };
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
        const def = g.type === 'mid' ? zone.mobs.mid : g.type === 'field' ? zone.mobs.field : zone.mobs.boss;
        if (def) {
          spawnEnemy(def, g.x, g.z, true);
          if (game.ui) game.ui.toast(`${def.name}이(가) 다시 나타났어요!`, 'bad');
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
    mesh.position.set(x, 0, z);
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
      pattern: def.boss ? (BOSS_PATTERN[def.shape] || 'nova') : null,
      deadT: 0, facing: Math.PI, fixed,
      targetType: 'player', leashing: false, knockT: 0,
    };
    mesh.userData.ref = e;
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
    if (e.isField) {
      addPickup('soul', e.x, e.z, 'gold');
      addPickup('item', e.x, e.z, { kind: pickKind(), fam: pickFam(pickKind()), grade: 4 });
    } else if (e.isBoss) {
      addPickup('soul', e.x, e.z, 'purple');
      addPickup('item', e.x, e.z, { kind: pickKind(), fam: pickFam(pickKind()), grade: 3 });
    } else if (e.isMid) {
      addPickup('soul', e.x, e.z, 'blue');
      addPickup('item', e.x, e.z, { kind: pickKind(), fam: pickFam(pickKind()), grade: 2 });
    } else if (e.elite) {
      addPickup('soul', e.x, e.z, 'green');
      // 반복 처치해도 항상 녹색(고급) 등급 장비 1개
      addPickup('item', e.x, e.z, { kind: pickKind(), fam: pickFam(pickKind()), grade: 1 });
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
    if (em !== 1 && game.ui && Math.random() < 0.35) game.ui.floatText(e.x, (e.headY || 1) + 0.3, e.z, em > 1 ? '약점!' : '내성', em > 1 ? 'crit' : 'hurt');
    if (game.ui) {
      game.ui.damageNumber(e.x, e.headY, e.z, crit ? `${dmg}!` : dmg, crit ? 'crit' : '');
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
    // 퀘스트 진행
    questKill(e);
    // 보상 표기
    const ov = game.mobStats(zone.id, e.def);
    const xp = Math.round(ov.xp);
    game.gainXp(xp);
    game.gainCompanionXp(Math.round(xp * 0.6));
    game.save();
    const normal = !e.elite && !e.isMid && !e.isBoss && !e.isField;
    if (game.ui) game.ui.rewardText(e.x, e.headY + 0.3, e.z, normal ? `+${fmtNum(xp)} XP` : `+${fmtNum(xp)} XP  +${fmtNum(ov.gold)} G`);
    dropLoot(e);
    // 보스 리스폰 타이머 기록
    const btype = e.isField ? 'field' : e.isBoss ? 'boss' : e.isMid ? 'mid' : null;
    if (btype) {
      game.state.bossTimers = game.state.bossTimers || {};
      game.state.bossTimers[`${zone.id}:${btype}`] = Date.now() + (BOSS_TIMER[btype] || 0);
      game.state.bossKills[btype] = (game.state.bossKills[btype] || 0) + 1;
      game.save(); game.flushSave();
      if (game.ui) game.ui.toast(`${e.def.name} 처치! 다음 등장까지 ${fmtRemain(BOSS_TIMER[btype])}`, 'gold');
      game.addGrave(btype);
    }
    // 사망 연출
    if (e.isField) { game.camShake = 0.9; if (game.ui) game.ui.toast(`${zone.name} 지역 필드보스 처치!`, 'gold'); }
    if (e.isBoss) { game.camShake = 0.7; if (game.ui) game.ui.toast(`${zone.mobs.boss.name} 처치!`, 'gold'); }
    if (e.isMid && game.ui) game.ui.toast(`${zone.mobs.mid.name} 처치!`, 'gold');
    if (e.isBoss || e.isField) bossDefeated();
    if (game.ui) game.ui.updateBossBar(null);
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
    if (next <= 4 && !s.unlocked.includes(next)) {
      s.unlocked.push(next);
      if (game.ui) game.ui.toast(`새 구역 해금: ${PLAYABLE.find((z) => z.id === next).name}`, 'good');
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
    for (const c of game.state.companions) {
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
    p.moving = len > 0.06;
    const beforeX = p.x, beforeZ = p.z;
    if (p.moving) {
      const sp = d.moveSpeed * Math.min(1, Math.hypot(mx, mz));
      let nx = p.x + mx * sp * dt;
      let nz = p.z + mz * sp * dt;
      // 소품 충돌
      for (const pr of game.world.props) {
        const dd = Math.hypot(nx - pr.x, nz - pr.z);
        const min = pr.r + 0.35;
        if (dd < min && dd > 0.0001) {
          nx = pr.x + ((nx - pr.x) / dd) * min;
          nz = pr.z + ((nz - pr.z) / dd) * min;
        }
      }
      nx = clamp(nx, -42, 42); nz = clamp(nz, -42, 42);
      p.x = nx; p.z = nz;
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
    m.position.set(p.x, 0, p.z);
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
  }

  function nearestEnemy(range, arc, facing) {
    let best = null, bestD = 1e9;
    for (const e of game.enemies) {
      if (!e.alive) continue;
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
          for (const t of hits) if (t.alive) { t.stunT = 1.2; stunStars(t.x, t.headY + 0.4, t.z); specialHit(t, 'stun'); }
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
    m.position.set(x, y, z);
    return m;
  }

  // 무기 휘두르기: 바닥 부채꼴 잔상 없이 몸 동작 + 짧은 궤적만.
  // 이중타격 · 치명타 · 스턴 같은 특수 판정에서만 화려한 타격 이펙트가 터진다.
  function weaponSwingFx(fam, p, a, W, hits) {
    const fx = Math.sin(a), fz = Math.cos(a);
    if (fam === 'dagger') {
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, W.range * 0.8), fxMat(0xdff4ff, 0.5));
        m.position.set(p.x + fx * W.range * 0.45, 1.05 + i * 0.12, p.z + fz * W.range * 0.45);
        m.rotation.y = a;
        addFx(m, 0.13, (f, k) => { m.material.opacity = k * 0.45; }, 'dagger:motion');
      }
      dustBurst(p.x + fx * 0.6, p.z + fz * 0.6, 0xdff4ff, 2);
    } else if (fam === 'axe' || fam === 'mace') {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), fxMat(fam === 'axe' ? 0xffcf8a : 0xffe0a0, 0.8));
      const y0 = fam === 'axe' ? 2.3 : 2.0;
      tip.position.set(p.x + fx * 0.9, y0, p.z + fz * 0.9);
      addFx(tip, 0.24, (f, k) => { tip.position.y = 0.25 + (1 - k) * y0 * 0.75; tip.material.opacity = k * 0.8; }, 'melee:tip');
      dustBurst(p.x + fx * 1.1, p.z + fz * 1.1, fam === 'axe' ? 0xffd6a0 : 0xfff0c0, 3);
    } else if (fam === 'bow' || fam === 'crossbow') {
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), fxMat(0xffe0a0, 0.85));
      flash.position.set(p.x + fx * 0.6, 1.1, p.z + fz * 0.6);
      addFx(flash, 0.12, (f, k) => { flash.scale.setScalar(1 + (1 - k) * 1.6); flash.material.opacity = k; }, 'ranged:muzzle');
    } else if (fam === 'staff' || fam === 'book') {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), fxMat(fam === 'staff' ? 0xb58cff : 0x9ff0ff, 0.9));
      orb.position.set(p.x + fx * 0.7, 1.25, p.z + fz * 0.7);
      addFx(orb, 0.22, (f, k) => { orb.scale.setScalar(0.6 + (1 - k) * 1.5); orb.material.opacity = k; }, 'cast:orb');
    } else {
      dustBurst(p.x + fx * 0.7, p.z + fz * 0.7, 0xeaf6ff, 2);
      for (let i = 0; i < 2; i++) {
        const st = new THREE.Mesh(new THREE.SphereGeometry(0.085, 6, 5), fxMat(0xdff2ff, 0.7));
        const sa = a + (i - 0.5) * 1.3;
        st.position.set(p.x + Math.sin(sa) * W.range * 0.75, 1.0, p.z + Math.cos(sa) * W.range * 0.75);
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
    const y = (e.headY || 1.2) * 0.72;
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
    if (game.ui) game.ui.floatText(e.x, (e.headY || 1.2) + 0.85, e.z, c.label, 'crit special');
  }
  game.specialHit = specialHit;

  function dustBurst(x, z, color, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), fxMat(color, 0.85));
      m.position.set(x, 0.2, z);
      const a = Math.random() * TAU, sp = 1.2 + Math.random() * 1.6;
      addFx(m, 0.32 + Math.random() * 0.1, (fx, k) => {
        const t = 1 - k;
        m.position.x = x + Math.cos(a) * sp * t;
        m.position.z = z + Math.sin(a) * sp * t;
        m.position.y = 0.2 + t * 0.8;
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
    m.position.set(x, 0.9, z);
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
    m.position.set(o.x, o.y || 0.9, o.z);
    const dx = o.targetX - o.x, dz = o.targetZ - o.z;
    const dd = Math.max(0.001, Math.hypot(dx, dz));
    m.rotation.y = Math.atan2(dx, dz);
    scene.add(m);
    game.projectiles.push({
      mesh: m, x: o.x, z: o.z, y: o.y || 0.9, vx: (dx / dd) * o.speed, vz: (dz / dd) * o.speed,
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
    disk.position.set(x, 0.11, z);
    addFx(disk, 0.4, (fx, k) => {
      disk.scale.setScalar(radius * (0.35 + (1 - k) * 0.85));
      disk.material.opacity = 0.7 * k;
    }, 'fire:disk');
    const ring = flatRing(x, z, 0.3, 1.0, 0xffa040, 0.95, 0.12);
    addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * radius * 1.6); ring.material.opacity = k * 0.9; }, 'fire:explode');
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), fxMat(0xffcc66, 0.9));
    core.position.set(x, 0.9, z);
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
      fl.position.set(x + Math.cos(a) * radius * 0.7, 0.45, z + Math.sin(a) * radius * 0.7);
      addFx(fl, duration, (fx) => {
        fl.position.y = 0.45 + Math.sin(game.time * 9 + i) * 0.14;
        fl.material.opacity = 0.45 + Math.sin(game.time * 7 + i) * 0.22;
      }, 'fire:flame');
    }
  }

  function healFx(x, z, color = 0x7dffb0) {
    const ring = flatRing(x, z, 0.2, 0.7, color, 0.9, 0.1);
    addFx(ring, 0.7, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 1.8); ring.material.opacity = k * 0.9; }, 'heal:ring');
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), fxMat(color, 0.9));
      m.position.set(x + (Math.random() - 0.5) * 0.5, 0.4, z + (Math.random() - 0.5) * 0.5);
      addFx(m, 0.8, (fx, k) => { m.position.y = 0.4 + (1 - k) * 1.4; m.material.opacity = k; }, 'heal:spark');
    }
  }

  // ---------- 몬스터 AI ----------
  // 스프라이트/모델 모두 같은 자리에 그린다 (보스 몸체·이름표 동기화)
  function placeEnemy(e) {
    if (!e.mesh) return;
    const jitter = e.knockT > 0 || e.hitFlash > 0 ? (Math.random() - 0.5) * 0.07 : 0;
    e.mesh.position.set(e.x + jitter, 0, e.z + jitter);
    if (e.mesh.userData.isSprite) {
      if (e.mesh.userData.update) e.mesh.userData.update(game.time, e, camera);
      if (e.tag) e.tag.style.opacity = '1';
    } else {
      e.mesh.rotation.y = e.facing;
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
            e.mesh.position.y = -Math.min(0.6, e.deadT * 1.2);
          }
          if (e.tag) e.tag.style.opacity = String(Math.max(0, 1 - e.deadT * 3));
        } else if (e.mesh.parent) {
          scene.remove(e.mesh);
          if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
          e.gone = true;
        }
        continue;
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
    e.x = clamp(e.x + dx, -43, 43);
    e.z = clamp(e.z + dz, -43, 43);
    for (const pr of game.world.props) {
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
    if (game.ui) game.ui.damageNumber(c.x, 1.55, c.z, `-${dmg}`, 'hurt');
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
    // 돌진 패턴 (오우거·골렘·아누비스 계열)
    if (e.pattern === 'charge' && bossCharge(e, dt, dx, dz)) return;
    e.telegraphT -= dt;
    if (dd > e.def.atkRange * 0.9 + e.radius) {
      moveEnemy(e, (dx / dd) * e.speed * dt, (dz / dd) * e.speed * dt);
      e.facing = Math.atan2(dx, dz);
    } else {
      e.facing = Math.atan2(dx, dz);
      e.atkCd -= dt;
      if (e.atkCd <= 0) { enemyAttack(e); e.atkCd = e.def.atkCd; }
    }
    // 강공격 텔레그래프 (빈도 완화)
    if (e.telegraphT <= 0 && dd < 15) {
      e.telegraphT = e.isField ? 16 : e.isBoss ? 13 : 10;
      addTelegraph(p.x, p.z, e.isField ? 5.6 : e.isBoss ? 4.6 : 3.6, 1.5, e.atk * 1.9, e);
    }
    // 분열 패턴 (히드라 계열): 체력 60%에서 두 마리로 갈라진다
    if (e.pattern === 'split' && !e.splitDone && e.hp < e.maxHp * 0.6) {
      e.splitDone = true;
      for (let i = 0; i < 2; i++) {
        const def = game.zone.mobs.normal[i % game.zone.mobs.normal.length];
        const ang = (i / 2) * TAU + 0.6;
        spawnEnemy(def, e.x + Math.cos(ang) * 2.8, e.z + Math.sin(ang) * 2.8, true);
      }
      dustBurst(e.x, e.z, 0x9fe0a0, 12);
      game.camShake = Math.max(game.camShake, 0.4);
      if (game.ui) game.ui.toast(`${e.def.name}이(가) 분열했어요!`, 'bad');
    }
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
        run.position.set(e.x + e.charge.dx * len * 0.45, 0.07, e.z + e.charge.dz * len * 0.45);
        run.rotation.y = Math.atan2(e.charge.dx, e.charge.dz);
        scene.add(run);
        e.charge.trail = run;
        if (game.ui) game.ui.floatText(e.x, (e.headY || 2) + 0.4, e.z, '돌진!', 'hurt');
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

  function addTelegraph(x, z, r, time, dmg, source) {
    // 지형·풀에 가려지지 않도록 바닥 위로 띄우고 깊이검사를 끈다
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 30),
      new THREE.MeshBasicMaterial({ color: 0xff2f45, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, depthTest: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.3, z);
    mesh.renderOrder = 12;
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 34), new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.31, z); ring.renderOrder = 13; scene.add(ring);
    const mark = new THREE.Mesh(new THREE.RingGeometry(r * 0.12, r * 0.2, 20), new THREE.MeshBasicMaterial({ color: 0xffd0d0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.set(x, 0.31, z); mark.renderOrder = 13; scene.add(mark);
    game.telegraphs.push({ mesh, ring, mark, x, z, r, t: 0, max: time, dmg, source, done: false });
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
      if (game.ui) game.ui.damageNumber(p.x, 1.6, p.z, '회피', 'heal');
      return;
    }
    const mitigation = d.defense / (d.defense + 55 + game.state.level * 5);
    let dmg = amount * (1 - mitigation) * (1 - medal);
    // 방어구 상성
    const threat = game.zone.threat;
    if (d.armorResist === threat) dmg *= 0.7 * Math.max(0.4, 1 - d.resist / 100);
    dmg = Math.max(1, Math.round(dmg));
    p.hp -= dmg;
    if (game.ui) game.ui.damageNumber(p.x, 1.7, p.z, `-${dmg}`, 'hurt');
    game.camShake = Math.max(game.camShake, 0.16);
    if (p.hp <= 0) playerDown();
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
        e.mesh.position.set(e.x, 0, e.z);
      }
    }
    for (const t of game.telegraphs) { scene.remove(t.mesh); scene.remove(t.ring); if (t.mark) scene.remove(t.mark); }
    game.telegraphs = [];
    for (const pr of game.projectiles) if (pr.from === 'enemy') scene.remove(pr.mesh);
    game.projectiles = game.projectiles.filter((pr) => pr.from !== 'enemy');
    if (game.ui) game.ui.updateBossBar(null);
  }

  // ---------- 동료 ----------
  function makeCompanionObj(c, cls, mesh, x, z) {
    const maxHp = Math.round(cls.hp * (1 + (c.grade || 0) * 0.12) * (1 + ((c.lv || 1) - 1) * 0.08));
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

  function updateCompanions(dt) {
    const p = game.player;
    if (!p) return;
    const d = game.derived();
    game.companions.forEach((c, i) => {
      if (c.hitT > 0) c.hitT -= dt;
      if (c.hp <= 0) {
        c.downT -= dt;
        c.mesh.rotation.z = 1.2;
        c.mesh.position.y = -0.3;
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
      c.mesh.position.set(c.x, Math.abs(Math.sin(game.time * 7 + i)) * 0.05, c.z);
      // 탱커: 주변 몬스터의 어그로를 끈다 (도발)
      if (c.cls.id === 'tank') {
        c.tauntCd -= dt;
        if (c.tauntCd <= 0) {
          c.tauntCd = 1.0;
          let taunted = 0;
          for (const e of game.enemies) {
            if (!e.alive || e.def.boss) continue;
            if (Math.hypot(e.x - c.x, e.z - c.z) > 9) continue;
            if (e.targetType !== 'tank') { e.targetType = 'tank'; e.state = 'chase'; taunted++; }
          }
          if (taunted && game.ui) game.ui.floatText(c.x, 1.95, c.z, '도발!', 'heal');
        }
      }
      // 전투
      c.atkCd -= dt;
      c.skillCd -= dt;
      c.healCd -= dt;
      const scale = 1 + ((c.data.lv || 1) - 1) * 0.22;
      const atk = c.cls.atk * scale * (1 + (c.data.grade || 0) * 0.16);
      if (c.cls.id === 'healer') {
        const learned = game.state.skills.learned;
        let acted = false;
        // 독 해제
        if (c.skillCd <= 0 && (p.poisonT > 0 || p.poisonStacks > 0) && learned.includes('cleanse')) {
          c.skillCd = 5.5;
          acted = true;
          p.poisonT = 0; p.poisonStacks = 0;
          game.state.cleanseT = 4;
          const healed = healTarget('player', SKILLS.cleanse.healPct, SKILLS.cleanse.healFlat);
          if (game.ui) game.ui.floatText(p.x, 2.0, p.z, `독 해제 +${healed}`, 'heal');
        }
        // 단체 힐 (여러 명이 다쳤을 때)
        if (!acted && c.skillCd <= 0 && learned.includes('healAll')) {
          const hurt = [p, ...game.companions.filter((x) => x.hp > 0)];
          const low = hurt.filter((x) => x.hp / (x === p ? d.maxHp : x.maxHp) < 0.6).length;
          if (low >= 2) {
            c.skillCd = 8;
            acted = true;
            for (const t of hurt) healTarget(t === p ? 'player' : t, SKILLS.healAll.healPct, SKILLS.healAll.healFlat);
            if (game.ui) game.ui.floatText(p.x, 2.1, p.z, '단체 힐!', 'heal');
          }
        }
        // 단일 힐
        if (!acted && c.healCd <= 0) {
          const allies = [{ obj: 'player', hp: p.hp, max: d.maxHp, x: p.x, z: p.z }, ...game.companions.filter((x) => x.hp > 0).map((x) => ({ obj: x, hp: x.hp, max: x.maxHp, x: x.x, z: x.z }))];
          allies.sort((a, b) => a.hp / a.max - b.hp / b.max);
          const low = allies[0];
          if (low && low.hp / low.max < (learned.includes('heal1') ? 0.75 : 0.85)) {
            c.healCd = learned.includes('heal1') ? 4.4 : 3.4;
            acted = true;
            const pct = learned.includes('heal1') ? SKILLS.heal1.healPct : 0.12;
            const flat = learned.includes('heal1') ? SKILLS.heal1.healFlat : Math.round(c.cls.heal * scale);
            const healed = healTarget(low.obj, pct, flat);
            if (game.ui && healed > 0) game.ui.damageNumber(low.x, 1.8, low.z, `+${healed}`, 'heal');
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

  game.learnSkill = function (id) {
    const def = SKILLS[id];
    if (!def) return { ok: false, reason: 'unknown' };
    const s = game.state.skills;
    if (s.learned.includes(id)) return { ok: false, reason: 'learned' };
    if (!(game.state.skillbooks[id] > 0)) return { ok: false, reason: 'nobook' };
    s.learned.push(id);
    game.state.skillbooks[id] -= 1;
    if (!(game.state.skillbooks[id] > 0)) delete game.state.skillbooks[id];
    let slot = s.slots.findIndex((x) => !x);
    if (slot < 0) slot = -1; else s.slots[slot] = id;
    game.save();
    if (game.ui) { game.ui.markDirty(true); game.ui.renderSkillBar && game.ui.renderSkillBar(); }
    return { ok: true, slot };
  };

  game.assignSkill = function (slot, id) {
    const s = game.state.skills;
    if (slot < 0 || slot >= s.slots.length) return { ok: false, reason: 'slot' };
    if (id && !s.learned.includes(id)) return { ok: false, reason: 'learned' };
    if (id) {
      const prev = s.slots.indexOf(id);
      if (prev >= 0) s.slots[prev] = null;
    }
    s.slots[slot] = id || null;
    game.save();
    if (game.ui) { game.ui.markDirty(true); game.ui.renderSkillBar && game.ui.renderSkillBar(); }
    return { ok: true };
  };

  game.toggleSkillAuto = function (on) {
    const s = game.state.skills;
    s.auto = on === undefined ? !s.auto : !!on;
    game.save();
    if (game.ui) { game.ui.markDirty(); game.ui.renderSkillBar && game.ui.renderSkillBar(); }
    return s.auto;
  };

  function skillLowestAlly() {
    const d = game.derived();
    const p = game.player;
    const allies = [{ obj: 'player', hp: p.hp, max: d.maxHp, x: p.x, z: p.z }];
    for (const c of game.companions) if (c.hp > 0) allies.push({ obj: c, hp: c.hp, max: c.maxHp, x: c.x, z: c.z });
    allies.sort((a, b) => a.hp / a.max - b.hp / b.max);
    return allies[0];
  }

  function poisonNearby() {
    return game.effects.some((fx) => fx.kind === 'pool' && game.player && Math.hypot(game.player.x - fx.x, game.player.z - fx.z) < fx.r + 1);
  }

  function autoCondition(def) {
    const p = game.player;
    const d = game.derived();
    if (def.id === 'cleanse') return (p.poisonT > 0 || p.poisonStacks > 0 || poisonNearby()) && game.zone.id === 2;
    if (def.id === 'heal1') return skillLowestAlly().hp / skillLowestAlly().max < 0.62;
    if (def.id === 'healAll') {
      const p2 = game.player;
      const list = [{ hp: p2.hp, max: d.maxHp }, ...game.companions.filter((c) => c.hp > 0).map((c) => ({ hp: c.hp, max: c.maxHp }))];
      return list.filter((x) => x.hp / x.max < 0.65).length >= 2;
    }
    const range = def.radius ? def.radius + 1.5 : def.range || 8;
    return !!nearestEnemyFrom(p.x, p.z, range);
  }

  game.canCastSkill = function (id) {
    const def = SKILLS[id];
    const s = game.state.skills;
    if (!def || !s.learned.includes(id)) return { ok: false, reason: 'learned' };
    if ((s.cds[id] || 0) > 0) return { ok: false, reason: 'cooldown' };
    const d = game.derived();
    const mp = game.player.mp === undefined ? d.maxMp : game.player.mp;
    if (mp < def.mp) return { ok: false, reason: 'mp' };
    if ((def.kind === 'attack' || def.target === 'enemy') && !nearestEnemyFrom(game.player.x, game.player.z, def.radius ? def.radius + 1.5 : (def.range || 8))) {
      return { ok: false, reason: 'target' };
    }
    return { ok: true };
  };

  game.castSkill = function (id, opts = {}) {
    const def = SKILLS[id];
    const s = game.state.skills;
    const p = game.player;
    if (!def) return { ok: false, reason: 'unknown' };
    if (!s.learned.includes(id)) return { ok: false, reason: 'learned' };
    if (!p || !p.alive) return { ok: false, reason: 'dead' };
    if ((s.cds[id] || 0) > 0) return { ok: false, reason: 'cooldown' };
    const d = game.derived();
    const mp = p.mp === undefined ? d.maxMp : p.mp;
    if (mp < def.mp) {
      if (game.ui) game.ui.toast('마나가 부족해요.', 'bad');
      return { ok: false, reason: 'mp' };
    }
    const isHeal = def.kind === 'heal' || def.kind === 'support';
    const target = nearestEnemyFrom(p.x, p.z, def.radius ? def.radius + 1.5 : (def.range || 8));
    if (!isHeal && !target) return { ok: false, reason: 'target' };
    p.mp = Math.max(0, mp - def.mp);
    s.cds[id] = def.cd * (1 - Math.min(40, d.cdr || 0) / 100);
    p.atkAnimMax = isHeal ? 0.34 : 0.3;
    p.atkAnim = p.atkAnimMax;
    p.atkKind = isHeal ? 'cast' : 'skill';
    p.atkFam = isHeal ? 'staff' : def.element === 'arrow' ? 'bow' : def.element === 'blade' ? 'sword' : 'staff';
    game.lastSkill = { id, at: game.time, auto: !!opts.auto };
    if (game.ui) { game.ui.markDirty(); if (game.ui.skillCastFx) game.ui.skillCastFx(id); }
    if (!isHeal && target) p.facing = Math.atan2(target.x - p.x, target.z - p.z);
    const a = p.facing;
    const dmgBase = d.attack * def.mult;
    let dealt = 0, healed = 0;
    switch (id) {
      case 'fireball': {
        spawnProjectile({
          from: 'player', x: p.x, y: 1.1, z: p.z, targetX: target.x, targetZ: target.z, speed: 14,
          color: 0xff8a3c, dmg: dmgBase, range: def.range, style: 'fireball', skill: 'fireball', radius: 0.5,
        });
        break;
      }
      case 'icebolt': {
        spawnProjectile({
          from: 'player', x: p.x, y: 1.1, z: p.z, targetX: target.x, targetZ: target.z, speed: 18,
          color: 0x9fe8ff, dmg: dmgBase, range: def.range, style: 'ice', skill: 'icebolt', radius: 0.45,
        });
        break;
      }
      case 'firewall': {
        const fx = p.x + Math.sin(a) * 3.4, fz = p.z + Math.cos(a) * 3.4;
        const zx = target ? target.x : fx;
        const zz = target ? target.z : fz;
        fireZone(zx, zz, def.radius, d.attack * def.mult, def.duration);
        break;
      }
      case 'swordwave': {
        // 부채꼴 대신 세워진 칼날 파동이 날아간다
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.08), fxMat(0xbfe6ff, 0.9));
        blade.position.set(p.x + Math.sin(a) * 1.0, 1.0, p.z + Math.cos(a) * 1.0);
        blade.rotation.y = a;
        addFx(blade, 0.42, (fx, k) => {
          const t = 1 - k;
          const dist = 1.0 + t * def.range;
          blade.position.set(p.x + Math.sin(a) * dist, 1.0, p.z + Math.cos(a) * dist);
          blade.scale.set(1 + t * 0.6, 1 - t * 0.4, 1);
          blade.rotation.z = Math.sin(t * 9) * 0.3;
          blade.material.opacity = k;
        }, 'skill:swordwave');
        for (const e of [...game.enemies]) {
          if (!e.alive) continue;
          const dd = Math.hypot(e.x - p.x, e.z - p.z);
          if (dd > def.range + e.radius) continue;
          if (angleDiff(Math.atan2(e.x - p.x, e.z - p.z), a) > 0.45) continue;
          dealt += game.dealDamage(e, dmgBase, { heavy: true });
        }
        break;
      }
      case 'whirlwind': {
        for (const e of [...game.enemies]) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - p.x, e.z - p.z) > def.radius + e.radius) continue;
          dealt += game.dealDamage(e, dmgBase, { heavy: true });
        }
        const ring = flatRing(p.x, p.z, 0.4, def.radius, 0xbfe6ff, 0.85, 0.12);
        addFx(ring, 0.45, (fx, k) => { ring.scale.setScalar(0.5 + (1 - k) * 1.1); ring.material.opacity = k * 0.9; }, 'skill:whirl');
        for (let i = 0; i < 4; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, def.radius * 0.9), fxMat(0xeaf6ff, 0.8));
          blade.position.y = 0.7; blade.rotation.y = (i / 4) * TAU;
          const g = new THREE.Group(); g.add(blade); g.position.set(p.x, 0, p.z);
          const off = (i / 4) * TAU;
          addFx(g, 0.4, (fx) => { g.rotation.y = off + (fx.max - fx.life) * 14; blade.material.opacity = Math.min(0.85, fx.life * 2.2); }, 'skill:blade');
        }
        break;
      }
      case 'multishot': {
        const n = 3 + Math.floor(Math.random() * 3);
        const spread = def.spread || 0.55;
        for (let i = 0; i < n; i++) {
          const ang = a + (i - (n - 1) / 2) * (spread / Math.max(1, n - 1));
          spawnProjectile({
            from: 'player', x: p.x, y: 1.1, z: p.z,
            targetX: p.x + Math.sin(ang) * def.range, targetZ: p.z + Math.cos(ang) * def.range,
            speed: 20, color: 0xffd27f, dmg: dmgBase, range: def.range, style: 'arrow', radius: 0.4,
          });
        }
        break;
      }
      case 'pierce': {
        spawnProjectile({
          from: 'player', x: p.x, y: 1.1, z: p.z, targetX: target.x, targetZ: target.z, speed: 26,
          color: 0xdff4ff, dmg: dmgBase, range: def.range, style: 'pierce', pierce: def.pierce || 5, radius: 0.45,
        });
        break;
      }
      case 'heal1': {
        const low = skillLowestAlly();
        healed = healTarget(low.obj, def.healPct, def.healFlat);
        if (game.ui) game.ui.damageNumber(low.x, 1.9, low.z, `+${healed}`, 'heal');
        break;
      }
      case 'healAll': {
        healed += healTarget('player', def.healPct, def.healFlat);
        for (const c of game.companions) if (c.hp > 0) healed += healTarget(c, def.healPct, def.healFlat);
        if (game.ui) game.ui.floatText(p.x, 2.2, p.z, '단체 힐!', 'heal');
        break;
      }
      case 'cleanse': {
        p.poisonT = 0; p.poisonStacks = 0;
        game.state.cleanseT = 4;
        for (const fx of game.effects) {
          if (fx.kind === 'pool' && Math.hypot(p.x - fx.x, p.z - fx.z) < 8) fx.life = 0.01;
        }
        healed = healTarget('player', def.healPct, def.healFlat);
        if (game.ui) game.ui.floatText(p.x, 2.2, p.z, '독 해제!', 'heal');
        break;
      }
      default: break;
    }
    game.save();
    return { ok: true, dealt, healed, target: target ? target.def.key : null };
  };

  function autoCastTick(dt) {
    const s = game.state.skills;
    for (const id of Object.keys(s.cds)) if (s.cds[id] > 0) s.cds[id] = Math.max(0, s.cds[id] - dt);
    if (!s.auto || !game.player || !game.player.alive) return;
    s.autoT = (s.autoT || 0) - dt;
    if (s.autoT > 0) return;
    s.autoT = 0.4;
    for (const id of s.slots) {
      if (!id || !s.learned.includes(id)) continue;
      if ((s.cds[id] || 0) > 0) continue;
      const def = SKILLS[id];
      if (!autoCondition(def)) continue;
      const r = game.castSkill(id, { auto: true });
      if (r.ok) return;
    }
  }
  game.autoCastTick = autoCastTick;

  // ---------- 투사체 ----------
  function updateProjectiles(dt) {
    const p = game.player;
    for (const pr of game.projectiles) {
      pr.life += dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.mesh.position.set(pr.x, pr.y + Math.sin(pr.life * 10) * 0.05, pr.z);
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
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.26, z); pool.renderOrder = 10; scene.add(pool);
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
      it.mesh.position.set(it.x, 0.5 + Math.sin(it.t * 4) * 0.1, it.z);
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
      gold.position.set(c.x, 0.7, c.z);
      addFx(gold, 0.75, (fx, k) => {
        gold.position.y = 0.7 + (1 - k) * 1.5;
        gold.position.x = c.x + Math.sin((1 - k) * 6) * 0.4;
        gold.material.opacity = k;
      }, 'chest:gold');
      const ring = flatRing(c.x, c.z, 0.4, 1.0, 0xffe08a, 0.95, 0.12);
      addFx(ring, 0.6, (fx, k) => { ring.scale.setScalar(1 + (1 - k) * 2.6); ring.material.opacity = k * 0.9; }, 'chest:ring');
      dustBurst(c.x, c.z, 0xffd257, 10);
      for (let i = 0; i < 8; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 8), fxMat(0xffcf4d, 0.95));
        const a = (i / 8) * TAU;
        coin.position.set(c.x, 0.7, c.z);
        addFx(coin, 0.9, (fx, k) => {
          const t = 1 - k;
          coin.position.set(c.x + Math.cos(a) * t * 1.6, 0.7 + t * 1.4 - t * t * 2.2, c.z + Math.sin(a) * t * 1.6);
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
          m.position.set(fx.x, 0.8, fx.z); scene.add(m); fx.mesh = m;
        }
        fx.mesh.scale.setScalar(1 + (1 - k) * 4);
        fx.mesh.material.opacity = k;
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
      } else if (fx.kind === 'shockwave') {
        if (!fx.mesh) {
          const m = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.9, 32), new THREE.MeshBasicMaterial({ color: 0xff7070, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.set(fx.x, 0.12, fx.z); scene.add(m); fx.mesh = m;
        }
        fx.mesh.scale.setScalar(1 + (1 - k) * (fx.r || 4) * 1.2);
        fx.mesh.material.opacity = k * 0.85;
        if (fx.life <= 0) { scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh.material.dispose(); }
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

  let respawnT = 4;
  function updateRespawn(dt) {
    respawnT -= dt;
    if (respawnT > 0) return;
    respawnT = 4.5;
    const alive = game.enemies.filter((e) => e.alive && !e.isBoss && !e.isMid).length;
    if (alive >= 13) return;
    const zone = game.zone;
    const pool = [...zone.mobs.normal, ...zone.mobs.normal, zone.mobs.elite[0]];
    const def = pool[Math.floor(Math.random() * pool.length)];
    for (let tries = 0; tries < 12; tries++) {
      const p = game.world.spawnPoints[Math.floor(Math.random() * game.world.spawnPoints.length)];
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
    const shake = game.camShake > 0 ? game.camShake : 0;
    const tx = p.x + (shake ? (Math.random() - 0.5) * shake : 0);
    const tz = p.z + rig.back + (shake ? (Math.random() - 0.5) * shake : 0);
    camPos.x = lerp(camPos.x, tx, 1 - Math.pow(0.0015, dt));
    camPos.z = lerp(camPos.z, tz, 1 - Math.pow(0.0015, dt));
    camPos.y = lerp(camPos.y || rig.height, rig.height, 1 - Math.pow(0.002, dt));
    camera.position.copy(camPos);
    // 시선도 카메라 위치 기준 → 이동해도 화면이 돌지 않는다
    camera.lookAt(camPos.x, 0, camPos.z - rig.back);
    if (game.camShake > 0) game.camShake = Math.max(0, game.camShake - dt * 2.4);
    sun.position.set(p.x + 16, 34, p.z + 14);
    sun.target.position.set(p.x, 0, p.z);
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
      if (p.atkAnim > 0) p.atkAnim -= dt;
      p.atkCd -= dt;
      if (p.atkCd <= 0) playerAttack();
      // 마나 재생
      const dd0 = game.derived();
      p.mp = Math.min(dd0.maxMp, (p.mp === undefined ? dd0.maxMp : p.mp) + 1.8 * dt);
      autoCastTick(dt);
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
        p.x = game.zone.spawn.x; p.z = game.zone.spawn.z;
        p.facing = Math.PI;
        if (game.ui) { game.ui.showDeath(false); game.ui.toast('입구에서 다시 일어났어요. 체력이 모두 회복되었습니다.', 'good'); }
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
    // NPC / 포탈 근접
    const nnp = Math.hypot(p.x - game.world.npc.position.x, p.z - game.world.npc.position.z) < 3.2;
    const npo = Math.hypot(p.x - game.world.portal.position.x, p.z - game.world.portal.position.z) < 3.2;
    if (nnp !== game.nearNpc || npo !== game.nearPortal) {
      game.nearNpc = nnp; game.nearPortal = npo;
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
    game.enterZone(game.state.zone, { silent: true, fullHp: game.state.hp || 0 });
    game.running = true;
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
    return { ...ap, costumes: COSTUMES.map((c) => ({ ...c, owned: ap.unlocked.includes(c.id) })) };
  };
  // 외형 뽑기 (골드 소모 · 중복은 일부 환급)
  game.pullCostume = function () {
    const s = game.state;
    const ap = s.appearance || (s.appearance = { mode: 'armor', owned: [], unlocked: [] });
    if (s.gold < COSTUME_PULL_COST) return { ok: false, msg: `골드가 부족해요 (${COSTUME_PULL_COST} 필요)` };
    s.gold -= COSTUME_PULL_COST;
    const roll = COSTUMES[Math.floor(Math.random() * COSTUMES.length)];
    let refund = 0;
    if (ap.unlocked.includes(roll.id)) {
      refund = COSTUME_REFUND;
      s.gold += refund;
    } else {
      ap.unlocked.push(roll.id);
    }
    game.save();
    game.flushSave();
    if (game.ui) game.ui.markDirty(true);
    return { ok: true, costume: roll, refund, owned: !refund };
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
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return { ok: true, reward: a.reward };
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
    if (s.gold < 120) return { ok: false, msg: '골드가 부족해요 (120 필요)' };
    s.gold -= 120;
    s.pulls++;
    const clsIds = Object.keys(COMPANION_CLASSES);
    const cls = clsIds[Math.floor(Math.random() * clsIds.length)];
    const roll = Math.random();
    const grade = roll < 0.5 ? 0 : roll < 0.78 ? 1 : roll < 0.92 ? 2 : roll < 0.98 ? 3 : 4;
    const name = COMPANION_NAMES[Math.floor(Math.random() * COMPANION_NAMES.length)];
    const c = { id: 'c' + Date.now() + Math.floor(Math.random() * 999), name, cls, grade, lv: 1, xp: 0 };
    s.companions.push(c);
    game.save();
    return { ok: true, companion: c, cls: COMPANION_CLASSES[cls], grade };
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
    if (r.unlock && !game.state.unlocked.includes(r.unlock)) {
      game.state.unlocked.push(r.unlock);
      const nz = PLAYABLE.find((z) => z.id === r.unlock);
      got.push(`새 구역 해금 · ${nz ? nz.name : r.unlock}`);
      if (game.ui) game.ui.toast(`새 구역 해금 · ${nz ? nz.name : r.unlock}`, 'good');
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
      teleport(x, z) { game.player.x = x; game.player.z = z; },
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
      auto() { return game.toggleSkillAuto(); },
      effects(tag) { return game.effects.filter((f) => !tag || (f.tag || '').startsWith(tag)).map((f) => f.tag || f.kind); },
      projectiles() { return game.projectiles.map((p) => ({ style: p.style, skill: p.skill, from: p.from })); },
      admin(on) { if (on === false) return game.disableAdmin(); if (on === true) return game.enableAdmin(game.adminCode); return game.isAdmin(); },
      giveMp(n = 999) { game.player.mp = Math.min(game.derived().maxMp, n); return game.player.mp; },
      chest(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 0.6; } },
      advance(sec, dt = 1 / 60) { const n = Math.min(3600, Math.round(sec / dt)); for (let i = 0; i < n; i++) step(dt); return game.time; },
      unlockAll() { game.state.unlocked = [1, 2, 3, 4]; game.state.equip.charm = { kind: 'charm', fam: 'aqua', grade: 0 }; game.ui.markDirty(true); },
      enter(id) { return game.enterZone(id); },
      killZone(n = 1) { const list = game.enemies.filter((e) => e.alive && !e.isBoss && !e.isMid); for (let i = 0; i < Math.min(n, list.length); i++) game.dealDamage(list[i], 999999, { canCrit: false }); },
      nearNpc() { const n = game.world.npc.position; game.player.x = n.x + 1.5; game.player.z = n.z + 0.5; },
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
      chestGoto(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 1.2; return c.id; } return null; },
      openChest() { return game.openChest(game.nearChest); },
      evolve(kind, fam, grade) { return game.evolve(kind, fam, grade); },
      evolveReady() { return game.evolveReady(); },
      questAccept() { return game.claimQuest(); },
      questClaim() { return game.claimQuest(); },
      questInfo() { return game.questInfo(game.zone.id); },
      setName(n) { return game.setHeroName(n); },
      appearance(mode, id) { return game.setAppearance(mode, id); },
      pullCostume() { return game.pullCostume(); },
      unlockCostume(id) { game.state.appearance.unlocked.push(id); game.save(); return game.state.appearance; },
      heroInfo() { return { name: game.heroName(), avatar: game.state.avatar, weapon: game.state.equip.weapon, armor: game.state.equip.armor }; },
      timer(type, sec) { game.state.bossTimers[`${game.zone.id}:${type}`] = Date.now() + sec * 1000; game.save(); return game.bossRemain(game.zone.id, type); },
    };
  }

  return game;
}
