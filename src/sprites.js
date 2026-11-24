// 스쿨히어로 — 2.5D 도트 스프라이트 · 초상화 생성
// 캐릭터/몬스터를 캔버스 픽셀아트로 그려 NearestFilter 텍스처로 쓴다.
import { GRADES, AVATAR_MAP, COSTUME_MAP } from './data.js';

const TAU = Math.PI * 2;
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function rgbOf(c) {
  if (typeof c === 'string') {
    const s = c.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function shade(c, t) {
  const [r, g, b] = rgbOf(c);
  const f = (v) => clamp255(t >= 0 ? v + (255 - v) * t : v * (1 + t));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function mixColor(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return `rgb(${clamp255(A[0] + (B[0] - A[0]) * t)},${clamp255(A[1] + (B[1] - A[1]) * t)},${clamp255(A[2] + (B[2] - A[2]) * t)})`;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

// 픽셀아트 가장자리를 또렷하게: 반투명 픽셀을 잘라낸다
function crisp(c, threshold = 96) {
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < threshold ? 0 : 255;
  g.putImageData(img, 0, 0);
}

function texture(THREE, canvas, opts = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(opts.repeat, 1); }
  return t;
}

// ---------- 픽셀 그리기 도우미 ----------
const el = (g, cx, cy, rx, ry, color) => {
  g.fillStyle = color; g.beginPath(); g.ellipse(cx, cy, Math.max(0.4, rx), Math.max(0.4, ry), 0, 0, TAU); g.fill();
};
const rct = (g, x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
const tri = (g, x1, y1, x2, y2, x3, y3, color) => {
  g.fillStyle = color; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill();
};
const ln = (g, x1, y1, x2, y2, color, w = 2) => {
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
};
// 외곽선 있는 덩어리
const blob = (g, cx, cy, rx, ry, C, D, o = 1.4) => { el(g, cx, cy, rx + o, ry + o, D); el(g, cx, cy, rx, ry, C); };

function eyes(g, cx, cy, gap, r, pupil = '#141a26', white = '#ffffff') {
  for (const s of [-1, 1]) {
    el(g, cx + s * gap, cy, r, r * 1.12, white);
    el(g, cx + s * gap + s * 0.3, cy + 0.5, r * 0.5, r * 0.62, pupil);
    rct(g, cx + s * gap - r * 0.5, cy - r * 0.55, 1.1, 1.1, '#ffffff');
  }
}
function angryBrows(g, cx, cy, gap, color = '#1a1520') {
  ln(g, cx - gap - 3, cy - 1, cx - gap + 2.5, cy + 1.6, color, 1.6);
  ln(g, cx + gap + 3, cy - 1, cx + gap - 2.5, cy + 1.6, color, 1.6);
}

// =======================================================================
// 몬스터 픽셀아트 (48x48, 발밑 y=46)
// =======================================================================
const MONSTER_ART = {
  slime(g, C, D, L) {
    // 키세스 초콜릿(물방울) 모양 슬라임
    const cx = 24, top = 5, bot = 45, w = 17;
    g.fillStyle = D;
    g.beginPath();
    g.moveTo(cx, top - 1);
    g.bezierCurveTo(cx + 2, top + 9, cx + w + 1.6, 30, cx + w + 1.6, bot - 6);
    g.quadraticCurveTo(cx + w + 1.6, bot + 1, cx, bot + 1);
    g.quadraticCurveTo(cx - w - 1.6, bot + 1, cx - w - 1.6, bot - 6);
    g.bezierCurveTo(cx - w - 1.6, 30, cx - 2, top + 9, cx, top - 1);
    g.fill();
    g.fillStyle = C;
    g.beginPath();
    g.moveTo(cx, top);
    g.bezierCurveTo(cx + 1.6, top + 9, cx + w, 30, cx + w, bot - 6);
    g.quadraticCurveTo(cx + w, bot, cx, bot);
    g.quadraticCurveTo(cx - w, bot, cx - w, bot - 6);
    g.bezierCurveTo(cx - w, 30, cx - 1.6, top + 9, cx, top);
    g.fill();
    // 광택
    el(g, cx - 7.5, 27, 3.4, 5.2, shade(C, 0.55));
    el(g, cx - 8.5, 25, 1.6, 2.4, '#ffffff');
    el(g, cx + 10, 38, 1.6, 2.4, shade(C, 0.4));
    // 얼굴
    eyes(g, cx, 34, 6.4, 3.4, '#101a24');
    g.strokeStyle = '#101a24'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.arc(cx, 39, 3.2, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    el(g, cx - 10, 39, 2.2, 1.4, shade(C, -0.25));
    el(g, cx + 10, 39, 2.2, 1.4, shade(C, -0.25));
  },

  goblin(g, C, D, L) {
    const cx = 24;
    // 큰 귀
    tri(g, cx - 10, 16, cx - 21, 9, cx - 15, 22, D);
    tri(g, cx + 10, 16, cx + 21, 9, cx + 15, 22, D);
    tri(g, cx - 10.5, 16.5, cx - 19, 10.5, cx - 14.5, 21, C);
    tri(g, cx + 10.5, 16.5, cx + 19, 10.5, cx + 14.5, 21, C);
    tri(g, cx - 13, 15.5, cx - 17.5, 12, cx - 14, 17.5, shade(C, -0.35));
    tri(g, cx + 13, 15.5, cx + 17.5, 12, cx + 14, 17.5, shade(C, -0.35));
    // 몸 · 팔다리
    blob(g, cx, 35, 9, 9, C, D);
    ln(g, cx - 8, 33, cx - 12, 27, D, 4);
    ln(g, cx - 12, 27, cx - 12, 27, D, 4);
    ln(g, cx + 8, 33, cx + 13, 30, D, 4);
    blob(g, cx - 12.5, 26, 2.4, 2.4, C, D);
    blob(g, cx + 13.5, 30, 2.4, 2.4, C, D);
    // 가죽 허리띠
    rct(g, cx - 9, 37, 18, 3, '#6b4a2a');
    rct(g, cx - 2, 36.4, 4, 4.2, '#c9a13a');
    // 발
    blob(g, cx - 4.5, 44, 4.2, 2.6, C, D);
    blob(g, cx + 4.5, 44, 4.2, 2.6, C, D);
    // 대머리 + 머리
    blob(g, cx, 17, 12, 10.5, C, D);
    el(g, cx - 4, 11.5, 4.6, 2.6, shade(C, 0.35));
    // 눈 · 눈썹 · 입
    eyes(g, cx, 18, 5.2, 3.1, '#1a1206', '#fff7d8');
    angryBrows(g, cx, 13.5, 5.2);
    g.fillStyle = '#241018'; g.beginPath(); g.ellipse(cx, 24.5, 4.2, 2.6, 0, 0, Math.PI); g.fill();
    rct(g, cx - 2.6, 24.2, 1.6, 2.2, '#f7f2e2');
    rct(g, cx + 1.0, 24.2, 1.6, 2.2, '#f7f2e2');
    // 코
    el(g, cx, 21.6, 1.5, 1.1, shade(C, -0.3));
    // 단검
    const hx = cx + 14, hy = 30;
    ln(g, hx, hy, hx + 2.5, hy - 10, '#dfe9f7', 2.4);
    tri(g, hx + 1.6, hy - 14.5, hx + 4.4, hy - 9, hx - 0.6, hy - 9, '#f2f8ff');
    rct(g, hx - 2.6, hy - 1.4, 6, 2.6, '#8a6a3a');
  },

  orc(g, C, D, L) {
    const cx = 24;
    // 몸통
    blob(g, cx, 34, 12, 11, C, D);
    rct(g, cx - 12, 36, 24, 4, '#5a3f22');
    el(g, cx, 36, 5, 4, '#8a6a3a');
    // 어깨 가죽
    blob(g, cx - 12, 27, 5.5, 4.5, '#6b4a2a', '#3a2412');
    blob(g, cx + 12, 27, 5.5, 4.5, '#6b4a2a', '#3a2412');
    // 다리
    blob(g, cx - 5.5, 44, 4.6, 2.8, C, D);
    blob(g, cx + 5.5, 44, 4.6, 2.8, C, D);
    // 팔
    ln(g, cx - 11, 30, cx - 15, 37, D, 5);
    ln(g, cx + 11, 30, cx + 16, 34, D, 5);
    blob(g, cx - 15, 38, 2.8, 2.8, C, D);
    blob(g, cx + 16.5, 34.5, 2.8, 2.8, C, D);
    // 머리
    blob(g, cx, 17, 10.5, 10, C, D);
    // 아래턱 · 엄니
    el(g, cx, 24, 7.4, 4.2, shade(C, -0.08));
    tri(g, cx - 4.4, 25, cx - 2.6, 25, cx - 3.6, 21.4, '#fff4d8');
    tri(g, cx + 4.4, 25, cx + 2.6, 25, cx + 3.6, 21.4, '#fff4d8');
    eyes(g, cx, 16.5, 5, 2.9, '#2a0c06', '#ffe9a8');
    angryBrows(g, cx, 12, 5);
    // 코
    el(g, cx, 20.6, 2.2, 1.5, shade(C, -0.35));
    // 도끼
    const hx = cx + 17, hy = 33;
    ln(g, hx, hy + 6, hx + 3, hy - 12, '#6b4a2a', 3);
    tri(g, hx + 4, hy - 13, hx + 12, hy - 8, hx + 3, hy - 3, '#b9c4d2');
    tri(g, hx + 4, hy - 12.5, hx + 10.5, hy - 8, hx + 3.5, hy - 4, '#eef4ff');
  },

  ogre(g, C, D, L) {
    const cx = 24;
    // 몸통
    blob(g, cx, 32, 16, 14, C, D);
    el(g, cx, 34, 11, 10, shade(C, 0.12));
    // 배 · 사슬 벨트
    el(g, cx, 36, 8, 7, shade(C, -0.12));
    rct(g, cx - 15, 36, 30, 5, '#6b4a2a');
    el(g, cx, 38.5, 4, 3.4, '#c9a13a');
    // 천 조각
    tri(g, cx - 8, 41, cx + 8, 41, cx, 46, '#8a3a2a');
    // 다리
    blob(g, cx - 8, 45, 6, 2.8, C, D);
    blob(g, cx + 8, 45, 6, 2.8, C, D);
    // 팔
    ln(g, cx - 15, 26, cx - 20, 35, D, 7);
    ln(g, cx + 15, 26, cx + 20, 33, D, 7);
    blob(g, cx - 20.5, 36, 3.6, 3.2, C, D);
    blob(g, cx + 20.5, 33.5, 3.6, 3.2, C, D);
    // 머리
    blob(g, cx, 16, 11.5, 9.5, C, D);
    // 뿔
    tri(g, cx - 9, 8, cx - 14, -1, cx - 5, 5, '#f2e6c8');
    tri(g, cx + 9, 8, cx + 14, -1, cx + 5, 5, '#f2e6c8');
    tri(g, cx - 9.4, 8.4, cx - 12.8, 1.4, cx - 6, 6, '#fff8e6');
    tri(g, cx + 9.4, 8.4, cx + 12.8, 1.4, cx + 6, 6, '#fff8e6');
    // 얼굴
    eyes(g, cx, 15.5, 5.4, 2.9, '#2a1004', '#fff2c0');
    angryBrows(g, cx, 10.8, 5.4);
    el(g, cx, 20.5, 6, 3, shade(C, -0.18));
    tri(g, cx - 5, 21, cx - 2.5, 21, cx - 3.7, 17.4, '#fffaf0');
    tri(g, cx + 5, 21, cx + 2.5, 21, cx + 3.7, 17.4, '#fffaf0');
    // 철퇴
    const hx = cx + 21, hy = 34;
    ln(g, hx, hy + 6, hx + 2, hy - 14, '#7a5a38', 4);
    el(g, hx + 2.4, hy - 17, 6, 5.6, '#8d8f9a');
    el(g, hx + 2.4, hy - 17, 4.4, 4, '#b9c0cf');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      el(g, hx + 2.4 + Math.cos(a) * 6, hy - 17 + Math.sin(a) * 5.6, 1.6, 1.6, '#e6ecf7');
    }
  },

  ent(g, C, D, L) {
    const cx = 24;
    // 뿌리
    blob(g, cx - 6, 44, 3, 2.4, '#5a4228', '#2c1f12');
    blob(g, cx + 6, 44, 3, 2.4, '#5a4228', '#2c1f12');
    // 줄기 몸통
    g.fillStyle = D; g.fillRect(cx - 7, 22, 14, 24); g.fillRect(cx - 8.6, 21, 17.2, 25);
    g.fillStyle = C; g.fillRect(cx - 6, 23, 12, 23);
    // 나뭇결
    for (let i = 0; i < 4; i++) rct(g, cx - 4 + (i % 2) * 3, 27 + i * 4, 6, 1, shade(C, -0.25));
    // 가지 팔
    ln(g, cx - 7, 29, cx - 16, 23, D, 4);
    ln(g, cx - 15, 23, cx - 18, 17, D, 3);
    ln(g, cx + 7, 29, cx + 16, 24, D, 4);
    ln(g, cx + 15, 24, cx + 18, 18, D, 3);
    // 수관
    el(g, cx - 10, 12, 8, 7, '#2f6b32');
    el(g, cx + 9, 11, 8.5, 7.5, '#2f6b32');
    el(g, cx, 6, 10, 7.5, '#2f6b32');
    el(g, cx - 9, 11, 6.4, 5.4, '#4f9a3e');
    el(g, cx + 8, 10, 7, 6, '#4f9a3e');
    el(g, cx - 1, 5, 8, 6, '#5fae4a');
    el(g, cx - 6.5, 4, 3.2, 2.6, '#7ecb62');
    // 얼굴 (줄기에)
    el(g, cx - 4, 27, 2.6, 2, '#c8ffb0');
    el(g, cx + 4, 27, 2.6, 2, '#c8ffb0');
    el(g, cx - 4, 27, 1.1, 1.3, '#1b3a14');
    el(g, cx + 4, 27, 1.1, 1.3, '#1b3a14');
    rct(g, cx - 4, 32, 8, 2, '#2c1f12');
    rct(g, cx - 2, 32, 1.4, 2, '#d8e8c8');
    rct(g, cx + 1, 32, 1.4, 2, '#d8e8c8');
  },

  frog(g, C, D, L) {
    const cx = 24;
    // 몸
    blob(g, cx, 36, 17, 10, C, D);
    el(g, cx, 39, 11, 6.4, shade(C, 0.22));
    el(g, cx, 40, 8, 4.4, '#eaf7c8');
    // 눈 두덩
    el(g, cx - 8, 22, 6.4, 6, D); el(g, cx + 8, 22, 6.4, 6, D);
    el(g, cx - 8, 22, 5.2, 4.8, C); el(g, cx + 8, 22, 5.2, 4.8, C);
    el(g, cx - 8, 21.4, 3.6, 3.4, '#ffffff');
    el(g, cx + 8, 21.4, 3.6, 3.4, '#ffffff');
    el(g, cx - 8, 21.8, 1.9, 2.2, '#12161f');
    el(g, cx + 8, 21.8, 1.9, 2.2, '#12161f');
    rct(g, cx - 9, 20, 1.4, 1.4, '#ffffff');
    rct(g, cx + 7, 20, 1.4, 1.4, '#ffffff');
    // 입
    g.strokeStyle = '#21361c'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(cx, 31, 7, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    // 볼 · 등 점
    el(g, cx - 12, 34, 2.4, 1.6, shade(C, -0.2));
    el(g, cx + 12, 34, 2.4, 1.6, shade(C, -0.2));
    for (const [x, y, r] of [[-10, 29, 2.2], [10, 28, 2.4], [0, 25, 1.8], [-4, 32, 1.6], [5, 33, 1.6]]) el(g, cx + x, y, r, r * 0.8, shade(C, -0.18));
    // 다리
    tri(g, cx - 16, 40, cx - 22, 38, cx - 18, 45, D);
    tri(g, cx + 16, 40, cx + 22, 38, cx + 18, 45, D);
  },

  lizard(g, C, D, L) {
    const cx = 24;
    // 꼬리
    tri(g, cx - 6, 40, cx - 18, 47, cx - 4, 44, D);
    tri(g, cx - 7, 40, cx - 15, 45.5, cx - 5, 43.5, C);
    // 다리
    blob(g, cx - 4.6, 44, 4.4, 2.6, C, D);
    blob(g, cx + 4.6, 44, 4.4, 2.6, C, D);
    // 몸
    blob(g, cx, 34, 9.5, 9, C, D);
    el(g, cx, 35, 6, 6, shade(C, 0.16));
    // 팔
    ln(g, cx - 8, 30, cx - 13, 34, D, 4);
    ln(g, cx + 8, 30, cx + 13, 33, D, 4);
    // 머리 (도마뱀)
    blob(g, cx, 17, 10, 8.5, C, D);
    el(g, cx, 23, 7.4, 3.4, shade(C, 0.1));
    // 주둥이
    rct(g, cx - 5.4, 23, 11, 3, D);
    rct(g, cx - 4.6, 23.4, 9, 2.2, shade(C, -0.08));
    // 눈
    eyes(g, cx, 16, 5.4, 2.8, '#2a1a06', '#ffe066');
    angryBrows(g, cx, 11.6, 5.4);
    // 볏
    tri(g, cx - 8, 9, cx - 3, 1.6, cx - 1, 9, shade(C, -0.3));
    tri(g, cx, 9, cx + 4, 4, cx + 6, 9.4, shade(C, -0.3));
    // 창
    const hx = cx + 15, hy = 34;
    ln(g, hx, hy + 8, hx + 1, hy - 16, '#8a6a3a', 2.4);
    tri(g, hx + 1, hy - 21, hx + 4, hy - 15, hx - 2, hy - 15, '#dfe9f7');
  },

  wraith(g, C, D, L) {
    const cx = 24;
    // 망토 (아래로 흩어짐)
    g.fillStyle = D;
    g.beginPath();
    g.moveTo(cx, 8);
    g.bezierCurveTo(cx + 15, 12, cx + 16, 30, cx + 13, 42);
    for (let i = 0; i <= 4; i++) g.lineTo(cx + 13 - i * 6.5, 42 + (i % 2 ? 4 : -1));
    g.bezierCurveTo(cx - 16, 30, cx - 15, 12, cx, 8);
    g.fill();
    g.fillStyle = C;
    g.beginPath();
    g.moveTo(cx, 10);
    g.bezierCurveTo(cx + 12, 14, cx + 13, 30, cx + 10.5, 39);
    for (let i = 0; i <= 4; i++) g.lineTo(cx + 10.5 - i * 5.2, 39 + (i % 2 ? 3 : -1));
    g.bezierCurveTo(cx - 13, 30, cx - 12, 14, cx, 10);
    g.fill();
    // 후드
    el(g, cx, 16, 9.5, 8.4, D);
    el(g, cx, 16, 8, 7.2, shade(C, -0.15));
    el(g, cx, 18, 5.6, 5.8, '#0d0b16');
    // 눈
    el(g, cx - 2.8, 18, 1.8, 1.5, '#9bffd0');
    el(g, cx + 2.8, 18, 1.8, 1.5, '#9bffd0');
    el(g, cx - 2.8, 18, 0.8, 0.8, '#ffffff');
    el(g, cx + 2.8, 18, 0.8, 0.8, '#ffffff');
    // 손
    blob(g, cx - 11, 27, 2.4, 2.6, C, D);
    blob(g, cx + 11, 27, 2.4, 2.6, C, D);
    // 안개
    el(g, cx, 43, 12, 2, 'rgba(140,255,210,.28)');
  },

  hydra(g, C, D, L) {
    const cx = 24;
    // 몸통
    blob(g, cx, 38, 16, 8, C, D);
    el(g, cx, 38, 12, 5, shade(C, 0.12));
    // 다리
    for (const s of [-1, 1]) { blob(g, cx + s * 11, 44, 4.4, 2.4, C, D); blob(g, cx + s * 4, 45, 3.4, 2, C, D); }
    // 목 3개
    const heads = [[-9, 20], [0, 14], [9, 20]];
    heads.forEach(([dx, ty], i) => {
      ln(g, cx + dx * 0.55, 36, cx + dx, ty + 5, D, 5);
      ln(g, cx + dx * 0.55, 36, cx + dx, ty + 5, C, 3);
      blob(g, cx + dx, ty, 6.2, 5.4, C, D);
      el(g, cx + dx + 1.4, ty + 3.2, 4.4, 1.6, D);
      el(g, cx + dx - 2, ty - 1, 1.7, 1.5, '#ff6a5a');
      el(g, cx + dx + 2.4, ty - 1, 1.7, 1.5, '#ff6a5a');
      tri(g, cx + dx - 5, ty - 4, cx + dx - 2, ty - 8, cx + dx - 1, ty - 3, shade(C, -0.3));
      tri(g, cx + dx + 5, ty - 4, cx + dx + 2, ty - 8, cx + dx + 1, ty - 3, shade(C, -0.3));
    });
    // 비늘
    for (const [x, y] of [[-8, 34], [-4, 36], [4, 35], [8, 33]]) el(g, cx + x, y, 1.8, 1.4, shade(C, -0.22));
  },

  witch(g, C, D, L) {
    const cx = 24;
    // 로브
    g.fillStyle = D; g.beginPath(); g.moveTo(cx, 20); g.lineTo(cx + 13, 45); g.lineTo(cx - 13, 45); g.closePath(); g.fill();
    g.fillStyle = C; g.beginPath(); g.moveTo(cx, 22); g.lineTo(cx + 11, 44); g.lineTo(cx - 11, 44); g.closePath(); g.fill();
    el(g, cx, 44, 11, 2.2, shade(C, -0.15));
    // 소매
    ln(g, cx - 9, 28, cx - 14, 36, D, 5);
    ln(g, cx + 9, 28, cx + 14, 34, D, 5);
    blob(g, cx - 14.4, 37, 2.4, 2.2, C, D);
    blob(g, cx + 14.4, 35, 2.4, 2.2, C, D);
    // 얼굴
    blob(g, cx, 19, 6.4, 6, '#e8d8c0', '#3a2d1c');
    eyes(g, cx, 19, 2.8, 1.6, '#2a1030', '#f2f7ff');
    el(g, cx, 22.4, 2.2, 0.9, '#a83a4a');
    // 마녀 모자
    el(g, cx, 12.4, 13, 2.8, D);
    el(g, cx, 12, 12, 2.2, C);
    tri(g, cx - 6.4, 12, cx + 5.4, 12, cx + 1.6, -3, D);
    tri(g, cx - 5.2, 12, cx + 4.6, 12, cx + 1.4, 0, C);
    rct(g, cx - 5.4, 9.4, 10, 2.6, '#c9a13a');
    // 지팡이
    const hx = cx + 16, hy = 34;
    ln(g, hx, hy + 9, hx + 1, hy - 6, '#4b3550', 2.6);
    el(g, hx + 1.4, hy - 8.4, 3.2, 3.2, '#9bff6a');
    el(g, hx + 1.4, hy - 8.4, 1.6, 1.6, '#e6ffd0');
  },

  scorpion(g, C, D, L) {
    const cx = 24;
    // 다리
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      ln(g, cx + s * 6, 34 + i * 3, cx + s * (15 + i), 40 + i * 2, D, 2.4);
    }
    // 몸통
    blob(g, cx, 34, 10, 7.5, C, D);
    el(g, cx, 32, 7, 4.4, shade(C, 0.18));
    for (const [x, y] of [[-4, 33], [2, 35], [5, 31]]) el(g, cx + x, y, 1.8, 1.2, shade(C, -0.2));
    // 집게
    for (const s of [-1, 1]) {
      ln(g, cx + s * 8, 32, cx + s * 15, 26, D, 3.6);
      el(g, cx + s * 16.4, 25, 3.4, 3, C);
      el(g, cx + s * 16.4, 25, 3.4, 3, C);
      el(g, cx + s * 16.4, 25, 1.8, 1.6, D);
      tri(g, cx + s * 18.6, 22, cx + s * 20.4, 25.4, cx + s * 17.6, 25.6, shade(C, 0.2));
    }
    // 꼬리
    const tail = [[8, 28], [13, 22], [16, 14], [17, 6]];
    for (let i = 0; i < tail.length; i++) el(g, cx + tail[i][0] - 3, tail[i][1], 2.4 - i * 0.15, 2.4 - i * 0.15, i % 2 ? C : shade(C, -0.15));
    tri(g, cx + 15, 4, cx + 20, 1.6, cx + 17.6, 7.4, '#ff5a4a');
    // 눈
    el(g, cx - 4, 30.6, 1.3, 1.3, '#1a1206');
    el(g, cx + 4, 30.6, 1.3, 1.3, '#1a1206');
  },

  mummy(g, C, D, L) {
    const cx = 24;
    // 다리
    blob(g, cx - 4.4, 43.6, 3.6, 2.6, C, D);
    blob(g, cx + 4.4, 43.6, 3.6, 2.6, C, D);
    // 몸
    blob(g, cx, 32, 8, 10, C, D);
    // 팔 (앞으로 뻗음)
    ln(g, cx - 7, 28, cx - 14, 26, D, 4);
    ln(g, cx + 7, 28, cx + 14, 26, D, 4);
    blob(g, cx - 15, 26, 2.2, 2.2, C, D);
    blob(g, cx + 15, 26, 2.2, 2.2, C, D);
    // 붕대
    for (let i = 0; i < 6; i++) rct(g, cx - 8.6, 24 + i * 3, 17.2, 1.6, i % 2 ? D : shade(C, -0.12));
    // 머리
    blob(g, cx, 15, 8, 7.6, C, D);
    for (let i = 0; i < 4; i++) rct(g, cx - 8.4, 10 + i * 3.2, 16.8, 1.5, i % 2 ? D : shade(C, -0.08));
    // 눈 (빛남)
    el(g, cx - 3, 16, 2, 1.5, '#ff7a3a');
    el(g, cx + 3, 16, 2, 1.5, '#ff7a3a');
    el(g, cx - 3, 16, 0.9, 0.7, '#ffe0b0');
    el(g, cx + 3, 16, 0.9, 0.7, '#ffe0b0');
    rct(g, cx - 4, 20.4, 8, 1.2, '#3a2a18');
  },

  scarab(g, C, D, L) {
    const cx = 24;
    // 다리
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      ln(g, cx + s * 7, 30 + i * 3, cx + s * (14 + i * 0.6), 38 + i * 2.4, D, 2.2);
    }
    // 껍질
    el(g, cx, 30, 12, 12, D);
    el(g, cx, 30, 10.6, 10.6, C);
    el(g, cx - 3, 26, 5.4, 4.4, shade(C, 0.24));
    el(g, cx + 2, 33, 7.4, 5, shade(C, -0.1));
    rct(g, cx - 0.7, 20, 1.4, 20, shade(C, -0.35));
    // 머리
    blob(g, cx, 18, 5.4, 4.6, D, D);
    el(g, cx - 2, 17.4, 1.3, 1.3, '#9be0ff');
    el(g, cx + 2, 17.4, 1.3, 1.3, '#9be0ff');
    // 뿔
    tri(g, cx, 13, cx + 2.4, 5, cx - 2.4, 6.4, '#ffe08a');
    tri(g, cx, 12, cx + 1.2, 6.4, cx - 1.2, 7.4, '#fff3c0');
    // 광택
    el(g, cx - 6, 24, 2.2, 1.4, 'rgba(255,255,255,.5)');
  },

  anubis(g, C, D, L) {
    const cx = 24;
    // 다리
    blob(g, cx - 5, 44, 3.8, 2.6, C, D);
    blob(g, cx + 5, 44, 3.8, 2.6, C, D);
    // 몸 · 가슴 장식
    blob(g, cx, 33, 9, 10, C, D);
    rct(g, cx - 9, 26, 18, 4, '#c9a13a');
    rct(g, cx - 4, 26, 8, 8, '#e0c060');
    // 팔
    ln(g, cx - 8, 28, cx - 13, 34, D, 4);
    ln(g, cx + 8, 28, cx + 13, 33, D, 4);
    // 머리 (자칼)
    g.fillStyle = D; g.fillRect(cx - 5.6, 12, 11.2, 12);
    g.fillStyle = C; g.fillRect(cx - 4.6, 13, 9.2, 10.4);
    el(g, cx, 20, 4.6, 4.2, C);
    el(g, cx, 24.6, 3.6, 2.6, shade(C, -0.12));
    // 주둥이
    rct(g, cx - 2.6, 22, 5.2, 5, D);
    rct(g, cx - 2, 22.4, 4, 4, shade(C, -0.05));
    // 귀
    tri(g, cx - 6, 13, cx - 9.6, 3, cx - 2.4, 8, C);
    tri(g, cx + 6, 13, cx + 9.6, 3, cx + 2.4, 8, C);
    // 눈 · 코
    el(g, cx - 3.4, 16.4, 1.6, 1.4, '#ffd257');
    el(g, cx + 3.4, 16.4, 1.6, 1.4, '#ffd257');
    el(g, cx, 21, 1.2, 0.8, '#1a1206');
    // 헤카 (지팡이 검)
    ln(g, cx + 15, 40, cx + 15, 20, '#c9d2e0', 2.6);
    el(g, cx + 15, 41, 2.4, 1.6, '#c9a13a');
    ln(g, cx + 15, 20, cx + 18, 14, '#e8eef8', 2.6);
    ln(g, cx + 18, 14, cx + 15.4, 11.4, '#e8eef8', 2.4);
  },

  golem(g, C, D, L) {
    const cx = 24;
    // 다리
    rct(g, cx - 9, 38, 7, 8, D);
    rct(g, cx + 2, 38, 7, 8, D);
    // 몸통
    g.fillStyle = D; g.fillRect(cx - 12, 16, 24, 24);
    g.fillStyle = C; g.fillRect(cx - 10.6, 17.4, 21.2, 21.2);
    // 돌 결
    rct(g, cx - 9, 22, 8, 2, shade(C, -0.25));
    rct(g, cx + 1, 27, 7, 2, shade(C, -0.25));
    rct(g, cx - 6, 32, 10, 1.6, shade(C, -0.25));
    rct(g, cx - 8, 18, 5, 1.6, shade(C, 0.2));
    // 코어
    el(g, cx, 28, 4.6, 4.6, '#2a6a80');
    el(g, cx, 28, 3.2, 3.2, '#8fe0ff');
    el(g, cx - 1, 27, 1.4, 1.4, '#ffffff');
    // 팔
    g.fillStyle = D; g.fillRect(cx - 18, 20, 6, 18); g.fillRect(cx + 12, 20, 6, 18);
    g.fillStyle = C; g.fillRect(cx - 17, 21, 4.4, 16); g.fillRect(cx + 12.6, 21, 4.4, 16);
    // 머리
    g.fillStyle = D; g.fillRect(cx - 7, 6, 14, 11);
    g.fillStyle = C; g.fillRect(cx - 6, 7, 12, 9);
    el(g, cx - 3, 11, 1.6, 1.4, '#9fe8ff');
    el(g, cx + 3, 11, 1.6, 1.4, '#9fe8ff');
    rct(g, cx - 4, 14, 8, 1.2, shade(C, -0.3));
    // 이끼
    el(g, cx + 8, 17, 3, 2, '#5fae4a');
  },

  merfolk(g, C, D, L) {
    const cx = 24;
    // 꼬리
    tri(g, cx - 9, 40, cx + 9, 40, cx, 47, C);
    tri(g, cx + 2, 41, cx + 10, 46, cx + 4, 47, shade(C, -0.2));
    // 몸
    blob(g, cx, 33, 7.4, 8.4, C, D);
    el(g, cx, 32, 4.6, 5.4, shade(C, 0.16));
    // 지느러미 귀
    tri(g, cx - 7, 16, cx - 14, 12, cx - 9, 21, '#7fe0d0');
    tri(g, cx + 7, 16, cx + 14, 12, cx + 9, 21, '#7fe0d0');
    // 머리
    blob(g, cx, 16, 7.4, 7, C, D);
    // 볏
    tri(g, cx - 3, 9, cx, 2, cx + 3, 9, '#7fe0d0');
    eyes(g, cx, 16.4, 3.2, 1.8, '#10323c', '#c8fff4');
    el(g, cx, 20, 2, 1, shade(C, -0.3));
    rct(g, cx - 2.4, 21.6, 4.8, 1, '#0e2a34');
    // 팔 · 삼지창
    ln(g, cx - 7, 29, cx - 12, 34, D, 3.6);
    ln(g, cx + 7, 29, cx + 12, 33, D, 3.6);
    const hx = cx + 13, hy = 33;
    ln(g, hx, hy + 10, hx, hy - 12, '#d8c890', 2.4);
    for (const d of [-2.6, 0, 2.6]) {
      ln(g, hx + d, hy - 12, hx + d, hy - 17, '#e8dca8', 2);
      tri(g, hx + d, hy - 19.6, hx + d + 1.4, hy - 16.6, hx + d - 1.4, hy - 16.6, '#fff2c8');
    }
    // 비늘
    for (const [x, y] of [[-4, 36], [0, 38], [4, 36]]) el(g, cx + x, y, 1.6, 1.2, shade(C, 0.3));
  },

  naga(g, C, D, L) {
    const cx = 24;
    // 뱀 몸통 (S자)
    g.strokeStyle = D; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 2, 30); g.bezierCurveTo(cx + 9, 36, cx - 9, 40, cx + 2, 45); g.stroke();
    g.strokeStyle = C; g.lineWidth = 6.6;
    g.beginPath(); g.moveTo(cx - 2, 30); g.bezierCurveTo(cx + 9, 36, cx - 9, 40, cx + 2, 45); g.stroke();
    for (let i = 0; i < 4; i++) el(g, cx + Math.sin(i * 1.7) * 5, 33 + i * 3, 1.4, 1, shade(C, -0.2));
    // 몸통
    blob(g, cx, 27, 7.6, 7.4, C, D);
    // 후드
    tri(g, cx - 11, 20, cx - 4, 6, cx - 1, 20, D);
    tri(g, cx + 11, 20, cx + 4, 6, cx + 1, 20, D);
    tri(g, cx - 9.4, 19.6, cx - 4, 9, cx - 2, 19.6, shade(C, -0.2));
    tri(g, cx + 9.4, 19.6, cx + 4, 9, cx + 2, 19.6, shade(C, -0.2));
    // 머리
    blob(g, cx, 16, 6.4, 6, C, D);
    eyes(g, cx, 15.6, 2.8, 1.6, '#123a1a', '#9fff6a');
    rct(g, cx - 2.6, 20, 5.2, 1.2, '#123a1a');
    // 팔
    ln(g, cx - 7, 24, cx - 12, 30, D, 3.4);
    ln(g, cx + 7, 24, cx + 12, 29, D, 3.4);
    // 지팡이
    ln(g, cx + 13, 38, cx + 13, 14, '#3f4a8a', 2.4);
    el(g, cx + 13, 12, 2.6, 2.6, '#6fc8ff');
    el(g, cx + 13, 12, 1.2, 1.2, '#e6f8ff');
  },

  crab(g, C, D, L) {
    const cx = 24;
    // 다리
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ln(g, cx + s * 10, 34 + i * 3, cx + s * 18, 42 + i * 1.6, D, 2.6);
    // 등딱지
    el(g, cx, 32, 15, 10, D);
    el(g, cx, 32, 13.4, 8.6, C);
    el(g, cx - 4, 28, 6.4, 4, shade(C, 0.25));
    for (const [x, y] of [[4, 33], [8, 30], [-8, 33]]) el(g, cx + x, y, 1.8, 1.2, shade(C, -0.2));
    // 집게
    for (const s of [-1, 1]) {
      ln(g, cx + s * 11, 30, cx + s * 17, 22, D, 4);
      el(g, cx + s * 18.6, 20, 4, 3.6, C);
      el(g, cx + s * 18.6, 20, 4, 3.6, C);
      tri(g, cx + s * 21, 17.6, cx + s * 22.6, 21.6, cx + s * 19.4, 22, shade(C, 0.2));
      el(g, cx + s * 18, 20, 1.4, 1.2, D);
    }
    // 눈자루
    ln(g, cx - 4, 26, cx - 5, 20, D, 2);
    ln(g, cx + 4, 26, cx + 5, 20, D, 2);
    el(g, cx - 5, 18.6, 2.2, 2.2, '#ffffff');
    el(g, cx + 5, 18.6, 2.2, 2.2, '#ffffff');
    el(g, cx - 5, 19, 1.1, 1.2, '#12161f');
    el(g, cx + 5, 19, 1.1, 1.2, '#12161f');
    // 입
    g.strokeStyle = '#3a1410'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(cx, 34, 4, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  },

  siren(g, C, D, L) {
    const cx = 24;
    // 꼬리
    g.fillStyle = D; g.beginPath(); g.moveTo(cx - 6, 30); g.quadraticCurveTo(cx + 12, 38, cx + 2, 46); g.lineTo(cx - 8, 40); g.closePath(); g.fill();
    g.fillStyle = C; g.beginPath(); g.moveTo(cx - 5, 31); g.quadraticCurveTo(cx + 9, 38, cx + 1, 44.6); g.lineTo(cx - 6.4, 39.4); g.closePath(); g.fill();
    tri(g, cx + 1, 44, cx + 9, 47, cx + 2, 46, shade(C, 0.3));
    // 몸
    blob(g, cx, 25, 6, 6.6, '#e8d8c0', '#8a7460');
    // 지느러미 날개
    tri(g, cx - 5, 22, cx - 17, 15, cx - 8, 30, 'rgba(159,240,232,.9)');
    tri(g, cx + 5, 22, cx + 17, 15, cx + 8, 30, 'rgba(159,240,232,.9)');
    // 머리
    blob(g, cx, 15, 6.4, 6.2, '#e8d8c0', '#8a7460');
    // 머리카락 (청록)
    el(g, cx, 11.6, 7.4, 6, '#4ad0c0');
    el(g, cx - 6.4, 16, 2.4, 5, '#3aa898');
    el(g, cx + 6.4, 16, 2.4, 5, '#3aa898');
    el(g, cx - 2, 8.6, 3.4, 2.2, '#8ff0e4');
    eyes(g, cx, 16.6, 2.8, 1.7, '#124a52', '#e6ffff');
    el(g, cx, 20.2, 1.8, 0.9, '#b84a5a');
    // 팔
    ln(g, cx - 6, 23, cx - 11, 20, '#e8d8c0', 2.6);
    ln(g, cx + 6, 23, cx + 11, 20, '#e8d8c0', 2.6);
    // 빛가루
    el(g, cx - 14, 33, 1.2, 1.2, 'rgba(180,255,250,.7)');
    el(g, cx + 13, 28, 1, 1, 'rgba(180,255,250,.7)');
  },

  kraken(g, C, D, L) {
    const cx = 24;
    // 다리(촉수)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI - Math.PI / 2;
      const x0 = cx + Math.cos(a) * 8, y0 = 30;
      g.strokeStyle = D; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.cos(a) * 9, y0 + 10, x0 + Math.cos(a) * 13, y0 + 15); g.stroke();
      g.strokeStyle = i % 2 ? C : shade(C, -0.2); g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.cos(a) * 9, y0 + 10, x0 + Math.cos(a) * 13, y0 + 15); g.stroke();
    }
    // 머리
    el(g, cx, 24, 12, 12.6, D);
    el(g, cx, 24, 10.6, 11.2, C);
    el(g, cx - 3.4, 18, 5, 4, shade(C, 0.25));
    // 눈
    el(g, cx - 5, 24, 3.4, 3, '#fff2c0');
    el(g, cx + 5, 24, 3.4, 3, '#fff2c0');
    el(g, cx - 5, 24, 1.6, 2, '#1a0a20');
    el(g, cx + 5, 24, 1.6, 2, '#1a0a20');
    // 부리
    tri(g, cx - 2.4, 31, cx + 2.4, 31, cx, 35, '#3a2030');
    // 빨판
    for (const [x, y] of [[-14, 41], [14, 41], [-6, 44], [6, 44]]) el(g, cx + x, y, 1.4, 1.4, shade(C, 0.4));
  },
};

