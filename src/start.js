// 스쿨히어로 — 시작 화면(로그인 · 게스트 · 새로고침 세션 복구)
// 아바타 선택은 로그인 뒤 게임 안에서 한다(main.js → ui.openAvatarSelect).

const SESSION_KEY = 'sh.session';

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.mode) return null;
    if (s.mode === 'guest' && s.key) return s;
    if (s.mode === 'account' && s.id && s.pw) return s;
    return null;
  } catch (e) { return null; }
}
function writeSession(s) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* 저장 공간을 못 쓰면 세션 유지 없이 진행 */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 무시 */ }
}

export function createStartScreen(store) {
  let root = null;
  let onReady = null;

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'startScreen';
    root.innerHTML = `
      <div class="start-card">
        <div class="start-logo">스쿨히어로</div>
        <div class="start-sub">서울 판타지 · 1단계</div>
        <div class="start-fields">
          <input id="loginId" class="start-input" maxlength="20" placeholder="아이디" autocomplete="username" inputmode="text">
          <input id="loginPw" class="start-input" type="password" maxlength="40" placeholder="비밀번호" autocomplete="current-password">
        </div>
        <button id="loginBtn" class="start-btn primary">로그인</button>
        <button id="guestBtn" class="start-btn ghost">게스트로 시작</button>
        <div id="startMsg" class="start-msg"></div>
        <div class="start-note">계정으로 로그인하면 다른 기기에서도 이어서 할 수 있어요.<br>처음이면 그 아이디로 새 모험이 시작됩니다.</div>
      </div>`;
    document.getElementById('app').appendChild(root);
    return root;
  }
  const $ = (id) => root.querySelector('#' + id);
  const msg = (t, kind = 'bad') => { const el = $('startMsg'); if (el) { el.textContent = t; el.className = 'start-msg ' + kind; } };

  function hide() {
    if (!root) return;
    root.classList.add('gone');
    setTimeout(() => { if (root) root.remove(); root = null; }, 380);
  }

  async function doGuest() {
    let key = null;
    try { key = localStorage.getItem('sh.guestKey'); } catch (e) { /* 무시 */ }
    if (!key) {
      key = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('sh.guestKey', key); } catch (e) { /* 무시 */ }
    }
    await store.login('guest', key, { cloud: null });
    const res = await store.load();
    writeSession({ mode: 'guest', key });
    return { mode: 'guest', ...res };
  }

  async function doAccount(id, pw) {
    await store.login(id, pw);
    const res = await store.load();
    if (!res.state && res.hadSave) return { error: '아이디 또는 비밀번호가 맞지 않아요.' };
    writeSession({ mode: 'account', id, pw });
    return { mode: 'account', ...res };
  }

  return {
    hide,
    // 새로고침해도 로그인 창으로 돌아가지 않도록 저장된 세션을 먼저 복구한다
    async ask() {
      const saved = readSession();
      if (saved) {
        try {
          if (saved.mode === 'guest') {
            const r = await doGuest();
            return { ...r, restored: true };
          }
          const r = await doAccount(saved.id, saved.pw);
          if (!r.error) return { ...r, restored: true };
          clearSession();
        } catch (e) {
          // 네트워크 문제라면 세션을 지우지 않고 로그인 화면을 보여준다
          clearSession();
        }
      }
      build();
      const prev = (() => { try { return JSON.parse(localStorage.getItem('sh.lastId') || 'null'); } catch (e) { return null; } })();
      if (prev) $('loginId').value = prev;
      return new Promise((resolve) => {
        let busy = false;
        const setBusy = (v) => {
          busy = v;
          $('loginBtn').disabled = v;
          $('guestBtn').disabled = v;
          $('loginBtn').textContent = v ? '불러오는 중…' : '로그인';
        };
        async function login() {
          if (busy) return;
          const id = $('loginId').value.trim();
          const pw = $('loginPw').value;
          if (id.length < 2) { msg('아이디를 2글자 이상 입력해 주세요.'); return; }
          if (pw.length < 4) { msg('비밀번호를 4글자 이상 입력해 주세요.'); return; }
          setBusy(true); msg('');
          try {
            const r = await doAccount(id, pw);
            if (r.error) { msg(r.error); setBusy(false); return; }
            try { localStorage.setItem('sh.lastId', JSON.stringify(id)); } catch (e) { /* 무시 */ }
            hide();
            resolve(r);
          } catch (e) {
            msg('불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
            setBusy(false);
          }
        }
        $('loginBtn').addEventListener('click', login);
        $('loginPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
        $('guestBtn').addEventListener('click', async () => {
          if (busy) return;
          setBusy(true); msg('');
          try {
            const r = await doGuest();
            hide();
            resolve(r);
          } catch (e) {
            msg('시작하지 못했어요. 다시 시도해 주세요.');
            setBusy(false);
          }
        });
        const idEl = $('loginId');
        if (idEl) idEl.addEventListener('input', () => { if (onReady) onReady(); });
      });
    },
  };
}
