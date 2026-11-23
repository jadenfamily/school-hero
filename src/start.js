// 스쿨히어로 — 시작 화면(아바타 선택 · 계정 로그인 · 게스트)
import { AVATARS, avatarOf } from './data.js';

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

function portraitHtml(A) {
  return `<span class="av-face" style="--av-skin:${hex(A.skin)};--av-uni:${hex(A.uniform)};--av-accent:${hex(A.accent || A.uniform)};--av-hair:${hex(A.hair)};--av-ribbon:${hex(A.ribbon || A.accent || A.uniform)}">
    <i class="av-head"></i><i class="av-hair"></i><i class="av-ribbon"></i><i class="av-eye l"></i><i class="av-eye r"></i>
  </span>`;
}

export function createStartScreen(store, opts = {}) {
  let picked = 'boyA';
  try { picked = localStorage.getItem('sh.avatar') || 'boyA'; } catch (e) { /* 무시 */ }
  if (!AVATARS.some((a) => a.id === picked)) picked = 'boyA';

  const root = document.createElement('div');
  root.id = 'startScreen';
  root.innerHTML = `
    <div class="start-card">
      <div class="start-logo">스쿨히어로</div>
      <div class="start-sub">서울 판타지 · 1단계</div>
      <div class="pick-label">모험할 학생을 골라 주세요</div>
      <div class="avatar-pick" id="avatarPick">
        ${AVATARS.map((A) => `<button class="pick-card ${A.id === picked ? 'on' : ''}" data-avatar="${A.id}" type="button" aria-label="${A.name}">
          <span class="pick-char ${A.hairStyle} ${A.hood ? 'hooded' : ''}">${portraitHtml(A)}</span>
          <b>${A.name}</b><small>${A.short}</small>
        </button>`).join('')}
      </div>
      <div class="start-fields">
        <input id="loginId" class="start-input" maxlength="20" placeholder="아이디" autocomplete="username">
        <input id="loginPw" class="start-input" type="password" maxlength="40" placeholder="비밀번호" autocomplete="current-password">
      </div>
      <button id="loginBtn" class="start-btn primary">로그인</button>
      <button id="guestBtn" class="start-btn ghost">게스트로 시작</button>
      <div id="startMsg" class="start-msg"></div>
      <div class="start-note">계정으로 로그인하면 다른 기기에서도 이어서 할 수 있어요.<br>처음이면 그 아이디로 새 모험이 시작됩니다.</div>
    </div>`;
  document.getElementById('app').appendChild(root);

  const $ = (id) => root.querySelector('#' + id);
  const msg = (t, kind = 'bad') => { const el = $('startMsg'); el.textContent = t; el.className = 'start-msg ' + kind; };
  let busy = false;

  // 아바타 선택
  const pickRoot = $('avatarPick');
  function selectAvatar(id) {
    if (!avatarOf(id) || !AVATARS.some((a) => a.id === id)) return;
    picked = id;
    pickRoot.querySelectorAll('[data-avatar]').forEach((el) => el.classList.toggle('on', el.dataset.avatar === id));
    try { localStorage.setItem('sh.avatar', id); } catch (e) { /* 무시 */ }
  }
  pickRoot.querySelectorAll('[data-avatar]').forEach((el) => el.addEventListener('click', () => selectAvatar(el.dataset.avatar)));

  function setBusy(v) {
    busy = v;
    $('loginBtn').disabled = v;
    $('guestBtn').disabled = v;
    $('loginBtn').textContent = v ? '불러오는 중…' : '로그인';
  }

  function hide() {
    root.classList.add('gone');
    setTimeout(() => root.remove(), 420);
  }

  return {
    hide,
    selectedAvatar: () => picked,
    ask() {
      return new Promise((resolve) => {
        const saved = (() => { try { return JSON.parse(localStorage.getItem('sh.session') || 'null'); } catch (e) { return null; } })();
        if (saved && saved.id) $('loginId').value = saved.id;

        async function doLogin() {
          if (busy) return;
          const id = $('loginId').value.trim();
          const pw = $('loginPw').value;
          if (id.length < 2) { msg('아이디를 2글자 이상 입력해 주세요.'); return; }
          if (pw.length < 4) { msg('비밀번호를 4글자 이상 입력해 주세요.'); return; }
          setBusy(true); msg('');
          try {
            await store.login(id, pw);
            const res = await store.load();
            if (!res.state && res.hadSave) {
              msg('아이디 또는 비밀번호가 맞지 않아요.');
              setBusy(false);
              return;
            }
            try { localStorage.setItem('sh.session', JSON.stringify({ id, pw })); } catch (e) { /* 무시 */ }
            hide();
            resolve({ mode: 'account', avatar: picked, ...res });
          } catch (e) {
            msg('불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
            setBusy(false);
          }
        }

        $('loginBtn').addEventListener('click', doLogin);
        $('loginPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
        $('guestBtn').addEventListener('click', async () => {
          if (busy) return;
          setBusy(true); msg('');
          try {
            let key = null;
            try { key = localStorage.getItem('sh.guestKey'); } catch (e) { /* 무시 */ }
            if (!key) {
              key = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
              try { localStorage.setItem('sh.guestKey', key); } catch (e) { /* 무시 */ }
            }
            await store.login('guest', key, { cloud: null });
            const res = await store.load();
            hide();
            resolve({ mode: 'guest', avatar: picked, ...res });
          } catch (e) {
            msg('시작하지 못했어요. 다시 시도해 주세요.');
            setBusy(false);
          }
        });
      });
    },
  };
}
