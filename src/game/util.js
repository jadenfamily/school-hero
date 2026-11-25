// 스쿨히어로 — 공용 수학/포맷 헬퍼 (순수 함수, 상태 없음)
// game.js에서 분리. 모든 게임 모듈이 여기서 가져다 쓴다.
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

import { groundHeight } from '../world.js';

// 3D 지형 높이. 월드가 아직 없으면 평지(0)로 취급한다.
export function groundY(x, z) {
  try { return groundHeight(x, z); } catch (e) { return 0; }
}

// 3D 그룹 해제. 공유 지오메트리(몬스터 3D 캐시)는 해제하지 않는다.
export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

export function fmtNum(n) { return Math.round(n).toLocaleString('ko-KR'); }

export function fmtRemain(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`;
  return `${h}시간 ${String(m).padStart(2, '0')}분`;
}