function monsterTexture(THREE, def) {
  const key = `m|${def.shape}|${def.color}|${def.dark}`;
  const cache = monsterTexture.cache || (monsterTexture.cache = new Map());
  if (cache.has(key)) return cache.get(key);
  const { c, g } = makeCanvas(48, 48);
  const C = hex(def.color), D = hex(def.dark), L = shade(def.color, 0.32);
  const fn = MONSTER_ART[def.shape] || MONSTER_ART.goblin;
  fn(g, C, D, L, def);
  crisp(c);
  const t = texture(THREE, c);
  cache.set(key, t);
  return t;
}
function monsterSilhouette(THREE, def) {
  const key = `s|${def.shape}|${def.color}|${def.dark}`;
  const cache = monsterSilhouette.cache || (monsterSilhouette.cache = new Map());
  if (cache.has(key)) return cache.get(key);
  const { c, g } = makeCanvas(48, 48);
  const fn = MONSTER_ART[def.shape] || MONSTER_ART.goblin;
  const src = makeCanvas(48, 48);
  fn(src.g, '#ffffff', '#ffffff', '#ffffff', def);
  crisp(src.c);
  // 원본 알파를 흰색 실루엣으로
  g.drawImage(src.c, 0, 0);
  const img = g.getImageData(0, 0, 48, 48);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 0) { img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  const t = texture(THREE, c);
  cache.set(key, t);
  return t;
}

