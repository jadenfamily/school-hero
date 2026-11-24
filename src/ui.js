// 스쿨히어로 — 화면 UI
import {
  PLAYABLE, ZONES, GRADES, WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, TALENTS, SOUL_KINDS,
  COMPANION_CLASSES, CHARMS, SECRET_TOTAL, MEDAL_TIERS, MEDAL_STEP, OPT_LABEL, MOB_REWARD,
  AVATARS, avatarOf, SKILLS, SKILL_IDS, HEAL_SKILL_IDS, EVOLVE_NEED, BOSS_LABEL, BOSS_TIMER,
  COMPANION_SKILLS, SKILL_BOOK_CLASS, COMPANION_SKILL_MAX_LEVEL,
  COSTUMES, COSTUME_MAP, COSTUME_PULL_COST, COSTUME_MAX_LEVEL, COSTUME_STAT_LABEL, COMPANION_PULL_COST,
  ELEMENTS, ELEM_BEATS, EARTH_GATE,
} from './data.js';
import { districtAt, PATH_CENTERS } from './world.js';
import { CloudAdapter } from './save.js';
import { heroPortraitDataUrl, heroFullDataUrl, visualEquip } from './sprites.js';

const $ = (id) => document.getElementById(id);
const pct = (a, b) => `${Math.max(0, Math.min(100, b ? (a / b) * 100 : 0)).toFixed(1)}%`;
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

const MAP_POS = {
  1: { x: 30, y: 63 }, 2: { x: 15, y: 50 }, 3: { x: 47, y: 31 }, 4: { x: 50, y: 53 },
  5: { x: 74, y: 44 }, 6: { x: 20, y: 82 }, 7: { x: 74, y: 74 }, 8: { x: 82, y: 16 }, 9: { x: 52, y: 9 },
};

const portraitCache = new Map();
function portrait(av) {
  if (!portraitCache.has(av.id)) portraitCache.set(av.id, heroPortraitDataUrl(av, 128));
  return portraitCache.get(av.id);
}
const fullCache = new Map();
function fullBody(av, equip, appearance, size = 150) {
  const ap = appearance || { mode: 'armor' };
  const key = `${av.id}|${equip.weapon ? equip.weapon.fam + equip.weapon.grade : '-'}|${equip.armor ? equip.armor.fam + equip.armor.grade : '-'}|${ap.mode}|${ap.costumeId || '-'}|${size}`;
  if (!fullCache.has(key)) fullCache.set(key, heroFullDataUrl(av, visualEquip(equip, ap), size));
  return fullCache.get(key);
}

