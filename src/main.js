// 스쿨히어로 — 시작
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');

async function loadThree() {
  const sources = [
    '../vendor/three.module.min.js',
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

    const token = readToken();
    const store = createSaveManager({ cloud: token ? new CloudAdapter(token) : null });
    const start = createStartScreen(store);
    loading.classList.add('gone');
    setTimeout(() => loading.remove(), 500);

    const session = await start.ask();

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
  } catch (e) {
    console.warn('시작하지 못했습니다:', e && e.message);
    loadingText.innerHTML = '게임을 시작하지 못했어요.<br>인터넷 연결을 확인한 뒤 새로고침해 주세요.';
    const bar = document.querySelector('.loading-bar');
    if (bar) bar.style.display = 'none';
  }
}

boot();