// ---------- 몬스터 빌보드 스프라이트 ----------
export function makeMonsterSprite(THREE, def) {
  const S = def.boss === 'field' ? 2.05 : def.boss === 'boss' ? 1.72 : def.boss === 'mid' ? 1.34 : def.elite ? 1.16 : 1.0;
  const tall = def.shape === 'kraken' ? 1.95 : def.shape === 'ent' ? 1.85 : def.shape === 'ogre' ? 1.75 : def.shape === 'golem' ? 1.6 : def.shape === 'hydra' ? 1.5 : 1.28;
  const g = new THREE.Group();
  const w = tall * 0.92, h = tall;
  const mat = new THREE.SpriteMaterial({ map: monsterTexture(THREE, def), transparent: true, alphaTest: 0.45, depthWrite: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(w, h, 1);
  spr.position.y = h / 2;
  g.add(spr);

  // 피격 흰색 실루엣
  const flashMat = new THREE.SpriteMaterial({ map: monsterSilhouette(THREE, def), transparent: true, alphaTest: 0.45, depthWrite: false, opacity: 0.62 });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(w * 1.02, h * 1.02, 1);
  flash.position.y = h / 2;
  flash.visible = false;
  g.add(flash);

  // 바닥 그림자
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(0.28, w * 0.42), 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  g.add(shadow);

  g.scale.setScalar(S);
  const radius = Math.max(0.34, (def.boss === 'boss' || def.boss === 'field' ? 0.95 : def.elite ? 0.5 : 0.42) * S * 0.82);
  const float = def.shape === 'wraith' || def.shape === 'witch' || def.shape === 'siren' || def.shape === 'kraken';
  const baseY = float ? 0.22 : 0;
  const bounce = def.shape === 'slime' || def.shape === 'frog' || def.shape === 'scarab';

  let flashT = 0;
  g.userData = {
    sprite: spr, flash, shadow, isSprite: true, S, float, baseY, bounce,
    headY: h * S * 0.98,
    radius,
    hit() { flashT = 0.075; flash.visible = true; },
    setColorTint(hexColor) { mat.color.setHex(hexColor); },
    update(time, e, camera) {
      if (flashT > 0) { flashT -= 1 / 60; if (flashT <= 0) flash.visible = false; }
      const alive = !e || e.alive !== false;
      let y = baseY;
      if (float) y += Math.sin(time * 1.9 + (e ? e.floatT : 0)) * 0.09;
      if (bounce) y += Math.abs(Math.sin(time * 3.4 + (e ? e.floatT : 0))) * 0.12;
      spr.position.y = h / 2 + y;
      flash.position.y = h / 2 + y;
      // 통통 튀는 스쿼시
      if (bounce) {
        const k = Math.abs(Math.sin(time * 3.4 + (e ? e.floatT : 0)));
        const sq = 1 + (0.5 - k) * 0.1;
        spr.scale.set(w * sq * S / S, h * (2 - sq) , 1);
        spr.scale.set(w * sq, h * (2 - sq), 1);
      }
      // 좌우 반전 (카메라 기준)
      if (e && camera) {
        const fx = Math.sin(e.facing || 0), fz = Math.cos(e.facing || 0);
        const rx = camera.matrixWorld.elements[0], rz = camera.matrixWorld.elements[2];
        const dot = fx * rx + fz * rz;
        spr.scale.x = Math.abs(spr.scale.x) * (dot < -0.05 ? -1 : 1);
        flash.scale.x = Math.abs(flash.scale.x) * (dot < -0.05 ? -1 : 1);
      }
      // 사망 페이드
      if (!alive) {
        const k = Math.max(0, 1 - (e.deadT || 0) * 2.2);
        mat.opacity = k; flashMat.opacity = 0; shadow.material.opacity = 0.26 * k;
        spr.position.y = h / 2 - (1 - k) * h * 0.4;
      }
    },
  };
  return g;
}

// =======================================================================
// 주인공 탑뷰 도트 (앞 = 텍스처 위쪽)
// =======================================================================
const HERO_FRAME = 52;

// 장착 장비 + 외형 설정을 실제 그림에 쓰는 형태로 바꾼다
export function visualEquip(equip, appearance) {
  const ap = appearance || { mode: 'armor' };
  const weapon = equip && equip.weapon ? equip.weapon : null;
  let armor = equip && equip.armor ? equip.armor : null;
  if (ap.mode === 'uniform') armor = null;
  else if (ap.mode === 'costume' && ap.costumeId && COSTUME_MAP[ap.costumeId]) {
    const c = COSTUME_MAP[ap.costumeId];
    armor = { fam: c.fam, grade: c.grade || 3, costume: c.id, capeColor: c.cape, trimColor: c.trim };
  }
  return { weapon, armor, mode: ap.mode || 'armor', costumeId: ap.costumeId || null };
}

function weaponArt(g, fam, x, y, metal, glowColor) {
  // (x,y) 손 위치에서 앞(위)으로 뻗는 무기
  const M = metal;
  switch (fam) {
    case 'dagger':
      ln(g, x, y, x + 1.5, y - 9, '#c9a13a', 2);
      ln(g, x + 1.5, y - 9, x + 2, y - 15, M, 3);
      tri(g, x + 2, y - 19, x + 4, y - 13, x, y - 13, shade(M, 0.4));
      break;
    case 'axe':
      ln(g, x, y + 4, x + 1, y - 13, '#7a5a38', 2.6);
      tri(g, x + 1, y - 13, x + 10, y - 9, x + 2, y - 3, M);
      tri(g, x + 1.5, y - 12, x + 8, y - 9, x + 2, y - 4.5, shade(M, 0.35));
      break;
    case 'mace':
      ln(g, x, y + 4, x + 1, y - 12, '#7a5a38', 2.6);
      el(g, x + 1.4, y - 15, 4.6, 4.4, M);
      el(g, x + 1.4, y - 15, 3, 2.8, shade(M, 0.3));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        el(g, x + 1.4 + Math.cos(a) * 4.6, y - 15 + Math.sin(a) * 4.4, 1.2, 1.2, shade(M, 0.5));
      }
      break;
    case 'bow':
      g.strokeStyle = '#9a7040'; g.lineWidth = 2.6;
      g.beginPath(); g.arc(x + 4, y - 8, 8, -1.9, 1.5); g.stroke();
      ln(g, x + 4 + Math.cos(-1.9) * 8, y - 8 + Math.sin(-1.9) * 8, x + 4 + Math.cos(1.5) * 8, y - 8 + Math.sin(1.5) * 8, '#f0f0e0', 1);
      tri(g, x + 1, y - 16, x + 4, y - 12, x - 2, y - 12, shade(M, 0.2));
      break;
    case 'crossbow':
      ln(g, x + 2, y + 3, x + 3, y - 12, '#6b4a2a', 3);
      ln(g, x - 5, y - 10, x + 10, y - 10, M, 2.4);
      ln(g, x + 3, y - 15, x + 3, y - 6, shade(M, 0.4), 1.6);
      break;
    case 'staff':
      ln(g, x + 3, y + 8, x + 3, y - 14, '#6b4a8a', 2.6);
      el(g, x + 3, y - 17, 3.6, 3.6, glowColor || '#9fd8ff');
      el(g, x + 2.4, y - 18, 1.6, 1.6, '#ffffff');
      break;
    case 'book':
      rct(g, x + 2, y - 8, 7, 9, '#8a3a6a');
      rct(g, x + 3, y - 7, 5, 7, '#f4ecd8');
      rct(g, x + 5, y - 6, 1.4, 5, '#8a3a6a');
      el(g, x + 6, y - 3, 1.4, 1.4, glowColor || '#9ff0ff');
      break;
    default: // sword
      ln(g, x, y, x + 1, y - 8, '#c9a13a', 2);
      ln(g, x + 1, y - 8, x + 1.4, y - 20, M, 3.4);
      tri(g, x + 1.4, y - 25, x + 3.6, y - 19, x - 0.8, y - 19, shade(M, 0.45));
      ln(g, x - 3, y - 8, x + 5, y - 8, '#e0c060', 1.8);
      break;
  }
}

function heroTopFrame(g, ox, av, eq, frame) {
  const cx = ox + HERO_FRAME / 2, cy = HERO_FRAME / 2 - 2;
  const hair = hex(av.hair), skin = hex(av.skin), uni = hex(av.uniform), accent = hex(av.accent || av.uniform);
  const armor = eq && eq.armor ? eq.armor : null;
  const weapon = eq && eq.weapon ? eq.weapon : null;
  const aFam = armor ? armor.fam : null;
  const aGrade = armor ? armor.grade : 0;
  const gradeColor = GRADES[Math.min(5, weapon ? weapon.grade : 0)].color;
  const metal = weapon && weapon.grade >= 2 ? mixColor('#e6eefb', gradeColor, 0.5) : '#e6eefb';
  let cape = shade(uni, -0.3);
  if (aFam === 'slash') cape = '#8a5a34';
  else if (aFam === 'blunt') cape = '#8f98a8';
  else if (aFam === 'ranged') cape = '#b9c4d4';
  else if (aFam === 'magic') cape = shade(accent, -0.1);
  if (armor && aGrade >= 2) cape = mixColor(cape, GRADES[aGrade].color, 0.3);
  if (armor && armor.capeColor) cape = armor.capeColor;
  const plate = aFam === 'blunt' || aFam === 'ranged';
  const trimColor = (armor && armor.trimColor) || GRADES[Math.min(5, aGrade)].color;

  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  const atk = frame === 3;
  const lean = atk ? 1.4 : 0;

  // 바닥 그림자 (발밑)
  el(g, cx, cy + 10, 11, 6, 'rgba(0,0,0,.16)');
  // 망토 (뒤 = 아래)
  g.fillStyle = shade(cape, -0.12);
  g.beginPath();
  g.moveTo(cx - 7, cy - 1);
  g.quadraticCurveTo(cx - 14 - step, cy + 9, cx - 9.6 - step * 2, cy + 17);
  g.lineTo(cx + 9.6 + step * 2, cy + 17);
  g.quadraticCurveTo(cx + 14 + step, cy + 9, cx + 7, cy - 1);
  g.closePath();
  g.fill();
  g.fillStyle = cape;
  g.beginPath();
  g.moveTo(cx - 5.8, cy);
  g.quadraticCurveTo(cx - 11.4 - step, cy + 8, cx - 7.6 - step * 1.6, cy + 15.6);
  g.lineTo(cx + 7.6 + step * 1.6, cy + 15.6);
  g.quadraticCurveTo(cx + 11.4 + step, cy + 8, cx + 5.8, cy);
  g.closePath();
  g.fill();
  if (trimColor && armor) {
    g.strokeStyle = trimColor; g.lineWidth = 0.9; g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(cx - 4.6, cy + 6); g.lineTo(cx - 3.6, cy + 12.4);
    g.moveTo(cx + 4.6, cy + 6); g.lineTo(cx + 3.6, cy + 12.4);
    g.stroke(); g.globalAlpha = 1;
  }
  if (aFam === 'magic') {
    el(g, cx, cy + 10.4, 1.8, 1.8, '#9ff0ff');
    el(g, cx - 3.4, cy + 8, 1, 1, '#9ff0ff');
    el(g, cx + 3.4, cy + 8, 1, 1, '#9ff0ff');
  }
  // 발 · 다리
  el(g, cx - 3.6 + step * 1.8, cy + 10.6 - Math.abs(step) * 1.2, 2.8, 3.8, '#2b3040');
  el(g, cx + 3.6 - step * 1.8, cy + 10.6 - Math.abs(step) * 1.2, 2.8, 3.8, '#2b3040');
  el(g, cx - 3.6 + step * 1.8, cy + 13 - Math.abs(step) * 1.2, 3, 1.5, '#171a22');
  el(g, cx + 3.6 - step * 1.8, cy + 13 - Math.abs(step) * 1.2, 3, 1.5, '#171a22');
  // 몸통
  el(g, cx, cy + 2.4, 8.2, 7.6, shade(uni, -0.22));
  el(g, cx, cy + 2, 7.2, 6.8, uni);
  if (plate) {
    el(g, cx, cy + 2.6, 6.6, 6.4, aFam === 'ranged' ? '#c8d3e2' : '#a8b3c4');
    el(g, cx, cy + 2, 4.8, 4.8, shade(aFam === 'ranged' ? '#c8d3e2' : '#a8b3c4', 0.28));
    ln(g, cx - 4, cy + 2.4, cx + 4, cy + 2.4, 'rgba(70,86,110,.8)', 1);
  } else if (aFam === 'magic') {
    el(g, cx, cy + 3, 7.8, 7, shade(accent, -0.02));
    el(g, cx, cy + 0.6, 4, 2.8, '#f2f6ff');
  } else {
    // 교복 상의 (어깨선 · 셔츠)
    el(g, cx, cy + 1.4, 4.2, 2.6, '#eef4ff');
    el(g, cx, cy + 3, 1.6, 3.8, av.skirt ? (av.ribbon ? hex(av.ribbon) : '#d04848') : '#3d6fd6');
  }
  if (armor && (aGrade >= 2 || armor.costume)) {
    g.strokeStyle = trimColor; g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(cx, cy + 2.4, 7.8, 7.2, 0, 0, TAU); g.stroke();
  }
  // 어깨 보호대
  const pads = plate ? 4.2 : 3.4;
  for (const sgn of [-1, 1]) {
    el(g, cx + sgn * 7.4, cy - 0.6 + lean * 0.3, pads, pads * 0.86, plate ? '#aab5c6' : accent);
    el(g, cx + sgn * 7.4 - sgn * 0.7, cy - 1.4, pads * 0.5, pads * 0.36, plate ? '#dfe7f2' : shade(accent, 0.4));
  }
  // 팔 · 손
  el(g, cx - 8.4, cy + 4, 2.4, 3.8, plate ? '#aab5c6' : shade(uni, 0.05));
  el(g, cx + 8.4, cy + 3.4, 2.4, 3.8, plate ? '#aab5c6' : shade(uni, 0.05));
  el(g, cx - 8.8, cy + 7.4, 1.9, 1.9, skin);
  el(g, cx + 9 + (atk ? 0.5 : 0), cy + 6.8, 1.9, 1.9, skin);
  // 무기 (앞 = 위쪽)
  const wx = cx + 9.4 + (atk ? 1.2 : 0);
  const wy = cy + 6.4 - (atk ? 1.4 : 0);
  g.save();
  g.translate(wx, wy);
  g.rotate(atk ? -0.5 : 0.06);
  g.translate(-wx, -wy);
  weaponArt(g, weapon ? weapon.fam : 'sword', wx, wy, metal, gradeColor);
  if (weapon && weapon.grade >= 4) {
    g.strokeStyle = GRADES[weapon.grade].color; g.globalAlpha = 0.45; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(wx + 1, wy - 2); g.lineTo(wx + 1.4, wy - 22); g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
  // 머리 (위에서 본 머리)
  const hx = cx, hy = cy - 2.4 + lean * 0.2;
  const style = av.hairStyle || 'short';
  // 뒷머리
  if (style === 'long') {
    el(g, hx, hy + 5.4, 7.4, 7.6, shade(hair, -0.12));
    el(g, hx, hy + 9, 5.6, 4.6, shade(hair, -0.18));
  } else if (style === 'bob') {
    el(g, hx, hy + 0.6, 8, 7.6, shade(hair, -0.12));
  }
  // 얼굴(살색) 살짝 보이게
  el(g, hx, hy + 0.8, 5.6, 5.6, shade(skin, -0.06));
  // 앞머리
  el(g, hx, hy - 0.8, 6, 5.4, hair);
  if (style === 'messy') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      tri(g, hx + Math.cos(a) * 4.4, hy + Math.sin(a) * 4.2, hx + Math.cos(a) * 8.6, hy + Math.sin(a) * 8.4, hx + Math.cos(a + 0.7) * 4.8, hy + Math.sin(a + 0.7) * 4.6, hair);
    }
    el(g, hx, hy - 0.8, 6, 5.4, hair);
  }
  if (av.hood) { el(g, hx, hy, 8.2, 7.8, shade(uni, 0.02)); el(g, hx, hy - 0.6, 5.8, 5.4, hair); }
  // 정수리 광택 · 가르마
  el(g, hx - 1.8, hy - 2.6, 2.6, 1.8, shade(hair, 0.4));
  ln(g, hx + 0.6, hy - 6, hx + 2, hy - 1.4, shade(hair, -0.3), 0.9);
  // 이마 · 눈 힌트 (앞 = 위)
  el(g, hx, hy - 5.4, 4.6, 1.5, skin);
  el(g, hx, hy - 6.2, 3, 0.7, shade(skin, 0.25));
  // 리본
  if (av.ribbon && (style === 'long' || style === 'bob')) {
    el(g, hx - 5.4, hy + 2.4, 2.4, 1.9, hex(av.ribbon));
    el(g, hx - 7.6, hy + 1.4, 1.5, 1.3, hex(av.ribbon));
  }
}

