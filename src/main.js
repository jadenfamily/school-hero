// 스쿨히어로 — 시작
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');

// 아이폰 확대 고정 방지: 핀치·더블탭 줌 차단 (입력칸 확대는 CSS 16px로 처리)
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('visibilitychange', () => { document.documentElement.style.height = window.innerHeight + 'px'; });
window.addEventListener('resize', () => { document.documentElement.style.height = window.innerHeight + 'px'; });

async function loadThree() {
  const sources = [
    '../vendor/three.module.min.js',
    './vendor/three.module.min.js',
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  ];
  for (const url of sources) {
    try {
      const m = await import(url);
      if (m && m.WebGLRenderer) return m;
    } catch (e) {
      console.warn('3D 엔진을 불러오지 못했습니다:', url.split('/').slice(0, 3).join('/'));
    }
  }
  throw new Error('three-unavailable');
}

function readToken() {
  let token = null;
  try {
    const m = location.hash.match(/connect=([^&]+)/);
    if (m) {
      token = decodeURIComponent(m[1]);
      localStorage.setItem('sh.token', token);
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (!token) token = localStorage.getItem('sh.token');
  } catch (e) { /* 저장 공간을 못 쓰면 연결 없이 진행 */ }
  return token && token.length > 10 ? token : null;
}

async function boot() {
  try {
    loadingText.textContent = '3D 세계를 만드는 중…';
    const THREE = await loadThree();
    const [{ createGame }, { createUI }, { createSaveManager, CloudAdapter }, { createStartScreen }] = await Promise.all([
      import('./game.js'),
      import('./ui.js'),
      import('./save.js'),
      import('./start.js'),
    ]);
    loadingText.textContent = '계정을 확인하는 중…';

    // 고퀄 2.5D 도트 PNG 에셋을 먼저 불러온다 (시안과 인게임 화면 일치)
    loadingText.textContent = '도트 그래픽을 불러오는 중…';
    const { preloadAssets } = await import('./assets.js');
    await preloadAssets(THREE, (r) => {
      loadingText.textContent = `도트 그래픽을 불러오는 중… ${Math.round(r * 100)}%`;
    });

    const token = readToken();
    const store = createSaveManager({ cloud: token ? new CloudAdapter(token) : null });
    const start = createStartScreen(store);
    const session = await start.ask();
    start.hide();
    loading.classList.add('gone');
    setTimeout(() => { if (loading.parentNode) loading.remove(); }, 500);

    const game = createGame(THREE);
    game.store = store;
    if (session.state) game.applyState(session.state);
    const ui = createUI(game, THREE);
    game.ui = ui;
    game.start();
    window.__GAME__ = game;

    if (session.repaired) ui.toast('저장 데이터가 손상되어 마지막 정상 기록으로 복구했어요.', 'good');
    if (session.mode === 'guest') ui.toast('게스트 모드 · 이 기기에만 저장됩니다.', '');
    else if (session.where === 'cloud') ui.toast(`${store.userId} 계정으로 불러왔어요.`, 'good');
    else if (session.restored) ui.toast('이어서 접속했어요.', 'good');

    // 순서: 로그인 → (아바타 미선택이면) 캐릭터 선택 → 졸업식 인트로 → 시작 가이드
    const needsPick = !game.state.avatarPicked;
    const afterIntro = () => ui.startTutorial();
    const goIntro = () => {
      if (needsPick || !game.state.introSeen) ui.showIntro(afterIntro);
      else afterIntro();
    };
    if (needsPick) ui.openAvatarSelect(goIntro);
    else goIntro();
  } catch (e) {
    console.warn('시작하지 못했습니다:', e && e.message);
    loadingText.innerHTML = '게임을 시작하지 못했어요.<br>인터넷 연결을 확인한 뒤 새로고침해 주세요.';
    const bar = document.querySelector('.loading-bar');
    if (bar) bar.style.display = 'none';
  }
}

boot();
