// 스쿨히어로 — 지도·구역·보스 리스폰·묘비 (game.js에서 분리)
// clearFieldEntities / buildWorld / setDistrict / unlockDistrict /
// returnToStart / returnToLastDistrict / enterZone / spawnZoneMobs /
// spawnDistrictMobs / applyDistrictAtmosphere / bossRemain / bossReady /
// allBossDefs / bossStatus / BOSS_PATTERN / setShieldVisual / linkBossGroup /
// graveSpot / bossTimerKey / addGrave / removeGrave / clearGraves / updateGraves.
import { clamp, groundY, disposeGroup } from './util.js';
import { buildWorld, makePlayer, makeCompanion, worldPos } from '../world.js';
import { ASSET_URL, getTexture, aspectOf } from '../assets.js';
import { PLAYABLE, BOSS_LABEL, BOSS_TIMER, avatarOf, COMPANION_CLASSES, GRADES } from '../data.js';

export function installZones(ctx) {
  const { game, THREE, scene, camera } = ctx;

// ---------- 하나의 판타지 대륙 지도 (서울 9 + 마계 인천 3 + 경기 6) ----------
// 월드는 한 번만 짓는다. 구역 이동은 setDistrict로 — 월드·플레이어·동료를 유지한 채
// 현재 구역(안개/배경/몬스터/NPC 기준)만 바꾼다. 포탈 이동은 없다.
function clearFieldEntities() {
  for (const e of game.enemies) {
    if (e.tag && e.tag.parentNode) e.tag.parentNode.removeChild(e.tag);
    if (e.mesh) { scene.remove(e.mesh); disposeGroup(e.mesh); }
  }
  if (game.ui) game.ui.clearTags();
  for (const pr of game.projectiles) scene.remove(pr.mesh);
  for (const it of game.pickups) if (it.mesh) ctx.fxFree(it.mesh);
  for (const fx of game.effects) if (fx.mesh) ctx.disposeObj(fx.mesh);
  for (const t of game.telegraphs) { ctx.fxFree(t.mesh); ctx.fxFree(t.ring); if (t.mark) ctx.fxFree(t.mark); }
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
  game.world = buildWorld(THREE, PLAYABLE, game.state.chestOpened, !!game.state.earthGateOpen, game.state.unlocked, !!game.state.gyeonggiGateOpen);
  scene.add(game.world.group);
  applyDistrictAtmosphere(zone);

  // 플레이어 (GLB 테스트: 준비된 GLB가 있으면 절차적 메쉬 대신 GLB를 쓴다)
  if (game.playerMesh) { scene.remove(game.playerMesh); if (game.playerMesh !== ctx.glbHeroMesh()) disposeGroup(game.playerMesh); }
  if (ctx.glbHeroReady()) {
    game.playerMesh = ctx.glbHeroMesh();
  } else {
    game.playerMesh = makePlayer(THREE, 'sword', avatarOf(game.state.avatar), game.state.equip, game.state.appearance);
  }
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
  ctx.ensureGlbHero();

  // 동료
  game.compObjects = [];
  game.tank = null;
  game.state.party.forEach((cid, i) => {
    const c = game.state.companions.find((x) => x.id === cid);
    if (!c) return;
    const cls = COMPANION_CLASSES[c.cls];
    const mesh = makeCompanion(THREE, cls, GRADES[c.grade].color);
    scene.add(mesh);
    const o = ctx.makeCompanionObj(c, cls, mesh, game.player.x + (i - (game.state.party.length - 1) / 2) * 1.6, game.player.z + 1.8);
    game.compObjects.push(o);
    game.companions.push(o);
    if (cls.id === 'tank' && !game.tank) game.tank = o;
  });
  // GLB 동료 테스트: 준비된 GLB가 있으면 첫 탱커·근접·마법·힐러를 GLB로 바꾼다
  ctx.maybeSwapGlbTank();
  ctx.maybeSwapGlbMelee();
  ctx.maybeSwapGlbMage();
  ctx.maybeSwapGlbHealer();

  spawnDistrictMobs(zone);

  // 카메라 즉시 이동 (플레이어 지형 높이 기준)
  const rig0 = ctx.camRig();
  const gy0 = groundY(game.player.x, game.player.z);
  camera.position.set(game.player.x, gy0 + rig0.height, game.player.z + rig0.back);
  camera.lookAt(camera.position.x, gy0, camera.position.z - rig0.back);

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
    ctx.snapCompanions();
  }
  applyDistrictAtmosphere(zone);
  spawnDistrictMobs(zone);
  if (game.ui) game.ui.onZoneEnter(zone);
  if (!opts.silent) { game.save(); game.flushSave(); }
  return true;
};

