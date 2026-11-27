// 스쿨히어로 — GLB 모델 (Tripo 주인공·동료) — 2026-11-27부터 기본 적용.
// game.js에서 분리. 기본 주소에서도 GLB가 로드되고, 실패하면 절차적 모델 +
// 토스트로 폴백한다. ?hero=glb / ?companion=glb는 예전 북마크용 no-op.
import { groundY, disposeGroup } from './util.js';
import { loadGlbHero, loadGlbCompanion, attachGlbHandWeapon, makePlayer } from '../world.js';
import { avatarOf } from '../data.js';

export function installGlb(ctx) {
  const { game, THREE, scene } = ctx;

  // ---------- GLB 주인공 (기본 적용) ----------
  // Tripo 시우 GLB(assets/siwoo.glb)를 플레이어로 쓴다. ?hero=glb는
  // 예전 북마크용으로만 남겨두고, 없어도 GLB가 기본으로 로드된다.
  const HERO_GLB = true;
  const GLB_HERO_URL = 'assets/siwoo.glb';

  // ---------- GLB 동료 (기본 적용) ----------
  // Tripo 동료 GLB(assets/tank.glb / assets/melee.glb / assets/mage.glb /
  // assets/healer.glb)를 해당 클래스 동료로 쓴다. ?companion=glb는
  // 예전 북마크용으로만 남겨두고, 없어도 GLB가 기본으로 로드된다.
  const COMPANION_GLB = true;
  const GLB_TANK_URL = 'assets/tank.glb';
  const GLB_MELEE_URL = 'assets/melee.glb';
  const GLB_MAGE_URL = 'assets/mage.glb';
  const GLB_HEALER_URL = 'assets/healer.glb';

  // GLB 주인공 상태 (기본값 off — 로드 전)
  let glbHeroState = 'off'; // off | loading | ready | failed
  let glbHeroMesh = null;
  function ensureGlbHero() {
    if (!HERO_GLB || glbHeroState !== 'off') return;
    glbHeroState = 'loading';
    loadGlbHero(THREE, GLB_HERO_URL).then((mesh) => {
      glbHeroMesh = mesh;
      glbHeroState = 'ready';
      swapGlbHeroIn();
      updateGlbHeroWeapon();
    }).catch((err) => {
      glbHeroState = 'failed';
      console.warn('GLB 주인공을 불러오지 못했어요:', err && err.message);
      if (game.ui) game.ui.toast('GLB 주인공 모델을 불러오지 못했어요. 기본 모델로 계속해요.', '');
    });
  }
  function swapGlbHeroIn() {
    if (!game.player || !glbHeroMesh || game.playerMesh === glbHeroMesh) return;
    if (game.playerMesh) { scene.remove(game.playerMesh); disposeGroup(game.playerMesh); }
    game.playerMesh = glbHeroMesh;
    game.playerMesh.position.set(game.player.x, groundY(game.player.x, game.player.z), game.player.z);
    game.playerMesh.rotation.y = game.player.facing;
    scene.add(game.playerMesh);
  }

  // GLB 탱커 동료 상태 (기본값 off — 로드 전)
  let glbTankState = 'off'; // off | loading | ready | failed
  let glbTankMesh = null;
  function ensureGlbTank() {
    if (!COMPANION_GLB || glbTankState !== 'off') return;
    glbTankState = 'loading';
    loadGlbCompanion(THREE, GLB_TANK_URL).then((mesh) => {
      glbTankMesh = mesh;
      glbTankState = 'ready';
      swapGlbTankIn();
    }).catch((err) => {
      glbTankState = 'failed';
      console.warn('GLB 탱커 모델을 불러오지 못했어요:', err && err.message);
      if (game.ui) game.ui.toast('GLB 탱커 모델을 불러오지 못했어요. 기본 모델로 계속해요.', '');
    });
  }
  // 파티의 첫 번째 탱커 동료 메쉬를 GLB로 바꾼다. GLB 메쉬는 하나뿐이라
  // 탱커가 둘 이상이면 첫 번째만 GLB, 나머지는 절차적 모델 그대로 둔다.
  function swapGlbTankIn() {
    if (!glbTankMesh || !game.compObjects) return;
    const o = game.compObjects.find((x) => x.cls.id === 'tank');
    if (!o || o.mesh === glbTankMesh) return;
    if (o.mesh) { scene.remove(o.mesh); disposeGroup(o.mesh); }
    o.mesh = glbTankMesh;
    o.mesh.position.set(o.x, groundY(o.x, o.z), o.z);
    o.mesh.rotation.y = Math.PI;
    scene.add(o.mesh);
  }
  function maybeSwapGlbTank() {
    if (!COMPANION_GLB) return;
    if (glbTankState === 'ready' && glbTankMesh) swapGlbTankIn();
    else if (glbTankState === 'off') ensureGlbTank();
  }

  // GLB 근접 동료 상태 (탱커와 같은 패턴)
  let glbMeleeState = 'off'; // off | loading | ready | failed
  let glbMeleeMesh = null;
  function ensureGlbMelee() {
    if (!COMPANION_GLB || glbMeleeState !== 'off') return;
    glbMeleeState = 'loading';
    loadGlbCompanion(THREE, GLB_MELEE_URL).then((mesh) => {
      glbMeleeMesh = mesh;
      glbMeleeState = 'ready';
      swapGlbMeleeIn();
    }).catch((err) => {
      glbMeleeState = 'failed';
      console.warn('GLB 근접 모델을 불러오지 못했어요:', err && err.message);
      if (game.ui) game.ui.toast('GLB 근접 모델을 불러오지 못했어요. 기본 모델로 계속해요.', '');
    });
  }
  // 파티의 첫 번째 근접 동료 메쉬를 GLB로 바꾼다. GLB 메쉬는 하나뿐이라
  // 근접이 둘 이상이면 첫 번째만 GLB, 나머지는 절차적 모델 그대로 둔다.
  function swapGlbMeleeIn() {
    if (!glbMeleeMesh || !game.compObjects) return;
    const o = game.compObjects.find((x) => x.cls.id === 'melee');
    if (!o || o.mesh === glbMeleeMesh) return;
    if (o.mesh) { scene.remove(o.mesh); disposeGroup(o.mesh); }
    o.mesh = glbMeleeMesh;
    o.mesh.position.set(o.x, groundY(o.x, o.z), o.z);
    o.mesh.rotation.y = Math.PI;
    scene.add(o.mesh);
  }
  function maybeSwapGlbMelee() {
    if (!COMPANION_GLB) return;
    if (glbMeleeState === 'ready' && glbMeleeMesh) swapGlbMeleeIn();
    else if (glbMeleeState === 'off') ensureGlbMelee();
  }

  // GLB 마법 동료 상태 (탱커와 같은 패턴)
  let glbMageState = 'off'; // off | loading | ready | failed
  let glbMageMesh = null;
  function ensureGlbMage() {
    if (!COMPANION_GLB || glbMageState !== 'off') return;
    glbMageState = 'loading';
    loadGlbCompanion(THREE, GLB_MAGE_URL).then((mesh) => {
      glbMageMesh = mesh;
      glbMageState = 'ready';
      swapGlbMageIn();
    }).catch((err) => {
      glbMageState = 'failed';
      console.warn('GLB 마법 모델을 불러오지 못했어요:', err && err.message);
      if (game.ui) game.ui.toast('GLB 마법 모델을 불러오지 못했어요. 기본 모델로 계속해요.', '');
    });
  }
  // 파티의 첫 번째 마법 동료 메쉬를 GLB로 바꾼다. GLB 메쉬는 하나뿐이라
  // 마법이 둘 이상이면 첫 번째만 GLB, 나머지는 절차적 모델 그대로 둔다.
  function swapGlbMageIn() {
    if (!glbMageMesh || !game.compObjects) return;
    const o = game.compObjects.find((x) => x.cls.id === 'mage');
    if (!o || o.mesh === glbMageMesh) return;
    if (o.mesh) { scene.remove(o.mesh); disposeGroup(o.mesh); }
    o.mesh = glbMageMesh;
    o.mesh.position.set(o.x, groundY(o.x, o.z), o.z);
    o.mesh.rotation.y = Math.PI;
    scene.add(o.mesh);
  }
  function maybeSwapGlbMage() {
    if (!COMPANION_GLB) return;
    if (glbMageState === 'ready' && glbMageMesh) swapGlbMageIn();
    else if (glbMageState === 'off') ensureGlbMage();
  }

  // GLB 힐러 동료 상태 (탱커와 같은 패턴)
  let glbHealerState = 'off'; // off | loading | ready | failed
  let glbHealerMesh = null;
  function ensureGlbHealer() {
    if (!COMPANION_GLB || glbHealerState !== 'off') return;
    glbHealerState = 'loading';
    loadGlbCompanion(THREE, GLB_HEALER_URL).then((mesh) => {
      glbHealerMesh = mesh;
      glbHealerState = 'ready';
      swapGlbHealerIn();
    }).catch((err) => {
      glbHealerState = 'failed';
      console.warn('GLB 힐러 모델을 불러오지 못했어요:', err && err.message);
      if (game.ui) game.ui.toast('GLB 힐러 모델을 불러오지 못했어요. 기본 모델로 계속해요.', '');
    });
  }
  // 파티의 첫 번째 힐러 동료 메쉬를 GLB로 바꾼다. GLB 메쉬는 하나뿐이라
  // 힐러가 둘 이상이면 첫 번째만 GLB, 나머지는 절차적 모델 그대로 둔다.
  function swapGlbHealerIn() {
    if (!glbHealerMesh || !game.compObjects) return;
    const o = game.compObjects.find((x) => x.cls.id === 'healer');
    if (!o || o.mesh === glbHealerMesh) return;
    if (o.mesh) { scene.remove(o.mesh); disposeGroup(o.mesh); }
    o.mesh = glbHealerMesh;
    o.mesh.position.set(o.x, groundY(o.x, o.z), o.z);
    o.mesh.rotation.y = Math.PI;
    scene.add(o.mesh);
  }
  function maybeSwapGlbHealer() {
    if (!COMPANION_GLB) return;
    if (glbHealerState === 'ready' && glbHealerMesh) swapGlbHealerIn();
    else if (glbHealerState === 'off') ensureGlbHealer();
  }

  // GLB 주인공 오른손에 장착 중인 게임 무기를 붙인다 (바꾸면 교체).
  // 구워진 검은 loadGlbHero에서 이미 제거됐고, 이 게임 무기가 손에 든다.
  function updateGlbHeroWeapon() {
    if (!HERO_GLB || glbHeroState !== 'ready' || !glbHeroMesh) return;
    const w = game.state && game.state.equip && game.state.equip.weapon;
    const fam = w && w.fam ? w.fam : 'sword';
    const grade = w && typeof w.grade === 'number' ? w.grade : 0;
    attachGlbHandWeapon(THREE, glbHeroMesh, fam, grade);
  }

  function rebuildPlayerMesh() {
    const p = game.player;
    if (!p) return;
    // GLB가 준비됐으면 GLB를 유지하고 장착 무기만 손에 붙인다
    // (의상 수집 전환: 코스튬 3D 파츠는 붙이지 않는다 — GLB 주인공은 항상 기본 교복)
    if (HERO_GLB && glbHeroState === 'ready' && glbHeroMesh) { swapGlbHeroIn(); updateGlbHeroWeapon(); return; }
    if (HERO_GLB && glbHeroState === 'off') ensureGlbHero();
    if (game.playerMesh) { scene.remove(game.playerMesh); if (game.playerMesh !== glbHeroMesh) disposeGroup(game.playerMesh); }
    game.playerMesh = makePlayer(THREE, 'sword', avatarOf(game.state.avatar), game.state.equip, game.state.appearance);
    game.playerMesh.position.set(p.x, groundY(p.x, p.z), p.z);
    game.playerMesh.rotation.y = p.facing;
    scene.add(game.playerMesh);
  }
  game.rebuildPlayerMesh = rebuildPlayerMesh;

  // game.start에서 GLB 준비 여부를 동기적으로 확인한다
  ctx.glbHeroMesh = () => glbHeroMesh;
  ctx.glbHeroReady = () => HERO_GLB && glbHeroState === 'ready' && !!glbHeroMesh;

  // 다른 모듈에서 부른다 (game.start, refreshCompanions)
  ctx.ensureGlbHero = ensureGlbHero;
  ctx.swapGlbHeroIn = swapGlbHeroIn;
  ctx.ensureGlbTank = ensureGlbTank;
  ctx.swapGlbTankIn = swapGlbTankIn;
  ctx.maybeSwapGlbTank = maybeSwapGlbTank;
  ctx.ensureGlbMelee = ensureGlbMelee;
  ctx.swapGlbMeleeIn = swapGlbMeleeIn;
  ctx.maybeSwapGlbMelee = maybeSwapGlbMelee;
  ctx.ensureGlbMage = ensureGlbMage;
  ctx.swapGlbMageIn = swapGlbMageIn;
  ctx.maybeSwapGlbMage = maybeSwapGlbMage;
  ctx.ensureGlbHealer = ensureGlbHealer;
  ctx.swapGlbHealerIn = swapGlbHealerIn;
  ctx.maybeSwapGlbHealer = maybeSwapGlbHealer;
  ctx.rebuildPlayerMesh = rebuildPlayerMesh;
}
