// 스쿨히어로 — GLB 모델 (Tripo 주인공·동료) — 2026-11-27부터 기본 적용.
// game.js에서 분리. 기본 주소에서도 GLB가 로드되고, 실패하면 절차적 모델 +
// 토스트로 폴백한다. ?hero=glb / ?companion=glb는 예전 북마크용 no-op.
import { groundY, disposeGroup } from './util.js';
import { loadGlbHero, loadGlbCompanion, attachGlbHandWeapon, makePlayer } from '../world.js';
import { avatarOf } from '../data.js';

export function installGlb(ctx) {
  const { game, THREE, scene } = ctx;

  // ---------- GLB 주인공 (기본 적용) ----------
  // 아바타별 Tripo GLB를 플레이어로 쓴다. ?hero=glb는 예전 북마크용으로만
  // 남겨두고, 없어도 GLB가 기본으로 로드된다.
  // boyA=시우 siwoo.glb, boyB=도윤 doyun.glb, girlA=하늘 haneul.glb.
  // girlB=서연은 GLB 재생성 대기 중(긴 머리+망토가 팔 뼈에 묶인 구버전)이라
  // 임시로 시우 GLB를 쓴다 — 서연 GLB가 준비되면 seoyeon.glb로 교체.
  // (아바타는 로그인 시 정해지고 바꾸면 페이지가 다시 로드되므로, 게임
  // 시작 시 한 번만 로드하면 된다.)
  const HERO_GLB = true;
  const HERO_GLB_URLS = {
    boyA: 'assets/siwoo.glb',
    boyB: 'assets/doyun.glb',
    girlA: 'assets/haneul.glb',
    girlB: 'assets/siwoo.glb', // 서연 GLB 준비 전 임시 (위 주석 참조)
  };
  function heroGlbUrl() {
    const av = game.state && game.state.avatar;
    return HERO_GLB_URLS[av] || 'assets/siwoo.glb';
  }

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
    // 새 주인공 GLB는 검 없이 재생성된 것이라 fixSword를 끈다. 색 기반
    // 검 판별(푸른 강철색)은 남색 교복에도 반응해서 시우 GLB 79개 정점을
    // 오른손에 묶어버린다 (검출됨 2026-11-28) — 검 고정이 필요 없어졌다.
    loadGlbHero(THREE, heroGlbUrl(), { fixSword: false }).then((mesh) => {
      glbHeroMesh = mesh;
      glbHeroState = 'ready';
      swapGlbHeroIn();
      updateGlbHeroWeapon();
    }).catch((err) => {
      glbHeroState = 'failed';
      console.warn('GLB 주인공을 불러오지 못했어요:', err && err.message);
      if (game.ui) game.ui.toast('GLB 주인공 모델을 불러오지 못했어요. 기본 모델로 계속해요.', '');
      // GLB 로드 실패 — 로딩 중 숨겨둔 절차적(레고) 몸통을 다시 보여준다 (폴백).
      if (game.playerMesh && game.playerMesh !== glbHeroMesh) game.playerMesh.visible = true;
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

  // GLB 동료 로드 실패 시, 로딩 중 숨겨둔 절차적 몸통을 다시 보여준다 (폴백).
  function showProceduralCompanion(clsId) {
    if (!game.compObjects) return;
    const o = game.compObjects.find((x) => x.cls.id === clsId);
    if (o && o.mesh) o.mesh.visible = true;
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
      showProceduralCompanion('tank');
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
      showProceduralCompanion('melee');
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
      showProceduralCompanion('mage');
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
      showProceduralCompanion('healer');
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
  // 주인공 GLB는 검 없이 재생성된 것이라 구워진 검은 없고, 이 게임
  // 무기가 손에 든다 (무기 크기 1.5배는 world.js attachGlbHandWeapon).
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
    // 부팅 시 레고 몸통 깜빡임 방지: GLB가 로딩 중이면 절차적 몸통을 숨긴다.
    // GLB가 준비되면 swapGlbHeroIn이 교체하고, 로드 실패 시 ensureGlbHero의 catch에서 다시 보여준다.
    game.playerMesh.visible = !(HERO_GLB && (glbHeroState === 'loading' || glbHeroState === 'off'));
    game.playerMesh.position.set(p.x, groundY(p.x, p.z), p.z);
    game.playerMesh.rotation.y = p.facing;
    scene.add(game.playerMesh);
  }
  game.rebuildPlayerMesh = rebuildPlayerMesh;

  // 동료 GLB 로딩 상태 조회 — companions.js가 절차적 몸통을 숨길지 결정한다.
  // GLB가 꺼져 있으면 'failed'를 돌려 절차적 모델이 보이게 한다.
  ctx.glbCompanionState = (clsId) => {
    if (!COMPANION_GLB) return 'failed';
    if (clsId === 'tank') return glbTankState;
    if (clsId === 'melee') return glbMeleeState;
    if (clsId === 'mage') return glbMageState;
    if (clsId === 'healer') return glbHealerState;
    return 'failed';
  };

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