function heroAtlas(THREE, av, eq) {
  const key = `h|${av.id}|${eq && eq.weapon ? eq.weapon.fam + eq.weapon.grade : '-'}|${eq && eq.armor ? (eq.armor.costume || eq.armor.fam) + eq.armor.grade : '-'}`;
  const cache = heroAtlas.cache || (heroAtlas.cache = new Map());
  if (cache.has(key)) return cache.get(key);
  const { c, g } = makeCanvas(HERO_FRAME * 4, HERO_FRAME);
  for (let f = 0; f < 4; f++) heroTopFrame(g, f * HERO_FRAME, av, eq, f);
  crisp(c, 110);
  const t = texture(THREE, c, { repeat: 0.25 });
  cache.set(key, t);
  return t;
}

export function makeHeroSprite(THREE, av, eq) {
  const g = new THREE.Group();
  const map = heroAtlas(THREE, av, eq).clone();
  map.needsUpdate = true;
  map.repeat.set(0.25, 1);
  map.offset.set(0, 0);
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.42, depthWrite: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  // 바닥에 눕힌 탑뷰 스프라이트. 텍스처 위쪽이 캐릭터 정면(+Z)이 되도록 Y를 뒤집는다.
  mesh.rotation.set(-Math.PI / 2, 0, 0);
  mesh.position.y = 0.055;
  mesh.scale.set(1, -1, 1);
  const art = new THREE.Group();
  art.scale.set(2.3, 2.3, 1);
  art.add(mesh);
  g.add(art);
  // 바닥 그림자 원반
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.035;
  g.add(shadow);
  // 무기 등급 발광 링
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.4, 22),
    new THREE.MeshBasicMaterial({ color: eq && eq.weapon && eq.weapon.grade >= 2 ? GRADES[eq.weapon.grade].color : '#8fd8ff', transparent: true, opacity: eq && eq.weapon && eq.weapon.grade >= 3 ? 0.22 : 0.0, side: THREE.DoubleSide, depthWrite: false }),
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  g.add(aura);

  let curFrame = -1;
  g.userData = {
    isHeroSprite: true, mesh, art, map, aura, shadow, avatar: av,
    frame(f) {
      if (f === curFrame) return;
      curFrame = f;
      map.offset.x = f * 0.25;
    },
    animate(p, dt) {
      const f = p.atkAnim > 0 ? 3 : p.moving ? ((Math.floor(p.walkT) % 2) ? 1 : 2) : 0;
      this.frame(f);
      const k = p.atkAnim > 0 ? 1.07 : p.moving ? 1 + Math.sin(p.walkT * 2) * 0.022 : 1;
      art.scale.set(2.3 * k, 2.3 * k, 1);
      aura.material.opacity = 0.24 + Math.sin(performance.now() / 500) * 0.08;
    },
  };
  return g;
}

