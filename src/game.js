// 스쿨히어로 — 게임 엔진
import {
  PLAYABLE, GRADES, WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, GRADE_ADJ, WEAPON_BASE, ITEM_STATS,
  MEDAL_TIERS, MEDAL_STEP, TALENTS, COMPANION_CLASSES, COMPANION_NAMES, CHARMS, SECRET_TOTAL,
  itemOptions, defaultBalance, MOB_REWARD, OPT_LABEL,
} from './data.js';
import { buildZone, makePlayer, makeMonster, makeCompanion } from './world.js';

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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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
    enemies: [], companions: [], projectiles: [], pickups: [], effects: [], telegraphs: [],
    zone: null, world: null,
    player: null,
    ui: null,
    paused: false,
    camShake: 0,
    nearNpc: false,
    nearPortal: false,
    lastSave: 0,
    hiddenBubble: null,
  };

  // ---------- 저장 데이터 ----------
  const defaultState = () => ({
    v: 1,
    level: 1, xp: 0, statPts: 0, gold: 60,
    stats: { str: 5, dex: 5, vit: 5, int: 5 },
    hp: 0,
    bag: {},      // "kind:fam:grade": count
    equip: { weapon: null, armor: null, necklace: null, ring: null, earring: null, charm: null },
    balance: defaultBalance(),
    souls: { gray: 0, green: 0, blue: 0, purple: 0 },
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
  });

  function loadState() {
    return defaultState();
  }

  function mergeState(saved) {
    const s = defaultState();
    if (!saved || typeof saved !== 'object') return s;
    Object.assign(s, saved);
    s.stats = Object.assign({ str: 5, dex: 5, vit: 5, int: 5 }, saved.stats || {});
    s.souls = Object.assign({ gray: 0, green: 0, blue: 0, purple: 0 }, saved.souls || {});
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
    return s;
  }

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
      bag: s.bag, equip: s.equip, souls: s.souls, talents: s.talents,
      companions: s.companions, party: s.party, unlocked: s.unlocked,
      zoneKills: s.zoneKills, chestOpened: s.chestOpened, chestsFound: s.chestsFound,
      quests: s.quests, zone: s.zone, kills: s.kills, pulls: s.pulls, balance: s.balance,
    };
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
    try {
      localStorage.removeItem('sh.lastgood.' + (game.store ? game.store.userId : 'guest'));
      localStorage.removeItem('sh.device.' + (game.store ? game.store.userId : 'guest'));
    } catch (e) { /* 무시 */ }
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

  game.derived = function () {
    const s = game.state;
    const has = (id) => s.talents.includes(id);
    const eq = s.equip;
    const w = game.weapon(eq.weapon ? eq.weapon.fam : 'sword');
    const wa = game.itemStats(eq.weapon).atk;
    const ad = game.itemStats(eq.armor).def;
    const opt = game.optionTotals();
    const cls = eq.weapon ? WEAPONS[eq.weapon.fam].cls : 'melee';
    let baseAtk;
    if (cls === 'magic') baseAtk = 9 + s.stats.int * 2.0;
    else if (cls === 'ranged') baseAtk = 8 + s.stats.dex * 1.7 + s.stats.str * 0.5;
    else if (eq.weapon) baseAtk = 10 + s.stats.str * 1.9 + s.stats.dex * 0.6;
    else baseAtk = 6 + s.stats.str * 0.8;
    const atkBonus = (has('atk') ? 1.09 : 1) * (1 + opt.atkPct / 100);
    const hpMul = (has('maxhp') ? 1.15 : 1) * (1 + opt.hpPct / 100);
    const maxHp = Math.round((100 + s.stats.vit * 9 + s.level * 12) * hpMul);
    const attack = Math.round((baseAtk + wa) * atkBonus);
    const defense = Math.round((2 + s.stats.vit * 0.55 + ad) * (1 + opt.defPct / 100));
    return {
      maxHp,
      maxMp: 40 + s.stats.int * 7,
      attack,
      baseAtk: Math.round(baseAtk),
      weaponAtk: wa,
      cls,
      weapon: w,
      attackRange: w.range,
      attackCd: w.cd,
      defense,
      critChance: Math.min(0.85, 0.05 + s.stats.dex * 0.003 + (has('crit') ? 0.06 : 0) + (opt.crit + (w.crit ? w.crit * 100 : 0)) / 100),
      critDmg: 1.5 + s.stats.dex * 0.004 + (has('critdmg') ? 0.3 : 0) + opt.critDmg / 100,
      evade: Math.min(0.45, s.stats.dex * 0.0022 + opt.evade / 100),
      atkSpeed: (1 + s.stats.dex * 0.004) * (has('atkspeed') ? 1.12 : 1),
      moveSpeed: 4.6 * (has('speed') ? 1.1 : 1) * (1 + opt.moveSpeed / 100) * (s.zone === 4 ? 0.92 : 1),
      magnet: 3.2 * (has('magnet') ? 1.4 : 1),
      autoloot: has('autoloot'),
      regen: has('regen') ? 1.5 : 0,
      lootBonus: has('loot') ? 1.3 : 1,
      armorResist: eq.armor ? eq.armor.fam : null,
      resist: opt.resist,
      opt,
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
    for (const e of game.enemies) if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
    if (game.ui) game.ui.clearTags();
    for (const pr of game.projectiles) scene.remove(pr.mesh);
    for (const it of game.pickups) if (it.mesh) scene.remove(it.mesh);
    for (const fx of game.effects) if (fx.mesh) scene.remove(fx.mesh);
    for (const t of game.telegraphs) { scene.remove(t.mesh); scene.remove(t.ring); }
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
    if (game.playerMesh) scene.remove(game.playerMesh);
    const fam = game.state.equip.weapon ? game.state.equip.weapon.fam : 'slash';
    game.playerMesh = makePlayer(THREE, fam);
    scene.add(game.playerMesh);
    const d = game.derived();
    const sp = zone.spawn;
    game.player = {
      x: sp.x, z: sp.z, facing: Math.PI, vy: 0,
      hp: clamp(game.state.hp || d.maxHp, 1, d.maxHp),
      mp: d.maxMp,
      atkCd: 0.2, regenT: 0, alive: true, respawnT: 0,
      walkT: 0, moving: false, atkAnim: 0, poisonT: 0,
    };
    game.playerMesh.position.set(game.player.x, 0, game.player.z);

    // 동료
    game.compObjects = [];
    game.state.party.forEach((cid, i) => {
      const c = game.state.companions.find((x) => x.id === cid);
      if (!c) return;
      const cls = COMPANION_CLASSES[c.cls];
      const mesh = makeCompanion(THREE, cls, GRADES[c.grade].color);
    scene.add(mesh);
      game.compObjects.push({ data: c, cls, mesh, x: game.player.x - 1.6 + i * 1.6, z: game.player.z + 1.8, atkCd: Math.random(), healCd: 2 });
      game.companions.push(game.compObjects[game.compObjects.length - 1]);
    });

    // 몬스터 배치
    spawnZoneMobs(zone);

    // 카메라 즉시 이동
    const aspect0 = window.innerWidth / Math.max(1, window.innerHeight);
    const vis0 = Math.max(13.6, 10.2 / aspect0);
    camera.position.set(game.player.x, vis0 * 1.06, game.player.z + vis0 * 0.42);
    camera.lookAt(game.player.x, 0, game.player.z - 1);

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
    spawnEnemy(zone.mobs.mid, zone.mid.x, zone.mid.z, true);
    spawnEnemy(zone.mobs.boss, zone.boss.x, zone.boss.z, true);
  }

  function enemyLevel(def, zone) {
    return Math.max(1, zone.scale.lvl + (def.boss === 'boss' ? 3 : def.boss === 'mid' ? 1 : def.elite ? 1 : 0));
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
      stunT: 0, reward: { xp: ov.xp, gold: ov.gold },
      headY: mesh.userData.headY || 1, state: 'idle', wanderT: Math.random() * 2,
      wander: { x, z }, atkCd: 1 + Math.random(), hitFlash: 0, alive: true,
      isBoss: def.boss === 'boss', isMid: def.boss === 'mid', elite: !!def.elite,
      level: lvl, tag: null, floatT: Math.random() * 6, telegraphT: 3 + Math.random() * 2,
      summonDone: false, deadT: 0, facing: 0, fixed,
    };
    mesh.userData.ref = e;
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

  game.setBalance = function (next) {
    game.balance = next;
    game.state.balance = next;
    game.save();
    game.flushSave();
    if (game.ui) game.ui.markDirty(true);
  };
  game.resetBalance = function () {
    game.balance = defaultBalance();
    game.state.balance = game.balance;
    game.save();
    game.flushSave();
    if (game.ui) game.ui.markDirty(true);
  };

  function dropLoot(e) {
    const zone = game.zone;
    const luck = game.derived().lootBonus;
    const ov = game.mobStats(zone.id, e.def);
    addPickup('gold', e.x, e.z, Math.max(1, Math.round(ov.gold * (0.85 + Math.random() * 0.3))));
    // 영혼
    const sr = Math.random();
    if (e.isBoss) addPickup('soul', e.x, e.z, 'purple');
    else if (e.isMid) addPickup('soul', e.x, e.z, sr < 0.35 ? 'purple' : 'blue');
    else if (e.elite) { if (sr < 0.85) addPickup('soul', e.x, e.z, 'green'); else if (sr < 0.93) addPickup('soul', e.x, e.z, 'blue'); }
    else if (sr < 0.38) addPickup('soul', e.x, e.z, 'gray');
    const wfams = Object.keys(WEAPONS);
    // 중간보스: 방어구 확정 드롭
    if (e.isMid) {
      const fam = Object.keys(ARMOR_KINDS)[Math.floor(Math.random() * 4)];
      addPickup('item', e.x, e.z, { kind: 'armor', fam, grade: rollGrade(zone, 2) });
    }
    // 보스: 악세서리 확정 드롭
    if (e.isBoss) {
      const fam = Object.keys(ACCESSORY_KINDS)[Math.floor(Math.random() * 3)];
      addPickup('item', e.x, e.z, { kind: 'accessory', fam, grade: rollGrade(zone, 3) });
    }
    // 무기 드롭
    const chance = (e.isBoss ? 0.9 : e.isMid ? 0.6 : e.elite ? 0.3 : 0.08) * luck;
    if (Math.random() < chance) {
      const fam = wfams[Math.floor(Math.random() * wfams.length)];
      const g = rollGrade(zone, e.isBoss ? 3 : e.isMid ? 2 : 0);
      addPickup('item', e.x, e.z, { kind: 'weapon', fam, grade: g });
    }
  }

  function addPickup(type, x, z, data) {
    game.pickups.push({ type, x: x + (Math.random() - 0.5) * 1.2, z: z + (Math.random() - 0.5) * 1.2, data, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, t: 0, alive: true });
  }

  game.dealDamage = function (e, baseDmg, opts = {}) {
    if (!e.alive) return 0;
    const d = game.derived();
    const medal = game.medalInfo(game.zone.id).bonus;
    let dmg = baseDmg * (1 + medal) * (1 + (game.state.level - 1) * 0.02);
    let crit = false;
    if (opts.canCrit !== false && Math.random() < d.critChance) { crit = true; dmg *= d.critDmg; }
    dmg = Math.max(1, Math.round(dmg * (0.9 + Math.random() * 0.2)));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    e.state = 'chase';
    if (game.ui) {
      game.ui.damageNumber(e.x, e.headY, e.z, dmg, crit ? 'crit' : '');
      if (e.isBoss || e.isMid) game.ui.updateBossBar(e);
    }
    if (e.hp <= 0) killEnemy(e);
    return dmg;
  };

  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    e.deadT = 0;
    game.state.kills++;
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
    // 경험치 · 골드 보상 표기
    const ov = game.mobStats(zone.id, e.def);
    const xp = Math.round(ov.xp);
    game.gainXp(xp);
    game.gainCompanionXp(Math.round(xp * 0.6));
    game.save();
    if (game.ui) game.ui.rewardText(e.x, e.headY + 0.3, e.z, `+${fmtNum(xp)} XP  +${fmtNum(ov.gold)} G`);
    dropLoot(e);
    // 사망 연출
    if (e.isBoss) { game.camShake = 0.7; if (game.ui) game.ui.toast(`${zone.mobs.boss.name} 처치!`, 'gold'); }
    if (e.isMid && game.ui) game.ui.toast(`${zone.mobs.mid.name} 처치!`, 'gold');
    if (e.isBoss) bossDefeated();
    if (game.ui) game.ui.updateBossBar(null);
  }

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
    if (step.type === 'kill') q.progress = Math.min(step.n, q.progress + 1);
    else if (step.type === 'mid' && e.isMid) q.progress = 1;
    else if (step.type === 'boss' && e.isBoss) q.progress = 1;
    if (q.progress >= step.n && game.ui) game.ui.toast('퀘스트 목표 달성! NPC에게 돌아가세요.', 'good');
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
    // 캐릭터 애니메이션
    const m = game.playerMesh;
    m.position.set(p.x, Math.abs(Math.sin(p.walkT)) * (p.moving ? 0.06 : 0.01), p.z);
    m.rotation.y = p.facing;
    if (m.userData.armR) {
      const swing = p.atkAnim > 0 ? Math.sin((1 - p.atkAnim / 0.22) * Math.PI) * 1.6 : 0;
      m.userData.armR.rotation.x = -swing;
      m.userData.armR.rotation.z = p.moving ? Math.sin(p.walkT) * 0.25 : 0;
    }
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
    p.atkAnim = 0.22;
    const dmgBase = d.attack * W.mult;
    if (W.projectile) {
      spawnProjectile({
        from: 'player', x: p.x, y: 1.1, z: p.z, targetX: target.x, targetZ: target.z,
        speed: 16, color: W.cls === 'magic' ? 0x9fd8ff : 0xffd27f, dmg: dmgBase, range: W.range + 1,
      });
    } else {
      spawnSlash(W, p, fam);
      const hits = [];
      for (const e of game.enemies) {
        if (!e.alive) continue;
        const dd = Math.hypot(e.x - p.x, e.z - p.z);
        if (dd > W.range + e.radius) continue;
        if (angleDiff(Math.atan2(e.x - p.x, e.z - p.z), a) > W.arc / 2 + 0.22 && W.arc < 6) continue;
        hits.push(e);
        game.dealDamage(e, dmgBase);
      }
      // 검: 확률 추가타 / 둔기: 확률 기절
      if (hits.length) {
        if (W.extra && Math.random() < W.extra) {
          const t = hits[0];
          game.dealDamage(t, dmgBase * 0.6);
          if (game.ui && t.alive) game.ui.floatText(t.x, t.headY + 0.2, t.z, '추가타!', 'crit');
        }
        if (W.stun && Math.random() < W.stun) {
          for (const t of hits) if (t.alive) { t.stunT = 1.2; }
          if (game.ui) game.ui.floatText(p.x, 2.1, p.z, '기절!', 'heal');
        }
      }
    }
    p.atkCd = W.cd / d.atkSpeed;
    return true;
  }

  function spawnSlash(W, p, fam) {
    let mesh;
    const color = fam === 'magic' ? 0x9fd8ff : fam === 'blunt' ? 0xffcf8a : fam === 'pierce' ? 0xbfe6ff : 0xeaf6ff;
    const mat2 = (op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    if (W.arc >= 6) {
      mesh = new THREE.Mesh(new THREE.RingGeometry(W.range * 0.45, W.range, 28), mat2(0.5));
    } else if (W.arc < 1) {
      mesh = new THREE.Mesh(new THREE.RingGeometry(W.range * 0.9, W.range, 12, 1, -W.arc / 2 + Math.PI / 2, W.arc), mat2(0.85));
    } else {
      mesh = new THREE.Mesh(new THREE.RingGeometry(W.range * 0.66, W.range, 18, 1, -W.arc / 2 + Math.PI / 2, W.arc), mat2(0.55));
    }
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI - p.facing;
    mesh.position.set(p.x, 0.16, p.z);
    scene.add(mesh);
    game.effects.push({ mesh, life: 0.2, max: 0.2, kind: 'fadeScale', from: 0.94 });
  }

  // ---------- 원거리 ----------
  function spawnProjectile(o) {
    const geo = new THREE.SphereGeometry(o.from === 'player' ? 0.16 : 0.22, 8, 6);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o.color }));
    m.position.set(o.x, o.y || 0.9, o.z);
    scene.add(m);
    const dx = o.targetX - o.x, dz = o.targetZ - o.z;
    const dd = Math.max(0.001, Math.hypot(dx, dz));
    game.projectiles.push({
      mesh: m, x: o.x, z: o.z, y: o.y || 0.9, vx: (dx / dd) * o.speed, vz: (dz / dd) * o.speed,
      life: 0, max: o.range / o.speed, from: o.from, dmg: o.dmg, color: o.color, style: o.style || 'normal',
    });
  }

  // ---------- 몬스터 AI ----------
  function updateEnemies(dt) {
    const p = game.player;
    if (!p || !p.alive) return;
    for (const e of game.enemies) {
      if (!e.alive) {
        e.deadT += dt;
        if (e.deadT < 0.45) {
          e.mesh.rotation.z = Math.min(1.4, e.deadT * 5);
          e.mesh.position.y = -Math.min(0.6, e.deadT * 1.2);
          if (e.tag) e.tag.style.opacity = String(Math.max(0, 1 - e.deadT * 3));
        } else if (e.mesh.parent) {
          scene.remove(e.mesh);
          if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
          e.gone = true;
        }
        continue;
      }
      const dx = p.x - e.x, dz = p.z - e.z;
      const dd = Math.hypot(dx, dz);
      e.floatT += dt;
      if (e.stunT > 0) {
        e.stunT -= dt;
        e.mesh.rotation.y += dt * 6;
        const bobS = e.mesh.userData.float ? 0.25 + Math.sin(e.floatT * 2) * 0.1 : 0;
        e.mesh.position.set(e.x, bobS + Math.abs(Math.sin(e.floatT * 8)) * 0.03, e.z);
        continue;
      }
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        e.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(e.hitFlash > 0 ? 0x662222 : 0x000000); });
      }
      if (e.def.boss) { updateBossAI(e, dt, dd, dx, dz); continue; }

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
          moveEnemy(e, (wdx / wd) * e.speed * 0.42 * dt, (wdz / wd) * e.speed * 0.42 * dt);
          e.mesh.rotation.y = Math.atan2(wdx, wdz);
        }
        if (dd < e.def.aggro && dd > 0.1) e.state = 'chase';
      } else if (e.state === 'chase') {
        if (dd > e.def.aggro * 2.4) { e.state = 'idle'; continue; }
        const stop = e.def.atkRange * 0.85 + e.radius * 0.4;
        if (dd > stop) {
          moveEnemy(e, (dx / dd) * e.speed * dt, (dz / dd) * e.speed * dt);
          e.mesh.rotation.y = Math.atan2(dx, dz);
        }
        e.atkCd -= dt;
        if (dd <= e.def.atkRange + e.radius && e.atkCd <= 0) {
          enemyAttack(e);
          e.atkCd = e.def.atkCd;
        }
      }
      // 이동 애니메이션
      const bob = e.mesh.userData.float ? 0.25 + Math.sin(e.floatT * 2) * 0.12 : 0;
      e.mesh.position.set(e.x, bob + Math.abs(Math.sin(e.floatT * 6)) * 0.04, e.z);
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
    if (style === 'ranged' || style === 'poison') {
      spawnProjectile({
        from: 'enemy', x: e.x, y: 1.0, z: e.z, targetX: p.x, targetZ: p.z,
        speed: style === 'poison' ? 8 : 9.5, color: style === 'poison' ? 0x9bff6a : 0xc58fff,
        dmg: e.atk, range: Math.hypot(p.x - e.x, p.z - e.z) + 2, style,
      });
      return;
    }
    if (style === 'aoe') {
      addTelegraph(p.x, p.z, e.def.boss === 'boss' ? 4.2 : 3.2, 1.25, e.atk * 1.5, e);
      return;
    }
    // 근접
    const dd = Math.hypot(p.x - e.x, p.z - e.z);
    if (dd < e.def.atkRange + e.radius + 0.5) {
      game.damagePlayer(e.atk, e);
    }
    game.effects.push({ mesh: null, kind: 'lunge', e, life: 0.15, max: 0.15 });
  }

  function updateBossAI(e, dt, dd, dx, dz) {
    const p = game.player;
    const homeDist = Math.hypot(e.x - e.home.x, e.z - e.home.z);
    if (dd > 23 || homeDist > 20) {
      const hx = e.home.x - e.x, hz = e.home.z - e.z;
      const hd = Math.hypot(hx, hz) || 1;
      if (hd > 1) {
        moveEnemy(e, (hx / hd) * e.speed * dt, (hz / hd) * e.speed * dt);
        e.mesh.rotation.y = Math.atan2(hx, hz);
      }
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.06 * dt);
      e.state = 'idle';
      return;
    }
    e.telegraphT -= dt;
    if (dd > e.def.atkRange * 0.9 + e.radius) {
      moveEnemy(e, (dx / dd) * e.speed * dt, (dz / dd) * e.speed * dt);
      e.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      e.mesh.rotation.y = Math.atan2(dx, dz);
      e.atkCd -= dt;
      if (e.atkCd <= 0) { enemyAttack(e); e.atkCd = e.def.atkCd; }
    }
    // 강공격 텔레그래프
    if (e.telegraphT <= 0 && dd < 16) {
      e.telegraphT = e.isBoss ? 6.5 : 5.0;
      addTelegraph(p.x, p.z, e.isBoss ? 4.6 : 3.6, 1.35, e.atk * 1.9, e);
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

  function addTelegraph(x, z, r, time, dmg, source) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 30),
      new THREE.MeshBasicMaterial({ color: 0xff2f45, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 34), new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.09, z); scene.add(ring);
    game.telegraphs.push({ mesh, ring, x, z, r, t: 0, max: time, dmg, source, done: false });
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
        game.effects.push({ mesh: null, kind: 'shockwave', x: t.x, z: t.z, r: t.r, life: 0.4, max: 0.4 });
        game.camShake = 0.32;
      }
      if (t.t >= t.max + 0.18) {
        scene.remove(t.mesh); scene.remove(t.ring);
        t.mesh.geometry.dispose(); t.mesh.material.dispose();
        t.ring.geometry.dispose(); t.ring.material.dispose();
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
    for (const t of game.telegraphs) { scene.remove(t.mesh); scene.remove(t.ring); }
    game.telegraphs = [];
    for (const pr of game.projectiles) if (pr.from === 'enemy') scene.remove(pr.mesh);
    game.projectiles = game.projectiles.filter((pr) => pr.from !== 'enemy');
    if (game.ui) game.ui.updateBossBar(null);
  }

  // ---------- 동료 ----------
  function updateCompanions(dt) {
    const p = game.player;
    if (!p) return;
    game.companions.forEach((c, i) => {
      const d = game.derived();
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
      // 전투
      c.atkCd -= dt;
      const scale = 1 + ((c.data.lv || 1) - 1) * 0.22;
      const atk = c.cls.atk * scale * (1 + (c.data.grade || 0) * 0.16);
      if (c.cls.id === 'healer') {
        c.healCd -= dt;
        if (c.healCd <= 0 && p.hp < d.maxHp * 0.85) {
          c.healCd = 3.4;
          const heal = Math.round(c.cls.heal * scale);
          p.hp = Math.min(d.maxHp, p.hp + heal);
          if (game.ui) game.ui.damageNumber(p.x, 1.8, p.z, `+${heal}`, 'heal');
        }
        if (c.atkCd <= 0) {
          const t = nearestEnemyFrom(c.x, c.z, 6.5);
          if (t) { c.atkCd = c.cls.cd; game.dealDamage(t, atk); }
        }
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
          if (!e.alive) continue;
          if (Math.hypot(e.x - pr.x, e.z - pr.z) < e.radius + 0.35) {
            game.dealDamage(e, pr.dmg);
            pr.dead = true;
            game.effects.push({ mesh: null, kind: 'burst', x: pr.x, z: pr.z, color: pr.color, life: 0.3, max: 0.3 });
            break;
          }
        }
      } else {
        if (p.alive && Math.hypot(p.x - pr.x, p.z - pr.z) < 0.75) {
          game.damagePlayer(pr.dmg, null);
          pr.dead = true;
          if (pr.style === 'poison') addPoisonPool(pr.x, pr.z, pr.dmg);
        }
      }
      if (pr.life > pr.max || Math.abs(pr.x) > 46 || Math.abs(pr.z) > 46) pr.dead = true;
      if (pr.dead) { scene.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); }
    }
    game.projectiles = game.projectiles.filter((x) => !x.dead);
  }

  function addPoisonPool(x, z, dmg) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), new THREE.MeshBasicMaterial({ color: 0x7ad64a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.05, z); scene.add(pool);
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
        const sp = 9 + (magnet - dd) * 1.4;
        it.x += ((p.x - it.x) / dd) * sp * dt;
        it.z += ((p.z - it.z) / dd) * sp * dt;
      } else {
        it.x += it.vx * dt * 0.4;
        it.z += it.vz * dt * 0.4;
        it.vx *= 0.92; it.vz *= 0.92;
      }
      if (!it.mesh) {
        let color = 0xffd257;
        if (it.type === 'soul') color = it.data === 'purple' ? 0xb46cff : it.data === 'blue' ? 0x5aa9ff : it.data === 'green' ? 0x5fe08d : 0xc9d2e0;
        if (it.type === 'item') color = parseInt(GRADES[it.data.grade].color.slice(1), 16);
        const geo = it.type === 'gold' ? new THREE.CylinderGeometry(0.14, 0.14, 0.05, 8) : new THREE.SphereGeometry(0.15, 7, 5);
        it.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
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
    }
    game.save();
    if (game.ui) game.ui.markDirty();
  }

  function gradeCss(g) { return g >= 4 ? 'gold' : g >= 2 ? 'good' : ''; }

  // ---------- 보관함 ----------
  function updateChests(dt) {
    const p = game.player;
    if (!p) return;
    for (const c of game.world.chests) {
      if (c.opened) continue;
      const dd = Math.hypot(p.x - c.x, p.z - c.z);
      if (dd < 2.1) {
        c.opened = true;
        c.mesh.userData.lid.rotation.x = -1.9;
        if (!game.state.chestOpened.includes(c.id)) {
          game.state.chestOpened.push(c.id);
          game.state.chestsFound = Math.min(SECRET_TOTAL, (game.state.chestsFound || 0) + 1);
          giveChestReward();
          if (game.ui) game.ui.showChestBubble(game.state.chestsFound, SECRET_TOTAL);
        }
        game.save();
      }
    }
  }

  function giveChestReward() {
    const s = game.state;
    const r = Math.random();
    if (r < 0.4) {
      s.gold += 80 + Math.round(Math.random() * 120) * game.zone.id;
      if (game.ui) game.ui.toast('보관함: 골드를 획득했어요.', 'gold');
    } else if (r < 0.7) {
      const kind = Math.random() < 0.6 ? 'weapon' : 'armor';
      const fam = kind === 'weapon' ? Object.keys(WEAPONS)[Math.floor(Math.random() * 4)] : Object.keys(ARMOR_KINDS)[Math.floor(Math.random() * 4)];
      const g = Math.min(5, 1 + Math.floor(Math.random() * 3) + (game.zone.id > 2 ? 1 : 0));
      game.addItem(kind, fam, g);
      if (game.ui) game.ui.toast(`보관함: ${itemName(kind, fam, g)} 획득!`, g >= 3 ? 'gold' : 'good');
    } else if (r < 0.9) {
      const kinds = ['gray', 'green', 'blue', 'purple'];
      const k = kinds[Math.min(3, Math.floor(Math.random() * (2 + game.zone.id)))];
      s.souls[k] = (s.souls[k] || 0) + 1 + Math.floor(Math.random() * 2);
      if (game.ui) game.ui.toast(`보관함: ${k === 'purple' ? '보스' : k === 'blue' ? '중간보스' : k === 'green' ? '정예' : '일반'} 영혼 획득!`, 'gold');
    } else {
      s.statPts += 1;
      if (game.ui) game.ui.toast('보관함: 영구 스탯 포인트 +1!', 'good');
    }
    if (game.ui) game.ui.markDirty();
  }

  // ---------- 이펙트 ----------
  function updateEffects(dt) {
    for (const fx of game.effects) {
      fx.life -= dt;
      const k = Math.max(0, fx.life / fx.max);
      if (fx.kind === 'fadeScale' && fx.mesh) {
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
  function updateCamera(dt) {
    const p = game.player;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const vis = Math.max(13.6, 10.2 / aspect);
    const targetX = p.x;
    const targetZ = p.z + vis * 0.42;
    const tx = targetX + (game.camShake > 0 ? (Math.random() - 0.5) * game.camShake : 0);
    const tz = targetZ + (game.camShake > 0 ? (Math.random() - 0.5) * game.camShake : 0);
    camPos.x = lerp(camPos.x, tx, 1 - Math.pow(0.0015, dt));
    camPos.z = lerp(camPos.z, tz, 1 - Math.pow(0.0015, dt));
    camPos.y = lerp(camPos.y || vis * 1.06, vis * 1.06, 1 - Math.pow(0.002, dt));
    camera.position.copy(camPos);
    camera.lookAt(p.x, 0, p.z - 1);
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
      // 재생
      const d = game.derived();
      if (d.regen > 0) {
        p.regenT += dt;
        if (p.regenT > 1) { p.regenT = 0; p.hp = Math.min(d.maxHp, p.hp + d.regen); }
      }
      // 늪지 독
      if (game.zone.id === 2 && !game.state.equip.charm) {
        p.poisonT = (p.poisonT || 0) + dt;
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
    updateCamera(dt);
    game.world.update(dt, game.time);
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
    if (kind === 'weapon') {
      // 무기 외형 교체
      const p = game.player;
      if (game.playerMesh) scene.remove(game.playerMesh);
      game.playerMesh = makePlayer(THREE, fam);
      game.playerMesh.position.set(p.x, 0, p.z);
      game.playerMesh.rotation.y = p.facing;
      scene.add(game.playerMesh);
    }
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

  game.unequip = function (kind) {
    const it = game.state.equip[kind];
    if (!it) return;
    game.addItem(it.kind, it.fam, it.grade);
    game.state.equip[kind] = null;
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
    game.state.party.forEach((cid, i) => {
      const c = game.state.companions.find((x) => x.id === cid);
      if (!c) return;
      const cls = COMPANION_CLASSES[c.cls];
      const mesh = makeCompanion(THREE, cls, GRADES[c.grade].color);
      scene.add(mesh);
      const o = { data: c, cls, mesh, x: game.player.x - 1.6 + i * 1.6, z: game.player.z + 1.8, atkCd: Math.random(), healCd: 2 };
      game.compObjects.push(o); game.companions.push(o);
    });
  }

  game.talkNpc = function () {
    const q = game.questInfo(game.zone.id);
    if (game.ui) game.ui.openQuestDialog(q);
  };
  game.claimQuest = function () {
    const zone = game.zone;
    const q = game.state.quests[zone.id] || { step: 0, progress: 0, accepted: false, done: false };
    const step = zone.quests.steps[q.step];
    if (!q.accepted) { q.accepted = true; q.progress = 0; game.state.quests[zone.id] = q; game.save(); return { ok: true, msg: '퀘스트를 수락했어요!' }; }
    if (!step) return { ok: false, msg: '모든 퀘스트를 마쳤어요.' };
    if (q.progress < step.n) return { ok: false, msg: '아직 목표를 달성하지 못했어요.' };
    const r = step.reward || {};
    if (r.gold) game.state.gold += r.gold;
    if (r.xp) game.gainXp(r.xp);
    if (r.pt) game.state.statPts += r.pt;
    if (r.soul) game.state.souls[r.soul] = (game.state.souls[r.soul] || 0) + (r.soulN || 1);
    if (r.item !== undefined) {
      const kind = Math.random() < 0.6 ? 'weapon' : 'armor';
      const fam = kind === 'weapon' ? Object.keys(WEAPONS)[Math.floor(Math.random() * 4)] : Object.keys(ARMOR_KINDS)[Math.floor(Math.random() * 4)];
      game.addItem(kind, fam, r.item);
    }
    if (r.charm) {
      game.state.equip.charm = { kind: 'charm', fam: r.charm, grade: 0 };
      if (game.ui) game.ui.toast(`${CHARMS[r.charm].name}을(를) 얻었어요!`, 'gold');
    }
    if (r.unlock && !game.state.unlocked.includes(r.unlock)) {
      game.state.unlocked.push(r.unlock);
      if (game.ui) game.ui.toast(`새 구역 해금 · ${PLAYABLE.find((z) => z.id === r.unlock).name}`, 'good');
    }
    q.step++;
    q.progress = 0;
    if (q.step >= zone.quests.steps.length) q.done = true;
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return { ok: true, msg: '보상을 받았어요!' };
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
      killAll() { for (const e of [...game.enemies]) if (e.alive && !e.isBoss) game.dealDamage(e, 99999, { canCrit: false }); },
      state() { return { zone: game.zone.id, level: game.state.level, hp: game.player.hp, maxHp: game.derived().maxHp, attack: game.derived().attack, kills: game.state.kills, medal: game.medalInfo(game.zone.id), enemies: game.enemies.filter((e) => e.alive).length, chests: game.chestInfo(game.zone.id), pos: { x: +game.player.x.toFixed(2), z: +game.player.z.toFixed(2) } }; },
      chest(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 0.6; } },
      advance(sec, dt = 1 / 60) { const n = Math.min(3600, Math.round(sec / dt)); for (let i = 0; i < n; i++) step(dt); return game.time; },
      unlockAll() { game.state.unlocked = [1, 2, 3, 4]; game.state.equip.charm = { kind: 'charm', fam: 'aqua', grade: 0 }; game.ui.markDirty(true); },
      enter(id) { return game.enterZone(id); },
      killZone(n = 1) { const list = game.enemies.filter((e) => e.alive && !e.isBoss && !e.isMid); for (let i = 0; i < Math.min(n, list.length); i++) game.dealDamage(list[i], 999999, { canCrit: false }); },
      nearNpc() { const n = game.world.npc.position; game.player.x = n.x + 1.5; game.player.z = n.z + 0.5; },
      hitOnce() { return playerAttack(); },
      options(kind, fam, grade) { return itemOptions(kind, fam, grade); },
    };
  }

  return game;
}