export function createUI(game, THREE) {
  const ui = {
    dirty: true, modal: null, tags: new Map(), bubbles: [], hudT: 0, mapT: 0, skillT: 0,
  };
  const worldLayer = $('worldLayer');
  const hexOf = hex;

  // ---------- HUD 프로필 (초상화) ----------
  const avatarEl = $('avatar');
  avatarEl.innerHTML = `<img class="av-portrait" id="avPortrait" alt=""><span class="lv-chip" id="lvChip">Lv.1</span>`;
  const avImg = $('avPortrait');
  let lastAvatarId = null;
  function renderAvatar() {
    const A = avatarOf(game.state ? game.state.avatar : 'boyA');
    if (lastAvatarId !== A.id) {
      lastAvatarId = A.id;
      avImg.src = portrait(A);
      avatarEl.dataset.avatar = A.id;
    }
    avatarEl.title = `${game.heroName()} · ${A.short}`;
  }

  // ---------- 동료 스킬 퀵슬롯 (하단 바) ----------
  // 스킬 개편: 주인공은 스킬을 쓰지 않는다. 하단 바에는 동행 중인 동료의
  // 대표 스킬이 쿨다운과 함께 보인다 (표시 전용 — 자동 사용, 누르면 설명이 뜬다).
  const skillBar = $('skillBar');
  ui.renderSkillBar = function (force) {
    if (!game.state) return;
    const list = game.companionSkillState ? game.companionSkillState() : [];
    // 매 프레임 DOM을 갈아끼우면 터치가 끊기므로 바뀔 때만 다시 그린다
    const sig = JSON.stringify(list.map((x) => [x.id, x.skillId, x.level, Math.ceil(x.cd)]));
    if (!force && sig === ui._skillSig) return;
    ui._skillSig = sig;
    skillBar.innerHTML = list.map((x, i) => {
      const cd = Math.ceil(x.cd);
      return `<button class="skill-slot comp-skill" data-comp-skill="${i}" title="${x.name} · ${x.skillName} Lv.${x.level}">
        <span>${x.skillIcon}</span>${cd > 0 ? `<i class="cd">${cd}</i>` : ''}<em class="sk-lv">Lv.${x.level}</em>
      </button>`;
    }).join('');
  };
  skillBar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-comp-skill]');
    if (!btn) return;
    const list = game.companionSkillState ? game.companionSkillState() : [];
    const x = list[parseInt(btn.dataset.compSkill, 10)];
    if (!x) return;
    const def = COMPANION_SKILLS[x.cls];
    const cd = Math.ceil(x.cd);
    ui.toast(`${x.skillIcon} ${x.name}의 ${x.skillName} Lv.${x.level}${cd > 0 ? ` · 쿨다운 ${cd}초` : ''} — ${def ? def.desc : ''}`, 'good');
  });

  // ---------- 좌표 ----------
  const v3 = new THREE.Vector3();
  function project(x, y, z) {
    v3.set(x, y, z).project(game.camera);
    return {
      x: (v3.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v3.y * 0.5 + 0.5) * window.innerHeight,
      visible: v3.z < 1 && v3.z > -1,
    };
  }

  // ---------- 토스트 ----------
  ui.toast = function (msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 3000);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  };

  // ---------- 데미지 숫자 ----------
  ui.damageNumber = function (x, y, z, text, cls) {
    const p = project(x, y + 0.4 + Math.random() * 0.4, z);
    if (!p.visible) return;
    const el = document.createElement('div');
    el.className = 'dmg ' + (cls || '');
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    worldLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  };
  ui.floatText = function (x, y, z, text, cls) { ui.damageNumber(x, y, z, text, cls); };
  ui.rewardText = function (x, y, z, text) { ui.damageNumber(x, y, z, text, 'reward'); };

  // ---------- 몬스터 이름표 ----------
  ui.clearTags = function () {
    for (const [, el] of ui.tags) el.remove();
    ui.tags.clear();
  };
  ui.attachEnemyTag = function (e) {
    const el = document.createElement('div');
    el.className = 'enemy-tag' + (e.isField ? ' field' : e.isBoss ? ' boss' : e.elite ? ' elite' : '');
    el.innerHTML = `<div class="et-name">Lv.${e.level} ${e.def.name}</div><div class="et-bar"><i style="width:100%"></i></div>`;
    worldLayer.appendChild(el);
    ui.tags.set(e, el);
    e.tag = el;
  };

  ui.attachGrave = function (g) {
    const zone = game.zone;
    const nm = g.name || (g.type === 'mid' ? zone.mobs.mid.name : g.type === 'field' ? (zone.mobs.field || {}).name : zone.mobs.boss.name);
    const el = document.createElement('div');
    el.className = 'grave-tag';
    el.innerHTML = `<div class="gt-title">⚰️ ${nm}</div><div class="gt-time">⏳ …</div>`;
    worldLayer.appendChild(el);
    g.el = el;
  };

  ui.updateBossBar = function (e) {
    const bar = $('bossBar');
    if (!e) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    // 쌍둥이·3형제는 살아남은 멤버 전원의 체력바를 쌓아서 보여준다
    let rows = [e];
    if (e.group) {
      const grp = (game.bossGroups && game.bossGroups[e.group]) || [];
      const alive = grp.filter((m) => m.alive);
      if (alive.length) rows = alive;
    }
    bar.innerHTML = rows.map((m) => {
      const tag = m.shielded ? ' 🛡️' : m.statue ? ' 🗿' : '';
      return `<div class="boss-row"><div class="boss-name">Lv.${m.level} ${m.def.name}${tag}</div><div class="boss-hp"><div class="fill" style="width:${pct(m.hp, m.maxHp)}"></div></div></div>`;
    }).join('');
  };

  // ---------- 보관함 말풍선 · 열기 버튼 ----------
  ui.showChestBubble = function (found, total) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.innerHTML = `<span class="badge">!</span>상자를 <b>${found}/${total}</b>개\n찾았습니다`;
    worldLayer.appendChild(el);
    ui.bubbles.push({ el, t: 3.4 });
  };

  const chestBtn = document.createElement('button');
  chestBtn.className = 'chest-open-btn hidden';
  chestBtn.innerHTML = '📦 열기';
  worldLayer.appendChild(chestBtn);
  ui.updateChestPrompt = function (chest) {
    ui.nearChest = chest;
    chestBtn.classList.toggle('hidden', !chest);
    if (chest) chestBtn.classList.add('pop');
  };
  chestBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (game.nearChest) game.openChest(game.nearChest);
  });

  // ---------- HUD ----------
  ui.markDirty = function (full) { ui.dirty = true; if (full) ui._rerender = true; };

  function renderHud() {
    if (!game.zone || !game.player) return;
    const s = game.state;
    const d = game.derived();
    const p = game.player;
    renderAvatar();
    $('pcName').textContent = game.heroName();
    $('pcZone').textContent = game.zone.name;
    $('lvChip').textContent = 'Lv.' + s.level;
    $('hpFill').style.width = pct(p.hp, d.maxHp);
    $('hpText').textContent = `${Math.max(0, Math.round(p.hp))} / ${d.maxHp}`;
    const mp = p.mp !== undefined ? p.mp : d.maxMp;
    $('mpFill').style.width = pct(mp, d.maxMp);
    $('mpText').textContent = `${Math.round(mp)} / ${d.maxMp}`;
    $('xpFill').style.width = pct(s.xp, game.xpNeed(s.level));
    const m = game.medalInfo(game.zone.id);
    $('medalNum').textContent = m.tier;
    $('medalGaugeFill').style.height = Math.round(m.ratio * 100) + '%';
    renderQuestTrack();
  }

  function renderQuestTrack() {
    if (!game.zone) return;
    const q = game.questInfo(game.zone.id);
    const box = $('questTrack');
    if (!q) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const step = q.def.steps[q.step];
    if (q.done) {
      box.innerHTML = `<div class="q-title">📜 ${q.def.title}</div><div class="q-done">퀘스트 완료!</div>`;
      return;
    }
    if (!q.accepted) {
      box.innerHTML = `<div class="q-title">📜 ${q.def.title}</div><div class="q-prog">${q.def.npc}에게 말을 걸어 보세요</div>`;
      return;
    }
    if (!step) { box.innerHTML = `<div class="q-title">📜 ${q.def.title}</div><div class="q-done">퀘스트 완료!</div>`; return; }
    box.innerHTML = `<div class="q-title">📜 ${q.def.title}</div>
      <div class="q-step">${q.progress >= step.n ? '✔ ' : ''}${step.text}</div>
      <div class="q-prog">${Math.min(q.progress, step.n)} / ${step.n}${q.progress >= step.n ? ' · NPC에게 보상 받기' : ''}</div>`;
  }

  // ---------- 미니맵 · 월드맵 바탕 (서울 지도 전체, 한 번만 그린다) ----------
  let mapBase = null, mapBaseKey = '';
  function buildMapBase() {
    const S = 900;
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const W2 = (wx) => (wx + 144) / 288 * S;
    const H2 = (wz) => (wz + 144) / 288 * S;
    // 구역별 바탕
    for (const zn of ZONES) {
      if (!zn.map) continue;
      const cx = W2(zn.map.cx), cy = H2(zn.map.cz);
      const R = S / 3 * 0.72;
      const grd = g.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
      grd.addColorStop(0, zn.theme.grass || hexOf(zn.theme.ground));
      grd.addColorStop(0.55, hexOf(zn.theme.ground));
      grd.addColorStop(1, zn.theme.ground2);
      g.fillStyle = grd;
      g.fillRect(cx - S / 6, cy - S / 6, S / 3, S / 3);
    }
    // 얼룩
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < 420; i++) {
      const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 26;
      const zn = districtAt(x / S * 288 - 144, y / S * 288 - 144);
      g.globalAlpha = 0.05 + rnd() * 0.1;
      g.fillStyle = rnd() > 0.5 ? zn.theme.ground2 : (zn.theme.grass || hexOf(zn.theme.ground));
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd()), rnd() * 3, 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;
    // 한강 물줄기
    const ry0 = H2(-104), ry1 = H2(-88);
    g.fillStyle = 'rgba(42,122,150,.85)';
    g.fillRect(0, ry0, S, ry1 - ry0);
    g.strokeStyle = 'rgba(168,232,238,.6)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y = ry0 + rnd() * (ry1 - ry0);
      g.beginPath();
      g.moveTo(rnd() * S * 0.5, y);
      g.bezierCurveTo(S * 0.4, y + (rnd() - 0.5) * 10, S * 0.6, y + (rnd() - 0.5) * 10, S * (0.5 + rnd() * 0.5), y);
      g.stroke();
    }
    // 메인 길 (구역 중심 뱀 모양)
    const pathColor = '#9c8a63';
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = S * 0.014; g.lineCap = 'round';
    g.beginPath();
    PATH_CENTERS.forEach((p, i) => {
      const px = W2(p.x), py = H2(p.z);
      if (i === 0) g.moveTo(px, py);
      else { const prev = PATH_CENTERS[i - 1]; g.quadraticCurveTo(W2(prev.x), H2(p.z), px, py); }
    });
    g.stroke();
    g.strokeStyle = pathColor; g.lineWidth = S * 0.011; g.stroke();
    // 구역 경계선
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2;
    for (const b of [-48, 48]) {
      g.beginPath(); g.moveTo(W2(b), 0); g.lineTo(W2(b), S); g.stroke();
      g.beginPath(); g.moveTo(0, H2(b)); g.lineTo(S, H2(b)); g.stroke();
    }
    // 소품 실루엣
    for (const pr of game.world.props) {
      const x = W2(pr.x), y = H2(pr.z);
      const k = pr.kind || 'rock';
      const r = Math.max(1.6, pr.r * 4.2);
      if (k === 'tree' || k === 'deadTree' || k === 'cactus' || k === 'coral') {
        g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x + 1.2, y + 1.4, r * 1.05, 0, 6.283); g.fill();
        g.fillStyle = k === 'deadTree' ? '#4a3f3a' : k === 'cactus' ? '#4f8a4a' : k === 'coral' ? '#c97a9a' : '#2f6b2c';
        g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        g.fillStyle = k === 'coral' ? '#ffb0c8' : '#5fae4a';
        g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.56, 0, 6.283); g.fill();
      } else if (k === 'rock' || k === 'sandRock' || k === 'bubbleRock') {
        g.fillStyle = k === 'sandRock' ? '#c9a468' : k === 'bubbleRock' ? '#4a8894' : '#8d929c';
        g.beginPath(); g.ellipse(x, y, r * 0.9, r * 0.7, 0, 0, 6.283); g.fill();
        g.fillStyle = 'rgba(255,255,255,.22)';
        g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.4, r * 0.3, 0, 0, 6.283); g.fill();
      } else if (k === 'wall' || k === 'pillar' || k === 'ruinPillar') {
        g.fillStyle = k === 'wall' ? '#6a6355' : k === 'ruinPillar' ? '#7fa4ac' : '#c9ad74';
        g.fillRect(x - r, y - r * 0.7, r * 2, r * 1.4);
      } else {
        g.fillStyle = 'rgba(30,70,30,.5)';
        g.beginPath(); g.arc(x, y, r * 0.7, 0, 6.283); g.fill();
      }
    }
    // 보스 제단 (에픽) · 중간보스 자리 · 지역 필드보스 자리
    const arena = (ax, az, rad, color, ringColor) => {
      g.fillStyle = color; g.beginPath(); g.arc(W2(ax), H2(az), rad, 0, 6.283); g.fill();
      g.strokeStyle = ringColor; g.lineWidth = 2; g.beginPath(); g.arc(W2(ax), H2(az), rad, 0, 6.283); g.stroke();
    };
    for (const zn of ZONES) {
      if (!zn.map) continue;
      arena(zn.map.cx + zn.mid.x, zn.map.cz + zn.mid.z, S * 0.013, 'rgba(80,160,255,.16)', 'rgba(120,190,255,.5)');
      arena(zn.map.cx + zn.boss.x, zn.map.cz + zn.boss.z, S * 0.019, 'rgba(180,90,255,.18)', 'rgba(210,140,255,.55)');
      if (zn.field) arena(zn.map.cx + zn.field.x, zn.map.cz + zn.field.z, S * 0.02, 'rgba(255,200,60,.16)', 'rgba(255,215,110,.6)');
    }
    // 시작 지점 문양 (1구역 스폰)
    const z1 = ZONES[0];
    g.strokeStyle = 'rgba(140,220,255,.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(W2(z1.map.cx + z1.spawn.x), H2(z1.map.cz + z1.spawn.z), S * 0.01, 0, 6.283); g.stroke();
    // 지구 귀환 게이트
    g.fillStyle = game.state.earthGateOpen ? '#ffd257' : '#8a97a8';
    g.beginPath(); g.arc(W2(EARTH_GATE.x), H2(EARTH_GATE.z), S * 0.012, 0, 6.283); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    // 테두리
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 8;
    g.strokeRect(4, 4, S - 8, S - 8);
    mapBase = cv;
    mapBaseKey = game.state.chestOpened.length + '|' + (game.state.earthGateOpen ? '1' : '0');
  }

  function drawMinimap() {
    if (!game.zone || !game.player || !game.world) return;
    const baseKey = game.state.chestOpened.length + '|' + (game.state.earthGateOpen ? '1' : '0');
    if (!mapBase || mapBaseKey !== baseKey) buildMapBase();
    const c = $('minimap');
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = W / 2 - 5;
    const scale = R / 27; // 화면 반경 = 월드 27유닛
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    // 지형 레이어 (한 번 그려 둔 오프스크린 캔버스 — 서울 지도 전체)
    const size = 288 * scale;
    const ox = cx - (game.player.x + 144) / 288 * size;
    const oy = cy - (game.player.z + 144) / 288 * size;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mapBase, ox, oy, size, size);
    ctx.imageSmoothingEnabled = false;
    const px2 = (wx, wz) => [cx + (wx - game.player.x) * scale, cy + (wz - game.player.z) * scale];

    // NPC (현재 구역)
    const npcMesh = game.world.npcs[game.zone.id];
    let p = npcMesh ? npcMesh.position : null;
    let d = p ? px2(p.x, p.z) : [cx, cy];
    const q = game.questInfo(game.zone.id);
    if (q && !q.done) {
      ctx.save(); ctx.translate(d[0], d[1]); ctx.rotate(Math.PI / 4);
      const pulse = 5 + Math.sin(game.time * 4) * 1.4;
      ctx.fillStyle = q.accepted && q.progress >= (q.def.steps[q.step] || {}).n ? '#ffd257' : '#57e08d';
      ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(d[0], d[1], 2.6, 0, 6.283); ctx.fillStyle = '#8fd8ff'; ctx.fill();
    }
    // 상자
    for (const ch of game.world.chests) {
      if (ch.opened) continue;
      const dd = px2(ch.x, ch.z);
      if (Math.hypot(dd[0] - cx, dd[1] - cy) > R) continue;
      ctx.fillStyle = '#ffd257';
      ctx.fillRect(dd[0] - 2.6, dd[1] - 2.2, 5.2, 4.4);
      ctx.strokeStyle = '#7a5a20'; ctx.lineWidth = 1; ctx.strokeRect(dd[0] - 2.6, dd[1] - 2.2, 5.2, 4.4);
    }
    // 몬스터 = 빨간 점
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const dd = px2(e.x, e.z);
      if (Math.hypot(dd[0] - cx, dd[1] - cy) > R) continue;
      const big = e.isField || e.isBoss || e.isMid;
      ctx.beginPath(); ctx.arc(dd[0], dd[1], big ? 4.8 : 2.6, 0, 6.283);
      ctx.fillStyle = big ? '#ff2d2d' : '#ff5b5b'; ctx.fill();
      if (big) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // 내 캐릭터 = 초록 점
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 6.283); ctx.fillStyle = '#2dff7a'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.stroke();
    // 바라보는 방향
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(game.player.facing) * 11, cy + Math.cos(game.player.facing) * 11);
    ctx.strokeStyle = 'rgba(45,255,122,.6)'; ctx.lineWidth = 2.2; ctx.stroke();
    // 가장자리 어둡게
    const grd = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---------- 프레임 업데이트 ----------
  ui.update = function (dt) {
    ui.hudT += dt;
    if (ui.hudT > 0.12) { ui.hudT = 0; renderHud(); }
    ui.skillT += dt;
    if (ui.skillT > 0.2) { ui.skillT = 0; ui.renderSkillBar(); }
    ui.mapT += dt;
    if (ui.mapT > 0.07) { ui.mapT = 0; drawMinimap(); }

    // 일반 몹 이름표는 가장 가까운 한 마리만 (여러 마리 겹침 방지)
    let nearE = null, nearD = 1e9;
    for (const en of game.enemies) {
      if (!en.alive || en.isBoss || en.isField || en.isMid || en.elite) continue;
      const dd = Math.hypot(en.x - game.player.x, en.z - game.player.z);
      if (dd < 9.5 && dd < nearD) { nearD = dd; nearE = en; }
    }
    for (const [e, el] of ui.tags) {
      if (!e.alive) {
        if (e.deadT > 0.5 || !e.mesh.parent) { el.remove(); ui.tags.delete(e); }
        continue;
      }
      const stateKey = e.leashing ? 'return' : e.targetType === 'tank' ? 'tank' : '';
      if (e._tagState !== stateKey) {
        e._tagState = stateKey;
        const name = el.querySelector('.et-name');
        if (name) name.innerHTML = `Lv.${e.level} ${e.def.name}` + (stateKey === 'return' ? ' <b style="color:#8fd8ff">복귀 중</b>' : stateKey === 'tank' ? ' <b style="color:#ffd479">탱커</b>' : '');
      }
      const dist = Math.hypot(e.x - game.player.x, e.z - game.player.z);
      // 잡몹 이름표는 가까울 때만 (여러 마리가 겹쳐 보이지 않게)
      const special = e.isBoss || e.isField || e.isMid || e.elite;
      const far = dist > (special ? 17 : 9.5) || (!special && e !== nearE);
      const p = project(e.x, e.headY + 0.3, e.z);
      if (far || !p.visible || p.x < -80 || p.x > window.innerWidth + 80 || p.y < -40 || p.y > window.innerHeight + 60) {
        el.style.display = 'none';
      } else {
        el.style.display = 'block';
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-100%)`;
        const fill = el.querySelector('.et-bar i');
        if (fill) fill.style.width = pct(e.hp, e.maxHp);
      }
    }
    // 보스 묘비 리스폰 카운트다운
    for (const g of game.graves) {
      if (!g.el) continue;
      const now = Date.now();
      const remain = Math.max(0, g.until - now);
      if (remain <= 0) { g.el.style.display = 'none'; continue; }
      const txt = `⏳ ${game.fmtRemain(remain)}`;
      const tEl = g.el.querySelector('.gt-time');
      if (tEl && tEl._t !== txt) { tEl._t = txt; tEl.textContent = txt; }
      const pj = project(g.x, 2.35, g.z);
      if (!pj.visible) { g.el.style.display = 'none'; continue; }
      g.el.style.display = 'block';
      g.el.style.transform = `translate(${pj.x}px, ${pj.y}px) translate(-50%,-100%)`;
    }
    if (ui.tutorialStep) ui.tickTutorial();
    const pl = game.player;
    if (pl) {
      for (const b of ui.bubbles) {
        b.t -= dt;
        const p = project(pl.x, 2.6, pl.z);
        b.el.style.left = p.x + 'px';
        b.el.style.top = p.y + 'px';
        if (b.t <= 0) { b.el.remove(); b.remove = true; }
      }
      ui.bubbles = ui.bubbles.filter((b) => !b.remove);
      // 상자 열기 버튼 위치
      if (ui.nearChest && !ui.nearChest.opened) {
        const p = project(ui.nearChest.x, 1.35, ui.nearChest.z);
        if (p.visible) {
          chestBtn.style.display = 'block';
          chestBtn.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-100%)`;
        } else chestBtn.style.display = 'none';
      } else if (ui.nearChest && ui.nearChest.opened) {
        ui.updateChestPrompt(null);
      }
    }
  };

  ui.updateTalkButtons = function () {
    const t = $('talkBtn'), l = $('leaveBtn');
    t.classList.toggle('hidden', !game.nearNpc);
    // 귀환 버튼은 항상 보인다 — 누르면 마지막으로 해금한 구역으로 돌아간다 (사망 부활은 1구역)
    l.classList.remove('hidden');
    if (game.nearNpc) {
      const q = game.questInfo(game.zone.id);
      const step = q && !q.done ? q.def.steps[q.step] : null;
      t.textContent = q && q.accepted && step && q.progress >= step.n ? '🎁 보상 받기' : '말 걸기';
    }
  };

  ui.showDeath = function (on) { $('deathVeil').classList.toggle('show', on); };

  ui.onZoneEnter = function (zone) {
    renderHud();
    const banner = $('zoneBanner');
    banner.innerHTML = `<div class="zb-name">${zone.icon} ${zone.name}</div><div class="zb-sub">${zone.sub || ''}</div>`;
    banner.classList.add('show');
    clearTimeout(ui._bannerT);
    ui._bannerT = setTimeout(() => banner.classList.remove('show'), 2600);
    $('bossBar').classList.add('hidden');
    ui.updateTalkButtons();
    ui.updateChestPrompt(null);
    mapBase = null;
    ui.dirty = true;
  };

  ui.levelUpFx = function () {
    if (!game.player) return;
    const p = project(game.player.x, 1.2, game.player.z);
    const el = document.createElement('div');
    el.className = 'fx-ring';
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    worldLayer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  };
  ui.medalFx = function () { ui.levelUpFx(); };

  // ---------- 졸업식 차원이동 인트로 ----------
  ui.showIntro = function (onDone) {
    if (document.getElementById('introOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'introOverlay';
    ov.className = 'intro-overlay';
    ov.innerHTML = `
      <div class="intro-card">
        <div class="intro-art-wrap"><img class="intro-art" id="introArt" src="./assets/intro-portal.png" alt="졸업식 날 열린 차원 포탈"></div>
        <div class="intro-body">
          <div class="intro-kicker">졸업식 · 그날</div>
          <h2>운동장에 빛의 소용돌이가 열렸다</h2>
          <p>졸업식이 끝나던 순간, 하늘에서 빛이 쏟아지고 발밑이 휘어졌어요.<br>
          손을 뻗은 순간 — 눈앞에 펼쳐진 건 서울이 뒤틀린 차원의 세계.<br>
          <b>“이 세계를 뚫고 강해지면, 지구로 돌아갈 수 있어.”</b></p>
          <div class="intro-btns">
            <button class="btn ghost" data-intro-skip>건너뛰기</button>
            <button class="btn gold" data-intro-start>모험 시작</button>
          </div>
        </div>
      </div>`;
    document.getElementById('app').appendChild(ov);
    game.paused = true;
    const close = () => {
      game.state.introSeen = true;
      game.save();
      game.flushSave();
      ov.classList.add('gone');
      setTimeout(() => ov.remove(), 380);
      game.paused = false;
      if (onDone) onDone(); else ui.startTutorial();
    };
    ov.querySelector('[data-intro-skip]').addEventListener('click', close);
    ov.querySelector('[data-intro-start]').addEventListener('click', close);
  };

  // ---------- 캐릭터 선택 (로그인 후) ----------
  ui.openAvatarSelect = function (onDone) {
    if (document.getElementById('pickScreen')) return;
    const st = game.state;
    let picked = st.avatar && AVATARS.some((a) => a.id === st.avatar) ? st.avatar : 'boyA';
    const root = document.createElement('div');
    root.id = 'pickScreen';
    root.className = 'pick-screen';
    const build = () => {
      const nameDefault = st.heroName || (avatarOf(picked).defaultName || '');
      root.innerHTML = `
        <div class="pick-card-wrap">
          <div class="pick-logo">스쿨히어로</div>
          <div class="pick-sub">모험할 학생을 골라 주세요</div>
          <div class="pick-grid">
            ${AVATARS.map((A) => `<button class="pick-item ${A.id === picked ? 'on' : ''}" data-pick="${A.id}" type="button">
              <img src="${portrait(A)}" alt="${A.name}">
              <b>${A.defaultName || A.name}</b><small>${A.short}</small>
            </button>`).join('')}
          </div>
          <label class="name-label">캐릭터 이름</label>
          <input id="pickName" class="name-input" maxlength="12" value="${nameDefault.replace(/"/g, '&quot;')}" placeholder="이름을 입력하세요">
          <button id="pickGo" class="start-btn primary">이 모험으로 시작</button>
          <div class="pick-note">이름은 나중에 가방 → 프로필에서 바꿀 수 있어요.</div>
        </div>`;
      root.querySelectorAll('[data-pick]').forEach((el) => el.addEventListener('click', () => {
        const cur = root.querySelector('#pickName');
        const typed = cur ? cur.value.trim() : '';
        const prevDefault = avatarOf(picked).defaultName;
        picked = el.dataset.pick;
        // 이름을 직접 고치지 않았으면 새 캐릭터의 기본 이름으로
        const nextDefault = avatarOf(picked).defaultName;
        root.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('on', b.dataset.pick === picked));
        if (cur && (!typed || typed === prevDefault)) cur.value = nextDefault;
      }));
      root.querySelector('#pickGo').addEventListener('click', () => {
        const name = (root.querySelector('#pickName').value || '').trim();
        game.setAvatar(picked);
        game.state.avatarPicked = true;
        game.setHeroName(name || avatarOf(picked).defaultName || '');
        game.save();
        game.flushSave();
        root.classList.add('gone');
        setTimeout(() => { root.remove(); if (onDone) onDone(); }, 260);
      });
    };
    build();
    document.getElementById('app').appendChild(root);
  };

  // ---------- 3단계 시작 가이드 (슬림 배너) ----------
  ui.tutorialStep = 0;
  ui.tutStart = null;
  function tutorialBox() {
    let box = document.getElementById('tutorialBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tutorialBox';
      box.className = 'tutorial-box hidden';
      $('hud').appendChild(box);
      box.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-tut-skip]')) ui.finishTutorial();
      });
    }
    return box;
  }
  const TUT_TEXT = {
    1: '조이스틱으로 움직여 보세요',
    2: '<b>사거리 안의 적</b>을 자동 공격해요',
    3: '오른쪽 위 <b>지도</b>와 아래 <b>가방</b>을 열어 보세요',
  };
  function renderTutorial() {
    const box = tutorialBox();
    if (!ui.tutorialStep || !game.state.tutorial || game.state.tutorial.done) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = `<span class="tut-num">${ui.tutorialStep}/3</span>
      <span class="tut-line">${TUT_TEXT[ui.tutorialStep]}</span>
      <button class="tut-skip" data-tut-skip>건너뛰기</button>`;
  }
  function setTutorial(step) {
    ui.tutorialStep = step;
    game.state.tutorial.step = step;
    game.save();
    renderTutorial();
  }
  ui.startTutorial = function () {
    const t = game.state.tutorial || { step: 1, done: false };
    if (t.done || ui.tutorialStep) return;
    ui.tutorialStep = Math.max(1, Math.min(3, t.step || 1));
    ui.tutStart = { x: game.player.x, z: game.player.z, kills: game.state.kills };
    renderTutorial();
    game.tutorialHook = (evt) => {
      if (evt === 'view') { ui.finishTutorial(); return; }
      if (evt === 'kill' && ui.tutorialStep === 2) { setTutorial(3); return; }
      if (evt === 'move' && ui.tutorialStep === 1) ui.tickTutorial();
    };
  };
  ui.tickTutorial = function () {
    if (!ui.tutorialStep) return;
    const box = tutorialBox();
    box.classList.toggle('hidden', game.zone && game.zone.id !== 1);
    if (ui.tutorialStep === 1 && ui.tutStart) {
      if (Math.hypot(game.player.x - ui.tutStart.x, game.player.z - ui.tutStart.z) > 2.2) setTutorial(2);
    } else if (ui.tutorialStep === 2 && ui.tutStart) {
      if (game.state.kills > ui.tutStart.kills) setTutorial(3);
    }
  };
  ui.finishTutorial = function () {
    if (!game.state.tutorial || game.state.tutorial.done) { ui.tutorialStep = 0; return; }
    ui.tutorialStep = 0;
    game.state.tutorial = { step: 3, done: true };
    game.tutorialHook = null;
    game.save();
    const box = document.getElementById('tutorialBox');
    if (box) box.classList.add('hidden');
    ui.toast('시작 가이드 완료! 이제 자유롭게 모험하세요.', 'good');
  };
  ui.tutorialInfo = () => ({
    step: ui.tutorialStep,
    done: !!(game.state.tutorial && game.state.tutorial.done),
    visible: !!document.getElementById('tutorialBox') && !document.getElementById('tutorialBox').classList.contains('hidden'),
  });

  // =======================================================================
  // 통합 시트(가방) — 가방 · 합성 · 특성 · 스탯 · 스킬 · 동료 · 설정 · 도움말
  // =======================================================================
  const root = $('modalRoot');
  function closeModal() { root.innerHTML = ''; ui.modal = null; }
  ui.closeAll = closeModal;

  const HUB_ALL = [
    { id: 'bag', icon: '🎒', name: '가방' },
    { id: 'merge', icon: '⚗️', name: '합성' },
    { id: 'souls', icon: '🌳', name: '특성' },
    { id: 'stats', icon: '💪', name: '스탯' },
    { id: 'skills', icon: '📖', name: '스킬' },
    { id: 'companions', icon: '🐾', name: '동료' },
    { id: 'ach', icon: '🏆', name: '업적' },
    { id: 'settings', icon: '⚙️', name: '설정' },
    { id: 'help', icon: '❔', name: '도움말' },
  ];
  function hubTabs(active) {
    const admin = game.isAdmin();
    const tabs = HUB_ALL.filter((t) => t.id !== 'settings' || admin);
    return `<div class="hub-tabs">${tabs.map((t) => `<button class="hub-tab ${t.id === active ? 'on' : ''}" data-hub="${t.id}"><span>${t.icon}</span>${t.name}</button>`).join('')}</div>`;
  }
  function head(title, sub = '', tab = null) {
    return `<div class="sheet-head"><div class="sheet-title">${title}${sub ? `<small>${sub}</small>` : ''}</div><button class="close-x" data-close>✕</button></div>${tab ? hubTabs(tab) : ''}`;
  }
  function openSheet(html, cls = '') {
    root.innerHTML = `<div class="overlay"><div class="sheet ${cls}" role="dialog">${html}</div></div>`;
    ui.modal = true;
    const ov = root.querySelector('.overlay');
    ov.addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) closeModal(); });
    const x = root.querySelector('[data-close]');
    if (x) x.addEventListener('click', closeModal);
    root.querySelectorAll('[data-hub]').forEach((el) => el.addEventListener('click', () => ui.openHub(el.dataset.hub)));
    return root.querySelector('.sheet');
  }
  ui.openHub = function (tab = 'bag') {
    if (tab === 'settings' && !game.isAdmin()) tab = 'bag';
    if (tab === 'bag') ui.openBag();
    else if (tab === 'merge') ui.openMerge();
    else if (tab === 'souls') ui.openSouls();
    else if (tab === 'stats') ui.openStats();
    else if (tab === 'skills') ui.openSkills();
    else if (tab === 'companions') ui.openCompanions();
    else if (tab === 'ach') ui.openAch();
    else if (tab === 'settings') ui.openSettings();
    else if (tab === 'help') ui.openHelp();
    else ui.openBag();
  };

  function itemIcon(kind, fam) {
    if (kind === 'weapon') return (WEAPONS[fam] || {}).icon || '⚔️';
    if (kind === 'armor') return (ARMOR_KINDS[fam] || {}).icon || '🛡️';
    if (kind === 'accessory') return (ACCESSORY_KINDS[fam] || {}).icon || '💍';
    if (kind === 'charm') return (CHARMS[fam] || {}).icon || '🧿';
    return '📿';
  }
  function optText(it) {
    return game.itemOptions(it).map((o) => `${OPT_LABEL[o.k] || o.k} +${o.v}%`).join(' · ');
  }
  function equipStatText(it) {
    const st = game.itemStats(it);
    if (it.kind === 'weapon') {
      const w = WEAPONS[it.fam];
      if (!w) return '알 수 없는 무기 · 스탯을 알 수 없어요';
      return `공격력 +${st.atk} · ${w.name}(${w.cls === 'melee' ? '근접' : w.cls === 'ranged' ? '원거리' : '마법'}) · ${optText(it) || w.style}`;
    }
    if (it.kind === 'armor') {
      const a = ARMOR_KINDS[it.fam];
      if (!a) return '알 수 없는 방어구 · 스탯을 알 수 없어요';
      return `방어력 +${st.def} · ${a.name}(${a.resist} 저항) · ${optText(it)}`;
    }
    if (it.kind === 'accessory') {
      const a = ACCESSORY_KINDS[it.fam];
      if (!a) return '알 수 없는 장신구 · 스탯을 알 수 없어요';
      return `${a.name} · ${optText(it)}`;
    }
    if (it.kind === 'charm') return CHARMS[it.fam] ? CHARMS[it.fam].desc : '';
    return '';
  }
  function isValidItem(kind, fam) {
    if (kind === 'weapon') return !!WEAPONS[fam];
    if (kind === 'armor') return !!ARMOR_KINDS[fam];
    if (kind === 'accessory') return !!ACCESSORY_KINDS[fam];
    if (kind === 'charm') return !!CHARMS[fam];
    return false;
  }
  function soulChips() {
    const s = game.state;
    return Object.entries(SOUL_KINDS).map(([k, v]) => `<span class="cur-chip" style="border-color:${v.color}55"><i style="background:${v.color}"></i>${v.name.replace(' 영혼', '')} <b>${fmt(s.souls[k] || 0)}</b></span>`).join('');
  }

  // ---------- 가방 (프로필 + 스탯 + 장비 + 아이템 + 진화) ----------
  ui.openBag = function () {
    const s = game.state;
    const d = game.derived();
    const A = avatarOf(s.avatar);
    const entries = Object.entries(s.bag)
      .map(([key, n]) => { const [kind, fam, g] = key.split(':'); return { key, kind, fam, grade: parseInt(g, 10), n }; })
      .sort((a, b) => b.grade - a.grade || a.kind.localeCompare(b.kind));
    const slotLabels = { weapon: '무기', armor: '방어구', necklace: '목걸이', ring: '반지', earring: '귀걸이', charm: '부적' };
    const equipRows = ['weapon', 'armor', 'necklace', 'ring', 'earring', 'charm'].map((k) => {
      const it = s.equip[k];
      if (!it) return `<div class="row-line eq-row"><span class="hint">${slotLabels[k]} · 비어 있음</span></div>`;
      const g = GRADES[it.grade] || GRADES[0];
      return `<div class="row-line eq-row"><span><b style="color:${g.color}">${it.kind === 'charm' ? CHARMS[it.fam].name : game.itemName(it.kind, it.fam, it.grade)}</b><br><span class="hint">${equipStatText(it)}</span></span><button class="btn ghost" data-unequip="${k}">해제</button></div>`;
    }).join('');
    // 보유 부적 교체 (장착 슬롯은 1개지만 얻은 부적은 전부 보관한다)
    const charmBtns = (s.charms || []).map((fam) => {
      const c = CHARMS[fam];
      if (!c) return '';
      const equipped = s.equip.charm && s.equip.charm.fam === fam;
      return `<button class="btn ${equipped ? 'gold' : 'ghost'}" data-charm="${fam}" ${equipped ? 'disabled' : ''}>${c.icon} ${c.name}${equipped ? ' · 장착 중' : ''}</button>`;
    }).join('');

    const grid = entries.length ? entries.map((it) => {
      const g = GRADES[it.grade] || GRADES[0];
      const evo = it.grade < 5 ? game.evoInfo(it.kind, it.fam, it.grade) : null;
      const ready = evo && evo.can;
      const ratio = evo && evo.need ? Math.min(1, it.n / evo.need) : 0;
      return `<div class="item ${ready ? 'evo-ready' : ''}" data-item="${it.key}" style="--g:${g.color};--gs:${g.glow}">
        <div class="ico">${itemIcon(it.kind, it.fam)}</div>
        <div class="nm">${game.itemName(it.kind, it.fam, it.grade)}</div>
        <div class="sub">${g.name}</div>
        <span class="cnt">×${it.n}</span>
        ${evo ? `<div class="evo-bar"><i style="width:${ratio * 100}%"></i></div><div class="evo-txt">${ready ? `빨강 진화 가능 ×${Math.floor(it.n / evo.need)}` : `${it.n} / ${evo.need}`}</div>` : '<div class="evo-txt">신화</div>'}
        ${ready ? `<button class="evo-btn" data-evolve="${it.key}">빨강 진화</button>` : ''}
      </div>`;
    }).join('') : `<div class="hint">아직 장비가 없어요. 몬스터를 처치해 보세요!</div>`;

    const statChips = [
      ['❤ 체력', `${Math.round(game.player ? game.player.hp : d.maxHp)} / ${fmt(d.maxHp)}`],
      ['⚔ 공격', fmt(d.attack)],
      ['🛡 방어', fmt(d.defense)],
      ['🎯 치명타', `${(d.critChance * 100).toFixed(1)}%`],
      ['👟 이동', d.moveSpeed.toFixed(1)],
      ['⚡ 공속', `${(d.atkSpeed * 100).toFixed(0)}%`],
      ['💨 회피', `${(d.evade * 100).toFixed(1)}%`],
    ].map(([n, v]) => `<span class="stat-chip"><small>${n}</small><b>${v}</b></span>`).join('');

    const ap = s.appearance || { mode: 'armor', unlocked: [] };
    const cosTotals = game.costumeBonus();
    const totalBonusText = (() => {
      const parts = Object.entries(cosTotals).filter(([, v]) => v).map(([k, v]) => `${COSTUME_STAT_LABEL[k] || k} +${v}${['crit', 'evade', 'moveSpeed', 'atkPct', 'defPct', 'hpPct', 'critDmg', 'mpPct', 'cdr'].includes(k) ? '%' : ''}`);
      return parts.length ? `수집 보너스 · ${parts.join(' · ')}` : '수집 보너스 없음 · 외형을 모아 보세요';
    })();
    const codexCards = COSTUMES.map((c) => {
      const owned = (ap.unlocked || []).includes(c.id);
      const lv = game.costumeLevel(c.id);
      const bonus = Object.entries(game.costumeScaledStats(c.id)).map(([k, v]) => `${COSTUME_STAT_LABEL[k] || k} +${v}%`).join(' · ');
      return `<div class="codex-card ${owned ? 'owned' : 'locked'}">
        <div class="cc-ico">${c.icon}</div>
        <div class="cc-body"><div class="cc-name">${c.name} <span class="cc-cls">${c.cls}</span>${owned ? `<span class="cc-own">보유 Lv.${lv}</span>` : '<span class="cc-lock">미보유</span>'}</div>
          <div class="cc-bonus">${bonus}</div><div class="hint">${c.desc}</div></div>
      </div>`;
    }).join('');
    const lookOpts = [
      `<button class="look-opt ${ap.mode === 'armor' ? 'on' : ''}" data-look="armor">🛡️ 장착 방어구</button>`,
      `<button class="look-opt ${ap.mode === 'uniform' ? 'on' : ''}" data-look="uniform">🎽 기본 교복</button>`,
      ...COSTUMES.map((c) => {
        const owned = (ap.unlocked || []).includes(c.id);
        const on = ap.mode === 'costume' && ap.costumeId === c.id;
        const lv = owned ? ` Lv.${game.costumeLevel(c.id)}` : '';
        return `<button class="look-opt ${on ? 'on' : ''} ${owned ? '' : 'locked'}" data-look="costume:${c.id}" title="${c.desc}">${c.icon} ${c.name}${lv}${owned ? '' : ' 🔒'}</button>`;
      }),
    ].join('');
    const html = `${head('🎒 가방', `Lv.${s.level} · ${A.name}`, 'bag')}
      <div class="bag-hero">
        <div class="bag-preview">
          <img src="${fullBody(A, s.equip, s.appearance, 150)}" alt="내 캐릭터">
        </div>
        <div class="bag-hero-info">
          <div class="bh-top">
            <div class="bh-name">${game.heroName()} <span class="bh-lv">Lv.${s.level}</span></div>
            <button class="mini-btn" data-name-edit>이름 변경</button>
            <button class="mini-btn" data-account>계정</button>
          </div>
          <div class="stat-chips">${statChips}</div>
          <div class="cur-chips"><span class="cur-chip gold"><i></i>골드 <b>${fmt(s.gold)}</b></span>${soulChips()}</div>
        </div>
      </div>
      <div class="look-box">
        <div class="look-head"><b>👗 외형</b><span class="hint">능력치는 그대로, 캐릭터 색조·오라로 표현됩니다</span>
          <button class="mini-btn gold" data-gacha ${game.costumePoolStatus().allMaxed ? 'disabled' : ''}>${game.costumePoolStatus().allMaxed ? '모두 최대 레벨' : `🎲 외형 뽑기 ${COSTUME_PULL_COST}G`}</button></div>
        <div class="look-opts">${lookOpts}</div>
        <div class="codex-head"><b>📖 외형 도감</b><span class="codex-total">${totalBonusText}</span></div>
        <div class="codex">${codexCards}</div>
      </div>
      <div class="equip-block">${equipRows}</div>
      ${charmBtns ? `<div class="charm-box"><b>🧿 보유 부적</b><div class="charm-row">${charmBtns}</div><div class="hint">눌러서 장착 중인 부적을 교체할 수 있어요. 해독 부적은 늪지 독을 막고, 수중호흡 아티팩트는 한강 심해 유적을 열어줘요.</div></div>` : ''}
      <div class="hint" style="margin:6px 2px 9px">아이템을 누르면 <b>설명 · 스탯 비교</b>가 열리고, <b>[장착하기]</b>를 눌러야 장착됩니다. 같은 등급·같은 아이템을 모으면 <b style="color:#ff5566">빨강(신화)</b>으로 진화해요. <button class="link-btn" data-hub="merge">합성·진화 →</button></div>
      <div class="item-grid">${grid}</div>`;

    const sheet = openSheet(html, 'bag-sheet');
    sheet.querySelector('[data-name-edit]').addEventListener('click', () => ui.nameEdit());
    sheet.querySelector('[data-account]').addEventListener('click', () => ui.openAccount());
    sheet.querySelectorAll('[data-look]').forEach((el) => el.addEventListener('click', () => {
      const v = el.dataset.look;
      const r = v.startsWith('costume:') ? game.setAppearance('costume', v.split(':')[1]) : game.setAppearance(v);
      if (!r.ok) { ui.toast(r.msg, 'bad'); return; }
      ui.openBag();
    }));
    sheet.querySelector('[data-gacha]').addEventListener('click', () => {
      const r = game.pullCostume();
      if (!r.ok) { ui.toast(r.msg, 'bad'); return; }
      if (r.leveledUp) ui.toast(`${r.costume.icon} ${r.costume.name} 레벨업! Lv.${r.level}`, 'good');
      else ui.toast(`${r.costume.icon} ${r.costume.name} 획득! 외형에서 착용할 수 있어요.`, 'gold');
      ui.openBag();
    });
    sheet.querySelectorAll('[data-item]').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-evolve]')) return;
        const [kind, fam, g] = el.dataset.item.split(':');
        ui.itemDetail(kind, fam, parseInt(g, 10));
      });
    });
    sheet.querySelectorAll('[data-evolve]').forEach((el) => el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const [kind, fam, g] = el.dataset.evolve.split(':');
      const n = game.evolve(kind, fam, parseInt(g, 10));
      if (n) ui.openBag();
    }));
    sheet.querySelectorAll('[data-unequip]').forEach((el) => {
      el.addEventListener('click', () => { game.unequip(el.dataset.unequip); ui.openBag(); });
    });
    sheet.querySelectorAll('[data-charm]').forEach((el) => {
      el.addEventListener('click', () => { if (game.equipCharm(el.dataset.charm)) ui.openBag(); });
    });
  };

  // ---------- 아이템 상세 · 스탯 비교 · 장착 확인 ----------
  ui.itemDetail = function (kind, fam, grade) {
    const s = game.state;
    const slot = kind === 'accessory' ? fam : kind;
    const it = { kind, fam, grade };
    const cur = s.equip[slot];
    const gd = GRADES[grade] || GRADES[0];
    const valid = isValidItem(kind, fam);
    const st = game.itemStats(it);
    const opts = game.itemOptions(it);
    // 장착했을 때의 능력치 (장착 전/후 비교)
    const before = game.derived();
    const backup = s.equip[slot];
    s.equip[slot] = it;
    const after = game.derived();
    s.equip[slot] = backup;

    const rows = [];
    const push = (label, a, b, dec = 0, suffix = '') => {
      const df = b - a;
      if (Math.abs(df) < (dec ? 0.05 : 0.5) && !(kind === 'weapon' && label === '공격력') && !(kind === 'armor' && label === '방어력')) return;
      const cls = df > 0 ? 'up' : df < 0 ? 'down' : 'same';
      const sign = df > 0 ? '+' : '';
      rows.push(`<div class="cmp-row"><span class="cr-l">${label}</span><span class="cr-v">${dec ? a.toFixed(dec) : fmt(a)}${suffix}</span><span class="cr-d ${cls}">${df === 0 ? '—' : `${sign}${dec ? df.toFixed(dec) : fmt(df)}${suffix}`}</span></div>`);
    };
    push('공격력', before.attack, after.attack);
    push('방어력', before.defense, after.defense);
    push('최대 체력', before.maxHp, after.maxHp);
    push('최대 마나', before.maxMp, after.maxMp);
    push('치명타', before.critChance * 100, after.critChance * 100, 1, '%');
    push('치명타 피해', before.critDmg * 100, after.critDmg * 100, 0, '%');
    push('회피', before.evade * 100, after.evade * 100, 1, '%');
    push('공격 속도', before.atkSpeed * 100, after.atkSpeed * 100, 0, '%');
    push('이동 속도', before.moveSpeed, after.moveSpeed, 1);

    const kindName = kind === 'weapon' ? '무기' : kind === 'armor' ? '방어구' : kind === 'charm' ? '부적' : (ACCESSORY_KINDS[fam] || {}).name || '장신구';
    const curName = cur ? (cur.kind === 'charm' ? (CHARMS[cur.fam] || {}).name : game.itemName(cur.kind, cur.fam, cur.grade)) : null;
    const optRows = opts.length
      ? opts.map((o) => `<span class="opt-chip">${OPT_LABEL[o.k] || o.k} +${o.v}%</span>`).join('')
      : '<span class="hint">추가 옵션 없음</span>';
    const desc = valid
      ? (kind === 'charm'
        ? ((CHARMS[fam] || {}).desc || '')
        : `${equipStatText(it)}`)
      : '이 아이템은 지금 버전에서 찾을 수 없는 종류예요. 장착할 수 없고, 삭제하는 게 좋아요.';
    const equipBtn = valid
      ? '<button class="btn gold" data-equip>장착하기</button>'
      : '<button class="btn gold" data-delete-item>삭제하기</button>';

    const el = document.createElement('div');
    el.className = 'item-sheet';
    el.innerHTML = `
      <div class="islot">
        <div class="islot-head">
          <div class="islot-ico" style="--g:${gd.color}">${itemIcon(kind, fam)}</div>
          <div class="islot-tt">
            <div class="islot-name" style="color:${gd.color}">${kind === 'charm' ? (CHARMS[fam] || {}).name : game.itemName(kind, fam, grade)}</div>
            <div class="islot-sub">${gd.name} · ${kindName}</div>
          </div>
          <button class="islot-x" data-close>✕</button>
        </div>
        <div class="islot-desc">${desc}</div>
        <div class="opt-chips">${optRows}</div>
        <div class="cmp-head"><b>${curName ? `현재 장착 · ${curName}` : '현재 장착 없음'}</b><span>장착하면</span></div>
        <div class="cmp-table">${rows.join('') || '<div class="hint">능력치 변화 없음</div>'}</div>
        <div class="islot-actions">
          <button class="btn ghost" data-close>닫기</button>
          ${equipBtn}
        </div>
      </div>`;
    document.getElementById('modalRoot').appendChild(el);
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => el.remove()));
    el.addEventListener('click', (ev) => { if (ev.target === el) el.remove(); });
    const equipBtnEl = el.querySelector('[data-equip]');
    if (equipBtnEl) equipBtnEl.addEventListener('click', () => {
      const ok = game.equipItem(kind, fam, grade);
      el.remove();
      if (ok) {
        ui.toast(`장착: ${game.itemName(kind, fam, grade)}`, grade >= 3 ? 'gold' : 'good');
        ui.openBag();
      }
    });
    const delBtnEl = el.querySelector('[data-delete-item]');
    if (delBtnEl) delBtnEl.addEventListener('click', () => {
      delete game.state.bag[`${kind}:${fam}:${grade}`];
      game.save();
      el.remove();
      ui.toast('알 수 없는 아이템을 삭제했어요.', 'good');
      ui.openBag();
    });
  };

  // ---------- 이름 변경 ----------
  ui.nameEdit = function () {
    const cur = game.heroName();
    const html = `${head('✏️ 캐릭터 이름')}
      <label class="name-label">이름 (최대 12자)</label>
      <input id="editName" class="name-input" maxlength="12" value="${cur.replace(/"/g, '&quot;')}">
      <div class="dialog-row">
        <button class="btn ghost" data-close>취소</button>
        <button class="btn gold" data-save-name>저장</button>
      </div>`;
    const sheet = openSheet(html);
    sheet.querySelector('[data-save-name]').addEventListener('click', () => {
      const v = (sheet.querySelector('#editName').value || '').trim();
      if (!v) { ui.toast('이름을 입력해 주세요.', 'bad'); return; }
      game.setHeroName(v);
      ui.toast(`이름을 '${game.heroName()}'(으)로 바꿨어요.`, 'good');
      ui.openBag();
    });
    sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    setTimeout(() => { const i = sheet.querySelector('#editName'); if (i) i.focus(); }, 60);
  };

  // ---------- 계정 (로그아웃 · 연결) ----------
  ui.openAccount = function () {
    const acc = game.store || {};
    const where = acc.mode === 'guest' ? '이 기기 (게스트)' : (acc.hasCloud ? '계정 저장 (여러 기기)' : '이 기기');
    const last = acc.status && acc.status.savedAt ? new Date(acc.status.savedAt).toLocaleString('ko-KR') : '아직 없음';
    const html = `${head('👤 계정', '이어하기 · 로그아웃')}
      <div class="account-row"><span>아이디</span><b>${acc.userId || '게스트'}</b></div>
      <div class="account-row"><span>저장 위치</span><b>${where}</b></div>
      <div class="account-row"><span>최근 저장</span><b>${last}</b></div>
      <div class="account-row"><span>캐릭터 이름</span><b>${game.heroName()}</b></div>
      <div class="hint" style="margin-top:10px">다른 기기와 이어서 하려면 가족 연결 코드를 넣어 주세요.</div>
      <div class="connect-row"><input id="connectCode" placeholder="연결 코드"><button class="btn" data-connect>연결</button></div>
      ${game.isAdmin() ? '<div class="hint" style="margin-top:10px;color:#8dffc0">관리자 인증됨 · 가방 탭에 ⚙️ 설정이 열려 있어요.</div>' : '<div class="hint" style="margin-top:12px">보호자라면 관리자 코드로 밸런스 설정을 열 수 있어요.</div><div class="connect-row"><input id="adminCode" placeholder="관리자 코드"><button class="btn" data-admin-on>확인</button></div>'}
      <button class="btn ghost" data-logout style="width:100%;margin-top:12px">로그아웃</button>`;
    const sheet = openSheet(html);
    sheet.querySelector('[data-connect]').addEventListener('click', async () => {
      const code = sheet.querySelector('#connectCode').value.trim();
      if (code.length < 10) { ui.toast('연결 코드를 확인해 주세요.', 'bad'); return; }
      try { localStorage.setItem('sh.token', code); } catch (e) { /* 무시 */ }
      if (game.store) { game.store.cloud = new CloudAdapter(code); await game.flushSave(); }
      ui.toast('연결했어요. 이제 계정에 저장됩니다.', 'good');
      ui.openAccount();
    });
    const adminOn = sheet.querySelector('[data-admin-on]');
    if (adminOn) adminOn.addEventListener('click', () => {
      const code = (sheet.querySelector('#adminCode') || {}).value || '';
      if (game.enableAdmin(code)) { ui.toast('관리자 인증 완료 · 가방 탭에 설정이 열렸어요.', 'good'); ui.openBag(); }
      else ui.toast('관리자 코드가 맞지 않아요.', 'bad');
    });
    sheet.querySelector('[data-logout]').addEventListener('click', async () => {
      try {
        localStorage.removeItem('sh.session');
        localStorage.removeItem('sh.avatar');
      } catch (e) { /* 무시 */ }
      if (game.store) await game.flushSave();
      location.reload();
    });
  };

  // ---------- 합성 · 진화 ----------
  ui.openMerge = function () {
    const groups = game.mergeGroups();
    const rows = groups.length ? groups.map((g) => {
      const gc = GRADES[g.grade], nc = GRADES[g.grade + 1];
      return `<div class="row-line" style="border-color:${gc.color}66">
        <span><b style="color:${gc.color}">${game.itemName(g.kind, g.fam, g.grade)}</b> ×${g.count}<br>
        <span class="hint">3개 → <b style="color:${nc.color}">${game.itemName(g.kind, g.fam, g.grade + 1)}</b></span></span>
        <button class="btn" data-merge="${g.kind}:${g.fam}:${g.grade}">합성</button>
      </div>`;
    }).join('') : `<div class="hint" style="margin:10px 0 16px">합성할 수 있는 장비가 없어요. 같은 등급 장비 3개를 모아 보세요!</div>`;

    const evoList = game.evolveReady();
    const evoRows = evoList.length ? evoList.map((e) => {
      const g = GRADES[e.grade];
      return `<div class="row-line evo-line" style="border-color:#ff556655">
        <span><b style="color:#ff7a88">${game.itemName(e.kind, e.fam, e.grade)}</b> ${e.count} / ${e.need}<br>
        <span class="hint">→ <b style="color:${GRADES[5].color}">${game.itemName(e.kind, e.fam, 5)}</b> ×${e.times}</span></span>
        <button class="btn gold" data-evolve-row="${e.kind}:${e.fam}:${e.grade}">빨강 진화</button>
      </div>`;
    }).join('') : '<div class="hint" style="margin:6px 0 14px">아직 빨강 진화할 수 있는 장비가 없어요. 같은 아이템을 모아 보세요.</div>';

    const need = EVOLVE_NEED.map((n, i) => `<span class="evo-need" style="color:${GRADES[i].color}">${GRADES[i].name} ${n}개</span>`).join('<span class="hint"> · </span>');
    const html = `${head('⚗️ 합성 · 진화', '3개 합성 / 개수 모아 빨강 진화', 'merge')}
      <div class="hint" style="margin-bottom:10px">흰 일반 → 초 고급 → 파 희귀 → 보 에픽 → 노 전설 → <b style="color:#ff5566">빨강 신화</b></div>
      <div class="sec-title">합성 (같은 등급 3개 → 상위 1개)</div>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn gold" data-merge-all style="flex:1">한 번에 모두 합성</button></div>
      <div class="sec-title" style="margin-top:16px">빨강 진화 (개수 모으기)</div>
      <div class="hint" style="margin-bottom:8px">${need}</div>
      ${evoRows}`;
    const sheet = openSheet(html, 'hub-sheet');
    sheet.querySelectorAll('[data-merge]').forEach((el) => el.addEventListener('click', () => {
      const [k, f, g] = el.dataset.merge.split(':');
      const n = game.merge(k, f, parseInt(g, 10), false);
      if (n) ui.toast(`${GRADES[Math.min(5, parseInt(g, 10) + 1)].name} 등급 장비 획득!`, 'gold');
      ui.openMerge();
    }));
    sheet.querySelector('[data-merge-all]').addEventListener('click', () => {
      let total = 0;
      for (let pass = 0; pass < 6; pass++) {
        const gs = game.mergeGroups();
        if (!gs.length) break;
        for (const g of gs) total += game.merge(g.kind, g.fam, g.grade, true);
      }
      ui.toast(total ? `합성 완료! ${total}개 승급` : '합성할 장비가 없어요.', total ? 'gold' : '');
      ui.openMerge();
    });
    sheet.querySelectorAll('[data-evolve-row]').forEach((el) => el.addEventListener('click', () => {
      const [k, f, g] = el.dataset.evolveRow.split(':');
      const n = game.evolve(k, f, parseInt(g, 10));
      if (n) ui.openMerge();
    }));
  };

  // ---------- 스탯 ----------
  ui.openStats = function () {
    const s = game.state, d = game.derived();
    const clsLabel = d.cls === 'magic' ? '마법' : d.cls === 'ranged' ? '원거리' : '근접';
    const base = [
      ['str', '힘', '근접 공격력 · 원거리 보조'],
      ['dex', '민첩', '원거리 공격력 · 치명타 · 회피 · 공속'],
      ['vit', '체력', '최대 체력 · 방어력'],
      ['int', '지력', '마법 공격력 · 마나'],
    ];
    const rows = base.map(([k, n, tip]) => `
      <div class="stat-big">
        <div><div class="nm">${n}</div><div class="hint">${tip}</div></div>
        <div style="display:flex;align-items:center;gap:8px"><span class="val">${s.stats[k]}</span>
        <div class="plus-btns"><button data-stat="${k}" ${s.statPts <= 0 ? 'disabled' : ''}>+</button></div></div>
      </div>`).join('');
    const html = `${head('💪 스탯', `레벨 ${s.level} · 남은 포인트 ${s.statPts} P`, 'stats')}
      <div style="margin-bottom:8px">${rows}</div>
      <div>
        <div class="stat-line"><span>무기</span><b>${d.weapon.icon} ${d.weapon.name} · ${clsLabel}</b></div>
        <div class="stat-line"><span>공격력 (기본 ${d.baseAtk} + 무기 ${d.weaponAtk})</span><b>${d.attack}</b></div>
        <div class="stat-line"><span>최대 체력</span><b>${d.maxHp}</b></div>
        <div class="stat-line"><span>방어력</span><b>${d.defense}</b></div>
        <div class="stat-line"><span>치명타 확률</span><b>${(d.critChance * 100).toFixed(1)}%</b></div>
        <div class="stat-line"><span>치명타 피해</span><b>${(d.critDmg * 100).toFixed(0)}%</b></div>
        <div class="stat-line"><span>회피</span><b>${(d.evade * 100).toFixed(1)}%</b></div>
        <div class="stat-line"><span>공격 속도</span><b>${(d.atkSpeed * 100).toFixed(0)}%</b></div>
        <div class="stat-line"><span>구역 메달</span><b>${(() => { const m = game.medalInfo(game.zone.id); return `${m.tier}등급 (+${Math.round(m.bonus * 100)}%)`; })()}</b></div>
        <div class="hint" style="margin-top:8px">근접은 힘·민첩, 원거리는 민첩·힘, 마법은 지력이 공격력을 올려줍니다.</div>
      </div>`;
    const sheet = openSheet(html, 'hub-sheet');
    sheet.querySelectorAll('[data-stat]').forEach((el) => el.addEventListener('click', () => {
      if (game.spendPoint(el.dataset.stat)) ui.openStats();
    }));
  };

  // ---------- 영혼 특성 ----------
  ui.openSouls = function () {
    const s = game.state;
    const soulRow = Object.entries(SOUL_KINDS).map(([k, v]) =>
      `<div class="zi-box" style="border-color:${v.color}55"><div class="big" style="color:${v.color};font-size:18px">${s.souls[k] || 0}</div><div class="lbl">${v.name}</div></div>`).join('');
    const svgLines = TALENTS.filter((t) => t.req.length).map((t) => t.req.map((r) => {
      const a = TALENTS.find((x) => x.id === r);
      if (!a) return '';
      const on = s.talents.includes(r);
      return `<line x1="${a.x}" y1="${a.y}" x2="${t.x}" y2="${t.y}" stroke="${on ? '#7fd8ff' : 'rgba(255,255,255,.14)'}" stroke-width="0.7" />`;
    }).join('')).join('');
    const nodes = TALENTS.map((t) => {
      const on = s.talents.includes(t.id);
      return `<div class="node ${on ? 'on' : ''}" data-talent="${t.id}" style="left:${t.x}%;top:${t.y}%">
        <div class="orb">${t.icon}</div>
        <div class="nl">${t.name}</div>
        <div class="cost">${on ? '완료' : `${SOUL_KINDS[t.cost.kind].name.split(' ')[0]} ${t.cost.n}`}</div>
      </div>`;
    }).join('');
    const html = `${head('🌳 영혼 특성', '영혼으로 능력을 해금하세요', 'souls')}
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">${soulRow}</div>
      <div class="board"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${svgLines}</svg>${nodes}</div>
      <div class="hint" id="talentHint">노드를 누르면 영혼을 사용해 해금합니다. 앞의 노드를 먼저 열어야 다음 노드가 열려요.</div>`;
    const sheet = openSheet(html, 'hub-sheet');
    sheet.querySelectorAll('[data-talent]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.talent;
      const t = TALENTS.find((x) => x.id === id);
      if (game.state.talents.includes(id)) return;
      if (t.req.some((r) => !game.state.talents.includes(r))) { ui.toast('앞의 특성을 먼저 해금해 주세요.', 'bad'); return; }
      if ((game.state.souls[t.cost.kind] || 0) < t.cost.n) { ui.toast('영혼이 부족해요.', 'bad'); return; }
      if (game.learnTalent(id)) { ui.toast(`${t.name} 해금!`, 'good'); ui.openSouls(); }
    }));
  };

  // ---------- 스킬북 (스킬 개편) ----------
  // 주인공은 스킬을 쓰지 않는다. 스킬은 동료만 쓴다.
  // 스킬북을 쓰면 해당 직업 동료의 대표 스킬 보너스가 +1 된다.
  ui.openSkills = function () {
    if (!game.state || !game.state.skills) return;
    const s = game.state.skills;
    const books = game.state.skillbooks || {};
    // 동료 대표 스킬 4종 (보유한 동료의 현재 레벨과 함께)
    const sigCards = Object.values(COMPANION_SKILLS).map((def) => {
      const cls = COMPANION_CLASSES[def.cls];
      const owned = game.state.companions.filter((c) => c.cls === def.cls);
      const lvText = owned.length
        ? owned.map((c) => `${c.name} Lv.${game.companionSkillLevel(c)}`).join(' · ')
        : '보유한 동료 없음';
      return `<div class="skill-card">
        <div class="sk-ico">${def.icon}</div>
        <div class="sk-body">
          <div class="sk-name">${def.name} <span class="sk-kind">${cls.role}</span></div>
          <div class="sk-desc">${def.desc}</div>
          <div class="sk-meta">쿨다운 ${def.cd}초 · 레벨이 오르면 ${def.cdMin}초까지 · ${lvText}</div>
        </div>
      </div>`;
    }).join('');
    // 스킬북 10종: 쓰면 해당 직업 동료 스킬 +1
    const cards = SKILL_IDS.map((id) => {
      const def = SKILLS[id];
      const cls = SKILL_BOOK_CLASS[id];
      const clsDef = COMPANION_CLASSES[cls];
      const learned = s.learned.includes(id);
      const n = books[id] || 0;
      const act = n > 0
        ? `<button class="btn gold" data-learn="${id}">강화하기</button><span class="hint">보유 ${n}</span>`
        : learned ? '<span class="sk-done">이미 사용</span>' : '<span class="hint">보스 처치로 획득</span>';
      return `<div class="skill-card ${learned ? 'learned' : ''} ${n > 0 ? 'hasbook' : ''}">
        <div class="sk-ico">${def.icon}</div>
        <div class="sk-body">
          <div class="sk-name">${def.name} <span class="sk-kind">→ ${clsDef.role} 동료 스킬 +1</span></div>
          <div class="sk-desc">${def.desc}</div>
          <div class="sk-meta">${clsDef.name}의 대표 스킬 '${COMPANION_SKILLS[cls].name}' 보너스가 올라갑니다</div>
        </div>
        <div class="sk-act">${act}</div>
      </div>`;
    }).join('');
    const html = `${head('📖 스킬북', '스킬은 동료만 써요', 'skills')}
      <div class="skill-top">
        <span class="hint">주인공은 스킬을 쓰지 않아요. 스킬북을 쓰면 해당 직업 동료의 대표 스킬이 강해집니다. 대표 스킬 레벨 = 동료 등급 + 1 + 스킬북 보너스 (최대 Lv.10).</span>
      </div>
      <div class="skill-list" style="margin-bottom:10px">${sigCards}</div>
      <div class="skill-list">${cards}</div>`;
    const sheet = openSheet(html, 'hub-sheet skills-sheet');
    sheet.querySelectorAll('[data-learn]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.learn;
      const r = game.learnSkill(id);
      if (!r.ok) { ui.toast('아직 이 스킬의 스킬북이 없어요.', 'bad'); return; }
      const clsDef = r.cls ? COMPANION_CLASSES[r.cls] : null;
      if (r.pending) ui.toast(`${SKILLS[id].icon} ${SKILLS[id].name} — ${clsDef.role} 동료가 아직 없어서 나중에 뽑으면 보너스가 적용돼요`, 'gold');
      else if (r.granted.length) ui.toast(`${SKILLS[id].icon} ${SKILLS[id].name} — ${r.granted.join(' · ')}의 대표 스킬이 강해졌어요!`, 'gold');
      else ui.toast(`${SKILLS[id].icon} ${SKILLS[id].name}을(를) 사용했어요`, 'gold');
      ui.openSkills();
    }));
  };

  // ---------- 동료 ----------
  ui.openCompanions = function (filter) {
    const s = game.state;
    if (filter) ui._compFilter = filter;
    const f = ui._compFilter || 'all';
    const tabs = [['all', '전체'], ['tank', '🛡️ 탱커'], ['healer', '💗 힐러'], ['melee', '🗡️ 근접'], ['mage', '🔮 마법']]
      .map(([id, label]) => `<button class="tab ${f === id ? 'on' : ''}" data-comp-tab="${id}">${label}</button>`).join('');
    const list = s.companions.filter((c) => f === 'all' || c.cls === f);
    const cards = list.map((c) => {
      const cls = COMPANION_CLASSES[c.cls];
      const g = GRADES[c.grade] || GRADES[0];
      const inParty = s.party.includes(c.id);
      return `<div class="comp-card ${inParty ? 'in-party' : ''}" style="--g:${g.color};--gs:${g.glow}">
        <div class="av" style="border-color:${g.color}">${cls.icon}</div>
        <div class="info">
          <div class="nm">${c.name} <span style="font-size:9px;color:${g.color}">${g.name}</span></div>
          <div class="cls">${cls.role} · ${cls.name}</div>
          <div class="lv">Lv.${c.lv || 1} · 공격 ${Math.round(cls.atk * (1 + ((c.lv || 1) - 1) * 0.22) * (1 + (c.grade || 0) * 0.20))}</div>
          <div class="lv">체력 ${(() => { const live = (game.companions || []).find((x) => x.data && x.data.id === c.id); return live ? `${Math.round(live.hp)} / ${live.maxHp}` : `${Math.round(cls.hp * (1 + (c.grade || 0) * 0.15))}`; })()}</div>
          <div class="lv">${(() => { const sk = COMPANION_SKILLS[c.cls]; return sk ? `${sk.icon} ${sk.name} Lv.${game.companionSkillLevel(c)}` : ''; })()}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <button class="btn ${inParty ? 'ghost' : ''}" data-party="${c.id}">${inParty ? '대기' : '동행'}</button>
          <button class="mini-btn danger" data-dismiss="${c.id}">보내기</button>
        </div>
      </div>`;
    }).join('') || `<div class="hint" style="margin:8px 0 16px">${f === 'all' ? '아직 동료가 없어요. 아래 뽑기로 동료를 만나 보세요!' : '이 직업의 동료가 없어요.'}</div>`;
    const html = `${head('🐾 동료', `동행 ${s.party.length}/3`, 'companions')}
      <div class="tab-row">${tabs}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="hint">동료 뽑기 · ${COMPANION_PULL_COST}골드 (보유 ${fmt(s.gold)})</span>
        <button class="btn gold" data-pull>뽑기 ✨</button>
      </div>
      ${cards}
      <div class="hint" style="margin-top:10px">탱커·힐러·근접딜러·마법딜러 중 최대 3명까지 함께 싸워요. 같은 동료가 다시 나오면 등급이 올라가요 (최대 신화). 동료는 각자 대표 스킬을 자동으로 써요. 스킬 레벨은 등급 + 1 + 스킬북 보너스 (최대 Lv.10).</div>`;
    const sheet = openSheet(html, 'hub-sheet');
    sheet.querySelectorAll('[data-comp-tab]').forEach((el) => el.addEventListener('click', () => ui.openCompanions(el.dataset.compTab)));
    sheet.querySelector('[data-pull]').addEventListener('click', () => {
      const r = game.pullCompanion();
      if (!r.ok) { ui.toast(r.msg, 'bad'); return; }
      if (r.upgraded === 'grade') ui.toast(`${r.cls.icon} ${r.companion.name} 등급 상승! ${GRADES[r.grade].name}이 됐어요`, 'good');
      else if (r.upgraded === 'level') ui.toast(`${r.cls.icon} ${r.companion.name} 이미 신화라 레벨 +5!`, 'good');
      else ui.toast(`${r.cls.icon} ${r.companion.name} (${r.cls.role}, ${GRADES[r.grade].name}) 등장!`, 'gold');
      ui.openCompanions();
    });
    sheet.querySelectorAll('[data-party]').forEach((el) => el.addEventListener('click', () => {
      const r = game.toggleParty(el.dataset.party);
      if (!r.ok) ui.toast(r.msg, 'bad');
      ui.openCompanions();
    }));
    sheet.querySelectorAll('[data-dismiss]').forEach((el) => el.addEventListener('click', () => {
      const c = s.companions.find((x) => x.id === el.dataset.dismiss);
      if (!c) return;
      if (!window.confirm(`${c.name} 동료를 보내겠어요? 보낸 동료는 다시 돌아오지 않아요.`)) return;
      const r = game.dismissCompanion(el.dataset.dismiss);
      if (r.ok) ui.toast(`${r.name} 동료를 보냈어요`, 'good');
      ui.openCompanions();
    }));
  };

  // ---------- 설정 (관리자 전용) ----------
  ui.openSettings = function (tab) {
    if (!game.isAdmin()) { ui.openBag(); return; }
    const b = game.balance;
    const admin = true;
    if (!tab) tab = 'weapon';
    const tabs = `<div class="tab-row">
      <button class="tab ${tab === 'weapon' ? 'on' : ''}" data-tab="weapon">무기</button>
      <button class="tab ${tab === 'item' ? 'on' : ''}" data-tab="item">아이템</button>
      <button class="tab ${tab === 'mob' ? 'on' : ''}" data-tab="mob">몬스터</button>
      <button class="tab ${tab === 'account' ? 'on' : ''}" data-tab="account">계정</button>
    </div>`;
    let body = '';
    if (tab === 'weapon') {
      body = Object.keys(WEAPONS).map((id) => {
        const w = WEAPONS[id];
        const ov = b.weapons[id] || {};
        return `<div class="row-line">
          <span><b>${w.icon} ${w.name}</b><br><span class="hint">${w.cls === 'melee' ? '근접' : w.cls === 'ranged' ? '원거리' : '마법'} · ${w.style}</span></span>
          <span class="num-row">
            <label>사거리<input class="num" type="number" step="0.1" data-w="${id}" data-f="range" value="${ov.range}"></label>
            <label>간격<input class="num" type="number" step="0.05" data-w="${id}" data-f="cd" value="${ov.cd}"></label>
            <label>배율<input class="num" type="number" step="0.05" data-w="${id}" data-f="mult" value="${ov.mult}"></label>
          </span>
        </div>`;
      }).join('');
    } else if (tab === 'item') {
      const gradeInputs = (key, label) => `<div class="row-line"><span><b>${label}</b><br><span class="hint">등급별 수치 (일반→신화)</span></span>
        <span class="num-row">${b.items[key].map((v, i) => `<label>${GRADES[i].name}<input class="num" type="number" data-item="${key}" data-i="${i}" value="${v}"></label>`).join('')}</span></div>`;
      body = gradeInputs('weaponAtk', '무기 공격력') + gradeInputs('armorDef', '방어구 방어력') +
        `<div class="hint" style="margin-top:8px">등급이 높을수록 붙는 복합 스탯 개수가 늘어납니다.</div>`;
    } else if (tab === 'account') {
      const acc = game.store || {};
      const where = acc.mode === 'guest' ? '이 기기 (게스트)' : (acc.hasCloud ? '계정 저장 (여러 기기)' : '이 기기');
      const last = acc.status && acc.status.savedAt ? new Date(acc.status.savedAt).toLocaleString('ko-KR') : '아직 없음';
      body = `<div class="account-row"><span>아이디</span><b>${acc.userId || '게스트'}</b></div>
        <div class="account-row"><span>저장 위치</span><b>${where}</b></div>
        <div class="account-row"><span>최근 저장</span><b>${last}</b></div>
        <div class="account-row"><span>밸런스 편집</span><b style="color:#8dffc0">관리자 ✓</b></div>
        <button class="btn ghost" data-admin-off style="width:100%;margin-top:10px">관리자 인증 해제</button>
        <div class="hint" style="margin-top:10px">보스 리스폰 타이머 (테스트용)</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          <button class="btn ghost" data-boss-reset="mid">중간보스 초기화</button>
          <button class="btn ghost" data-boss-reset="boss">에픽보스 초기화</button>
          <button class="btn ghost" data-boss-reset="field">필드보스 초기화</button>
        </div>
        <div class="hint" style="margin-top:8px">현재 구역: ${game.bossStatus(game.zone.id).map((x) => `${x.label} ${x.remain > 0 ? game.fmtRemain(x.remain) : '등장 가능'}`).join(' · ')}</div>`;
    } else if (tab === 'mob') {
      body = PLAYABLE.map((z) => {
        const list = [...z.mobs.normal, ...z.mobs.elite, z.mobs.mid, z.mobs.boss];
        if (z.mobs.field) list.push(z.mobs.field);
        return `<div class="bestiary-zone"><div class="bz-title">${z.icon} ${z.name}</div>` + list.map((m) => {
          const key = `${z.id}:${m.key}`;
          const ov = b.mobs[key] || {};
          return `<div class="row-line">
            <span><b>${m.name}</b><br><span class="hint">${m.boss === 'field' ? '지역 필드보스' : m.boss === 'boss' ? '에픽보스' : m.boss === 'mid' ? '중간보스' : m.elite ? '정예' : '일반'}</span></span>
            <span class="num-row">
              <label>HP<input class="num" type="number" data-mob="${key}" data-f="hp" value="${ov.hp}"></label>
              <label>공격<input class="num" type="number" data-mob="${key}" data-f="atk" value="${ov.atk}"></label>
              <label>XP<input class="num" type="number" data-mob="${key}" data-f="xp" value="${ov.xp}"></label>
              <label>골드<input class="num" type="number" data-mob="${key}" data-f="gold" value="${ov.gold}"></label>
            </span>
          </div>`;
        }).join('') + '</div>';
      }).join('');
    }
    const html = `${head('⚙️ 설정', '밸런스 · 데이터 편집', 'settings')}
      ${tabs}
      <div class="settings-body">${body}</div>
      ${tab !== 'account' ? `<div class="hint" style="margin:10px 0 8px">바꾼 수치는 저장하면 바로 적용됩니다.</div>
      <div style="display:flex;gap:8px"><button class="btn gold" data-save style="flex:1">저장</button>
      <button class="btn ghost" data-reset-balance style="flex:0 0 auto">기본값</button></div>` : ''}`;
    const sheet = openSheet(html, 'settings-sheet hub-sheet');
    sheet.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => ui.openSettings(el.dataset.tab)));
    const adminOff = sheet.querySelector('[data-admin-off]');
    if (adminOff) adminOff.addEventListener('click', () => { game.disableAdmin(); ui.toast('관리자 인증을 해제했어요.', ''); ui.openBag(); });
    sheet.querySelectorAll('[data-boss-reset]').forEach((el) => el.addEventListener('click', () => {
      game.state.bossTimers = game.state.bossTimers || {};
      for (const k of Object.keys(game.state.bossTimers)) if (k.startsWith(game.zone.id + ':' + el.dataset.bossReset)) delete game.state.bossTimers[k];
      game.save(); game.flushSave();
      ui.toast('보스 타이머를 초기화했어요. 구역을 다시 들어오면 등장합니다.', 'good');
      ui.openSettings('account');
    }));
    const saveBtn = sheet.querySelector('[data-save]');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const next = JSON.parse(JSON.stringify(game.balance));
      sheet.querySelectorAll('input[data-w]').forEach((inp) => { const v = parseFloat(inp.value); if (isFinite(v) && v > 0) next.weapons[inp.dataset.w][inp.dataset.f] = v; });
      sheet.querySelectorAll('input[data-item]').forEach((inp) => { const v = parseFloat(inp.value); if (isFinite(v) && v >= 0) next.items[inp.dataset.item][parseInt(inp.dataset.i, 10)] = v; });
      sheet.querySelectorAll('input[data-mob]').forEach((inp) => { const v = parseFloat(inp.value); if (isFinite(v) && v >= 0) next.mobs[inp.dataset.mob][inp.dataset.f] = v; });
      game.setBalance(next);
      ui.toast('설정을 저장했어요. 전투에 바로 적용됩니다.', 'good');
      ui.openSettings(tab);
    });
    const resetBtn = sheet.querySelector('[data-reset-balance]');
    if (resetBtn) resetBtn.addEventListener('click', () => { game.resetBalance(); ui.toast('밸런스를 기본값으로 되돌렸어요.', 'good'); ui.openSettings(tab); });
  };

  // ---------- 도움말 ----------
  ui.openHelp = function () {
    const html = `${head('❔ 도움말', '스쿨히어로 1단계', 'help')}
      <ul class="help-list">
        <li><b>이동</b> · <b>화면 아무 곳이나 터치해 드래그</b>(플로팅 조이스틱) 또는 PC의 <b>WASD / 방향키</b></li>
        <li><b>공격</b> · 움직이기만 하면 무기 사거리 안의 적을 자동으로 공격해요</li>
        <li><b>미니맵</b> · 오른쪽 위 원을 누르면 서울 판타지 전체 지도가 열려요</li>
        <li><b>메달</b> · 미니맵 아래 메달을 누르면 구역 정보와 보스 리스폰 시간이 보여요</li>
        <li><b>숨겨진 상자</b> · 바위·나무·폐허 뒤를 살펴보세요. 가까이 가면 <b>📦 열기</b> 버튼이 떠요</li>
        <li><b>가방</b> · 장비·합성·진화·특성·스탯·스킬·동료를 이 창에서 모두 관리해요</li>
        <li><b>보스</b> · 중간보스 4시간 · 에픽보스 6시간 · 지역 필드보스 24시간마다 다시 등장해요</li>
        <li><b>퀘스트</b> · 오른쪽 📜 퀘스트에서 구역 이야기를 확인하세요</li>
      </ul>
      <button class="btn ghost" data-reset style="width:100%;margin-top:12px">처음부터 다시 시작</button>`;
    const sheet = openSheet(html, 'hub-sheet');
    sheet.querySelector('[data-reset]').addEventListener('click', async () => {
      await game.resetSave();
      location.reload();
    });
  };

  // ---------- 퀘스트 ----------
  ui.openQuests = function () {
    const rows = PLAYABLE.map((z) => {
      const q = game.questInfo(z.id);
      const step = q.def.steps[Math.min(q.step, q.def.steps.length - 1)];
      const status = q.done ? '완료' : !q.accepted ? '시작 전' : `${Math.min(q.progress, step.n)}/${step.n}`;
      const unlocked = game.state.unlocked.includes(z.id);
      return `<div class="quest-card ${q.done ? 'done' : ''}">
        <div class="qn"><span>${z.icon} ${z.name}</span><span style="color:${q.done ? '#7dffb0' : '#a9b6cf'}">${status}</span></div>
        <div class="qs">${q.done ? '모든 퀘스트를 마쳤어요.' : `${q.accepted ? '' : 'NPC에게 말을 걸어 시작 · '}${step.text}`}</div>
        <div class="qbar"><i style="width:${q.done ? 100 : (Math.min(q.progress, step.n) / step.n) * 100}%"></i></div>
        ${!unlocked ? `<div class="hint" style="margin-top:6px">🔒 이전 구역 보스를 처치하면 열립니다</div>` : ''}
      </div>`;
    }).join('');
    openSheet(`${head('📜 퀘스트', '구역별 이야기')}${rows}`, 'hub-sheet');
  };

  ui.openQuestDialog = function (q) {
    if (!q) return;
    const step = q.def.steps[q.step];
    const done = q.done || !step;
    let body = '';
    if (done) {
      body = `<div class="say">이 구역의 이야기는 여기까지야. 자네의 활약 덕분이지!<br><b>다음 구역</b>에서도 부탁하네.</div>`;
    } else if (!q.accepted) {
      body = `<div class="say">“${q.def.npc}”<br>${q.def.title} — 자네가 와서 다행이야.<br><b>${step.text}</b>부터 시작해 보겠나?</div>`;
    } else {
      const ready = q.progress >= step.n;
      body = `<div class="say">“${q.def.npc}”<br>진행 상황: <b>${Math.min(q.progress, step.n)} / ${step.n}</b><br>${ready ? '훌륭하네! 보상을 받게나.' : `${step.text}를 계속 부탁하네.`}</div>`;
    }
    const rewardText = step && step.reward ? Object.entries(step.reward).map(([k, v]) => {
      if (k === 'gold') return `골드 +${v}`;
      if (k === 'xp') return `경험치 +${v}`;
      if (k === 'pt') return `스탯 +${v}`;
      if (k === 'soul') return `${(SOUL_KINDS[v] || { name: '영혼' }).name} +${step.reward.soulN || 1}`;
      if (k === 'item') return `${GRADES[v] ? GRADES[v].name : '장비'} 등급 장비`;
      if (k === 'charm') return CHARMS[v] ? CHARMS[v].name : '부적';
      if (k === 'unlock') return '새 구역 해금';
      return '';
    }).filter(Boolean).join(' · ') : '';
    const ready = !done && q.accepted && q.progress >= step.n;
    const btn = done ? '' : !q.accepted
      ? `<button class="btn gold" data-claim style="width:100%;margin-top:10px">퀘스트 수락</button>`
      : `<button class="btn ${ready ? 'gold' : 'ghost'}" data-claim style="width:100%;margin-top:10px" ${ready ? '' : 'disabled'}>${ready ? '🎁 보상 받기' : '진행 중'}</button>`;
    const html = `<div class="zone-info">
      ${head('📜 ' + q.def.title, q.def.npc)}
      <div class="dlg"><div class="npc">${game.zone.npc.icon}</div>${body}</div>
      ${rewardText ? `<div class="reward-preview">보상: ${rewardText}</div>` : ''}
      <div class="claim-result" id="claimResult"></div>
      ${btn}
      <button class="btn ghost" data-close style="width:100%;margin-top:8px">닫기</button>
    </div>`;
    const sheet = openSheet(html, 'zone-info');
    sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    const c = sheet.querySelector('[data-claim]');
    if (c) c.addEventListener('click', () => {
      const r = game.claimQuest();
      if (!r.ok) { ui.toast(r.msg, 'bad'); return; }
      ui.toast(r.msg, 'gold');
      const res = sheet.querySelector('#claimResult');
      if (res) {
        res.innerHTML = r.accept
          ? `<div class="claim-ok">퀘스트를 수락했어요. ${r.msg.replace('퀘스트 수락! ', '')}</div>`
          : `<div class="claim-ok">✔ ${r.msg}${r.next ? `<br><span class="hint">다음 목표: ${r.next}</span>` : '<br><span class="hint">이 구역의 퀘스트를 모두 마쳤어요!</span>'}</div>`;
      }
      // 시트 갱신
      setTimeout(() => ui.openQuestDialog(game.questInfo(game.zone.id)), 700);
    });
  };

  // ---------- 월드맵 ----------
  // ---------- 전체 지도 (실제 맵 지형) ----------
  // ---------- 월드맵 (서울 지도 전체 · 잠긴 구역은 구름) ----------
  ui.openWorldMap = function () {
    const s = game.state;
    const zone = game.zone;
    buildMapBase();
    const M = 920;
    const cv = document.createElement('canvas');
    cv.width = M; cv.height = M;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(mapBase, 0, 0, M, M);
    const X = (wx) => (wx + 144) / 288 * M;
    const Y = (wz) => (wz + 144) / 288 * M;
    // 잠긴 구역은 구름으로 가린다
    for (const zn of ZONES) {
      if (!zn.map) continue;
      if (s.unlocked.includes(zn.id)) continue;
      const x0 = X(zn.map.cx - 48), y0 = Y(zn.map.cz - 48), w = M / 3, h = M / 3;
      g.fillStyle = 'rgba(220,228,240,.82)';
      g.fillRect(x0, y0, w, h);
      g.fillStyle = '#5a6a8a';
      g.font = 'bold 44px sans-serif'; g.textAlign = 'center';
      g.fillText('☁️', x0 + w / 2, y0 + h / 2 - 6);
      g.font = 'bold 20px sans-serif';
      g.fillText('방벽', x0 + w / 2, y0 + h / 2 + 26);
      g.strokeStyle = 'rgba(90,106,138,.6)'; g.lineWidth = 3;
      g.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
    }
    // 방벽 게이트 표시 (잠긴 구역 입구)
    for (const zn of ZONES) {
      if (!zn.gate || s.unlocked.includes(zn.id)) continue;
      g.fillStyle = '#b46cff';
      g.beginPath(); g.arc(X(zn.gate.x), Y(zn.gate.z), 9, 0, 6.283); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    // 상자(보물)
    for (const c of game.world.chests) {
      if (c.opened) continue;
      g.beginPath(); g.arc(X(c.x), Y(c.z), 5.5, 0, 6.283); g.fillStyle = '#ffd257'; g.fill();
      g.strokeStyle = '#7a5a12'; g.lineWidth = 1.5; g.stroke();
    }
    // NPC (구역마다)
    for (const zn of ZONES) {
      if (!zn.map) continue;
      const np = game.world.npcs[zn.id];
      if (!np) continue;
      g.beginPath(); g.arc(X(np.position.x), Y(np.position.z), 6, 0, 6.283); g.fillStyle = '#4fd2ff'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    // 몬스터 (현재 구역)
    for (const en of game.enemies) {
      if (!en.alive || en.isBoss || en.isField || en.isMid || en.elite) continue;
      g.beginPath(); g.arc(X(en.x), Y(en.z), 3.4, 0, 6.283); g.fillStyle = '#ff5a5a'; g.fill();
    }
    // 보스 묘비 (타이머 표시)
    for (const gr of game.graves) {
      g.beginPath(); g.arc(X(gr.x), Y(gr.z), 7, 0, 6.283); g.fillStyle = '#0e1420'; g.fill();
      g.strokeStyle = '#ffd257'; g.lineWidth = 2; g.stroke();
    }
    // 지구 귀환 게이트
    g.beginPath(); g.arc(X(EARTH_GATE.x), Y(EARTH_GATE.z), 10, 0, 6.283);
    g.fillStyle = s.earthGateOpen ? '#ffd257' : '#8a97a8'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    // 내 캐릭터
    g.beginPath(); g.arc(X(game.player.x), Y(game.player.z), 8.5, 0, 6.283); g.fillStyle = '#3ddc54'; g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
    // 현재 구역 테두리
    if (zone.map) {
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.strokeRect(X(zone.map.cx - 48) + 2, Y(zone.map.cz - 48) + 2, M / 3 - 4, M / 3 - 4);
    }
    const img = cv.toDataURL('image/png');
    const zoneCards = ZONES.map((z) => {
      const unlocked = s.unlocked.includes(z.id);
      const current = zone.id === z.id;
      return `<button class="wm-zone ${current ? 'on' : ''} ${unlocked ? '' : 'fog'}" data-zone="${z.id}">
        ${unlocked ? '' : '<span class="wm-cloud">☁️</span>'}
        <span class="wm-ic">${z.icon}</span>
        <span class="wm-nm">${z.short}</span>
        <span class="wm-st">${current ? '지금 여기' : unlocked ? '🚀 탭하여 이동' : '미탐험 · 방벽'}</span>
      </button>`;
    }).join('');
    const html = `${head('🗺️ 서울 판타지 지도', `${zone.icon} ${zone.name}`)}
      <div class="wm-wrap">
        <img class="wm-map" src="${img}" alt="서울 판타지 지도">
        <div class="wm-legend">
          <span><i class="lg me"></i>내 위치</span>
          <span><i class="lg mon"></i>몬스터</span>
          <span><i class="lg boss"></i>보스</span>
          <span><i class="lg chest"></i>보물</span>
          <span><i class="lg npc"></i>NPC</span>
          <span>🚪 방벽</span>
        </div>
      </div>
      <div class="wm-zones">${zoneCards}</div>
      <div class="hint" style="margin-top:10px">하나로 연결된 서울 지도예요. 해금된 구역 카드를 누르면 그 구역 스폰으로 이동해요. 지금 있는 구역 카드를 누르면 구역 정보를 볼 수 있어요. 잠긴 구역은 이전 구역 보스를 처치하면 방벽이 열려요.</div>`;
    const sheet = openSheet(html, 'hub-sheet');
    sheet.querySelectorAll('[data-zone]').forEach((el) => el.addEventListener('click', () => {
      const id = parseInt(el.dataset.zone, 10);
      const z = ZONES.find((x) => x.id === id);
      if (!z) return;
      if (!game.state.unlocked.includes(id)) {
        const prev = ZONES.find((p) => p.id === id - 1);
        ui.toast(prev ? `${prev.name} 보스를 먼저 처치해야 방벽이 열려요.` : '아직 갈 수 없는 구역이에요.', 'bad');
        return;
      }
      closeModal();
      // 지금 있는 구역은 정보만 보고, 해금된 다른 구역은 그 자리로 이동한다
      if (id === game.zone.id) { ui.openZoneInfo(id); return; }
      game.setDistrict(id, { spawn: true });
      if (game.ui) game.ui.toast(`${z.name}(으)로 이동했어요.`, 'good');
    }));
  };

  // ---------- 구역 정보 (보스 리스폰 표시) ----------
  ui.openZoneInfo = function (zoneId = game.zone.id) {
    const z = ZONES.find((x) => x.id === zoneId) || game.zone;
    const m = game.medalInfo(z.id);
    const chest = game.chestInfo(z.id);
    const ak = ARMOR_KINDS[z.threat];
    const zel = (z.mobs.normal[0] || {}).elem;
    const ze = ELEMENTS[zel];
    const zw = ze ? Object.entries(ELEM_BEATS).filter(([, arr]) => arr.includes(zel)).map(([k]) => `${(ELEMENTS[k] || {}).icon} ${(ELEMENTS[k] || {}).name}`).join(' · ') : '';
    const bosses = game.bossStatus(z.id);
    const bossRows = bosses.map((b) => `<div class="boss-row">
      <span class="br-l"><b>${b.name}</b><small>${b.label} · Lv.${b.lv}</small></span>
      <span class="br-r ${b.remain > 0 ? 'dead' : 'ready'}">${b.remain > 0 ? `⏳ ${game.fmtRemain(b.remain)}` : '● 등장 가능'}</span>
    </div>`).join('');
    const html = `<div class="zone-info">
      <div class="zi-icon">${z.icon}</div>
      <div class="zi-title">${z.name} - ${z.id}</div>
      <div class="zi-resist"><span class="ic">${ak.icon}</span><span class="tx">저항 · ${ak.resist}</span></div>
      <div class="zi-row">
        <div class="zi-box" style="flex:0 0 84px"><div class="zi-medal"><span>${m.tier}</span></div><div class="zi-medal-title">메달 ${m.tier}등급</div></div>
        <div class="zi-box"><div class="big">${chest.found}/${chest.total}</div><div class="lbl">숨겨진 상자</div></div>
      </div>
      ${ze ? `<div class="zi-elem">이 구역 속성 <b style="color:${ze.color}">${ze.icon} ${ze.name}</b> · 약점 ${zw}</div>` : ''}
      <div class="sec-title" style="text-align:left">보스 리스폰</div>
      <div class="boss-list">${bossRows}</div>
      <div class="hint" style="margin-top:8px">처치 ${m.kills}마리${m.next ? ` · 다음 등급까지 ${m.next - m.kills}마리` : ' · 최고 등급'}</div>
      <div class="hint" style="margin-top:4px">일반 몹은 경험치와 일반 영혼, 정예는 녹색 장비, 중간보스는 파란 영혼+파란 장비, 에픽보스는 보라 영혼+보라 장비, 지역 보스는 특수 영혼+노란 장비를 줍니다.</div>
      <button class="btn ghost" data-bestiary style="width:100%;margin-top:10px">몹 도감 보기</button>
      <div class="zi-tap">탭하여 닫기</div>
    </div>`;
    const sheet = openSheet(html, 'zone-info');
    sheet.querySelector('.zi-tap').addEventListener('click', closeModal);
    sheet.querySelector('[data-bestiary]').addEventListener('click', () => ui.openBestiary(zoneId));
    if (!ui._bossT) ui._bossT = setInterval(() => {
      if (!document.querySelector('.boss-list')) { clearInterval(ui._bossT); ui._bossT = null; return; }
      const rows = sheet.querySelectorAll('.br-r');
      const list = game.bossStatus(z.id);
      rows.forEach((el, i) => {
        const b = list[i];
        if (!b) return;
        el.className = 'br-r ' + (b.remain > 0 ? 'dead' : 'ready');
        el.textContent = b.remain > 0 ? `⏳ ${game.fmtRemain(b.remain)}` : '● 등장 가능';
      });
    }, 1000);
  };

  // ---------- 업적 도감 ----------
  ui.openAch = function () {
    const list = game.achList();
    const done = list.filter((a) => a.progress >= a.goal).length;
    const cards = list.map((a) => {
      const r = Math.min(1, a.progress / a.goal);
      const claimable = a.progress >= a.goal && !a.claimed;
      return `<div class="ach-card ${a.progress >= a.goal ? 'done' : ''}">
        <div class="ach-ico">${a.progress >= a.goal ? a.icon : '🔒'}</div>
        <div class="ach-body">
          <div class="ach-name">${a.name}<span class="ach-rw">${a.reward}G · 스탯+1</span></div>
          <div class="hint">${a.desc}</div>
          <div class="ach-bar"><i style="width:${r * 100}%"></i></div>
          <div class="ach-num">${Math.min(a.progress, a.goal)} / ${a.goal}</div>
        </div>
        ${claimable ? `<button class="btn gold ach-claim" data-ach="${a.id}">받기</button>` : a.claimed ? '<span class="ach-ok">완료</span>' : ''}
      </div>`;
    }).join('');
    const sheet = openSheet(`${head('🏆 업적', `${done}/${list.length} 달성`, 'ach')}
      <div class="hint" style="margin-bottom:10px">모험 기록이 자동으로 쌓입니다. 달성한 업적마다 골드와 스탯 포인트 +1을 받을 수 있어요.</div>
      <div class="ach-list">${cards}</div>`, 'hub-sheet');
    sheet.querySelectorAll('[data-ach]').forEach((el) => el.addEventListener('click', () => {
      const r = game.claimAch(el.dataset.ach);
      if (r.ok) { ui.toast(`업적 보상 +${r.reward}G · 스탯 포인트 +1`, 'gold'); ui.openAch(); }
    }));
  };

  // ---------- 몹 도감 ----------
  ui.openBestiary = function (zoneId = game.zone.id) {
    const cards = PLAYABLE.map((z) => {
      const list = [
        ['일반', z.mobs.normal], ['정예', z.mobs.elite], ['중간보스', [z.mobs.mid]], ['에픽보스', [z.mobs.boss]],
      ];
      if (z.mobs.field) list.push(['지역 필드보스', [z.mobs.field]]);
      for (const ex of (z.extraBosses || [])) list.push([ex.label || '추가 보스', ex.defs || [ex.def]]);
      const rows = list.map(([label, arr]) => arr.map((m) => {
        const st = game.mobStats(z.id, m);
        const lv = game.scaledMobLevel ? game.scaledMobLevel(m, z) : z.scale.lvl + (m.boss === 'field' ? 5 : m.boss === 'boss' ? 3 : m.boss === 'mid' ? 1 : m.elite ? 1 : 0);
        const drop = m.boss === 'field' ? '지역 보스 영혼 · 노란 장비' : m.boss === 'boss' ? '에픽 영혼 · 보라 장비' : m.boss === 'mid' ? '중간보스 영혼 · 파란 장비' : m.elite ? '정예 영혼 · 녹색 장비' : '일반 영혼';
        const el = ELEMENTS[m.elem] || null;
        const weak = el ? Object.entries(ELEM_BEATS).filter(([, arr]) => arr.includes(m.elem)).map(([k]) => (ELEMENTS[k] || {}).icon || k).join(' ') : '';
        return `<div class="mob-row ${z.id === zoneId ? 'on' : ''}">
          <div class="mr-name"><b>${m.name}</b><span>${label} · Lv.${lv}${el ? ` · <em class="elem" style="color:${el.color}">${el.icon} ${el.name}</em>` : ''}</span>${weak ? `<span class="weak">약점 ${weak}</span>` : ''}</div>
          <div class="mr-stats"><span>❤ ${Math.round(st.hp)}</span><span>⚔ ${Math.round(st.atk)}</span><span class="xp">+${Math.round(st.xp)} XP</span><span class="gold">+${Math.round(st.gold)} G</span></div>
          <div class="mr-drop">${drop}</div>
        </div>`;
      }).join('')).join('');
      return `<div class="bestiary-zone"><div class="bz-title">${z.icon} ${z.name}</div>${rows}</div>`;
    }).join('');
    openSheet(`${head('📖 몹 도감', '처치 보상과 드롭')}
      <div class="hint" style="margin-bottom:10px">등급별 보상이 다릅니다. 일반 몹은 경험치와 일반 영혼만 줍니다.</div>${cards}`, 'hub-sheet');
  };

  // ---------- 입력 ----------
  $('minimapFrame').addEventListener('click', () => { if (game.tutorialHook) game.tutorialHook('view'); ui.openWorldMap(); });
  $('medalBlock').addEventListener('click', () => ui.openZoneInfo());
  document.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const k = el.dataset.open;
      if (k === 'bag') { if (game.tutorialHook) game.tutorialHook('view'); ui.openBag(); }
      else if (k === 'merge' || k === 'souls' || k === 'stats' || k === 'companions' || k === 'skills' || k === 'settings' || k === 'help') ui.openHub(k);
      else if (k === 'quests') ui.openQuests();
    });
  });
  $('talkBtn').addEventListener('click', () => ui.openQuestDialog(game.questInfo(game.zone.id)));
  $('leaveBtn').addEventListener('click', () => {
    if (game.player && game.player.alive) game.returnToLastDistrict();
  });

  // ---------- 플로팅 조이스틱 ----------
  // 좌하단 고정 조이스틱 대신, 화면을 터치하면 그 지점에 반투명 조이스틱이 떠서 방향을 보여 준다.
  const floatJoy = document.createElement('div');
  floatJoy.className = 'float-joy hidden';
  floatJoy.innerHTML = '<div class="fj-ring"></div><div class="fj-knob"></div>';
  document.getElementById('hud').appendChild(floatJoy);
  const fjKnob = floatJoy.querySelector('.fj-knob');
  const FJ_MAX = 58;
  let fjId = null, fjOX = 0, fjOY = 0;
  function uiTargetBlocked(t) {
    if (!t || !t.closest) return false;
    return !!t.closest('button, a, input, textarea, select, .player-card, .map-col, .bottom-bar, .side-menu, .quest-track, .talk-btn, .chest-open-btn, .boss-bar, .toasts, .zone-banner, #modalRoot, .float-joy, .enemy-tag, .grave-tag, .dmg');
  }
  function fjStart(ev) {
    if (fjId !== null) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (uiTargetBlocked(ev.target)) return;
    if (ui.modal) return;
    fjId = ev.pointerId;
    fjOX = ev.clientX; fjOY = ev.clientY;
    floatJoy.style.left = fjOX + 'px';
    floatJoy.style.top = fjOY + 'px';
    floatJoy.classList.remove('hidden');
    fjKnob.style.transform = 'translate(0,0)';
    game.input.mx = 0; game.input.mz = 0;
    window.addEventListener('pointermove', fjMove, { passive: false });
    window.addEventListener('pointerup', fjEnd);
    window.addEventListener('pointercancel', fjEnd);
  }
  function fjMove(ev) {
    if (fjId !== ev.pointerId) return;
    ev.preventDefault();
    let dx = ev.clientX - fjOX, dy = ev.clientY - fjOY;
    const len = Math.hypot(dx, dy);
    if (len > FJ_MAX) { dx = (dx / len) * FJ_MAX; dy = (dy / len) * FJ_MAX; }
    fjKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    game.input.mx = dx / FJ_MAX;
    game.input.mz = dy / FJ_MAX;
  }
  function fjEnd(ev) {
    if (ev.pointerId !== fjId) return;
    fjId = null;
    floatJoy.classList.add('hidden');
    fjKnob.style.transform = 'translate(0,0)';
    game.input.mx = 0; game.input.mz = 0;
    window.removeEventListener('pointermove', fjMove);
    window.removeEventListener('pointerup', fjEnd);
    window.removeEventListener('pointercancel', fjEnd);
  }
  document.addEventListener('pointerdown', fjStart, { passive: true });

  // 키보드
  const keyMap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright' };
  window.addEventListener('keydown', (ev) => {
    if (ev.target && /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
    const k = keyMap[ev.code];
    if (k) { game.input.keys.add(k); ev.preventDefault(); }
    if (ev.code === 'Escape') closeModal();
  });
  window.addEventListener('keyup', (ev) => {
    const k = keyMap[ev.code];
    if (k) { game.input.keys.delete(k); ev.preventDefault(); }
  });
  window.addEventListener('blur', () => game.input.keys.clear());

  // 초기화
  renderAvatar();
  ui.renderSkillBar();
  renderHud();

  return ui;
}
