// 스쿨히어로 — 게임 엔진
import {
  PLAYABLE, ZONES, GRADES, WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, GRADE_ADJ, WEAPON_BASE, ITEM_STATS,
  MEDAL_TIERS, MEDAL_STEP, TALENTS, COMPANION_CLASSES, COMPANION_NAMES, CHARMS, SECRET_TOTAL,
  itemOptions, defaultBalance, MOB_REWARD, OPT_LABEL,
  AVATARS, AVATAR_MAP, avatarOf, SKILLS,
  COMPANION_SKILLS, COMPANION_SKILL_POOLS, SKILL_BOOK_SKILL, COMPANION_SKILL_MAX_LEVEL, COMPANION_DMG_FACTOR,
  COMPANION_LV_PER, COMPANION_LV_HIGH_PER, COMPANION_LV_FLAT_AFTER,
  BOSS_TIMER, BOSS_LABEL, EVOLVE_NEED, SOUL_KINDS, COSTUMES, COSTUME_MAP, COSTUME_PULL_COST, COSTUME_MAX_LEVEL, costumeLevelMult, COMPANION_PULL_COST,
  ELEMENTS, ELEM_BEATS, EARTH_GATE, GYEONGGI_GATE,
} from './data.js';
import { buildWorld, makePlayer, makeMonster, makeCompanion, districtAt, worldPos, WORLD_BOUNDS } from './world.js';
import { ASSET_URL, getTexture, aspectOf } from './assets.js';
import { clamp, lerp, dist2, angleDiff, TAU, fmtNum, fmtRemain, groundY, disposeGroup } from './game/util.js';
import { installGlb } from './game/glb.js';
import { installStats } from './game/stats.js';
import { installState } from './game/state.js';
import { installZones } from './game/zones.js';
import { installEffects } from './game/effects.js';
import { installCombat } from './game/combat.js';
import { installPlayer } from './game/player.js';
import { installEnemies } from './game/enemies.js';
import { installCompanions } from './game/companions.js';
import { installProjectiles } from './game/projectiles.js';