// =======================================================================
// 동료 도트
// =======================================================================
const COMPANION_ART = {
  tank(g, c, d) {
    const cx = 24;
    blob(g, cx, 34, 9, 9, c, d);
    blob(g, cx - 5, 44, 3.6, 2.4, c, d); blob(g, cx + 5, 44, 3.6, 2.4, c, d);
    blob(g, cx, 16, 8, 7.4, '#f2c9a0', '#8a6a4a');
    el(g, cx, 11, 8.4, 5, '#3a2b22');
    eyes(g, cx, 16.5, 3, 1.7, '#20242e');
    el(g, cx - 15, 30, 5.4, 6.4, '#cfd8e6'); el(g, cx - 15, 30, 3.6, 4.6, '#8fa0b8');
    ln(g, cx + 10, 34, cx + 12, 18, '#dfe7f2', 2.6);
    ln(g, cx + 8, 20, cx + 16, 20, '#c9a13a', 2);
  },
  healer(g, c, d) {
    const cx = 24;
    g.fillStyle = d; g.beginPath(); g.moveTo(cx, 22); g.lineTo(cx + 11, 45); g.lineTo(cx - 11, 45); g.closePath(); g.fill();
    g.fillStyle = c; g.beginPath(); g.moveTo(cx, 23); g.lineTo(cx + 9.4, 44); g.lineTo(cx - 9.4, 44); g.closePath(); g.fill();
    blob(g, cx, 16, 7.4, 7, '#f7d8bd', '#a08060');
    el(g, cx, 10.6, 8, 5.4, '#f3d78a');
    el(g, cx - 8, 16, 2.4, 5, '#e8c878'); el(g, cx + 8, 16, 2.4, 5, '#e8c878');
    eyes(g, cx, 16.6, 2.8, 1.7, '#3a4a2a');
    g.strokeStyle = '#c86a7a'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, 20, 2, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
    ln(g, cx + 12, 42, cx + 12, 18, '#e8d8a0', 2.2);
    el(g, cx + 12, 15, 2.8, 2.8, '#8dffc0'); el(g, cx + 12, 15, 1.2, 1.2, '#ffffff');
  },
  melee(g, c, d) {
    const cx = 24;
    blob(g, cx, 33, 8, 8.4, c, d);
    blob(g, cx - 4.4, 43, 3.2, 2.4, c, d); blob(g, cx + 4.4, 43, 3.2, 2.4, c, d);
    blob(g, cx, 15, 7.6, 7, '#f2c9a0', '#8a6a4a');
    el(g, cx, 10, 8.2, 5, '#2a2a33');
    el(g, cx - 6, 14, 2, 4, '#2a2a33'); el(g, cx + 6, 14, 2, 4, '#2a2a33');
    eyes(g, cx, 15.4, 2.8, 1.6, '#20242e');
    for (const s of [-1, 1]) {
      ln(g, cx + s * 9, 36, cx + s * 12, 20, '#dfe7f2', 2.2);
      ln(g, cx + s * 9, 28, cx + s * 13, 30, '#c9a13a', 1.6);
    }
  },
  mage(g, c, d) {
    const cx = 24;
    g.fillStyle = d; g.beginPath(); g.moveTo(cx, 22); g.lineTo(cx + 11, 45); g.lineTo(cx - 11, 45); g.closePath(); g.fill();
    g.fillStyle = c; g.beginPath(); g.moveTo(cx, 23); g.lineTo(cx + 9.4, 44); g.lineTo(cx - 9.4, 44); g.closePath(); g.fill();
    blob(g, cx, 15, 7.2, 6.8, '#f2c9a0', '#8a6a4a');
    el(g, cx, 10.4, 7.8, 5, '#6f5aa8');
    tri(g, cx - 7, 10, cx + 7, 10, cx, -1, '#6f5aa8');
    eyes(g, cx, 15.4, 2.8, 1.6, '#4a3a8a');
    ln(g, cx + 12, 42, cx + 12, 18, '#5a4a8a', 2.2);
    el(g, cx + 12, 15, 2.8, 2.8, '#b58cff'); el(g, cx + 12, 15, 1.2, 1.2, '#ffffff');
  },
};
export function makeCompanionSprite(THREE, cls, gradeColor) {
  const key = `c|${cls.id}`;
  const cache = makeCompanionSprite.cache || (makeCompanionSprite.cache = new Map());
  let tex = cache.get(key);
  if (!tex) {
    const { c, g } = makeCanvas(48, 48);
    const C = hex(cls.color), D = shade(cls.color, -0.4);
    (COMPANION_ART[cls.id] || COMPANION_ART.melee)(g, C, D);
    crisp(c);
    tex = texture(THREE, c);
    cache.set(key, tex);
  }
  const g = new THREE.Group();
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.45, depthWrite: true }));
  spr.scale.set(1.2, 1.2, 1);
  spr.position.y = 0.6;
  g.add(spr);
  const ring = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 16),
    new THREE.MeshBasicMaterial({ color: gradeColor || 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  g.userData = { sprite: spr, headY: 1.25, radius: 0.4 };
  return g;
}

// =======================================================================
// 초상화 · 전신 (HUD · 선택 화면 · 가방)
// =======================================================================
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawFace(g, av, cx, cy, s, opts = {}) {
  const hair = hex(av.hair), skin = hex(av.skin), uni = hex(av.uniform), accent = hex(av.accent || av.uniform);
  const style = av.hairStyle || 'short';
  const faceW = 26 * s, faceH = 30 * s;
  // 목
  g.fillStyle = shade(skin, -0.12);
  g.fillRect(cx - 6 * s, cy + faceH * 0.42, 12 * s, 12 * s);
  // 뒷머리
  g.fillStyle = shade(hair, -0.18);
  g.beginPath();
  g.ellipse(cx, cy + 2 * s, faceW * 0.72, faceH * 0.74, 0, 0, TAU);
  g.fill();
  if (style === 'long') {
    g.beginPath();
    g.ellipse(cx, cy + faceH * 0.85, faceW * 0.78, faceH * 0.95, 0, 0, TAU);
    g.fill();
  }
  // 얼굴
  const grd = g.createLinearGradient(cx, cy - faceH * 0.5, cx, cy + faceH * 0.6);
  grd.addColorStop(0, shade(skin, 0.14));
  grd.addColorStop(1, shade(skin, -0.12));
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(cx, cy, faceW * 0.5, faceH * 0.52, 0, 0, TAU);
  g.fill();
  // 볼
  g.fillStyle = 'rgba(255,130,130,.22)';
  g.beginPath(); g.ellipse(cx - faceW * 0.3, cy + faceH * 0.14, 4.6 * s, 3 * s, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + faceW * 0.3, cy + faceH * 0.14, 4.6 * s, 3 * s, 0, 0, TAU); g.fill();
  // 눈
  const eyeY = cy + faceH * 0.04, eyeDX = faceW * 0.24, eyeW = 4.4 * s, eyeH = 5.6 * s;
  const iris = opts.iris || accent;
  for (const sd of [-1, 1]) {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx + sd * eyeDX, eyeY, eyeW, eyeH, 0, 0, TAU); g.fill();
    g.fillStyle = shade(iris, -0.15);
    g.beginPath(); g.ellipse(cx + sd * eyeDX, eyeY + 0.4 * s, eyeW * 0.66, eyeH * 0.74, 0, 0, TAU); g.fill();
    g.fillStyle = '#12141c';
    g.beginPath(); g.ellipse(cx + sd * eyeDX, eyeY + 0.6 * s, eyeW * 0.34, eyeH * 0.46, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(cx + sd * eyeDX - 1.6 * s, eyeY - 1.8 * s, 1.3 * s, 0, TAU); g.fill();
    // 눈꼬리
    g.strokeStyle = '#2a2230'; g.lineWidth = 1.2 * s; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + sd * (eyeDX - eyeW), eyeY - eyeH * 0.75); g.lineTo(cx + sd * (eyeDX + eyeW), eyeY - eyeH * 0.55); g.stroke();
  }
  // 눈썹
  g.strokeStyle = shade(hair, -0.05); g.lineWidth = 1.6 * s;
  g.beginPath(); g.moveTo(cx - eyeDX - eyeW * 0.9, eyeY - eyeH * 1.3); g.lineTo(cx - eyeDX + eyeW * 0.7, eyeY - eyeH * 1.55); g.stroke();
  g.beginPath(); g.moveTo(cx + eyeDX + eyeW * 0.9, eyeY - eyeH * 1.3); g.lineTo(cx + eyeDX - eyeW * 0.7, eyeY - eyeH * 1.55); g.stroke();
  // 코 · 입
  g.fillStyle = shade(skin, -0.28);
  g.beginPath(); g.ellipse(cx, cy + faceH * 0.16, 1.4 * s, 1 * s, 0, 0, TAU); g.fill();
  g.strokeStyle = '#b8545e'; g.lineWidth = 1.5 * s;
  g.beginPath(); g.arc(cx, cy + faceH * 0.26, 3.4 * s, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  // 앞머리
  g.fillStyle = hair;
  g.beginPath();
  g.moveTo(cx - faceW * 0.62, cy - faceH * 0.16);
  g.quadraticCurveTo(cx - faceW * 0.6, cy - faceH * 0.72, cx, cy - faceH * 0.66);
  g.quadraticCurveTo(cx + faceW * 0.6, cy - faceH * 0.72, cx + faceW * 0.62, cy - faceH * 0.16);
  g.quadraticCurveTo(cx + faceW * 0.52, cy - faceH * 0.3, cx + faceW * 0.18, cy - faceH * 0.38);
  g.quadraticCurveTo(cx - faceW * 0.1, cy - faceH * 0.2, cx - faceW * 0.22, cy - faceH * 0.34);
  g.quadraticCurveTo(cx - faceW * 0.5, cy - faceH * 0.26, cx - faceW * 0.62, cy - faceH * 0.16);
  g.fill();
  if (style === 'messy') {
    for (let i = 0; i < 5; i++) {
      const a = -1.9 + i * 0.5;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * faceW * 0.4, cy + Math.sin(a) * faceH * 0.5);
      g.lineTo(cx + Math.cos(a) * faceW * 0.78, cy + Math.sin(a) * faceH * 0.9);
      g.lineTo(cx + Math.cos(a + 0.28) * faceW * 0.42, cy + Math.sin(a + 0.28) * faceH * 0.5);
      g.closePath(); g.fill();
    }
  }
  if (style === 'bob') {
    g.beginPath(); g.ellipse(cx - faceW * 0.56, cy + faceH * 0.12, faceW * 0.16, faceH * 0.36, 0.1, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx + faceW * 0.56, cy + faceH * 0.12, faceW * 0.16, faceH * 0.36, -0.1, 0, TAU); g.fill();
  }
  if (style === 'long') {
    g.beginPath(); g.ellipse(cx - faceW * 0.62, cy + faceH * 0.36, faceW * 0.18, faceH * 0.6, 0.08, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx + faceW * 0.62, cy + faceH * 0.36, faceW * 0.18, faceH * 0.6, -0.08, 0, TAU); g.fill();
  }
  // 머리 광택
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.beginPath(); g.ellipse(cx - faceW * 0.2, cy - faceH * 0.46, faceW * 0.22, faceH * 0.09, -0.3, 0, TAU); g.fill();
  // 리본 / 장식
  if (opts.ribbon || av.ribbon && (style === 'long' || style === 'bob')) {
    const rb = hex(av.ribbon || 0xff9ec4);
    if (style === 'long' || style === 'bob') {
      g.fillStyle = rb;
      g.beginPath(); g.ellipse(cx + faceW * 0.44, cy - faceH * 0.42, 4.4 * s, 3.2 * s, -0.4, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(cx + faceW * 0.62, cy - faceH * 0.52, 2.6 * s, 2 * s, -0.4, 0, TAU); g.fill();
      g.fillStyle = shade(rb, -0.2);
      g.beginPath(); g.arc(cx + faceW * 0.5, cy - faceH * 0.44, 1.4 * s, 0, TAU); g.fill();
    }
  }
  // 교복 깃
  if (opts.collar !== false) {
    g.fillStyle = uni;
    g.beginPath();
    g.moveTo(cx - 15 * s, cy + 32 * s);
    g.lineTo(cx - 6 * s, cy + 21 * s);
    g.lineTo(cx + 6 * s, cy + 21 * s);
    g.lineTo(cx + 15 * s, cy + 32 * s);
    g.closePath(); g.fill();
    g.fillStyle = '#f4f7ff';
    g.beginPath();
    g.moveTo(cx - 7 * s, cy + 21 * s); g.lineTo(cx, cy + 26 * s); g.lineTo(cx + 7 * s, cy + 21 * s);
    g.lineTo(cx + 4 * s, cy + 20 * s); g.lineTo(cx, cy + 23.4 * s); g.lineTo(cx - 4 * s, cy + 20 * s);
    g.closePath(); g.fill();
    g.fillStyle = style === 'long' || style === 'bob' ? hex(av.ribbon || 0xd04848) : '#3d6fd6';
    g.beginPath(); g.moveTo(cx, cy + 24 * s); g.lineTo(cx + 3.4 * s, cy + 27 * s); g.lineTo(cx, cy + 34 * s); g.lineTo(cx - 3.4 * s, cy + 27 * s); g.closePath(); g.fill();
  }
  // 후드
  if (av.hood) {
    g.strokeStyle = shade(uni, -0.1); g.lineWidth = 5 * s;
    g.beginPath(); g.ellipse(cx, cy - faceH * 0.1, faceW * 0.82, faceH * 0.86, 0, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
  }
}

export function heroPortraitDataUrl(av, size = 128) {
  const { c, g } = makeCanvas(size, size);
  const cx = size / 2, cy = size * 0.48;
  // 배경 원
  const bg = g.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, shade(av.uniform, 0.35));
  bg.addColorStop(1, shade(av.accent || av.uniform, -0.35));
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, size * 0.49, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = size * 0.02;
  g.beginPath(); g.arc(cx, cy, size * 0.48, 0, TAU); g.stroke();
  g.save();
  g.beginPath(); g.arc(cx, cy, size * 0.47, 0, TAU); g.clip();
  drawFace(g, av, cx, cy + size * 0.02, size / 100, { iris: av.accent });
  g.restore();
  return c.toDataURL('image/png');
}

export function heroFullDataUrl(av, eq, size = 220) {
  const W = size, H = Math.round(size * 1.45);
  const { c, g } = makeCanvas(W, H);
  const s = W / 120;
  const cx = W / 2, cy = H * 0.3;
  // 배경
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(60,90,150,.16)');
  bg.addColorStop(1, 'rgba(10,16,28,.05)');
  g.fillStyle = bg;
  g.beginPath(); roundRect(g, 0, 0, W, H, 16 * s); g.fill();
  // 받침 그림자
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(cx, H * 0.95, 34 * s, 7 * s, 0, 0, TAU); g.fill();

  const uni = hex(av.uniform), accent = hex(av.accent || av.uniform), skin = hex(av.skin);
  const armor = eq && eq.armor ? eq.armor : null;
  const weapon = eq && eq.weapon ? eq.weapon : null;
  const aFam = armor ? armor.fam : null;
  const gradeColor = weapon ? GRADES[weapon.grade].color : '#dfe9f7';
  const metal = weapon && weapon.grade >= 2 ? mixColor('#e6eefb', gradeColor, 0.55) : '#e6eefb';
  let cape = shade(uni, -0.25);
  if (aFam === 'slash') cape = '#8a5a34';
  else if (aFam === 'blunt') cape = '#8f98a8';
  else if (aFam === 'ranged') cape = '#b9c4d4';
  else if (aFam === 'magic') cape = shade(accent, -0.12);
  if (armor && armor.grade >= 2) cape = mixColor(cape, GRADES[armor.grade].color, 0.3);
  if (armor && armor.capeColor) cape = armor.capeColor;
  const trimCol = (armor && armor.trimColor) || (armor ? GRADES[Math.min(5, armor.grade)].color : gradeColor);

  const bodyY = H * 0.52;
  // 망토
  g.fillStyle = cape;
  g.beginPath();
  g.moveTo(cx - 20 * s, bodyY - 24 * s);
  g.quadraticCurveTo(cx - 34 * s, bodyY + 30 * s, cx - 24 * s, H * 0.9);
  g.lineTo(cx + 24 * s, H * 0.9);
  g.quadraticCurveTo(cx + 34 * s, bodyY + 30 * s, cx + 20 * s, bodyY - 24 * s);
  g.closePath(); g.fill();
  g.fillStyle = shade(cape, -0.22);
  g.beginPath();
  g.moveTo(cx - 15 * s, bodyY - 18 * s);
  g.quadraticCurveTo(cx - 22 * s, bodyY + 26 * s, cx - 14 * s, H * 0.88);
  g.lineTo(cx + 14 * s, H * 0.88);
  g.quadraticCurveTo(cx + 22 * s, bodyY + 26 * s, cx + 15 * s, bodyY - 18 * s);
  g.closePath(); g.fill();
  // 다리
  g.fillStyle = '#2b3040';
  g.fillRect(cx - 13 * s, bodyY + 22 * s, 10 * s, 34 * s);
  g.fillRect(cx + 3 * s, bodyY + 22 * s, 10 * s, 34 * s);
  g.fillStyle = '#1a1d26';
  roundRect(g, cx - 15 * s, bodyY + 52 * s, 13 * s, 9 * s, 3 * s); g.fill();
  roundRect(g, cx + 2 * s, bodyY + 52 * s, 13 * s, 9 * s, 3 * s); g.fill();
  // 스커트
  if (av.skirt) {
    g.fillStyle = shade(uni, -0.1);
    g.beginPath();
    g.moveTo(cx - 16 * s, bodyY + 14 * s); g.lineTo(cx + 16 * s, bodyY + 14 * s);
    g.lineTo(cx + 22 * s, bodyY + 34 * s); g.lineTo(cx - 22 * s, bodyY + 34 * s);
    g.closePath(); g.fill();
    g.strokeStyle = shade(uni, 0.3); g.lineWidth = 2 * s;
    g.beginPath(); g.moveTo(cx - 20 * s, bodyY + 31 * s); g.lineTo(cx + 20 * s, bodyY + 31 * s); g.stroke();
  }
  // 몸통
  const plate = aFam === 'blunt' || aFam === 'ranged';
  g.fillStyle = plate ? (aFam === 'ranged' ? '#c8d3e2' : '#a8b3c4') : uni;
  roundRect(g, cx - 17 * s, bodyY - 22 * s, 34 * s, 42 * s, 8 * s); g.fill();
  if (plate) {
    g.fillStyle = shade(aFam === 'ranged' ? '#c8d3e2' : '#a8b3c4', 0.25);
    roundRect(g, cx - 12 * s, bodyY - 18 * s, 24 * s, 20 * s, 6 * s); g.fill();
    g.strokeStyle = 'rgba(90,110,140,.7)'; g.lineWidth = 1.6 * s;
    g.beginPath(); g.moveTo(cx, bodyY - 16 * s); g.lineTo(cx, bodyY + 16 * s); g.stroke();
  } else if (aFam === 'magic') {
    g.fillStyle = shade(accent, -0.05);
    roundRect(g, cx - 17 * s, bodyY - 22 * s, 34 * s, 30 * s, 8 * s); g.fill();
    g.fillStyle = '#f4f7ff';
    g.beginPath(); g.moveTo(cx - 7 * s, bodyY - 20 * s); g.lineTo(cx, bodyY - 4 * s); g.lineTo(cx + 7 * s, bodyY - 20 * s); g.closePath(); g.fill();
    g.fillStyle = gradeColor;
    g.beginPath(); g.arc(cx, bodyY - 10 * s, 2.4 * s, 0, TAU); g.fill();
  } else {
    // 교복 셔츠 · 넥타이
    g.fillStyle = '#f4f7ff';
    g.beginPath(); g.moveTo(cx - 8 * s, bodyY - 22 * s); g.lineTo(cx, bodyY - 8 * s); g.lineTo(cx + 8 * s, bodyY - 22 * s); g.closePath(); g.fill();
    g.fillStyle = av.skirt ? hex(av.ribbon || 0xd04848) : '#3d6fd6';
    g.beginPath(); g.moveTo(cx, bodyY - 12 * s); g.lineTo(cx + 4 * s, bodyY - 6 * s); g.lineTo(cx, bodyY + 4 * s); g.lineTo(cx - 4 * s, bodyY - 6 * s); g.closePath(); g.fill();
  }
  // 어깨 보호대
  for (const sd of [-1, 1]) {
    g.fillStyle = plate ? '#aab5c6' : accent;
    g.beginPath(); g.ellipse(cx + sd * 19 * s, bodyY - 18 * s, 9 * s, 7.4 * s, sd * 0.3, 0, TAU); g.fill();
    g.fillStyle = plate ? '#dfe7f2' : shade(accent, 0.35);
    g.beginPath(); g.ellipse(cx + sd * 19 * s, bodyY - 20 * s, 5 * s, 3.6 * s, sd * 0.3, 0, TAU); g.fill();
    if (armor && (armor.grade >= 2 || armor.costume)) {
      g.fillStyle = trimCol;
      g.beginPath(); g.arc(cx + sd * 19 * s, bodyY - 18 * s, 2 * s, 0, TAU); g.fill();
    }
  }
  // 팔
  for (const sd of [-1, 1]) {
    g.fillStyle = plate ? '#9fabbd' : uni;
    roundRect(g, cx + sd * 26 * s - 5 * s, bodyY - 14 * s, 10 * s, 26 * s, 5 * s); g.fill();
    g.fillStyle = skin;
    g.beginPath(); g.arc(cx + sd * 26 * s, bodyY + 14 * s, 4.6 * s, 0, TAU); g.fill();
  }
  // 무기
  const wxs = cx + 26 * s, wys = bodyY + 12 * s;
  g.save();
  g.translate(wxs, wys);
  g.rotate(-0.25);
  const sc = 1.5 * s;
  g.scale(sc, sc);
  weaponArt(g, weapon ? weapon.fam : 'sword', 0, 0, metal, gradeColor);
  g.restore();
  // 머리
  drawFace(g, av, cx, cy, s * 1.02, { iris: av.accent });
  // 등급 표시
  if (weapon && weapon.grade >= 2) {
    g.fillStyle = gradeColor;
    g.beginPath(); g.arc(W - 14 * s, 14 * s, 4 * s, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2 * s; g.stroke();
  }
  return c.toDataURL('image/png');
}

export function avatarPalette(id) {
  return AVATAR_MAP[id] || null;
}
