// 스쿨히어로 — 화면 UI
import {
  PLAYABLE, ZONES, GRADES, WEAPONS, ARMOR_KINDS, ACCESSORY_KINDS, TALENTS, SOUL_KINDS,
  COMPANION_CLASSES, CHARMS, SECRET_TOTAL, MEDAL_TIERS, MEDAL_STEP, OPT_LABEL, MOB_REWARD,
} from './data.js';
import { CloudAdapter } from './save.js';

const $ = (id) => document.getElementById(id);
const pct = (a, b) => `${Math.max(0, Math.min(100, b ? (a / b) * 100 : 0)).toFixed(1)}%`;
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

const MAP_POS = {
  1: { x: 30, y: 63 }, 2: { x: 15, y: 50 }, 3: { x: 47, y: 31 }, 4: { x: 50, y: 53 },
  5: { x: 74, y: 44 }, 6: { x: 20, y: 82 }, 7: { x: 74, y: 74 }, 8: { x: 82, y: 16 }, 9: { x: 52, y: 9 },
};

export function createUI(game, THREE) {
  const ui = {
    dirty: true,
    modal: null,
    tags: new Map(),
    bubbles: [],
    hudT: 0,
    mapT: 0,
  };
  const worldLayer = $('worldLayer');

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
    setTimeout(() => el.remove(), 2900);
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

  // ---------- 몬스터 이름/체력 ----------
  ui.clearTags = function () {
    for (const [, el] of ui.tags) el.remove();
    ui.tags.clear();
  };

  ui.attachEnemyTag = function (e) {
    const el = document.createElement('div');
    el.className = 'enemy-tag' + (e.isBoss ? ' boss' : e.elite ? ' elite' : '');
    el.innerHTML = `<div class="et-name">Lv.${e.level} ${e.def.name}</div><div class="et-bar"><i style="width:100%"></i></div>`;
    worldLayer.appendChild(el);
    ui.tags.set(e, el);
    e.tag = el;
  };

  ui.updateBossBar = function (e) {
    const bar = $('bossBar');
    if (!e) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    $('bossName').textContent = `Lv.${e.level} ${e.def.name}`;
    $('bossHpFill').style.width = pct(e.hp, e.maxHp);
  };

  // ---------- 보관함 말풍선 ----------
  ui.showChestBubble = function (found, total) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.innerHTML = `<span class="badge">!</span>상자를 <b>${found}/${total}</b>개\n찾았습니다`;
    worldLayer.appendChild(el);
    ui.bubbles.push({ el, t: 3.4 });
  };

  // ---------- HUD ----------
  ui.markDirty = function (full) { ui.dirty = true; if (full) ui._rerender = true; };

  function accList() {
    return ['necklace', 'ring', 'earring'].map((k) => game.state.equip[k]).filter(Boolean);
  }
  function equipSlotHtml(kind, label) {
    if (kind === 'accessory') {
      const list = accList();
      if (!list.length) return `<div class="slot empty" data-slot="accessory">악세서리<br>없음</div>`;
      const best = list.slice().sort((a, b) => b.grade - a.grade)[0];
      const g = GRADES[best.grade];
      return `<div class="slot" data-slot="accessory" style="border-color:${g.color};box-shadow:0 0 10px ${g.glow}, inset 0 0 12px rgba(0,0,0,.5)"><span>${ACCESSORY_KINDS[best.fam].icon}</span><span class="slot-key">${list.length}/3</span></div>`;
    }
    const it = game.state.equip[kind];
    if (!it) return `<div class="slot empty" data-slot="${kind}">${label}<br>없음</div>`;
    const g = GRADES[it.grade];
    const icon = kind === 'weapon' ? WEAPONS[it.fam].icon : kind === 'armor' ? ARMOR_KINDS[it.fam].icon : CHARMS[it.fam] ? CHARMS[it.fam].icon : '📿';
    return `<div class="slot" data-slot="${kind}" style="border-color:${g.color};box-shadow:0 0 10px ${g.glow}, inset 0 0 12px rgba(0,0,0,.5)"><span>${icon}</span><span class="slot-key">${label}</span></div>`;
  }

  function renderEquipSlots() {
    $('equipSlots').innerHTML =
      equipSlotHtml('weapon', '무기') + equipSlotHtml('armor', '방어구') +
      equipSlotHtml('accessory', '악세서리') + equipSlotHtml('charm', '부적');
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
    box.innerHTML = `<div class="q-title">📜 ${q.def.title}</div>
      <div class="q-step">${q.progress >= step.n ? '✔ ' : ''}${step.text}</div>
      <div class="q-prog">${Math.min(q.progress, step.n)} / ${step.n}${q.progress >= step.n ? ' · NPC에게 보상 받기' : ''}</div>`;
  }

  function renderHud() {
    if (!game.zone || !game.player) return;
    const s = game.state;
    const d = game.derived();
    const p = game.player;
    $('pcName').textContent = '스쿨히어로';
    $('pcZone').textContent = game.zone.name;
    $('lvChip').textContent = 'Lv.' + s.level;
    $('hpFill').style.width = pct(p.hp, d.maxHp);
    $('hpText').textContent = `${Math.max(0, Math.round(p.hp))} / ${d.maxHp}`;
    const mp = p.mp !== undefined ? p.mp : d.maxMp;
    $('mpFill').style.width = pct(mp, d.maxMp);
    $('mpText').textContent = `${Math.round(mp)} / ${d.maxMp}`;
    $('xpFill').style.width = pct(s.xp, game.xpNeed(s.level));
    $('goldText').textContent = fmt(s.gold);
    $('soulText').textContent = fmt((s.souls.gray || 0) + (s.souls.green || 0) + (s.souls.blue || 0) + (s.souls.purple || 0));
    const m = game.medalInfo(game.zone.id);
    $('medalNum').textContent = m.tier;
    $('medalGaugeFill').style.height = Math.round(m.ratio * 100) + '%';
    renderQuestTrack();
  }

  // ---------- 미니맵 ----------
  function drawMinimap() {
    if (!game.zone || !game.player || !game.world) return;
    const c = $('minimap');
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = W / 2 - 5;
    const scale = R / 46;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    // 배경
    const theme = game.zone.theme;
    ctx.fillStyle = '#' + theme.ground.toString(16).padStart(6, '0');
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#000';
    for (let i = 0; i < 12; i++) {
      const x = ((i * 97) % W), y = ((i * 173) % H);
      ctx.beginPath(); ctx.arc(x, y, 22, 0, 6.283); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 보스 제단
    const bz = game.zone.boss;
    const bd = Math.hypot(bz.x - game.player.x, bz.z - game.player.z);
    if (bd < 46) {
      ctx.beginPath();
      ctx.arc(cx + (bz.x - game.player.x) * scale, cy + (bz.z - game.player.z) * scale, 7, 0, 6.283);
      ctx.fillStyle = 'rgba(255,90,90,.35)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,140,.8)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // 포탈
    const portal = game.world.portal.position;
    ctx.beginPath(); ctx.arc(cx + (portal.x - game.player.x) * scale, cy + (portal.z - game.player.z) * scale, 4, 0, 6.283);
    ctx.fillStyle = '#6fe0ff'; ctx.fill();
    // NPC
    const npc = game.world.npc.position;
    const np = game.questInfo(game.zone.id);
    if (np && !np.done) {
      ctx.save();
      ctx.translate(cx + (npc.x - game.player.x) * scale, cy + (npc.z - game.player.z) * scale);
      ctx.rotate(Math.PI / 4);
      const pulse = 6 + Math.sin(game.time * 4) * 1.5;
      ctx.fillStyle = '#57e08d'; ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      ctx.restore();
    }
    // 몬스터
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const dx = (e.x - game.player.x) * scale, dz = (e.z - game.player.z) * scale;
      if (Math.hypot(dx, dz) > R) continue;
      ctx.beginPath();
      if (e.isBoss) {
        ctx.fillStyle = '#c98bff'; ctx.arc(cx + dx, cy + dz, 6, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (e.elite) {
        ctx.fillStyle = '#ffb347'; ctx.arc(cx + dx, cy + dz, 4, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = '#ff5566'; ctx.arc(cx + dx, cy + dz, 3, 0, 6.283); ctx.fill();
      }
    }
    // 플레이어
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-game.player.facing + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#2f6bff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    // 테두리광
    const grd = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,.32)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ---------- 프레임 업데이트 ----------
  ui.update = function (dt) {
    ui.hudT += dt;
    if (ui.hudT > 0.12) {
      ui.hudT = 0;
      if (ui._rerender) { ui._rerender = false; renderEquipSlots(); }
      renderHud();
    }
    ui.mapT += dt;
    if (ui.mapT > 0.07) { ui.mapT = 0; drawMinimap(); }

    // 몬스터 태그
    for (const [e, el] of ui.tags) {
      if (!e.alive) {
        if (e.deadT > 0.5 || !e.mesh.parent) { el.remove(); ui.tags.delete(e); }
        continue;
      }
      const far = Math.hypot(e.x - game.player.x, e.z - game.player.z) > 17;
      const p = project(e.x, e.headY + 0.35, e.z);
      if (far || !p.visible || p.x < -80 || p.x > window.innerWidth + 80 || p.y < -40 || p.y > window.innerHeight + 60) {
        el.style.display = 'none';
      } else {
        el.style.display = 'block';
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-100%)`;
        const fill = el.querySelector('.et-bar i');
        if (fill) fill.style.width = pct(e.hp, e.maxHp);
      }
    }
    // 말풍선
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
    }
  };

  ui.updateTalkButtons = function () {
    const t = $('talkBtn'), l = $('leaveBtn');
    t.classList.toggle('hidden', !game.nearNpc);
    l.classList.toggle('hidden', !game.nearPortal);
    if (game.nearNpc) {
      const q = game.questInfo(game.zone.id);
      const step = q && !q.done ? q.def.steps[q.step] : null;
      t.textContent = q && q.accepted && step && q.progress >= step.n ? '보상 받기' : '말 걸기';
    }
  };

  ui.showDeath = function (on) { $('deathVeil').classList.toggle('show', on); };

  ui.onZoneEnter = function (zone) {
    renderEquipSlots();
    renderHud();
    const banner = $('zoneBanner');
    banner.innerHTML = `<div class="zb-name">${zone.icon} ${zone.name}</div><div class="zb-sub">${zone.sub || ''}</div>`;
    banner.classList.add('show');
    clearTimeout(ui._bannerT);
    ui._bannerT = setTimeout(() => banner.classList.remove('show'), 2600);
    $('bossBar').classList.add('hidden');
    ui.updateTalkButtons();
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

  // ---------- 모달 공통 ----------
  const root = $('modalRoot');
  function closeModal() {
    root.innerHTML = '';
    ui.modal = null;
  }
  ui.closeAll = closeModal;
  function openSheet(html, cls = '') {
    root.innerHTML = `<div class="overlay"><div class="sheet ${cls}" role="dialog">${html}</div></div>`;
    ui.modal = true;
    root.querySelector('.overlay').addEventListener('click', (ev) => {
      if (ev.target === ev.currentTarget) closeModal();
    });
    const x = root.querySelector('[data-close]');
    if (x) x.addEventListener('click', closeModal);
    return root.querySelector('.sheet');
  }
  function head(title, sub = '') {
    return `<div class="sheet-head"><div class="sheet-title">${title}${sub ? `<small>${sub}</small>` : ''}</div><button class="close-x" data-close>✕</button></div>`;
  }

  // ---------- 가방/장비 ----------
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
      return `공격력 +${st.atk} · ${w.name}(${w.cls === 'melee' ? '근접' : w.cls === 'ranged' ? '원거리' : '마법'}) · ${optText(it) || w.style}`;
    }
    if (it.kind === 'armor') return `방어력 +${st.def} · ${ARMOR_KINDS[it.fam].name}(${ARMOR_KINDS[it.fam].resist} 저항) · ${optText(it)}`;
    if (it.kind === 'accessory') return `${ACCESSORY_KINDS[it.fam].name} · ${optText(it)}`;
    if (it.kind === 'charm') return CHARMS[it.fam] ? CHARMS[it.fam].desc : '';
    return '';
  }

  ui.openBag = function (tab = 'all') {
    const s = game.state;
    const d = game.derived();
    const entries = Object.entries(s.bag)
      .map(([key, n]) => {
        const [kind, fam, g] = key.split(':');
        return { key, kind, fam, grade: parseInt(g, 10), n };
      })
      .sort((a, b) => b.grade - a.grade || a.kind.localeCompare(b.kind));

    const slotLabels = { weapon: '무기', armor: '방어구', necklace: '목걸이', ring: '반지', earring: '귀걸이', charm: '부적' };
    const equipRows = ['weapon', 'armor', 'necklace', 'ring', 'earring', 'charm'].map((k) => {
      const it = s.equip[k];
      if (!it) return `<div class="row-line"><span class="hint">${slotLabels[k]} · 비어 있음</span></div>`;
      const g = GRADES[it.grade];
      return `<div class="row-line"><span><b style="color:${g.color}">${it.kind === 'charm' ? CHARMS[it.fam].name : game.itemName(it.kind, it.fam, it.grade)}</b><br><span class="hint">${equipStatText(it)}</span></span><button class="btn ghost" data-unequip="${k}">해제</button></div>`;
    }).join('');

    const grid = entries.length ? entries.map((it) => {
      const g = GRADES[it.grade];
      return `<div class="item" data-item="${it.key}" style="--g:${g.color};--gs:${g.glow}">
        <div class="ico">${itemIcon(it.kind, it.fam)}</div>
        <div class="nm">${game.itemName(it.kind, it.fam, it.grade)}</div>
        <div class="sub">${g.name}</div>
        <span class="cnt">×${it.n}</span>
      </div>`;
    }).join('') : `<div class="hint">아직 장비가 없어요. 몬스터를 처치해 보세요!</div>`;

    const html = `${head('🎒 장비와 가방', `공격력 ${d.attack} · 방어력 ${d.defense}`)}
      <div class="tab-row"><button class="tab on">장비</button><button class="tab" data-jump="merge">합성</button></div>
      <div style="margin-bottom:10px">${equipRows}</div>
      <div class="hint" style="margin:4px 2px 9px">가방 · 아이템을 누르면 바로 장착됩니다. 같은 등급 3개를 모으면 합성으로 승급할 수 있어요.</div>
      <div class="item-grid">${grid}</div>`;
    const sheet = openSheet(html);
    sheet.querySelector('[data-jump="merge"]').addEventListener('click', () => ui.openMerge());
    sheet.querySelectorAll('[data-item]').forEach((el) => {
      el.addEventListener('click', () => {
        const [kind, fam, g] = el.dataset.item.split(':');
        const grade = parseInt(g, 10);
        if (kind === 'charm') return;
        game.equipItem(kind, fam, grade);
        ui.toast(`장착: ${game.itemName(kind, fam, grade)}`, grade >= 3 ? 'gold' : 'good');
        ui.openBag();
      });
    });
    sheet.querySelectorAll('[data-unequip]').forEach((el) => {
      el.addEventListener('click', () => { game.unequip(el.dataset.unequip); ui.openBag(); });
    });
  };

  // ---------- 합성 ----------
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

    const s = game.state;
    const html = `${head('⚗️ 장비 합성', '같은 등급·종류 3개 → 상위 등급 1개')}
      <div class="hint" style="margin-bottom:10px">흰 일반 → 초 고급 → 파 희귀 → 보 영웅 → 노 전설 → 빨 신화</div>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn gold" data-merge-all style="flex:1">한 번에 모두 합성</button>
      </div>`;
    const sheet = openSheet(html);
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
    const html = `${head('💪 스탯', `레벨 ${s.level}`)}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="hint">남은 스탯 포인트</span><span class="points-chip">${s.statPts} P</span>
      </div>
      ${rows}
      <div style="margin-top:12px">
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
    const sheet = openSheet(html);
    sheet.querySelectorAll('[data-stat]').forEach((el) => el.addEventListener('click', () => {
      if (game.spendPoint(el.dataset.stat)) { ui.openStats(); }
    }));
  };

  // ---------- 영혼 특성보드 ----------
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
      const can = !on && t.req.every((r) => s.talents.includes(r)) && (s.souls[t.cost.kind] || 0) >= t.cost.n;
      return `<div class="node ${on ? 'on' : ''}" data-talent="${t.id}" style="left:${t.x}%;top:${t.y}%">
        <div class="orb">${t.icon}</div>
        <div class="nl">${t.name}</div>
        <div class="cost">${on ? '완료' : `${SOUL_KINDS[t.cost.kind].name.split(' ')[0]} ${t.cost.n}`}</div>
      </div>`;
    }).join('');

    const html = `${head('🌳 영혼 특성보드', '영혼으로 능력을 해금하세요')}
      <div style="display:flex;gap:6px;margin-bottom:12px">${soulRow}</div>
      <div class="board"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${svgLines}</svg>${nodes}</div>
      <div class="hint" id="talentHint">노드를 누르면 영혼을 사용해 해금합니다. 앞의 노드를 먼저 열어야 다음 노드가 열려요.</div>`;
    const sheet = openSheet(html);
    sheet.querySelectorAll('[data-talent]').forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.talent;
      const t = TALENTS.find((x) => x.id === id);
      if (game.state.talents.includes(id)) return;
      if (t.req.some((r) => !game.state.talents.includes(r))) { ui.toast('앞의 특성을 먼저 해금해 주세요.', 'bad'); return; }
      if ((game.state.souls[t.cost.kind] || 0) < t.cost.n) { ui.toast('영혼이 부족해요.', 'bad'); return; }
      if (game.learnTalent(id)) { ui.toast(`${t.name} 해금!`, 'good'); ui.openSouls(); }
    }));
  };

  // ---------- 동료 ----------
  ui.openCompanions = function () {
    const s = game.state;
    const cards = s.companions.map((c) => {
      const cls = COMPANION_CLASSES[c.cls];
      const g = GRADES[c.grade];
      const inParty = s.party.includes(c.id);
      return `<div class="comp-card ${inParty ? 'in-party' : ''}" style="--g:${g.color};--gs:${g.glow}">
        <div class="av" style="border-color:${g.color}">${cls.icon}</div>
        <div class="info">
          <div class="nm">${c.name} <span style="font-size:9px;color:${g.color}">${g.name}</span></div>
          <div class="cls">${cls.role} · ${cls.name}</div>
          <div class="lv">Lv.${c.lv || 1} · 공격 ${Math.round(cls.atk * (1 + ((c.lv || 1) - 1) * 0.22) * (1 + (c.grade || 0) * 0.16))}</div>
        </div>
        <button class="btn ${inParty ? 'ghost' : ''}" data-party="${c.id}">${inParty ? '대기' : '동행'}</button>
      </div>`;
    }).join('') || `<div class="hint" style="margin:8px 0 16px">아직 동료가 없어요. 아래 뽑기로 동료를 만나 보세요!</div>`;

    const html = `${head('🐾 동료', `동행 ${s.party.length}/3`)}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span class="hint">동료 뽑기 · 120골드</span>
        <button class="btn gold" data-pull>뽑기 ✨</button>
      </div>
      ${cards}
      <div class="hint" style="margin-top:10px">탱커·힐러·근접딜러·마법딜러 중 최대 3명까지 함께 싸워요. 동료는 경험치를 나눠 받아 함께 성장합니다.</div>`;
    const sheet = openSheet(html);
    sheet.querySelector('[data-pull]').addEventListener('click', () => {
      const r = game.pullCompanion();
      if (!r.ok) { ui.toast(r.msg, 'bad'); return; }
      ui.toast(`${r.cls.icon} ${r.companion.name} (${r.cls.role}, ${GRADES[r.grade].name}) 등장!`, 'gold');
      ui.openCompanions();
    });
    sheet.querySelectorAll('[data-party]').forEach((el) => el.addEventListener('click', () => {
      const r = game.toggleParty(el.dataset.party);
      if (!r.ok) ui.toast(r.msg, 'bad');
      ui.openCompanions();
    }));
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
    const html = `${head('📜 퀘스트', '구역별 이야기')}${rows}`;
    openSheet(html);
  };

  ui.openQuestDialog = function (q) {
    if (!q) return;
    const step = q.def.steps[q.step];
    let body = '';
    if (q.done) {
      body = `<div class="say">이 구역의 이야기는 여기까지야. 자네의 활약 덕분이지!<br><b>다음 구역</b>에서도 부탁하네.</div>`;
    } else if (!q.accepted) {
      body = `<div class="say">“${q.def.npc}”<br>${q.def.title} — 자네가 와서 다행이야.<br><b>${step.text}</b>부터 시작해 보겠나?</div>`;
    } else {
      const ready = q.progress >= step.n;
      body = `<div class="say">“${q.def.npc}”<br>진행 상황: <b>${Math.min(q.progress, step.n)} / ${step.n}</b><br>${ready ? '훌륭하네! 보상을 받게나.' : `${step.text}를 계속 부탁하네.`}</div>`;
    }
    const btn = q.done ? '' : !q.accepted ? `<button class="btn gold" data-claim style="width:100%;margin-top:10px">퀘스트 수락</button>`
      : `<button class="btn ${q.progress >= step.n ? 'gold' : ''}" data-claim style="width:100%;margin-top:10px" ${q.progress >= step.n ? '' : 'disabled'}>${q.progress >= step.n ? '보상 받기' : '진행 중'}</button>`;
    const html = `<div class="zone-info" style="text-align:left">
      ${head('📜 ' + q.def.title, q.def.npc)}
      <div class="dlg"><div class="npc">${game.zone.npc.icon}</div>${body}</div>
      ${btn}
      <button class="btn ghost" data-close style="width:100%;margin-top:8px">닫기</button>
    </div>`;
    const sheet = openSheet(html, 'zone-info');
    const c = sheet.querySelector('[data-claim]');
    if (c) c.addEventListener('click', () => {
      const r = game.claimQuest();
      ui.toast(r.msg, r.ok ? 'good' : 'bad');
      if (r.ok) { ui.openQuestDialog(game.questInfo(game.zone.id)); }
    });
    sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
  };

  // ---------- 전체 지도 ----------
  ui.openWorldMap = function () {
    const s = game.state;
    const nodes = ZONES.map((z) => {
      const pos = MAP_POS[z.id];
      const unlocked = !z.comingSoon && s.unlocked.includes(z.id);
      const current = game.zone.id === z.id;
      const locked = !unlocked || z.comingSoon;
      const fill = z.comingSoon ? '#2a3348' : unlocked ? '#3d6fe0' : '#252c3d';
      const stroke = current ? '#ffd257' : locked ? '#4a5468' : '#9fd8ff';
      return `<g class="zm-node ${locked ? 'locked' : ''}" data-zone="${z.id}" transform="translate(${pos.x},${pos.y})">
        <circle r="${current ? 6.2 : 5}" fill="${fill}" stroke="${stroke}" stroke-width="${current ? 1.4 : 0.9}" opacity="${locked ? 0.75 : 1}"/>
        ${current ? `<circle r="8.4" fill="none" stroke="#ffd257" stroke-width="0.6" opacity="0.8"/>` : ''}
        <text class="zm-label" x="0" y="1.7" text-anchor="middle" font-size="${current ? 4.4 : 4}">${z.icon}</text>
        <text class="zm-small" x="0" y="${current ? 12 : 10.5}" text-anchor="middle" font-size="3.6">${z.short}${locked && !z.comingSoon ? ' 🔒' : ''}</text>
      </g>`;
    }).join('');

    const html = `${head('🗺️ 서울 판타지 월드맵', `해금 ${s.unlocked.filter((u) => u <= 4).length}/4 구역`)}
      <div class="worldmap">
        <svg viewBox="0 0 100 100">
          <defs>
            <linearGradient id="landG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#203a2c"/><stop offset="100%" stop-color="#17281f"/>
            </linearGradient>
            <linearGradient id="riverG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#2a6fa8"/><stop offset="100%" stop-color="#3f9bd0"/>
            </linearGradient>
          </defs>
          <rect width="100" height="100" fill="url(#landG)"/>
          <path d="M0,58 C18,54 30,60 46,56 C62,52 74,58 100,50 L100,60 C74,68 62,62 46,66 C30,70 18,64 0,68 Z" fill="url(#riverG)" opacity="0.9"/>
          <path d="M0,58 C18,54 30,60 46,56 C62,52 74,58 100,50" fill="none" stroke="#8fd0f0" stroke-width="0.5" opacity="0.5"/>
          <text x="50" y="63" text-anchor="middle" font-size="3.2" fill="#bfe8ff" opacity="0.8">한 강</text>
          <text x="8" y="95" font-size="3" fill="#7f8ba0">서울 판타지 · 1단계</text>
          ${nodes}
        </svg>
      </div>
      <div class="hint" style="margin-top:10px">해금한 구역을 누르면 바로 이동합니다. 잠긴 구역은 이전 구역 보스를 처치해야 열려요.</div>`;
    const sheet = openSheet(html);
    sheet.querySelectorAll('[data-zone]').forEach((el) => el.addEventListener('click', () => {
      const id = parseInt(el.dataset.zone, 10);
      const z = ZONES.find((x) => x.id === id);
      if (z.comingSoon) { ui.toast('2단계 업데이트에서 만나요!', 'bad'); return; }
      if (!game.state.unlocked.includes(id)) { ui.toast('이전 구역 보스를 먼저 처치해야 해요.', 'bad'); return; }
      if (id === game.zone.id) { closeModal(); return; }
      if (id === 4 && !game.state.equip.charm) { ui.toast('수중호흡 아티팩트가 필요해요!', 'bad'); ui.openZoneInfo(4); return; }
      if (game.enterZone(id)) { closeModal(); }
    }));
  };

  // ---------- 구역 정보 ----------
  ui.openZoneInfo = function (zoneId = game.zone.id) {
    const z = PLAYABLE.find((x) => x.id === zoneId) || game.zone;
    const m = game.medalInfo(z.id);
    const chest = game.chestInfo(z.id);
    const ak = ARMOR_KINDS[z.threat];
    const html = `<div class="zone-info">
      <div class="zi-icon">${z.icon}</div>
      <div class="zi-title">${z.name} - ${z.id}</div>
      <div class="zi-resist"><span class="ic">${ak.icon}</span><span class="tx">저항 · ${ak.resist}</span></div>
      <div class="zi-row">
        <div class="zi-box" style="flex:0 0 84px">
          <div class="zi-medal"><span>${m.tier}</span></div>
          <div class="zi-medal-title">메달 ${m.tier}등급</div>
        </div>
        <div class="zi-box">
          <div class="big">${chest.found}/${chest.total}</div>
          <div class="lbl">심의 숨겨진 상자</div>
        </div>
      </div>
      <div class="zi-stats-title">메달 능력치</div>
      <div class="zi-stats">
        <div class="zi-stat"><div class="v">⚔ ${Math.round(m.bonus * 100)}% / ${Math.round(MEDAL_TIERS.length * MEDAL_STEP * 100)}%</div><div class="n">구역에서의 피해</div></div>
        <div class="zi-stat"><div class="v">🛡 ${Math.round(m.bonus * 100)}% / ${Math.round(MEDAL_TIERS.length * MEDAL_STEP * 100)}%</div><div class="n">구역에서의 방어</div></div>
      </div>
      <div class="hint" style="margin-top:8px">처치 ${m.kills}마리${m.next ? ` · 다음 등급까지 ${m.next - m.kills}마리` : ' · 최고 등급'}</div>
      <div class="hint" style="margin-top:4px">중간보스는 방어구, 구역 보스는 악세서리를 드롭합니다.</div>
      <button class="btn ghost" data-bestiary style="width:100%;margin-top:10px">몹 도감 보기</button>
      <div class="zi-tap">탭하여 닫기</div>
    </div>`;
    const sheet = openSheet(html, 'zone-info');
    sheet.querySelector('.zi-tap').addEventListener('click', closeModal);
    sheet.querySelector('[data-bestiary]').addEventListener('click', () => ui.openBestiary(zoneId));
  };


  // ---------- 몹 도감 ----------
  ui.openBestiary = function (zoneId = game.zone.id) {
    const zone = PLAYABLE.find((z) => z.id === zoneId) || game.zone;
    const cards = PLAYABLE.map((z) => {
      const groups = [
        ['일반', z.mobs.normal],
        ['정예', z.mobs.elite],
        ['중간보스', [z.mobs.mid]],
        ['구역 보스', [z.mobs.boss]],
      ];
      const rows = groups.map(([label, list]) => list.map((m) => {
        const st = game.mobStats(z.id, m);
        const lv = z.scale.lvl + (m.boss === 'boss' ? 3 : m.boss === 'mid' ? 1 : m.elite ? 1 : 0);
        return `<div class="mob-row ${z.id === zone.id ? 'on' : ''}">
          <div class="mr-name"><b>${m.name}</b><span>${label} · Lv.${lv}</span></div>
          <div class="mr-stats">
            <span>❤ ${Math.round(st.hp)}</span><span>⚔ ${Math.round(st.atk)}</span>
            <span class="xp">+${Math.round(st.xp)} XP</span><span class="gold">+${Math.round(st.gold)} G</span>
          </div>
          <div class="mr-drop">${SOUL_KINDS[m.soul || 'gray'].name} 드롭${m.boss === 'mid' ? ' · 방어구' : m.boss === 'boss' ? ' · 악세서리' : ''}</div>
        </div>`;
      }).join('')).join('');
      return `<div class="bestiary-zone"><div class="bz-title">${z.icon} ${z.name}</div>${rows}</div>`;
    }).join('');
    const html = `${head('📖 몹 도감', '잡으면 오르는 보상')}
      <div class="hint" style="margin-bottom:10px">몬스터를 처치하면 경험치·골드·영혼과 함께 중간보스는 방어구, 보스는 악세서리를 드롭합니다.</div>
      ${cards}`;
    openSheet(html);
  };

  // ---------- 설정 · 밸런스 편집 ----------
  ui.openSettings = function (tab = 'weapon') {
    const b = game.balance;
    const tabs = `<div class="tab-row">
      <button class="tab ${tab === 'weapon' ? 'on' : ''}" data-tab="weapon">무기</button>
      <button class="tab ${tab === 'item' ? 'on' : ''}" data-tab="item">아이템</button>
      <button class="tab ${tab === 'mob' ? 'on' : ''}" data-tab="mob">몬스터</button>
      <button class="tab" data-tab="bestiary">몹 도감</button>
      <button class="tab" data-tab="account">계정</button>
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
        `<div class="hint" style="margin-top:8px">등급이 높을수록 붙는 복합 스탯 개수가 늘어납니다 (일반 1개 → 신화 4개). 악세서리는 목걸이·반지·귀걸이별로 다른 옵션이 붙습니다.</div>`;
    } else if (tab === 'account') {
      const acc = game.store || {};
      const where = acc.mode === 'guest' ? '이 기기 (게스트)' : (acc.hasCloud ? '계정 저장 (여러 기기)' : '이 기기');
      const last = acc.status && acc.status.savedAt ? new Date(acc.status.savedAt).toLocaleString('ko-KR') : '아직 없음';
      const ver = acc.status && acc.status.version ? 'v' + acc.status.version : '-';
      body = `<div class="account-row"><span>아이디</span><b>${acc.userId || '게스트'}</b></div>
        <div class="account-row"><span>저장 위치</span><b>${where}</b></div>
        <div class="account-row"><span>최근 저장</span><b>${last}</b></div>
        <div class="account-row"><span>저장 버전</span><b>${ver}</b></div>
        <div class="hint" style="margin-top:8px">다른 기기와 이어서 하려면 가족 연결 코드를 넣어 주세요.</div>
        <div class="connect-row"><input id="connectCode" placeholder="연결 코드"><button class="btn" data-connect>연결</button></div>
        <button class="btn ghost" data-logout style="width:100%;margin-top:12px">로그아웃</button>`;
    } else if (tab === 'mob') {
      body = PLAYABLE.map((z) => {
        const list = [...z.mobs.normal, ...z.mobs.elite, z.mobs.mid, z.mobs.boss];
        return `<div class="bestiary-zone"><div class="bz-title">${z.icon} ${z.name}</div>` + list.map((m) => {
          const key = `${z.id}:${m.key}`;
          const ov = b.mobs[key] || {};
          return `<div class="row-line">
            <span><b>${m.name}</b><br><span class="hint">${m.boss === 'boss' ? '구역 보스' : m.boss === 'mid' ? '중간보스' : m.elite ? '정예' : '일반'}</span></span>
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

    const html = `${head('⚙️ 설정', '밸런스 · 데이터 편집')}
      ${tabs}
      <div class="settings-body">${body}</div>
      <div class="hint" style="margin:10px 0 8px">바꾼 수치는 저장하면 바로 적용되고, 이 기기에 보관됩니다.</div>
      <div style="display:flex;gap:8px">
        <button class="btn gold" data-save style="flex:1">저장</button>
        <button class="btn ghost" data-reset-balance style="flex:0 0 auto">기본값</button>
      </div>`;
    const sheet = openSheet(html, 'settings-sheet');
    sheet.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.tab === 'bestiary') ui.openBestiary();
      else ui.openSettings(el.dataset.tab);
    }));
    const connectBtn = sheet.querySelector('[data-connect]');
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        const code = sheet.querySelector('#connectCode').value.trim();
        if (code.length < 10) { ui.toast('연결 코드를 확인해 주세요.', 'bad'); return; }
        try { localStorage.setItem('sh.token', code); } catch (e) { /* 무시 */ }
        if (game.store) { game.store.cloud = new CloudAdapter(code); await game.flushSave(); }
        ui.toast('연결했어요. 이제 계정에 저장됩니다.', 'good');
        ui.openSettings('account');
      });
    }
    const logoutBtn = sheet.querySelector('[data-logout]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try { localStorage.removeItem('sh.session'); } catch (e) { /* 무시 */ }
        if (game.store) await game.flushSave();
        location.reload();
      });
    }
    sheet.querySelector('[data-save]').addEventListener('click', () => {
      const next = JSON.parse(JSON.stringify(game.balance));
      sheet.querySelectorAll('input[data-w]').forEach((inp) => {
        const v = parseFloat(inp.value);
        if (isFinite(v) && v > 0) next.weapons[inp.dataset.w][inp.dataset.f] = v;
      });
      sheet.querySelectorAll('input[data-item]').forEach((inp) => {
        const v = parseFloat(inp.value);
        if (isFinite(v) && v >= 0) next.items[inp.dataset.item][parseInt(inp.dataset.i, 10)] = v;
      });
      sheet.querySelectorAll('input[data-mob]').forEach((inp) => {
        const v = parseFloat(inp.value);
        if (isFinite(v) && v >= 0) next.mobs[inp.dataset.mob][inp.dataset.f] = v;
      });
      game.setBalance(next);
      ui.toast('설정을 저장했어요. 전투에 바로 적용됩니다.', 'good');
      ui.openSettings(tab);
    });
    sheet.querySelector('[data-reset-balance]').addEventListener('click', () => {
      game.resetBalance();
      ui.toast('밸런스를 기본값으로 되돌렸어요.', 'good');
      ui.openSettings(tab);
    });
  };

  // ---------- 도움말 ----------
  ui.openHelp = function () {
    const html = `${head('❔ 도움말', '스쿨히어로 1단계')}
      <ul class="help-list">
        <li><b>이동</b> · 화면 아래 조이스틱 또는 PC의 <b>WASD / 방향키</b></li>
        <li><b>공격</b> · 움직이기만 하면 무기 사거리 안의 적을 자동으로 공격해요 (검·창·둔기·지팡이)</li>
        <li><b>미니맵</b> · 오른쪽 위 원을 누르면 서울 판타지 전체 지도가 열려요</li>
        <li><b>메달</b> · 미니맵 아래 메달을 누르면 구역 정보가 열려요. 몬스터를 많이 처치할수록 그 구역에서 피해·방어가 강해집니다 (최대 +70%)</li>
        <li><b>숨겨진 상자</b> · 바위·나무·폐허 뒤 그늘을 살펴보세요. 가까이 가면 저절로 열립니다</li>
        <li><b>성장</b> · 가방에서 장비 장착, 같은 등급 3개 합성, 영혼으로 특성 해금, 동료는 최대 3명</li>
        <li><b>퀘스트</b> · 구역 NPC에게 말을 걸면 이야기가 시작됩니다</li>
      </ul>
      <button class="btn ghost" data-reset style="width:100%;margin-top:12px">처음부터 다시 시작</button>`;
    const sheet = openSheet(html);
    sheet.querySelector('[data-reset]').addEventListener('click', () => {
      game.resetSave();
      location.reload();
    });
  };

  // ---------- 입력 ----------
  $('minimapFrame').addEventListener('click', () => ui.openWorldMap());
  $('medalBlock').addEventListener('click', () => ui.openZoneInfo());
  document.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => {
      const k = el.dataset.open;
      if (k === 'bag') ui.openBag();
      else if (k === 'merge') ui.openMerge();
      else if (k === 'souls') ui.openSouls();
      else if (k === 'stats') ui.openStats();
      else if (k === 'companions') ui.openCompanions();
      else if (k === 'quests') ui.openQuests();
      else if (k === 'help') ui.openHelp();
      else if (k === 'settings') ui.openSettings();
    });
  });
  $('talkBtn').addEventListener('click', () => {
    ui.openQuestDialog(game.questInfo(game.zone.id));
  });
  $('leaveBtn').addEventListener('click', () => ui.openWorldMap());

  // 조이스틱
  const joystick = $('joystick');
  const knob = $('joyKnob');
  let joyId = null;
  function joyStart(ev) {
    joyId = ev.pointerId;
    joystick.setPointerCapture(ev.pointerId);
    joyMove(ev);
  }
  function joyMove(ev) {
    if (joyId !== ev.pointerId) return;
    const r = joystick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = ev.clientX - cx, dy = ev.clientY - cy;
    const max = r.width * 0.36;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    game.input.mx = dx / max;
    game.input.mz = dy / max;
  }
  function joyEnd(ev) {
    if (joyId !== ev.pointerId) return;
    joyId = null;
    knob.style.transform = 'translate(0,0)';
    game.input.mx = 0; game.input.mz = 0;
  }
  joystick.addEventListener('pointerdown', joyStart);
  joystick.addEventListener('pointermove', joyMove);
  joystick.addEventListener('pointerup', joyEnd);
  joystick.addEventListener('pointercancel', joyEnd);

  // 키보드
  const keyMap = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright' };
  window.addEventListener('keydown', (ev) => {
    const k = keyMap[ev.code];
    if (k) { game.input.keys.add(k); ev.preventDefault(); }
    if (ev.code === 'Escape') closeModal();
  });
  window.addEventListener('keyup', (ev) => {
    const k = keyMap[ev.code];
    if (k) { game.input.keys.delete(k); ev.preventDefault(); }
  });
  window.addEventListener('blur', () => game.input.keys.clear());

  $('equipSlots').addEventListener('click', (ev) => {
    const slot = ev.target.closest('[data-slot]');
    if (!slot) return;
    if (slot.dataset.slot === 'charm' && game.state.equip.charm) {
      ui.toast(CHARMS[game.state.equip.charm.fam].name + ' · ' + CHARMS[game.state.equip.charm.fam].desc, 'good');
      return;
    }
    ui.openBag();
  });

  // 초기화
  renderEquipSlots();
  renderHud();

  return ui;
}