const SAVE_KEY = 'school-hero.save.v1';

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2)); // 전투 렉 완화: 저전력 기기는 픽셀비를 더 낮춘다
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const scene = new THREE.Scene();
  // 3D 볼륨이 읽히는 원근 투영 — 고도 48°, 주인공 위치에서 보이는 세로 ≈18m
  // (2D 탑뷰 시절과 같은 화면 크기). 주인공(2.9m)이 화면 높이의 ~16%로 크게 보인다.
  const CAM_FOV = 50;
  const camera = new THREE.PerspectiveCamera(CAM_FOV, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 400);
  function updateCameraFrustum() {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }
  updateCameraFrustum();
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x3a4a30, 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e0, 0.92);
  sun.position.set(16, 34, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16; // 2D 탑뷰: 보이는 18m만 커버하면 된다 (그림자는 그대로, 해상도 효율은 2배)
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

  // ---------- 모듈 공용 컨텍스트 ----------
  // game.js를 모듈로 나누기 위한 공용 객체. 각 모듈은 install(ctx)로 자신의
  // 함수를 ctx에 붙이고, 다른 모듈의 함수는 ctx.fn()으로 부른다.
  // 공개 API(game.xxx)는 그대로 — ui.js/main.js가 쓴다.
  const ctx = { game, THREE, scene, camera, renderer };
  installGlb(ctx);
  installStats(ctx);
  installState(ctx);
  installZones(ctx);
  installEffects(ctx);
  installCombat(ctx);
  installPlayer(ctx);
  installEnemies(ctx);
  installCompanions(ctx);
  installProjectiles(ctx);
  // 아직 분리되지 않은 모듈이 쓰는 함수 (zones.js로 옮기면 이 줄은 지운다)
  ctx.camRig = camRig;

  game.groundY = groundY;

  // ---------- 저장 데이터 (src/game/state.js) ----------
  game.state = ctx.loadState();

  // ---------- 능력치 (src/game/stats.js) ----------
  // game.balance는 loadState() 뒤에 와야 해서 여기에 둔다.
  game.balance = game.state.balance || defaultBalance();
  // ---------- 지도·구역·보스 (src/game/zones.js) ----------

  // ---------- 전투·몹 스폰·전리품·관리자 (src/game/combat.js) ----------


  // ---------- 플레이어 (src/game/player.js) ----------

  // ---------- 이펙트 풀·공격 연출 (src/game/effects.js) ----------

  // ---------- 몬스터 AI·보스 패턴 (src/game/enemies.js) ----------

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
    ctx.stunStars(p.x, groundY(p.x, p.z) + 1.6, p.z, sec);
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
        if (e.group === 'twins') { e.shielded = e.def.key === 'twinA'; ctx.setShieldVisual(e, e.shielded); e.twinSwapT = 8; }
        if (e.group === 'brothers') {
          e.statue = !!e.def.statue;
          if (e.statue && e.mesh && e.mesh.userData.setColorTint) e.mesh.userData.setColorTint(0x8f8f8f);
        }
        e.mesh.position.set(e.x, groundY(e.x, e.z), e.z);
      }
    }
    for (const t of game.telegraphs) { ctx.fxFree(t.mesh); ctx.fxFree(t.ring); if (t.mark) ctx.fxFree(t.mark); }
    game.telegraphs = [];
    // 회오리·대포 같은 보스 패턴 이펙트도 함께 정리한다
    for (const fx of game.effects) {
      if ((fx.kind === 'whirlwind' || fx.kind === 'cannon') && fx.mesh) ctx.fxFree(fx.mesh);
    }
    game.effects = game.effects.filter((fx) => fx.kind !== 'whirlwind' && fx.kind !== 'cannon');
    for (const pr of game.projectiles) if (pr.from === 'enemy') ctx.fxFree(pr.mesh);
    game.projectiles = game.projectiles.filter((pr) => pr.from !== 'enemy');
    if (game.ui) game.ui.updateBossBar(null);
  }


  // ---------- 카메라 ----------
  let camPos = new THREE.Vector3(0, 18, 26);
  // 카메라 각도 완전 고정 (원근 투영, 고도 48°). 캐릭터가 움직여도 회전하지 않는다.
  function camRig() {
    // 보이는 세로 18m: 거리 = 9 / tan(25°) ≈ 19.3m, 뒤로 12.9m, 높이 14.35m.
    const dist = 9 / Math.tan((CAM_FOV / 2) * Math.PI / 180);
    const elev = 48 * Math.PI / 180;
    return { back: dist * Math.cos(elev), height: dist * Math.sin(elev) };
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
    // 안전망: 한 프레임에서 오류가 나도 루프가 죽지 않게 한다 (오류는 콘솔에 남기고 5초에 한 번만 알린다).
    // — 예전에는 여기서 던져진 오류가 requestAnimationFrame 예약을 건너뛰어 화면이 영원히 얼어붙었다.
    try {
      if (!game.paused) step(dt);
      renderer.render(scene, camera);
    } catch (err) {
      console.error('[school-hero] frame error (loop kept alive):', err);
      if (!frame._errToastT || game.time - frame._errToastT > 5) {
        frame._errToastT = game.time;
        if (game.ui) game.ui.toast('화면에 문제가 생겼어요. 계속 진행할게요.', 'bad');
      }
    }
    requestAnimationFrame(frame);
  }

  function step(dt) {
    game.time += dt;
    const p = game.player;
    if (!p) return;
    if (p.alive) {
      ctx.movePlayer(dt);
      // 구역 경계를 걸어서 넘으면 현재 구역이 바뀐다
      const here = districtAt(p.x, p.z);
      if (here.id !== game.zone.id) game.setDistrict(here.id);
      if (p.atkAnim > 0) p.atkAnim -= dt;
      if (p.switchT > 0) p.switchT -= dt;
      p.atkCd -= dt;
      if (p.atkCd <= 0) ctx.playerAttack();
      // 검 이중타격: 두 번째 휘두르기가 나올 때 데미지가 들어간다 (즉시 적용 아님)
      if (p.extraSwing && game.time >= p.extraSwing.at) {
        const ex = p.extraSwing; p.extraSwing = null;
        const W2 = game.weapon(ex.fam);
        if (ex.t.alive && p.alive && Math.hypot(ex.t.x - p.x, ex.t.z - p.z) < W2.range + ex.t.radius + 1) {
          p.facing = Math.atan2(ex.t.x - p.x, ex.t.z - p.z);
          const F2 = ctx.ATTACK_FX[ex.fam] || ctx.ATTACK_FX.sword;
          p.atkAnimMax = F2.anim; p.atkAnim = F2.anim; p.atkKind = F2.kind; p.atkFam = ex.fam;
          ctx.weaponSwingFx(ex.fam, p, p.facing, W2, [ex.t]);
          ctx.specialHit(ex.t, 'double');
          game.dealDamage(ex.t, ex.dmg, { canCrit: false });
        }
      }
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
      if (game.zone.id === 2 && !(game.state.equip.charm && game.state.equip.charm.fam === 'antidote') && !(game.state.cleanseT > 0)) {
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
    ctx.updateEnemies(dt);
    ctx.updateCompanions(dt);
    ctx.updateProjectiles(dt);
    ctx.updatePickups(dt);
    ctx.updateTelegraphs(dt);
    ctx.updateEffects(dt);
    ctx.updateChests(dt);
    ctx.updatePortals(dt);
    ctx.updateRespawn(dt);
    ctx.updateGraves(dt);
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
    // 지구 귀환 게이트가 이미 열려 있는 저장본(9구역 클리어 후)으로 들어오면
    // 게이트가 이제 포탈이라는 것을 알려준다 (대비가 안 된 채로 지도를 헤매지 않게)
    if (game.ui && game.state.earthGateOpen && game.state.zone === 9 && !game.state.unlocked.includes(10)) {
      game.ui.toast('지구 귀환 게이트가 열려 있어요! 북한산 정상 북쪽 끝의 황금 고리로 가 보세요.', 'gold');
    }
    // 잃어버린 부적 되찾기 알림 (로드 시 1회): mergeState가 _charmRecovered에 되찾은 부적을 남겨둔다
    if (game.ui && game.state._charmRecovered && game.state._charmRecovered.length) {
      const names = game.state._charmRecovered.map((f) => (CHARMS[f] || {}).name || f).join(' · ');
      game.ui.toast(`${names}을(를) 되찾았어요. 가방 캐릭터 화면에서 부적을 교체할 수 있어요.`, 'gold');
      game.state._charmRecovered = [];
    }
    requestAnimationFrame((t) => { last = t / 1000; frame(t); });
  };

  game.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    updateCameraFrustum(); // 원근 투영: aspect를 다시 계산한다
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
    if (kind === 'weapon' || kind === 'armor') game.rebuildPlayerMesh();
    if (kind === 'weapon' && game.player) game.player.switchT = 0.45; // 무기 교체 플러리시
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

  game.unequip = function (kind) {
    const it = game.state.equip[kind];
    if (!it) return;
    game.addItem(it.kind, it.fam, it.grade);
    game.state.equip[kind] = null;
    if (kind === 'weapon' || kind === 'armor') game.rebuildPlayerMesh();
    if (kind === 'weapon' && game.player) game.player.switchT = 0.45; // 무기 교체 플러리시
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
    if (game.ui) { game.ui.markDirty(true); game.ui.toast(`빨강 진화! ${game.itemName(kind, fam, 5)} ×${times} 획득`, 'gold'); }
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
    game.rebuildPlayerMesh();
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

  // 특성 페이지: N페이지는 N-1페이지의 특성을 모두 해금해야 열린다 (1페이지는 항상 열림)
  game.talentPageCount = function () { return 10; };
  game.talentPageTalents = function (page) { return TALENTS.filter((t) => (t.page || 1) === page); };
  game.isTalentPageComplete = function (page) {
    return game.talentPageTalents(page).every((t) => game.state.talents.includes(t.id));
  };
  game.isTalentPageUnlocked = function (page) {
    if (page <= 1) return true;
    return game.isTalentPageComplete(page - 1);
  };

  game.learnTalent = function (id) {
    const node = TALENTS.find((t) => t.id === id);
    if (!node || game.state.talents.includes(id)) return false;
    if (!game.isTalentPageUnlocked(node.page || 1)) return false;
    if (node.req.some((r) => !game.state.talents.includes(r))) return false;
    const cost = node.cost;
    if ((game.state.souls[cost.kind] || 0) < cost.n) return false;
    game.state.souls[cost.kind] -= cost.n;
    game.state.talents.push(id);
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };


  // ---------- 부적 (소유 목록 + 교체) ----------
  // 장착 슬롯은 1개지만, 얻은 부적은 전부 state.charms에 보관한다.
  // 새 부적을 받아도 이미 장착 중인 부적은 사라지지 않고, 캐릭터 화면에서 교체할 수 있다.
  game.grantCharm = function (fam, force) {
    if (!CHARMS[fam]) return { owned: false, equipped: false };
    const s = game.state;
    if (!Array.isArray(s.charms)) s.charms = [];
    if (!s.charms.includes(fam)) s.charms.push(fam);
    if (s.equip.charm && s.equip.charm.fam === fam) return { owned: true, equipped: true };
    if (!s.equip.charm || force) {
      s.equip.charm = { kind: 'charm', fam, grade: 0 };
      return { owned: true, equipped: true };
    }
    return { owned: true, equipped: false };
  };
  // 보유한 부적을 장착한다 (가방 캐릭터 화면의 부적 교체 버튼에서 쓴다)
  game.equipCharm = function (fam) {
    const s = game.state;
    if (!CHARMS[fam] || !(s.charms || []).includes(fam)) return false;
    s.equip.charm = { kind: 'charm', fam, grade: 0 };
    game.save();
    if (game.ui) game.ui.markDirty(true);
    return true;
  };

  game.talkNpc = function () {
    const q = game.questInfo(game.zone.id);
    if (game.ui) game.ui.openQuestDialog(q);
  };
  // 퀘스트가 보스 처치를 요구할 때, 이미 잡아 둔 보스 때문에 몇 시간씩 막히지 않도록
  // 해당 보스의 리스폰을 10초 뒤로 앞당긴다. (보스 타이머 자체는 그대로 — 퀘스트 몹이 없을 때만 이 10초 앞당김이 적용된다)
  function readyQuestBoss(zone, step) {
    if (!step) return null;
    const type = step.type === 'mid' ? 'mid' : step.type === 'boss' ? 'boss' : null;
    if (!type) return null;
    const key = `${zone.id}:${type}`;
    const at = (game.state.bossTimers || {})[key];
    if (!at) return null;
    const soon = Date.now() + 10 * 1000;
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
      if (soon && game.ui) game.ui.toast(`퀘스트를 위해 ${soon}이(가) 10초 뒤 다시 나타납니다.`, 'good');
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
      const kind = ctx.pickKind();
      const fam = ctx.pickFam(kind);
      game.addItem(kind, fam, r.item);
      got.push(game.itemName(kind, fam, r.item));
    }
    if (r.charm) {
      const g = game.grantCharm(r.charm);
      got.push(CHARMS[r.charm].name + (g.equipped ? '' : ' (보관)'));
      if (!g.equipped && game.ui) game.ui.toast(`${CHARMS[r.charm].name}을(를) 얻었어요. 이미 장착 중인 부적이 있어 보관했어요. 가방 캐릭터 화면에서 교체할 수 있어요.`, 'good');
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
      if (soon && game.ui) game.ui.toast(`다음 목표를 위해 ${soon}이(가) 10초 뒤 다시 나타납니다.`, 'good');
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
      teleport(x, z) { game.player.x = x; game.player.z = z; ctx.snapCompanions(); },
      give(kind, fam, grade, n = 1) { game.addItem(kind, fam, grade, n); game.ui.markDirty(true); },
      giveAll(grade, n = 3) { for (const f of Object.keys(WEAPONS)) game.addItem('weapon', f, grade, n); for (const f of Object.keys(ARMOR_KINDS)) game.addItem('armor', f, grade, n); for (const f of Object.keys(ACCESSORY_KINDS)) game.addItem('accessory', f, grade, n); game.ui.markDirty(true); },
      equip(kind, fam, grade) { game.addItem(kind, fam, grade, 1); return game.equipItem(kind, fam, grade); },
      mob(type = 'mid') { const z = game.zone; const e = game.enemies.find((x) => x.alive && (type === 'boss' ? x.isBoss : x.isMid)); return e; },
      gold(n) { game.state.gold += n; },
      souls(kind, n) { game.state.souls[kind] = (game.state.souls[kind] || 0) + n; },
      heal() { game.player.hp = game.derived().maxHp; },
      spawn(key) { const z = game.zone; const all = [...z.mobs.normal, ...z.mobs.elite]; const d = all.find((m) => m.key === key) || all[0]; return ctx.spawnEnemy(d, game.player.x + 2, game.player.z - 2); },
      spawnBoss(type = 'mid') { const z = game.zone; const d = type === 'boss' ? z.mobs.boss : type === 'field' ? z.mobs.field : z.mobs.mid; return ctx.spawnEnemy(d, game.player.x + 1.5, game.player.z - 4.5, true); },
      killAll() { for (const e of [...game.enemies]) if (e.alive && !e.isBoss) game.dealDamage(e, 99999, { canCrit: false }); },
      state() { return { zone: game.zone.id, level: game.state.level, hp: game.player.hp, maxHp: game.derived().maxHp, attack: game.derived().attack, kills: game.state.kills, medal: game.medalInfo(game.zone.id), enemies: game.enemies.filter((e) => e.alive).length, chests: game.chestInfo(game.zone.id), pos: { x: +game.player.x.toFixed(2), z: +game.player.z.toFixed(2) } }; },
      avatar(id) { return game.setAvatar(id); },
      avatarInfo() { return { id: game.state.avatar, mesh: game.playerMesh && game.playerMesh.userData.avatar && game.playerMesh.userData.avatar.id, facing: game.player.facing, rot: game.playerMesh ? game.playerMesh.rotation.y : null }; },
      giveTank(grade = 2) {
        const c = { id: 'tank' + Date.now() + Math.floor(Math.random() * 999), name: '테스', cls: 'tank', grade, lv: 1, xp: 0 };
        game.state.companions.push(c);
        if (!game.state.party.includes(c.id)) game.state.party.push(c.id);
        ctx.refreshCompanions();
        return c.id;
      },
      giveHealer(grade = 2) {
        const c = { id: 'heal' + Date.now() + Math.floor(Math.random() * 999), name: '세라', cls: 'healer', grade, lv: 1, xp: 0 };
        game.state.companions.push(c);
        if (!game.state.party.includes(c.id)) game.state.party.push(c.id);
        ctx.refreshCompanions();
        return c.id;
      },
      tankInfo() { return game.tank ? { hp: game.tank.hp, maxHp: game.tank.maxHp, x: game.tank.x, z: game.tank.z, down: game.tank.hp <= 0 } : null; },
      giveBook(id) { game.state.skillbooks[id] = (game.state.skillbooks[id] || 0) + 1; game.ui && game.ui.markDirty(true); return id; },
      learn(id) { return game.learnSkill(id); },
      spawnBook(id) { ctx.addPickup('book', game.player.x + 1.0, game.player.z, id); return id; },
      cast(id) { return game.castSkill(id); },
      skills() { return game.skillState(); },
      auto() { return { ok: false, reason: 'companion-only', msg: '주인공 스킬 자동 사용은 없어요. 스킬은 동료만 씁니다.' }; },
      effects(tag) { return game.effects.filter((f) => !tag || (f.tag || '').startsWith(tag)).map((f) => f.tag || f.kind); },
      projectiles() { return game.projectiles.map((p) => ({ style: p.style, skill: p.skill, from: p.from })); },
      admin(on) { if (on === false) return game.disableAdmin(); if (on === true) return game.enableAdmin(game.adminCode); return game.isAdmin(); },
      giveMp(n = 999) { game.player.mp = Math.min(game.derived().maxMp, n); return game.player.mp; },
      chest(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 0.6; ctx.snapCompanions(); } },
      advance(sec, dt = 1 / 60) { const n = Math.min(3600, Math.round(sec / dt)); for (let i = 0; i < n; i++) step(dt); return game.time; },
      unlockAll() { game.state.unlocked = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]; game.state.earthGateOpen = true; game.state.gyeonggiGateOpen = true; game.grantCharm('aqua', true); if (game.world) { for (let i = 2; i <= 18; i++) game.world.openGate(i); game.world.setEarthGate(true); game.world.setGyeonggiGate(true); } game.ui.markDirty(true); },
      enter(id) { return game.enterZone(id); },
      killZone(n = 1) { const list = game.enemies.filter((e) => e.alive && !e.isBoss && !e.isMid); for (let i = 0; i < Math.min(n, list.length); i++) game.dealDamage(list[i], 999999, { canCrit: false }); },
      nearNpc() { const n = game.world.npcs[game.zone.id].position; game.player.x = n.x + 1.5; game.player.z = n.z + 0.5; ctx.snapCompanions(); },
      hitOnce() { return ctx.playerAttack(); },
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
      chestGoto(i = 0) { const c = game.world.chests[i]; if (c) { game.player.x = c.x; game.player.z = c.z + 1.2; ctx.snapCompanions(); return c.id; } return null; },
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
