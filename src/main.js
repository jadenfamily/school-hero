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

async function importWithTimeout(url, ms = 15000) {
  let timer = null;
  try {
    return await Promise.race([
      import(url),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('three-timeout')), ms); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function loadThree() {
  // importmap('three')이 가장 정확하고, 상대 경로는 src/main.js 기준이다.
  // './vendor/...'는 src/vendor를 가리켜 404가 나므로 목록에서 뺐다.
  // '?retry=1'은 일반 탭에 남은 오래되거나 깨진 캐시를 우회하기 위한 재시도다.
  const sources = [
    'three',
    '../vendor/three.module.min.js',
    '../vendor/three.module.min.js?retry=1',
    'https://unpkg.com/three@0.160.0/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  ];
  let lastErr = null;
  for (const url of sources) {
    try {
      const m = await importWithTimeout(url);
      if (m && m.WebGLRenderer) return m;
    } catch (e) {
      lastErr = e;
      console.warn('3D 엔진을 불러오지 못했습니다:', url.split('/').slice(0, 3).join('/'));
    }
  }
  throw new Error('three-unavailable' + (lastErr && lastErr.message ? ': ' + lastErr.message : ''));
}

function showFatalError(message) {
  const safe = String(message || 'unknown').replace(/</g, '&lt;');
  const text = '게임을 시작하지 못했어요.<br>오류: ' + safe + '<br>인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  // 로딩 화면이 아직 있으면 거기에, 이미 사라졌으면(3D 실행 중) 새 오버레이에 표시한다.
  let box = document.getElementById('loading');
  if (box && box.parentNode) {
    const t = document.getElementById('loadingText');
    if (t) t.innerHTML = text;
    const bar = document.querySelector('.loading-bar');
    if (bar) bar.style.display = 'none';
    box.classList.remove('gone');
    box.style.opacity = '1';
    box.style.pointerEvents = 'auto';
  } else {
    box = document.createElement('div');
    box.id = 'fatalError';
    box.style.cssText = 'position:fixed;inset:0;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:radial-gradient(circle at 50% 30%,#1b2a4a,#070b14 70%);color:#eef4ff;text-align:center;padding:20px;font-size:12px;line-height:1.7;';
    box.innerHTML = '<div>' + text + '</div>';
    document.getElementById('app').appendChild(box);
  }
  if (!document.getElementById('bootRetryBtn')) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center;';
    wrap.innerHTML = '<button id="bootRetryBtn" style="padding:12px 16px;border-radius:12px;border:none;background:#ffd966;color:#3a2400;font-weight:900;cursor:pointer;">다시 시도</button>'
      + '<button id="bootResetBtn" style="padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;font-weight:900;cursor:pointer;">로그인부터 다시 시작</button>';
    box.appendChild(wrap);
    document.getElementById('bootRetryBtn').addEventListener('click', () => location.reload());
    // 세션만 지운다. 저장본(sh.device.*)은 그대로 두므로 같은 아이디로 다시 로그인하면 이어서 할 수 있다.
    document.getElementById('bootResetBtn').addEventListener('click', () => {
      try { localStorage.removeItem('sh.session'); } catch (e) { /* 무시 */ }
      location.reload();
    });
  }
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
    // WebGL 컨텍스트가 날아가면 검은 화면으로만 남지 않고, 원인과 다시 시도 버튼을 보여준다.
    document.getElementById('gl').addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      showFatalError('webgl-context-lost');
    }, false);
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
    showFatalError((e && e.message) || 'unknown');
  }
}

boot();