// 구역 해금 (보스 처치·퀘스트 보상 공용) — 방벽 게이트도 함께 연다 (결계 완전 제거)
game.unlockDistrict = function (zoneId, silent) {
  const s = game.state;
  if (zoneId < 1 || zoneId > 18 || s.unlocked.includes(zoneId)) return false;
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

// 귀환 (zoneId를 안 주면 1구역 — 사망 부활은 이 기본값을 쓴다)
game.returnToStart = function (zoneId) {
  const target = PLAYABLE.find((z) => z.id === zoneId) || PLAYABLE[0];
  const sp = worldPos(target, target.spawn.x, target.spawn.z);
  game.player.x = sp.x; game.player.z = sp.z; game.player.facing = Math.PI;
  game.setDistrict(target.id, { spawn: true });
  ctx.snapCompanions();
  if (game.ui) game.ui.toast(`${target.name}(으)로 돌아왔어요. 체력이 모두 회복되었습니다.`, 'good');
  return true;
};

// 귀환 버튼: 현재 구역 퀘스트를 끝내고 필드보스까지 잡았을 때만 가장 높은 해금 구역으로,
// 그 전에는 현재 구역 NPC 옆으로 돌아간다 (필드보스를 잡았다고 퀘스트가 끝나기 전에 다음 구역으로 넘어가지 않는다)
game.returnToLastDistrict = function () {
  const cur = game.zone;
  const q = (game.state.quests || {})[cur.id] || {};
  const bossDead = game.bossRemain(cur.id, 'field') > 0; // 필드보스 타이머가 살아 있으면 잡은 상태 (타이머 자체는 그대로)
  if (q.done && bossDead) {
    const last = Math.max(...(game.state.unlocked || [1]));
    return game.returnToStart(last);
  }
  // 퀘스트 진행 중이거나 필드보스가 살아 있으면 현재 구역 NPC 옆으로
  game.setDistrict(cur.id);
  const npc = cur.npc ? worldPos(cur, cur.npc.x, cur.npc.z) : worldPos(cur, cur.spawn.x, cur.spawn.z);
  game.player.x = npc.x + 2; game.player.z = npc.z + 2; game.player.facing = Math.PI;
  game.playerMesh.position.set(game.player.x, groundY(game.player.x, game.player.z), game.player.z);
  ctx.snapCompanions();
  if (game.ui) game.ui.toast(`${cur.npc ? cur.npc.name : cur.name} 옆으로 돌아왔어요.`, 'good');
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
    ctx.spawnEnemy(def, sp.x + Math.cos(ang) * rad, sp.z + Math.sin(ang) * rad * 0.9);
  }
  for (let i = 0; i < 9; i++) {
    const def = zone.mobs.normal[i % zone.mobs.normal.length];
    const p = pick();
    ctx.spawnEnemy(def, p.x, p.z);
  }
  for (let i = 0; i < 4; i++) {
    const def = zone.mobs.elite[0];
    const p = pick();
    ctx.spawnEnemy(def, p.x, p.z);
  }
  // 보스는 리스폰 타이머가 지난 경우에만 등장 (중간보스 4시간 · 에픽보스 6시간 · 필드보스 24시간)
  const midP = worldPos(zone, zone.mid.x, zone.mid.z);
  const bossP = worldPos(zone, zone.boss.x, zone.boss.z);
  if (bossReady(zone.id, 'mid')) ctx.spawnEnemy(zone.mobs.mid, midP.x, midP.z, true);
  if (bossReady(zone.id, 'boss')) ctx.spawnEnemy(zone.mobs.boss, bossP.x, bossP.z, true);
  if (zone.field && bossReady(zone.id, 'field')) {
    const fP = worldPos(zone, zone.field.x, zone.field.z);
    ctx.spawnEnemy(zone.mobs.field, fP.x, fP.z, true);
  }
  // 추가 보스 (드래곤·쌍둥이·3형제·독버섯) — 각자 타이머가 지난 경우에만 등장
  for (const ex of (zone.extraBosses || [])) {
    if (!bossReady(zone.id, ex.type)) continue;
    const defs = ex.defs || [ex.def];
    const exP = worldPos(zone, ex.x, ex.z);
    const spawned = defs.map((d, i) => ctx.spawnEnemy(d, exP.x + (i - (defs.length - 1) / 2) * 3.2, exP.z + (i % 2) * 2, true));
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
    .map((b) => ({ type: b.type, name: b.name, lv: ctx.enemyLevel(b.def, zone), remain: game.bossRemain(zoneId, b.type), total: BOSS_TIMER[b.type] || 0, label: b.label }));
};

// ---------- 보스 특수 패턴 ----------
const BOSS_PATTERN = {
  ogre: 'charge', golem: 'cannon', anubis: 'whirlwind',
  ent: 'nova', witch: 'necromancer', kraken: 'portal', siren: 'nova',
  hydra: 'split', dragon: 'dragon',
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
        const spawned = defs.map((b, i) => ctx.spawnEnemy(b.def, b.x + (i - (defs.length - 1) / 2) * 3.2, b.z + (i % 2) * 2, true));
        if (defs[0].def.group) linkBossGroup(defs[0].def.group, spawned);
        if (game.ui) game.ui.toast(`${defs[0].name}이(가) 다시 나타났어요!`, 'bad');
      }
    }
  }
}
  // 다른 모듈에서 부른다 (stats questBossTarget, main loop, enemies, combat)
  ctx.BOSS_PATTERN = BOSS_PATTERN;
  ctx.clearFieldEntities = clearFieldEntities;
  ctx.spawnZoneMobs = spawnZoneMobs;
  ctx.spawnDistrictMobs = spawnDistrictMobs;
  ctx.applyDistrictAtmosphere = applyDistrictAtmosphere;
  ctx.allBossDefs = allBossDefs;
  ctx.bossReady = bossReady;
  ctx.setShieldVisual = setShieldVisual;
  ctx.linkBossGroup = linkBossGroup;
  ctx.graveSpot = graveSpot;
  ctx.bossTimerKey = bossTimerKey;
  ctx.updateGraves = updateGraves;
}
