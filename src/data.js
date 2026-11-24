// 스쿨히어로 — 게임 설정 데이터
export const GRADES = [
  { i: 0, name: '일반', color: '#b8c2d4', glow: 'rgba(184,194,212,.22)' },
  { i: 1, name: '고급', color: '#43d17a', glow: 'rgba(67,209,122,.4)' },
  { i: 2, name: '희귀', color: '#4aa3ff', glow: 'rgba(74,163,255,.45)' },
  { i: 3, name: '에픽', color: '#b46cff', glow: 'rgba(180,108,255,.5)' },
  { i: 4, name: '전설', color: '#ffc93c', glow: 'rgba(255,201,60,.55)' },
  { i: 5, name: '신화', color: '#ff5566', glow: 'rgba(255,85,102,.6)' },
];

// 무기 8종 · 계열(근접/원거리/마법)별 공격력 계산과 고유 특성
export const WEAPONS = {
  sword: {
    id: 'sword', name: '검', cls: 'melee', icon: '⚔️', range: 3.0, arc: 2.2, cd: 0.75, mult: 1.00,
    atkScale: 1.0, extra: 0.25, style: '부채꼴 베기 · 25% 확률로 추가타',
  },
  dagger: {
    id: 'dagger', name: '단검', cls: 'melee', icon: '🗡️', range: 2.4, arc: 1.7, cd: 0.46, mult: 0.80,
    atkScale: 0.8, style: '빠른 연격 · 공속이 매우 빠름',
  },
  axe: {
    id: 'axe', name: '도끼', cls: 'melee', icon: '🪓', range: 2.8, arc: 1.9, cd: 0.98, mult: 1.18,
    atkScale: 1.15, crit: 0.15, style: '강타 · 치명타 확률 +15%',
  },
  mace: {
    id: 'mace', name: '둔기', cls: 'melee', icon: '🔨', range: 2.4, arc: 6.28, cd: 1.05, mult: 1.28,
    atkScale: 1.25, stun: 0.25, style: '주변 강타 · 25% 확률로 기절',
  },
  bow: {
    id: 'bow', name: '활', cls: 'ranged', icon: '🏹', range: 8.4, cd: 1.00, mult: 1.15,
    atkScale: 1.05, projectile: true, style: '강한 화살 · 연사 느림',
  },
  crossbow: {
    id: 'crossbow', name: '석궁', cls: 'ranged', icon: '🎯', range: 8.8, cd: 0.58, mult: 0.86,
    atkScale: 0.85, projectile: true, style: '속사 · 데미지 약함',
  },
  staff: {
    id: 'staff', name: '지팡이', cls: 'magic', icon: '🪄', range: 7.8, cd: 0.92, mult: 1.15,
    atkScale: 1.20, projectile: true, style: '마력 폭발 · 마법력 상승 큼',
  },
  book: {
    id: 'book', name: '마법책', cls: 'magic', icon: '📖', range: 7.4, cd: 0.60, mult: 0.88,
    atkScale: 0.85, projectile: true, style: '빠른 시전 · 마법력 상승 작음',
  },
};

// 방어구 4종 (공격 타입별 저항)
export const ARMOR_KINDS = {
  slash:  { id: 'slash',  name: '경갑', icon: '🥋', resist: '참격' },
  blunt:  { id: 'blunt',  name: '중갑', icon: '🪖', resist: '타격' },
  ranged: { id: 'ranged', name: '판금', icon: '🛡️', resist: '원거리' },
  magic:  { id: 'magic',  name: '로브', icon: '🧥', resist: '마법' },
};

// 악세서리 3종 (보스 드롭)
export const ACCESSORY_KINDS = {
  necklace: { id: 'necklace', name: '목걸이', icon: '📿', theme: '공격' },
  ring:     { id: 'ring',     name: '반지',   icon: '💍', theme: '방어' },
  earring:  { id: 'earring',  name: '귀걸이', icon: '🌙', theme: '민첩' },
};

// ---------- 아바타(학생 4종) ----------
// 색·머리 모양·리본이 탑뷰 도트 캐릭터와 HUD 초상화에 그대로 반영된다.
export const AVATARS = [
  {
    id: 'boyA', name: '남학생 A', short: '네이비 교복 · 장검', defaultName: '시우', icon: '👦',
    skin: 0xf2c9a0, uniform: 0x2b3a66, accent: 0x4a6bd6, pants: 0x2c3242,
    hair: 0x1e2130, hairStyle: 'short', hair3d: 'fringe', ribbon: 0, skirt: false, iris: 0x3d6fd6,
  },
  {
    id: 'girlA', name: '여학생 A', short: '금발 · 마법 지팡이', defaultName: '하늘', icon: '👧',
    skin: 0xf7d8bd, uniform: 0x3a3350, accent: 0xb03a5a, pants: 0x3b3652,
    hair: 0xf0d089, hairStyle: 'long', hair3d: 'twin', ribbon: 0xc03050, skirt: true, iris: 0x8a5ad0,
  },
  {
    id: 'boyB', name: '남학생 B', short: '갈색 머리 · 수호 방패', defaultName: '도윤', icon: '🧑',
    skin: 0xefc49b, uniform: 0x2f4a34, accent: 0x6f9a4a, pants: 0x39422f,
    hair: 0x8a4a24, hairStyle: 'messy', hair3d: 'spiky', ribbon: 0, skirt: false, iris: 0x4a8a3a, hood: false,
  },
  {
    id: 'girlB', name: '여학생 B', short: '은발 · 마법책', defaultName: '서연', icon: '👩',
    skin: 0xf6ddc8, uniform: 0x3a2f56, accent: 0x7a5ac0, pants: 0x352c4a,
    hair: 0xe6e2f4, hairStyle: 'long', hair3d: 'bun', ribbon: 0x8a6ad0, skirt: true, iris: 0x5a8ad0,
  },
];
export const AVATAR_MAP = Object.fromEntries(AVATARS.map((a) => [a.id, a]));
export function avatarOf(id) { return AVATAR_MAP[id] || AVATARS[0]; }

// ---------- 판타지 스킬북 ----------
// kind: attack(공격) · heal(회복) · support(지원)
// auto: 자동 사용 조건 판단에 쓰이는 힌트
const SK = (o) => o;
export const SKILLS = {
  fireball: SK({
    id: 'fireball', name: '파이어볼', icon: '🔥', kind: 'attack', element: 'fire',
    mp: 14, cd: 4.5, mult: 2.2, range: 10, radius: 2.6, target: 'enemy', auto: 'enemy',
    desc: '불덩이를 날려 폭발 범위 안의 적 모두에게 화염 피해를 줍니다.',
  }),
  icebolt: SK({
    id: 'icebolt', name: '아이스볼트', icon: '❄️', kind: 'attack', element: 'ice',
    mp: 9, cd: 3.4, mult: 1.5, range: 10, slow: 0.5, slowT: 3.2, target: 'enemy', auto: 'enemy',
    desc: '얼음 화살을 쏘아 피해를 주고 3초 동안 이동 속도를 절반으로 늦춥니다.',
  }),
  firewall: SK({
    id: 'firewall', name: '파이어월', icon: '🧨', kind: 'attack', element: 'fire',
    mp: 18, cd: 8.5, mult: 0.6, range: 8, radius: 2.8, duration: 5, target: 'enemy', auto: 'enemy',
    desc: '전방에 5초 동안 타오르는 불길 장판을 만들어 계속 피해를 줍니다.',
  }),
  swordwave: SK({
    id: 'swordwave', name: '검기 날리기', icon: '🌪️', kind: 'attack', element: 'blade',
    mp: 10, cd: 3.2, mult: 1.7, range: 9, target: 'enemy', auto: 'enemy',
    desc: '전방으로 참격파를 날려 일직선의 적을 베어냅니다.',
  }),
  whirlwind: SK({
    id: 'whirlwind', name: '회전 베기', icon: '🌀', kind: 'attack', element: 'blade',
    mp: 12, cd: 4.2, mult: 1.55, radius: 4.2, target: 'self', auto: 'enemy',
    desc: '몸을 돌려 주변 모든 적을 한 번에 벱니다.',
  }),
  multishot: SK({
    id: 'multishot', name: '멀티샷', icon: '🎯', kind: 'attack', element: 'arrow',
    mp: 11, cd: 3.6, mult: 0.8, range: 10, shots: 5, spread: 0.55, target: 'enemy', auto: 'enemy',
    desc: '부채꼴로 화살 3~5발을 동시에 쏘아 여러 적을 공격합니다.',
  }),
  pierce: SK({
    id: 'pierce', name: '관통 사격', icon: '➡️', kind: 'attack', element: 'arrow',
    mp: 10, cd: 4.2, mult: 1.9, range: 13, pierce: 5, target: 'enemy', auto: 'enemy',
    desc: '고속 화살이 일직선의 적을 꿰뚫고 지나갑니다.',
  }),
  heal1: SK({
    id: 'heal1', name: '단일 힐', icon: '💚', kind: 'heal',
    mp: 10, cd: 5, healPct: 0.35, healFlat: 18, target: 'ally', auto: 'hurt',
    desc: '가장 체력이 낮은 주인공·동료 한 명을 크게 회복합니다.',
  }),
  healAll: SK({
    id: 'healAll', name: '단체 힐', icon: '💖', kind: 'heal',
    mp: 20, cd: 9, healPct: 0.22, healFlat: 10, target: 'party', auto: 'hurtAll',
    desc: '주인공과 동행 중인 동료 모두의 체력을 회복합니다.',
  }),
  cleanse: SK({
    id: 'cleanse', name: '독 해제', icon: '🧼', kind: 'support',
    mp: 8, cd: 6, healPct: 0.08, healFlat: 6, target: 'self', auto: 'poison',
    desc: '늪지 독·디버프를 즉시 풀고 소량 회복합니다.',
  }),
};
export const SKILL_IDS = Object.keys(SKILLS);
export const HEAL_SKILL_IDS = ['heal1', 'healAll', 'cleanse'];

// ---------- 동료 대표 스킬 (스킬 개편) ----------
// 주인공은 스킬을 쓰지 않는다. 동료만 직업별 대표 스킬 하나를 전투 중에 자동 사용한다.
// 스킬 레벨 = 등급 + 1 + 스킬북 보너스 (최대 10). 레벨이 오르면 피해·회복이 커지고 쿨다운이 조금씩 짧아진다.
// cdPerLv: 레벨당 쿨다운 감소량 (최소 cdMin까지). multPerLv: 레벨당 피해 배율 증가량.
export const COMPANION_SKILL_MAX_LEVEL = 10;
// 동료 고유 스킬 16종 — 동료마다 직업 풀에서 하나씩 가진다 (skillId, 뽑을 때 랜덤 지정).
// 스킬 레벨 = 등급 + 1 + 스킬 보너스 (최대 Lv.10).
// 기존 4종(방패 강타·치유의 빛·회전 베기·파이어볼)은 수치 그대로 유지한다.
export const COMPANION_SKILLS = {
  shieldSlam: {
    cls: 'tank', id: 'shieldSlam', name: '방패 강타', icon: '🛡️',
    cd: 10, cdMin: 7, cdPerLv: 0.3, radius: 3.2, mult: 1.2, multPerLv: 0.15, tauntT: 3, elem: 'blade',
    desc: '방패로 주변을 강타해 피해를 주고, 맞은 적을 3초간 자신에게 붙잡아 둡니다 (보스급 제외).',
  },
  tauntRoar: {
    cls: 'tank', id: 'tauntRoar', name: '도발의 포효', icon: '📣',
    cd: 10, cdMin: 7, cdPerLv: 0.3, radius: 6, mult: 0.5, multPerLv: 0.1, tauntT: 4, elem: 'blade',
    desc: '포효로 6m 안의 모든 적을 4초간 자신에게 붙잡아 둡니다 (보스급 제외).',
  },
  stunSlam: {
    cls: 'tank', id: 'stunSlam', name: '내려찍기', icon: '🔨',
    cd: 9, cdMin: 6, cdPerLv: 0.3, radius: 3.0, mult: 1.4, multPerLv: 0.15, stunT: 1.5, elem: 'blade',
    desc: '주변을 내려찍어 피해를 주고 맞은 적을 1.5초 기절시킵니다 (보스급은 피해만).',
  },
  fireball: {
    cls: 'mage', id: 'fireball', name: '파이어볼', icon: '🔥',
    cd: 7, cdMin: 4.5, cdPerLv: 0.25, range: 8.5, mult: 1.6, multPerLv: 0.15, elem: 'fire',
    desc: '불덩이를 날려 맞은 적 주변을 폭발시킵니다.',
  },
  icebolt: {
    cls: 'mage', id: 'icebolt', name: '아이스볼트', icon: '❄️',
    cd: 6, cdMin: 4, cdPerLv: 0.25, range: 9, mult: 1.4, multPerLv: 0.15, elem: 'ice',
    desc: '얼음 화살을 쏘아 한 명의 적에게 냉기 피해를 줍니다.',
  },
  firewall: {
    cls: 'mage', id: 'firewall', name: '파이어월', icon: '🧨',
    cd: 9, cdMin: 6, cdPerLv: 0.3, range: 8, radius: 2.5, mult: 0.25, multPerLv: 0.03, duration: 4, elem: 'fire',
    desc: '적 위치에 4초 동안 타오르는 불길 장판을 만들어 계속 피해를 줍니다.',
  },
  blizzard: {
    cls: 'mage', id: 'blizzard', name: '블리자드', icon: '🌨️',
    cd: 10, cdMin: 7, cdPerLv: 0.3, range: 8, radius: 3.5, mult: 1.5, multPerLv: 0.15, elem: 'ice',
    desc: '적 위치에 큰 눈보라를 일으켜 넓은 범위의 적에게 냉기 피해를 줍니다.',
  },
  thunderbolt: {
    cls: 'mage', id: 'thunderbolt', name: '썬더볼트', icon: '⚡',
    cd: 8, cdMin: 5, cdPerLv: 0.25, range: 9, mult: 2.2, multPerLv: 0.2, elem: 'holy',
    desc: '벼락을 떨어뜨려 한 명의 적에게 큰 피해를 줍니다.',
  },
  whirlwind: {
    cls: 'melee', id: 'whirlwind', name: '회전 베기', icon: '🌀',
    cd: 9, cdMin: 6, cdPerLv: 0.3, radius: 3.6, mult: 1.3, multPerLv: 0.12, elem: 'blade',
    desc: '몸을 빙글 돌려 주변 모든 적을 한 번에 벱니다.',
  },
  swordwave: {
    cls: 'melee', id: 'swordwave', name: '검기 날리기', icon: '🌪️',
    cd: 8, cdMin: 5, cdPerLv: 0.3, range: 7, mult: 1.4, multPerLv: 0.15, elem: 'blade',
    desc: '전방으로 참격파를 날려 일직선의 적을 베어냅니다.',
  },
  multishot: {
    cls: 'melee', id: 'multishot', name: '멀티샷', icon: '🎯',
    cd: 8, cdMin: 5, cdPerLv: 0.25, range: 8, mult: 1.0, multPerLv: 0.12, shots: 3, elem: 'blade',
    desc: '가까운 적 3명에게 화살을 한 발씩 동시에 쏩니다.',
  },
  pierce: {
    cls: 'melee', id: 'pierce', name: '관통 사격', icon: '➡️',
    cd: 8, cdMin: 5, cdPerLv: 0.3, range: 9, mult: 1.5, multPerLv: 0.15, elem: 'blade',
    desc: '고속 화살이 일직선의 적을 꿰뚫고 지나갑니다.',
  },
  stunStrike: {
    cls: 'melee', id: 'stunStrike', name: '스턴 강타', icon: '💥',
    cd: 9, cdMin: 6, cdPerLv: 0.3, range: 2.5, mult: 1.8, multPerLv: 0.18, stunT: 1.5, elem: 'blade',
    desc: '가장 가까운 적을 세게 쳐서 큰 피해와 함께 1.5초 기절시킵니다 (보스급은 피해만).',
  },
  heal: {
    cls: 'healer', id: 'heal', name: '치유의 빛', icon: '💗',
    cd: 8, cdMin: 5, cdPerLv: 0.3, healPct: 0.15, healPctPerLv: 0.02, healFlat: 10, healFlatPerLv: 5,
    desc: '가장 다친 아군을 회복합니다. Lv.4부터 두 명, Lv.7부터 파티 전체를 회복하고, Lv.3부터 대상의 독도 풉니다.',
  },
  groupHeal: {
    cls: 'healer', id: 'groupHeal', name: '단체 힐', icon: '💖',
    cd: 10, cdMin: 7, cdPerLv: 0.3, healPct: 0.12, healPctPerLv: 0.015, healFlat: 8, healFlatPerLv: 4,
    desc: '주인공과 동행 중인 동료 모두의 체력을 회복합니다.',
  },
  cleanse: {
    cls: 'healer', id: 'cleanse', name: '독 해제', icon: '🧼',
    cd: 9, cdMin: 6, cdPerLv: 0.3, healPct: 0.08, healPctPerLv: 0.01, healFlat: 6, healFlatPerLv: 3,
    desc: '아군의 독을 풀고 4초 동안 독에 걸리지 않게 하며, 다친 아군을 조금 회복합니다.',
  },
};

// 직업별 고유 스킬 풀 — 동료를 뽑을 때 이 중에서 하나를 랜덤으로 받는다.
export const COMPANION_SKILL_POOLS = {
  tank: ['shieldSlam', 'tauntRoar', 'stunSlam'],
  mage: ['fireball', 'icebolt', 'firewall', 'blizzard', 'thunderbolt'],
  melee: ['whirlwind', 'swordwave', 'multishot', 'pierce', 'stunStrike'],
  healer: ['heal', 'groupHeal', 'cleanse'],
};

// 스킬북 → 동료 고유 스킬 매핑 (스킬북을 쓰면 같은 스킬을 쓰는 동료의 보너스 +1).
export const SKILL_BOOK_SKILL = {
  fireball: 'fireball', icebolt: 'icebolt', firewall: 'firewall',
  swordwave: 'swordwave', whirlwind: 'whirlwind', multishot: 'multishot', pierce: 'pierce',
  heal1: 'heal', healAll: 'groupHeal', cleanse: 'cleanse',
};

// 동료 피해 계수 — 동료가 주인공보다 세서 돌아만 다녀도 몹이 다 죽던 문제를 잡는다.
// 기본 공격·스킬 모두 companionAtk를 거치므로 이 한 곳만 바꾸면 둘 다 줄어든다.
// (체력·치유·도발은 건드리지 않는다)
export const COMPANION_DMG_FACTOR = 0.6;

export const GRADE_ADJ = ['낡은', '단단한', '빛나는', '에픽의', '전설의', '신화의'];
export const WEAPON_BASE = {
  sword: '학생회 장검', dagger: '급식 단검', axe: '체육 도끼', mace: '철퇴',
  bow: '사냥 활', crossbow: '석궁', staff: '마법 지팡이', book: '마법책',
};
export const ITEM_STATS = {
  weapon:  { atk: [6, 11, 17, 25, 35, 48] },
  armor:   { def: [4, 7, 11, 16, 23, 33] },
};

export const OPT_LABEL = {
  atkPct: '공격력', defPct: '방어력', hpPct: '최대 체력', crit: '치명타 확률',
  critDmg: '치명타 피해', evade: '회피', moveSpeed: '이동 속도', resist: '받는 피해 감소',
};

// 등급이 높을수록 붙는 복합 스탯 개수가 늘어난다 (일반 1 → 신화 4)
export const OPT_COUNT = [1, 1, 2, 2, 3, 4];

export function itemOptions(kind, fam, grade) {
  const n = OPT_COUNT[grade] || 1;
  const g = grade;
  if (kind === 'armor') {
    const all = [
      { k: 'defPct', v: 4 + g * 4 },
      { k: 'hpPct', v: 5 + g * 5 },
      { k: 'resist', v: 4 + g * 5 },
      { k: 'defPct', v: 3 + g * 3 },
    ];
    return all.slice(0, n);
  }
  if (kind === 'accessory') {
    const pool = {
      necklace: [
        { k: 'atkPct', v: 4 + g * 3 },
        { k: 'crit', v: +(1.5 + g * 1.2).toFixed(1) },
        { k: 'critDmg', v: 10 + g * 6 },
        { k: 'atkPct', v: 3 + g * 2 },
      ],
      ring: [
        { k: 'defPct', v: 5 + g * 4 },
        { k: 'hpPct', v: 5 + g * 5 },
        { k: 'atkPct', v: 3 + g * 2 },
        { k: 'defPct', v: 4 + g * 3 },
      ],
      earring: [
        { k: 'evade', v: +(2 + g * 1.2).toFixed(1) },
        { k: 'moveSpeed', v: +(2 + g * 1.5).toFixed(1) },
        { k: 'critDmg', v: 8 + g * 5 },
        { k: 'crit', v: +(1 + g).toFixed(1) },
      ],
    };
    return (pool[fam] || pool.ring).slice(0, n);
  }
  if (kind === 'weapon') {
    if (grade >= 3) return [{ k: 'crit', v: +(1 + grade).toFixed(1) }];
    return [];
  }
  return [];
}

// 구역별 몬스터 성장 배율 (HP·공격력은 아래 표에 구역별 절대값)
const SCALE = {
  1: { xp: 1.00, gold: 1.00, lvl: 3 },
  2: { xp: 2.25, gold: 2.60, lvl: 8 },
  3: { xp: 4.70, gold: 5.20, lvl: 14 },
  4: { xp: 9.10, gold: 9.60, lvl: 21 },
  5: { xp: 14.0, gold: 15.0, lvl: 27 },
  6: { xp: 20.0, gold: 21.0, lvl: 33 },
  7: { xp: 28.0, gold: 30.0, lvl: 39 },
  8: { xp: 38.0, gold: 40.0, lvl: 45 },
  9: { xp: 50.0, gold: 53.0, lvl: 52 },
};

const DROP_W = {
  1: [58, 30, 10, 2, 0, 0],
  2: [40, 32, 20, 7, 1, 0],
  3: [24, 30, 27, 14, 4.4, 0.6],
  4: [14, 24, 30, 21, 9.6, 1.4],
  5: [8, 20, 32, 26, 12, 2],
  6: [6, 16, 30, 28, 16, 4],
  7: [4, 12, 28, 30, 20, 6],
  8: [3, 10, 24, 32, 24, 7],
  9: [2, 8, 20, 32, 28, 10],
};

const E = (o) => o;

export const ZONES = [
  {
    id: 1, key: 'yeouido', name: '여의도 시작의 숲', short: '여의도', icon: '🌳',
    sub: '차원이동이 시작된 곳 · 초보 사냥터',
    theme: {
      ground: 0x3d8a32, ground2: '#24521f', grass: '#63bb4c', accent: 0x8fd06a,
      sky: 0x9fd8ff, fog: 0xbfe4ff, fogDensity: 0.012,
      prop: ['tree', 'rock', 'bush', 'grass', 'flower'], ambient: 'firefly', ambientColor: 0xfff3a0,
    },
    threat: 'slash',
    // 하나의 연결된 서울 지도에서의 위치 (월드 좌표 중심) — 로컬 좌표는 그대로 두고 중심만 더한다
    map: { cx: -96, cz: 96 },
    npc: { name: '숲지기 노인', x: 4, z: 22, icon: '🧙‍♂️' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -32 }, mid: { x: -19, z: -6 }, field: { x: 30, z: -24 },
    scale: SCALE[1], dropW: DROP_W[1],
    mobs: {
      normal: [
        E({ key: 'slime', name: '풀슬라임', shape: 'slime', color: 0x6cdc8a, dark: 0x3aa85c, hp: 34, atk: 8, speed: 1.55, atkRange: 1.5, atkCd: 1.3, aggro: 5, style: 'melee', soul: 'gray' }),
        E({ key: 'goblin', name: '고블린', shape: 'goblin', color: 0x8fbf5a, dark: 0x4c7a2e, hp: 46, atk: 10, speed: 2.1, atkRange: 1.7, atkCd: 1.25, aggro: 5.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'orc', name: '오크 정예', shape: 'orc', color: 0x6e9450, dark: 0x3c5a28, hp: 120, atk: 16, speed: 1.9, atkRange: 2.0, atkCd: 1.5, aggro: 6.5, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'ogre', name: '거대 오우거', shape: 'ogre', color: 0xb08a5a, dark: 0x6b4a25, hp: 380, atk: 26, speed: 1.7, atkRange: 2.6, atkCd: 1.7, aggro: 9, style: 'aoe', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'ent', name: '숲의 거대 엔트', shape: 'ent', color: 0x7c5b34, dark: 0x3e6b32, hp: 760, atk: 34, speed: 1.35, atkRange: 3.2, atkCd: 1.9, aggro: 12, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldOgre', name: '황금 오우거', shape: 'ogre', color: 0xc9a13a, dark: 0x7a5a1e, hp: 1900, atk: 44, speed: 1.5, atkRange: 3.0, atkCd: 2.0, aggro: 12, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: -13, z: 12, hide: 'rock' }, { x: 15, z: 4, hide: 'tree' }, { x: 20, z: -18, hide: 'rock' }, { x: -6, z: -22, hide: 'tree' }],
    quests: {
      title: '숲을 되찾는 첫걸음', npc: '숲지기 노인',
      steps: [
        { text: '숲의 몬스터 처치', type: 'kill', n: 6, reward: { gold: 60, pt: 2, xp: 40 } },
        { text: '거대 오우거 처치', type: 'mid', n: 1, reward: { gold: 120, item: 2, xp: 120 } },
        { text: '숲의 거대 엔트 처치', type: 'boss', n: 1, reward: { gold: 200, soul: 'green', soulN: 6, xp: 180, unlock: 2 } },
      ],
    },
  },
  {
    id: 2, key: 'magok', name: '마곡 안개 늪지', short: '마곡', icon: '🌫️',
    sub: '독 안개가 자욱한 습지 · 해독 부적 필요',
    theme: {
      ground: 0x35583f, ground2: '#1c2f22', grass: '#4f8f4a', accent: 0x9be08a,
      sky: 0x9fb8ad, fog: 0x9fc4ad, fogDensity: 0.028,
      prop: ['deadTree', 'rock', 'reed', 'grass'], ambient: 'spore', ambientColor: 0xb9ff9a,
    },
    threat: 'magic',
    map: { cx: -96, cz: 0 },
    // 이 구역으로 들어오는 방벽(게이트) 위치 — 이전 구역 보스를 처치하면 열린다
    gate: { x: -96, z: 48, along: 'x' },
    npc: { name: '늪지 약초꾼', x: -5, z: 22, icon: '🧝‍♀️' },
    spawn: { x: 0, z: 23 }, boss: { x: 2, z: -32 }, mid: { x: 20, z: -8 }, field: { x: -30, z: -26 },
    scale: SCALE[2], dropW: DROP_W[2],
    mobs: {
      normal: [
        E({ key: 'frog', name: '독개구리', shape: 'frog', color: 0x93c94f, dark: 0x4e7722, hp: 90, atk: 15, speed: 1.75, atkRange: 6.5, atkCd: 2.2, aggro: 5.5, style: 'poison', soul: 'gray' }),
        E({ key: 'lizard', name: '리자드맨', shape: 'lizard', color: 0x5d9a76, dark: 0x2f5c44, hp: 110, atk: 18, speed: 2.25, atkRange: 2.1, atkCd: 1.35, aggro: 6, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'wraith', name: '늪지 망령', shape: 'wraith', color: 0x8f7fc4, dark: 0x3b2f5e, hp: 260, atk: 24, speed: 1.6, atkRange: 7, atkCd: 2.3, aggro: 6.5, style: 'ranged', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'hydra', name: '늪지 히드라', shape: 'hydra', color: 0x6fae68, dark: 0x2f6136, hp: 1200, atk: 36, speed: 1.5, atkRange: 3.4, atkCd: 1.8, aggro: 10, style: 'poison', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'witch', name: '부패한 늪지 마녀', shape: 'witch', color: 0x9b6fbf, dark: 0x3d2450, hp: 2400, atk: 46, speed: 1.45, atkRange: 7.5, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldHydra', name: '황금 히드라', shape: 'hydra', color: 0xb99a3a, dark: 0x5b6b22, hp: 5200, atk: 62, speed: 1.45, atkRange: 3.6, atkCd: 2.1, aggro: 12, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: 14, z: 14, hide: 'deadTree' }, { x: -20, z: -2, hide: 'rock' }, { x: 8, z: -24, hide: 'wall' }],
    // 추가 보스 (2차 보스 패턴) — 각자 타이머가 지난 경우에만 등장
    extraBosses: [
      {
        type: 'shroom', label: '독버섯 보스',
        def: E({ key: 'shroom', name: '독버섯 군주', shape: 'mushroom', color: 0xb06ab0, dark: 0x5a2a6a, hp: 1500, atk: 40, speed: 1.4, atkRange: 3.0, atkCd: 1.9, aggro: 10, style: 'poison', elite: true, boss: 'mid', soul: 'blue', elem: 'nature', timerType: 'shroom', pattern: 'poison' }),
        x: -20, z: 10,
      },
      {
        type: 'twins', label: '쌍둥이 마녀',
        defs: [
          E({ key: 'twinA', name: '쌍둥이 마녀 루나', shape: 'witch', color: 0x7fb0e0, dark: 0x2a4a6a, hp: 1700, atk: 42, speed: 1.5, atkRange: 7.0, atkCd: 2.0, aggro: 12, style: 'aoe', boss: 'boss', soul: 'purple', elem: 'shadow', timerType: 'twins', pattern: 'twins', group: 'twins', enrage: true }),
          E({ key: 'twinB', name: '쌍둥이 마녀 솔라', shape: 'witch', color: 0xe0a0c0, dark: 0x6a2a4a, hp: 1700, atk: 42, speed: 1.5, atkRange: 7.0, atkCd: 2.0, aggro: 12, style: 'aoe', boss: 'boss', soul: 'purple', elem: 'shadow', timerType: 'twins', pattern: 'twins', group: 'twins', enrage: true }),
        ],
        x: 18, z: -18,
      },
    ],
    quests: {
      title: '안개 속의 약초', npc: '늪지 약초꾼',
      steps: [
        { text: '늪지 몬스터 처치', type: 'kill', n: 8, reward: { gold: 150, item: 2, xp: 160, charm: 'antidote' } },
        { text: '늪지 히드라 처치', type: 'mid', n: 1, reward: { gold: 260, soul: 'blue', soulN: 2, xp: 300 } },
        { text: '부패한 늪지 마녀 처치', type: 'boss', n: 1, reward: { gold: 400, soul: 'purple', soulN: 3, xp: 420, unlock: 3 } },
      ],
    },
  },
  {
    id: 3, key: 'gangbuk', name: '강북 황금 사막', short: '강북', icon: '🏜️',
    sub: '작열하는 모래와 고대 무덤 · 원거리 위협',
    theme: {
      ground: 0xcfa34c, ground2: '#99702c', grass: '#e6c779', accent: 0xf0dc9a,
      sky: 0xffd9a0, fog: 0xffe3b0, fogDensity: 0.016,
      prop: ['cactus', 'sandRock', 'pillar', 'sandRock'], ambient: 'sand', ambientColor: 0xfff0c0,
    },
    threat: 'ranged',
    map: { cx: -96, cz: -96 },
    gate: { x: -96, z: -48, along: 'x' },
    npc: { name: '사막 대상인', x: 5, z: 22, icon: '🧕' },
    spawn: { x: 0, z: 23 }, boss: { x: -2, z: -32 }, mid: { x: 18, z: -4 }, field: { x: 30, z: 24 },
    scale: SCALE[3], dropW: DROP_W[3],
    mobs: {
      normal: [
        E({ key: 'scorpion', name: '모래 전갈', shape: 'scorpion', color: 0xd08a3e, dark: 0x8a5220, hp: 175, atk: 26, speed: 2.3, atkRange: 1.9, atkCd: 1.15, aggro: 6.5, style: 'melee', soul: 'gray' }),
        E({ key: 'mummy', name: '미라', shape: 'mummy', color: 0xd8cfa8, dark: 0x8f8258, hp: 210, atk: 30, speed: 1.25, atkRange: 7.5, atkCd: 2.4, aggro: 7, style: 'ranged', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'scarab', name: '스카라브 정예', shape: 'scarab', color: 0x3f8f9a, dark: 0x1e4f57, hp: 460, atk: 38, speed: 2.5, atkRange: 2.0, atkCd: 1.3, aggro: 7.5, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'anubis', name: '아누비스 전사', shape: 'anubis', color: 0x2f3247, dark: 0xc9a13a, hp: 2200, atk: 52, speed: 2.0, atkRange: 2.6, atkCd: 1.4, aggro: 11, style: 'melee', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'golem', name: '고대 모래 골렘', shape: 'golem', color: 0xc9a468, dark: 0x7a5a2c, hp: 4200, atk: 62, speed: 1.3, atkRange: 3.8, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldAnubis', name: '황금 아누비스', shape: 'anubis', color: 0xcaa03a, dark: 0x3a3020, hp: 8800, atk: 78, speed: 2.0, atkRange: 2.8, atkCd: 1.6, aggro: 12, style: 'melee', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: -16, z: 8, hide: 'sandRock' }, { x: 18, z: 12, hide: 'pillar' }, { x: -9, z: -20, hide: 'sandRock' }],
    // 추가 보스 (2차 보스 패턴) — 각자 타이머가 지난 경우에만 등장
    extraBosses: [
      {
        type: 'brothers', label: '바바리안 3형제',
        defs: [
          E({ key: 'barbAxe', name: '바바리안 맏형', shape: 'barbarian', weapon: 'axe', color: 0xc05a3a, dark: 0x5a2418, hp: 2600, atk: 58, speed: 1.9, atkRange: 2.6, atkCd: 1.4, aggro: 11, style: 'melee', boss: 'boss', soul: 'purple', elem: 'blade', timerType: 'brothers', pattern: 'brothers', group: 'brothers', statue: true, enrage: true }),
          E({ key: 'barbBow', name: '바바리안 둘째', shape: 'barbarian', weapon: 'bow', color: 0x6a9a4a, dark: 0x2a4a1e, hp: 2100, atk: 52, speed: 2.0, atkRange: 8.0, atkCd: 1.8, aggro: 11, style: 'ranged', boss: 'boss', soul: 'purple', elem: 'blade', timerType: 'brothers', pattern: 'brothers', group: 'brothers', statue: true, enrage: true }),
          E({ key: 'barbMace', name: '바바리안 막내', shape: 'barbarian', weapon: 'mace', color: 0x5a7ac0, dark: 0x243a6a, hp: 2900, atk: 55, speed: 1.7, atkRange: 2.6, atkCd: 1.6, aggro: 11, style: 'melee', boss: 'boss', soul: 'purple', elem: 'holy', timerType: 'brothers', pattern: 'brothers', group: 'brothers', statue: true, enrage: true }),
        ],
        x: -18, z: 12,
      },
    ],
    quests: {
      title: '모래 아래 유산', npc: '사막 대상인',
      steps: [
        { text: '사막 몬스터 처치', type: 'kill', n: 10, reward: { gold: 320, pt: 2, xp: 420 } },
        { text: '아누비스 전사 처치', type: 'mid', n: 1, reward: { gold: 480, item: 3, xp: 600 } },
        { text: '고대 모래 골렘 처치', type: 'boss', n: 1, reward: { gold: 700, charm: 'aqua', soul: 'purple', soulN: 4, xp: 800 } },
      ],
    },
  },
  {
    id: 4, key: 'hangang', name: '한강 심해 유적', short: '한강', icon: '🌊',
    sub: '물빛에 잠긴 고대 도시 · 수중호흡 아티팩트 필요',
    theme: {
      ground: 0x236b7c, ground2: '#103842', grass: '#3f9aab', accent: 0x7fe0e0,
      sky: 0x0e3f5a, fog: 0x1e6c86, fogDensity: 0.03,
      prop: ['coral', 'ruinPillar', 'bubbleRock', 'coral'], ambient: 'bubble', ambientColor: 0x9fe8ff,
    },
    threat: 'blunt',
    map: { cx: 0, cz: -96 },
    gate: { x: -48, z: -96, along: 'z' },
    npc: { name: '심해의 기록관', x: 6, z: 22, icon: '🧜' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -33 }, mid: { x: -20, z: -5 }, field: { x: 30, z: 22 },
    scale: SCALE[4], dropW: DROP_W[4],
    mobs: {
      normal: [
        E({ key: 'merrow', name: '어인 머록', shape: 'merfolk', color: 0x4aa3b8, dark: 0x1e5566, hp: 380, atk: 44, speed: 2.3, atkRange: 2.1, atkCd: 1.2, aggro: 6.5, style: 'melee', soul: 'gray' }),
        E({ key: 'naga', name: '심해 나가', shape: 'naga', color: 0x6f7fd0, dark: 0x2c3566, hp: 420, atk: 50, speed: 1.9, atkRange: 7.5, atkCd: 2.2, aggro: 7.5, style: 'ranged', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'crab', name: '갑각 크랩 정예', shape: 'crab', color: 0xd2703e, dark: 0x7a3a1c, hp: 980, atk: 62, speed: 2.2, atkRange: 2.3, atkCd: 1.3, aggro: 8, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'siren', name: '세이렌', shape: 'siren', color: 0x7fe0d0, dark: 0x2a6a7a, hp: 3800, atk: 78, speed: 1.8, atkRange: 7.8, atkCd: 1.9, aggro: 12, style: 'aoe', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'kraken', name: '심해 크라켄', shape: 'kraken', color: 0x7a4fa8, dark: 0x3a1c5a, hp: 7000, atk: 96, speed: 1.4, atkRange: 4.2, atkCd: 1.9, aggro: 14, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldKraken', name: '황금 크라켄', shape: 'kraken', color: 0xc9a13a, dark: 0x5a3a1a, hp: 15000, atk: 118, speed: 1.35, atkRange: 4.4, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: 16, z: 10, hide: 'coral' }, { x: -14, z: -14, hide: 'ruinPillar' }, { x: 12, z: -26, hide: 'bubbleRock' }],
    // 추가 보스 (2차 보스 패턴) — 각자 타이머가 지난 경우에만 등장
    extraBosses: [
      {
        type: 'dragon', label: '심해룡',
        def: E({ key: 'dragon', name: '심해룡', shape: 'dragon', color: 0x3f8fd0, dark: 0x1c4a6a, hp: 6800, atk: 92, speed: 1.6, atkRange: 4.0, atkCd: 1.9, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple', elem: 'water', timerType: 'dragon', pattern: 'dragon', enrage: true }),
        x: -28, z: -10,
      },
    ],
    quests: {
      title: '가라앉은 기록', npc: '심해의 기록관',
      steps: [
        { text: '심해 몬스터 처치', type: 'kill', n: 12, reward: { gold: 600, pt: 2, xp: 900 } },
        { text: '세이렌 처치', type: 'mid', n: 1, reward: { gold: 800, item: 4, xp: 1200 } },
        { text: '심해 크라켄 처치', type: 'boss', n: 1, reward: { gold: 1200, soul: 'purple', soulN: 6, xp: 1600 } },
      ],
    },
  },
  {
    id: 5, key: 'namsan', name: '남산 하늘 유적', short: '남산', icon: '🏯',
    sub: '구름 위의 고대 유적 · 하늘의 파수꾼',
    theme: {
      ground: 0x8fa3b8, ground2: '#46566a', grass: '#b8c8dc', accent: 0xd0e0f0,
      sky: 0xbfdcff, fog: 0xa8c8e8, fogDensity: 0.014,
      prop: ['pillar', 'tree', 'rock', 'grass'], ambient: 'firefly', ambientColor: 0xfff3a0,
    },
    threat: 'magic',
    map: { cx: 0, cz: 0 },
    gate: { x: 0, z: -48, along: 'x' },
    npc: { name: '하늘의 파수꾼', x: 5, z: 22, icon: '🧝' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -32 }, mid: { x: -19, z: -6 }, field: { x: 30, z: -24 },
    scale: SCALE[5], dropW: DROP_W[5],
    mobs: {
      normal: [
        E({ key: 'skySpirit', name: '하늘 정령', shape: 'wraith', color: 0x9fc8e8, dark: 0x3a5a7a, hp: 520, atk: 58, speed: 1.8, atkRange: 7.0, atkCd: 2.2, aggro: 6.5, style: 'ranged', soul: 'gray' }),
        E({ key: 'ruinGuard', name: '유적 수호병', shape: 'goblin', color: 0xb8a888, dark: 0x6a5a3a, hp: 570, atk: 64, speed: 2.1, atkRange: 1.8, atkCd: 1.3, aggro: 5.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'skyKnight', name: '하늘 기사', shape: 'anubis', color: 0x7fb0d0, dark: 0x2a4a6a, hp: 1350, atk: 80, speed: 2.0, atkRange: 2.6, atkCd: 1.4, aggro: 7, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'skyGuardian', name: '하늘 수호자', shape: 'anubis', color: 0x9fc8e8, dark: 0x2a4a6a, hp: 5200, atk: 100, speed: 1.9, atkRange: 2.8, atkCd: 1.5, aggro: 11, style: 'melee', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'skyPriest', name: '하늘 대제사장', shape: 'witch', color: 0xc0a0e8, dark: 0x4a2a6a, hp: 9500, atk: 122, speed: 1.45, atkRange: 7.5, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldSkyGuardian', name: '황금 하늘 수호자', shape: 'anubis', color: 0xc9a13a, dark: 0x5a4a1a, hp: 20000, atk: 150, speed: 1.9, atkRange: 3.0, atkCd: 1.7, aggro: 13, style: 'melee', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: -14, z: 10, hide: 'pillar' }, { x: 16, z: -12, hide: 'rock' }, { x: 8, z: -24, hide: 'tree' }],
    quests: {
      title: '하늘 유적의 부름', npc: '하늘의 파수꾼',
      steps: [
        { text: '하늘 유적 몬스터 처치', type: 'kill', n: 14, reward: { gold: 900, pt: 2, xp: 1500 } },
        { text: '하늘 수호자 처치', type: 'mid', n: 1, reward: { gold: 1200, item: 4, xp: 2000 } },
        { text: '하늘 대제사장 처치', type: 'boss', n: 1, reward: { gold: 1800, soul: 'purple', soulN: 6, xp: 2600, unlock: 6 } },
      ],
    },
  },
  {
    id: 6, key: 'gwanak', name: '관악 용암 화산', short: '관악', icon: '🌋',
    sub: '끓어오르는 용암과 잿빛 하늘',
    theme: {
      ground: 0x8a3a28, ground2: '#3a1a12', grass: '#c05a3a', accent: 0xffa060,
      sky: 0xff9a6a, fog: 0xd86a4a, fogDensity: 0.02,
      prop: ['sandRock', 'pillar', 'rock', 'cactus'], ambient: 'sand', ambientColor: 0xffc080,
    },
    threat: 'blunt',
    map: { cx: 0, cz: 96 },
    gate: { x: 0, z: 48, along: 'x' },
    npc: { name: '화산의 대장장이', x: -5, z: 22, icon: '🧑‍🏭' },
    spawn: { x: 0, z: 23 }, boss: { x: 2, z: -32 }, mid: { x: 18, z: -4 }, field: { x: -30, z: 24 },
    scale: SCALE[6], dropW: DROP_W[6],
    mobs: {
      normal: [
        E({ key: 'lavaSlime', name: '용암 슬라임', shape: 'slime', color: 0xe86a3a, dark: 0x7a2a1a, hp: 700, atk: 72, speed: 1.6, atkRange: 1.5, atkCd: 1.3, aggro: 5.5, style: 'melee', soul: 'gray' }),
        E({ key: 'volcanoImp', name: '화산 임프', shape: 'goblin', color: 0xd05a4a, dark: 0x6a2418, hp: 760, atk: 78, speed: 2.3, atkRange: 1.9, atkCd: 1.2, aggro: 6.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'lavaGolem', name: '용암 골렘', shape: 'golem', color: 0xc05a2a, dark: 0x5a2410, hp: 1800, atk: 96, speed: 1.4, atkRange: 3.4, atkCd: 1.8, aggro: 7, style: 'aoe', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'magmaGolem', name: '마그마 골렘', shape: 'golem', color: 0xd06a2a, dark: 0x6a2a10, hp: 7000, atk: 122, speed: 1.35, atkRange: 3.6, atkCd: 1.9, aggro: 11, style: 'aoe', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'volcanoLord', name: '화산의 군주', shape: 'ogre', color: 0xb03a24, dark: 0x4a1810, hp: 12800, atk: 148, speed: 1.6, atkRange: 3.0, atkCd: 1.8, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldMagmaGolem', name: '황금 마그마 골렘', shape: 'golem', color: 0xc9a13a, dark: 0x5a3a10, hp: 27000, atk: 180, speed: 1.35, atkRange: 3.8, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: -16, z: 6, hide: 'sandRock' }, { x: 14, z: 14, hide: 'pillar' }, { x: -8, z: -22, hide: 'rock' }],
    quests: {
      title: '타오르는 심장', npc: '화산의 대장장이',
      steps: [
        { text: '화산 몬스터 처치', type: 'kill', n: 16, reward: { gold: 1300, pt: 2, xp: 2200 } },
        { text: '마그마 골렘 처치', type: 'mid', n: 1, reward: { gold: 1700, item: 4, xp: 3000 } },
        { text: '화산의 군주 처치', type: 'boss', n: 1, reward: { gold: 2400, soul: 'purple', soulN: 7, xp: 3800, unlock: 7 } },
      ],
    },
  },
  {
    id: 7, key: 'gangnam', name: '강남 달표면 황무지', short: '강남', icon: '🌑',
    sub: '회색 달빛 아래 고요한 황무지',
    theme: {
      ground: 0x8a8f96, ground2: '#4a4d55', grass: '#b9bec8', accent: 0xd0d8e8,
      sky: 0x2a2a3a, fog: 0x6a6a7a, fogDensity: 0.016,
      prop: ['rock', 'pillar', 'sandRock'], ambient: 'spore', ambientColor: 0xc0c8ff,
    },
    threat: 'ranged',
    map: { cx: 96, cz: 96 },
    gate: { x: 48, z: 96, along: 'z' },
    npc: { name: '달의 점쟁이', x: 6, z: 22, icon: '🧙‍♀️' },
    spawn: { x: 0, z: 23 }, boss: { x: -2, z: -32 }, mid: { x: -18, z: 6 }, field: { x: 28, z: 22 },
    scale: SCALE[7], dropW: DROP_W[7],
    mobs: {
      normal: [
        E({ key: 'moonShadow', name: '달그림자', shape: 'wraith', color: 0x8f8fb8, dark: 0x3a3a55, hp: 950, atk: 88, speed: 1.7, atkRange: 7.0, atkCd: 2.3, aggro: 6.5, style: 'ranged', soul: 'gray' }),
        E({ key: 'moonRabbit', name: '달토끼', shape: 'frog', color: 0xd8d8e8, dark: 0x6a6a8a, hp: 1020, atk: 95, speed: 1.9, atkRange: 2.0, atkCd: 1.3, aggro: 5.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'moonKnight', name: '달의 기사', shape: 'anubis', color: 0x7a7ab0, dark: 0x2a2a4a, hp: 2400, atk: 115, speed: 2.0, atkRange: 2.6, atkCd: 1.4, aggro: 7, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'moonGuardian', name: '달의 수호자', shape: 'anubis', color: 0x9a9ad0, dark: 0x3a3a5a, hp: 9500, atk: 148, speed: 2.0, atkRange: 2.8, atkCd: 1.5, aggro: 11, style: 'melee', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'moonQueen', name: '달의 여왕', shape: 'siren', color: 0xc8b8e8, dark: 0x4a3a6a, hp: 17000, atk: 178, speed: 1.7, atkRange: 7.8, atkCd: 1.9, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldMoonQueen', name: '황금 달의 여왕', shape: 'siren', color: 0xc9a13a, dark: 0x5a4a1a, hp: 36000, atk: 215, speed: 1.65, atkRange: 8.0, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: 12, z: 12, hide: 'rock' }, { x: -18, z: -8, hide: 'pillar' }, { x: 6, z: -20, hide: 'sandRock' }],
    quests: {
      title: '달빛 황무지', npc: '달의 점쟁이',
      steps: [
        { text: '달표면 몬스터 처치', type: 'kill', n: 18, reward: { gold: 1900, pt: 2, xp: 3200 } },
        { text: '달의 수호자 처치', type: 'mid', n: 1, reward: { gold: 2400, item: 5, xp: 4400 } },
        { text: '달의 여왕 처치', type: 'boss', n: 1, reward: { gold: 3400, soul: 'purple', soulN: 8, xp: 5600, unlock: 8 } },
      ],
    },
  },
  {
    id: 8, key: 'dobong', name: '도봉 수정 빙하', short: '도봉', icon: '🧊',
    sub: '수정이 빛나는 얼어붙은 빙하',
    theme: {
      ground: 0x9fd4e8, ground2: '#3a6a8a', grass: '#d0f0ff', accent: 0x7fe0f0,
      sky: 0xcfe8ff, fog: 0xa8d0e8, fogDensity: 0.018,
      prop: ['rock', 'bubbleRock', 'pillar'], ambient: 'bubble', ambientColor: 0x9fe8ff,
    },
    threat: 'slash',
    map: { cx: 96, cz: 0 },
    gate: { x: 96, z: 48, along: 'x' },
    npc: { name: '빙하의 탐험가', x: -6, z: 22, icon: '🧑‍🚀' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -32 }, mid: { x: 20, z: -8 }, field: { x: -30, z: -24 },
    scale: SCALE[8], dropW: DROP_W[8],
    mobs: {
      normal: [
        E({ key: 'iceSlime', name: '얼음 슬라임', shape: 'slime', color: 0x9fd8f0, dark: 0x3a6a8a, hp: 1280, atk: 106, speed: 1.6, atkRange: 1.5, atkCd: 1.3, aggro: 5.5, style: 'melee', soul: 'gray' }),
        E({ key: 'glacierSpirit', name: '빙하 정령', shape: 'wraith', color: 0xb8e0f0, dark: 0x4a7a8a, hp: 1360, atk: 114, speed: 1.8, atkRange: 7.0, atkCd: 2.2, aggro: 6.5, style: 'ranged', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'crystalGolem', name: '수정 골렘', shape: 'golem', color: 0x7fc8d8, dark: 0x2a5a6a, hp: 3200, atk: 138, speed: 1.5, atkRange: 3.4, atkCd: 1.7, aggro: 7, style: 'aoe', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'glacierHydra', name: '빙하 히드라', shape: 'hydra', color: 0x6fb0d0, dark: 0x2a4a6a, hp: 12800, atk: 178, speed: 1.5, atkRange: 3.4, atkCd: 1.8, aggro: 11, style: 'poison', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'glacierQueen', name: '빙하의 여왕', shape: 'witch', color: 0xa8d0e8, dark: 0x3a5a7a, hp: 23000, atk: 212, speed: 1.45, atkRange: 7.5, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldGlacierHydra', name: '황금 빙하 히드라', shape: 'hydra', color: 0xc9a13a, dark: 0x5a5a1a, hp: 48000, atk: 255, speed: 1.45, atkRange: 3.6, atkCd: 2.1, aggro: 13, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: -12, z: 14, hide: 'bubbleRock' }, { x: 18, z: -6, hide: 'rock' }, { x: -6, z: -24, hide: 'pillar' }],
    quests: {
      title: '얼어붙은 수정', npc: '빙하의 탐험가',
      steps: [
        { text: '빙하 몬스터 처치', type: 'kill', n: 20, reward: { gold: 2600, pt: 3, xp: 4800 } },
        { text: '빙하 히드라 처치', type: 'mid', n: 1, reward: { gold: 3300, item: 5, xp: 6400 } },
        { text: '빙하의 여왕 처치', type: 'boss', n: 1, reward: { gold: 4600, soul: 'purple', soulN: 9, xp: 8200, unlock: 9 } },
      ],
    },
  },
  {
    id: 9, key: 'bukhansan', name: '북한산 설산 정상', short: '북한산', icon: '🏔️',
    sub: '눈 덮인 정상 · 지구 귀환 게이트',
    theme: {
      ground: 0xe8eef2, ground2: '#8a97a8', grass: '#ffffff', accent: 0xffffff,
      sky: 0xd8ecff, fog: 0xc8d8e8, fogDensity: 0.014,
      prop: ['tree', 'rock', 'pillar'], ambient: 'firefly', ambientColor: 0xffffff,
    },
    threat: 'blunt',
    map: { cx: 96, cz: -96 },
    gate: { x: 96, z: -48, along: 'x' },
    npc: { name: '설산의 은둔자', x: 4, z: 22, icon: '🧓' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -32 }, mid: { x: -20, z: -5 }, field: { x: 30, z: 22 },
    scale: SCALE[9], dropW: DROP_W[9],
    mobs: {
      normal: [
        E({ key: 'snowSpirit', name: '눈보라 정령', shape: 'wraith', color: 0xd8e8f0, dark: 0x6a7a8a, hp: 1720, atk: 128, speed: 1.8, atkRange: 7.0, atkCd: 2.2, aggro: 6.5, style: 'ranged', soul: 'gray' }),
        E({ key: 'snowYeti', name: '설산 예티', shape: 'ogre', color: 0xe8e8e8, dark: 0x8a8a8a, hp: 1820, atk: 136, speed: 1.7, atkRange: 2.6, atkCd: 1.6, aggro: 6.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'snowGiant', name: '설산 거인', shape: 'ogre', color: 0xd0d8e0, dark: 0x5a6a7a, hp: 4300, atk: 165, speed: 1.7, atkRange: 2.8, atkCd: 1.6, aggro: 7, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'snowGuardian', name: '설산의 수호자', shape: 'ogre', color: 0xe0e8f0, dark: 0x6a7a8a, hp: 17200, atk: 212, speed: 1.7, atkRange: 3.0, atkCd: 1.7, aggro: 11, style: 'aoe', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'snowKing', name: '설산의 왕', shape: 'ent', color: 0xf0f4f8, dark: 0x5a6a7a, hp: 31000, atk: 252, speed: 1.35, atkRange: 3.4, atkCd: 1.9, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
      field: E({ key: 'goldSnowKing', name: '황금 설산의 왕', shape: 'ent', color: 0xc9a13a, dark: 0x5a4a1a, hp: 65000, atk: 300, speed: 1.3, atkRange: 3.6, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'field', soul: 'gold' }),
    },
    chests: [{ x: 14, z: 8, hide: 'tree' }, { x: -16, z: -14, hide: 'rock' }, { x: 10, z: -26, hide: 'pillar' }],
    quests: {
      title: '설산 정상의 문', npc: '설산의 은둔자',
      steps: [
        { text: '설산 몬스터 처치', type: 'kill', n: 22, reward: { gold: 3600, pt: 3, xp: 7000 } },
        { text: '설산의 수호자 처치', type: 'mid', n: 1, reward: { gold: 4600, item: 5, xp: 9200 } },
        { text: '설산의 왕 처치', type: 'boss', n: 1, reward: { gold: 6400, soul: 'gold', soulN: 4, xp: 12000 } },
      ],
    },
  },
];

export const PLAYABLE = ZONES.filter((z) => !z.comingSoon);

export const MEDAL_TIERS = [12, 30, 60, 100, 150];
export const MEDAL_STEP = 0.14;

// ---------- 영혼 특성 (10페이지) ----------
// 1페이지 = 기존 10개 특성 그대로. 2~10페이지는 각 6개씩.
// 페이지는 앞 페이지를 모두 해금해야 열린다 (game.isTalentPageUnlocked).
// effect: derived()가 키별로 합산하는 보너스. 1페이지 수치는 기존 하드코딩과 동일해야 한다.
export const TALENTS = [
  // ---- 1페이지 (기존 그대로) ----
  { id: 'magnet', name: '자석 범위', icon: '🧲', desc: '아이템을 끌어당기는 범위 +40%', cost: { kind: 'gray', n: 5 }, x: 14, y: 12, req: [], page: 1, effect: { key: 'magnetPct', value: 40 } },
  { id: 'autoloot', name: '자동 루팅', icon: '🎣', desc: '드롭 아이템이 멀리서도 날아옵니다', cost: { kind: 'gray', n: 12 }, x: 50, y: 12, req: ['magnet'], page: 1, effect: { key: 'autoloot', value: true } },
  { id: 'regen', name: 'HP 재생', icon: '💚', desc: '초당 체력 +1.5 회복', cost: { kind: 'green', n: 8 }, x: 86, y: 26, req: ['autoloot'], page: 1, effect: { key: 'regen', value: 1.5 } },
  { id: 'atk', name: '공격력', icon: '💪', desc: '공격력 +9%', cost: { kind: 'green', n: 6 }, x: 14, y: 46, req: [], page: 1, effect: { key: 'atkPct', value: 9 } },
  { id: 'crit', name: '치명타', icon: '🎯', desc: '치명타 확률 +6%', cost: { kind: 'blue', n: 6 }, x: 50, y: 46, req: ['atk'], page: 1, effect: { key: 'crit', value: 6 } },
  { id: 'critdmg', name: '치명타 피해', icon: '💥', desc: '치명타 피해 +30%', cost: { kind: 'blue', n: 10 }, x: 86, y: 46, req: ['crit'], page: 1, effect: { key: 'critDmg', value: 30 } },
  { id: 'speed', name: '이동 속도', icon: '👟', desc: '이동 속도 +10%', cost: { kind: 'blue', n: 8 }, x: 14, y: 72, req: [], page: 1, effect: { key: 'moveSpeedPct', value: 10 } },
  { id: 'atkspeed', name: '공격 속도', icon: '⚡', desc: '공격 속도 +12%', cost: { kind: 'purple', n: 10 }, x: 50, y: 72, req: ['speed'], page: 1, effect: { key: 'atkSpeedPct', value: 12 } },
  { id: 'maxhp', name: '최대 체력', icon: '❤️', desc: '최대 체력 +15%', cost: { kind: 'purple', n: 12 }, x: 86, y: 72, req: [], page: 1, effect: { key: 'maxHpPct', value: 15 } },
  { id: 'loot', name: '드롭률', icon: '🍀', desc: '장비 드롭 확률 +30%', cost: { kind: 'purple', n: 16 }, x: 50, y: 92, req: ['atkspeed'], page: 1, effect: { key: 'lootPct', value: 30 } },
  // ---- 2페이지 (정예·중간보스 영혼) ----
  { id: 'atk2', name: '공격력 II', icon: '💪', desc: '공격력 +7%', cost: { kind: 'green', n: 10 }, x: 14, y: 22, req: [], page: 2, effect: { key: 'atkPct', value: 7 } },
  { id: 'crit2', name: '치명타 II', icon: '🎯', desc: '치명타 확률 +5%', cost: { kind: 'green', n: 12 }, x: 50, y: 22, req: ['atk2'], page: 2, effect: { key: 'crit', value: 5 } },
  { id: 'critdmg2', name: '치명타 피해 II', icon: '💥', desc: '치명타 피해 +25%', cost: { kind: 'blue', n: 8 }, x: 86, y: 22, req: ['crit2'], page: 2, effect: { key: 'critDmg', value: 25 } },
  { id: 'maxhp2', name: '최대 체력 II', icon: '❤️', desc: '최대 체력 +12%', cost: { kind: 'green', n: 10 }, x: 14, y: 66, req: [], page: 2, effect: { key: 'maxHpPct', value: 12 } },
  { id: 'def2', name: '방어력 II', icon: '🛡️', desc: '방어력 +8%', cost: { kind: 'blue', n: 8 }, x: 50, y: 66, req: ['maxhp2'], page: 2, effect: { key: 'defPct', value: 8 } },
  { id: 'regen2', name: 'HP 재생 II', icon: '💚', desc: '초당 체력 +1.5 회복', cost: { kind: 'blue', n: 10 }, x: 86, y: 66, req: ['def2'], page: 2, effect: { key: 'regen', value: 1.5 } },
  // ---- 3페이지 (중간보스 영혼) ----
  { id: 'atk3', name: '공격력 III', icon: '💪', desc: '공격력 +8%', cost: { kind: 'blue', n: 10 }, x: 14, y: 22, req: [], page: 3, effect: { key: 'atkPct', value: 8 } },
  { id: 'crit3', name: '치명타 III', icon: '🎯', desc: '치명타 확률 +5%', cost: { kind: 'blue', n: 12 }, x: 50, y: 22, req: ['atk3'], page: 3, effect: { key: 'crit', value: 5 } },
  { id: 'critdmg3', name: '치명타 피해 III', icon: '💥', desc: '치명타 피해 +25%', cost: { kind: 'blue', n: 14 }, x: 86, y: 22, req: ['crit3'], page: 3, effect: { key: 'critDmg', value: 25 } },
  { id: 'speed3', name: '이동 속도 III', icon: '👟', desc: '이동 속도 +8%', cost: { kind: 'blue', n: 10 }, x: 14, y: 66, req: [], page: 3, effect: { key: 'moveSpeedPct', value: 8 } },
  { id: 'atkspeed3', name: '공격 속도 III', icon: '⚡', desc: '공격 속도 +10%', cost: { kind: 'blue', n: 12 }, x: 50, y: 66, req: ['speed3'], page: 3, effect: { key: 'atkSpeedPct', value: 10 } },
  { id: 'evade3', name: '회피 III', icon: '🌀', desc: '회피 +3%', cost: { kind: 'blue', n: 12 }, x: 86, y: 66, req: ['atkspeed3'], page: 3, effect: { key: 'evade', value: 3 } },
  // ---- 4페이지 (중간보스·에픽보스 영혼) ----
  { id: 'maxhp3', name: '최대 체력 III', icon: '❤️', desc: '최대 체력 +12%', cost: { kind: 'blue', n: 12 }, x: 14, y: 22, req: [], page: 4, effect: { key: 'maxHpPct', value: 12 } },
  { id: 'def3', name: '방어력 III', icon: '🛡️', desc: '방어력 +9%', cost: { kind: 'blue', n: 12 }, x: 50, y: 22, req: ['maxhp3'], page: 4, effect: { key: 'defPct', value: 9 } },
  { id: 'magnet2', name: '자석 범위 II', icon: '🧲', desc: '아이템을 끌어당기는 범위 +35%', cost: { kind: 'blue', n: 10 }, x: 86, y: 22, req: ['def3'], page: 4, effect: { key: 'magnetPct', value: 35 } },
  { id: 'loot2', name: '드롭률 II', icon: '🍀', desc: '장비 드롭 확률 +25%', cost: { kind: 'blue', n: 14 }, x: 14, y: 66, req: [], page: 4, effect: { key: 'lootPct', value: 25 } },
  { id: 'mp3', name: '최대 마나 III', icon: '🔮', desc: '최대 마나 +15%', cost: { kind: 'purple', n: 8 }, x: 50, y: 66, req: ['loot2'], page: 4, effect: { key: 'mpPct', value: 15 } },
  { id: 'regen3', name: 'HP 재생 III', icon: '💚', desc: '초당 체력 +1.5 회복', cost: { kind: 'purple', n: 10 }, x: 86, y: 66, req: ['mp3'], page: 4, effect: { key: 'regen', value: 1.5 } },
  // ---- 5페이지 (에픽보스 영혼) ----
  { id: 'atk4', name: '공격력 IV', icon: '💪', desc: '공격력 +9%', cost: { kind: 'purple', n: 10 }, x: 14, y: 22, req: [], page: 5, effect: { key: 'atkPct', value: 9 } },
  { id: 'crit4', name: '치명타 IV', icon: '🎯', desc: '치명타 확률 +5%', cost: { kind: 'purple', n: 12 }, x: 50, y: 22, req: ['atk4'], page: 5, effect: { key: 'crit', value: 5 } },
  { id: 'critdmg4', name: '치명타 피해 IV', icon: '💥', desc: '치명타 피해 +25%', cost: { kind: 'purple', n: 12 }, x: 86, y: 22, req: ['crit4'], page: 5, effect: { key: 'critDmg', value: 25 } },
  { id: 'atkspeed4', name: '공격 속도 IV', icon: '⚡', desc: '공격 속도 +10%', cost: { kind: 'purple', n: 12 }, x: 14, y: 66, req: [], page: 5, effect: { key: 'atkSpeedPct', value: 10 } },
  { id: 'speed4', name: '이동 속도 IV', icon: '👟', desc: '이동 속도 +8%', cost: { kind: 'purple', n: 12 }, x: 50, y: 66, req: ['atkspeed4'], page: 5, effect: { key: 'moveSpeedPct', value: 8 } },
  { id: 'evade4', name: '회피 IV', icon: '🌀', desc: '회피 +3%', cost: { kind: 'purple', n: 14 }, x: 86, y: 66, req: ['speed4'], page: 5, effect: { key: 'evade', value: 3 } },
  // ---- 6페이지 (에픽보스 영혼) ----
  { id: 'maxhp4', name: '최대 체력 IV', icon: '❤️', desc: '최대 체력 +13%', cost: { kind: 'purple', n: 12 }, x: 14, y: 22, req: [], page: 6, effect: { key: 'maxHpPct', value: 13 } },
  { id: 'def4', name: '방어력 IV', icon: '🛡️', desc: '방어력 +9%', cost: { kind: 'purple', n: 12 }, x: 50, y: 22, req: ['maxhp4'], page: 6, effect: { key: 'defPct', value: 9 } },
  { id: 'regen4', name: 'HP 재생 IV', icon: '💚', desc: '초당 체력 +2 회복', cost: { kind: 'purple', n: 14 }, x: 86, y: 22, req: ['def4'], page: 6, effect: { key: 'regen', value: 2 } },
  { id: 'loot3', name: '드롭률 III', icon: '🍀', desc: '장비 드롭 확률 +25%', cost: { kind: 'purple', n: 14 }, x: 14, y: 66, req: [], page: 6, effect: { key: 'lootPct', value: 25 } },
  { id: 'magnet3', name: '자석 범위 III', icon: '🧲', desc: '아이템을 끌어당기는 범위 +35%', cost: { kind: 'purple', n: 12 }, x: 50, y: 66, req: ['loot3'], page: 6, effect: { key: 'magnetPct', value: 35 } },
  { id: 'mp4', name: '최대 마나 IV', icon: '🔮', desc: '최대 마나 +15%', cost: { kind: 'purple', n: 12 }, x: 86, y: 66, req: ['magnet3'], page: 6, effect: { key: 'mpPct', value: 15 } },
  // ---- 7페이지 (에픽보스 영혼) ----
  { id: 'atk5', name: '공격력 V', icon: '💪', desc: '공격력 +10%', cost: { kind: 'purple', n: 14 }, x: 14, y: 22, req: [], page: 7, effect: { key: 'atkPct', value: 10 } },
  { id: 'crit5', name: '치명타 V', icon: '🎯', desc: '치명타 확률 +5%', cost: { kind: 'purple', n: 14 }, x: 50, y: 22, req: ['atk5'], page: 7, effect: { key: 'crit', value: 5 } },
  { id: 'critdmg5', name: '치명타 피해 V', icon: '💥', desc: '치명타 피해 +30%', cost: { kind: 'purple', n: 14 }, x: 86, y: 22, req: ['crit5'], page: 7, effect: { key: 'critDmg', value: 30 } },
  { id: 'speed5', name: '이동 속도 V', icon: '👟', desc: '이동 속도 +9%', cost: { kind: 'purple', n: 14 }, x: 14, y: 66, req: [], page: 7, effect: { key: 'moveSpeedPct', value: 9 } },
  { id: 'atkspeed5', name: '공격 속도 V', icon: '⚡', desc: '공격 속도 +11%', cost: { kind: 'purple', n: 14 }, x: 50, y: 66, req: ['speed5'], page: 7, effect: { key: 'atkSpeedPct', value: 11 } },
  { id: 'evade5', name: '회피 V', icon: '🌀', desc: '회피 +4%', cost: { kind: 'purple', n: 16 }, x: 86, y: 66, req: ['atkspeed5'], page: 7, effect: { key: 'evade', value: 4 } },
  // ---- 8페이지 (에픽보스 영혼) ----
  { id: 'maxhp5', name: '최대 체력 V', icon: '❤️', desc: '최대 체력 +14%', cost: { kind: 'purple', n: 14 }, x: 14, y: 22, req: [], page: 8, effect: { key: 'maxHpPct', value: 14 } },
  { id: 'def5', name: '방어력 V', icon: '🛡️', desc: '방어력 +10%', cost: { kind: 'purple', n: 14 }, x: 50, y: 22, req: ['maxhp5'], page: 8, effect: { key: 'defPct', value: 10 } },
  { id: 'regen5', name: 'HP 재생 V', icon: '💚', desc: '초당 체력 +2 회복', cost: { kind: 'purple', n: 16 }, x: 86, y: 22, req: ['def5'], page: 8, effect: { key: 'regen', value: 2 } },
  { id: 'loot4', name: '드롭률 IV', icon: '🍀', desc: '장비 드롭 확률 +30%', cost: { kind: 'purple', n: 16 }, x: 14, y: 66, req: [], page: 8, effect: { key: 'lootPct', value: 30 } },
  { id: 'mp5', name: '최대 마나 V', icon: '🔮', desc: '최대 마나 +18%', cost: { kind: 'purple', n: 14 }, x: 50, y: 66, req: ['loot4'], page: 8, effect: { key: 'mpPct', value: 18 } },
  { id: 'magnet4', name: '자석 범위 IV', icon: '🧲', desc: '아이템을 끌어당기는 범위 +40%', cost: { kind: 'purple', n: 14 }, x: 86, y: 66, req: ['mp5'], page: 8, effect: { key: 'magnetPct', value: 40 } },
  // ---- 9페이지 (지역 보스 영혼) ----
  { id: 'atk6', name: '공격력 VI', icon: '💪', desc: '공격력 +10%', cost: { kind: 'gold', n: 2 }, x: 14, y: 22, req: [], page: 9, effect: { key: 'atkPct', value: 10 } },
  { id: 'crit6', name: '치명타 VI', icon: '🎯', desc: '치명타 확률 +6%', cost: { kind: 'gold', n: 2 }, x: 50, y: 22, req: ['atk6'], page: 9, effect: { key: 'crit', value: 6 } },
  { id: 'critdmg6', name: '치명타 피해 VI', icon: '💥', desc: '치명타 피해 +30%', cost: { kind: 'gold', n: 3 }, x: 86, y: 22, req: ['crit6'], page: 9, effect: { key: 'critDmg', value: 30 } },
  { id: 'maxhp6', name: '최대 체력 VI', icon: '❤️', desc: '최대 체력 +15%', cost: { kind: 'gold', n: 2 }, x: 14, y: 66, req: [], page: 9, effect: { key: 'maxHpPct', value: 15 } },
  { id: 'def6', name: '방어력 VI', icon: '🛡️', desc: '방어력 +10%', cost: { kind: 'gold', n: 2 }, x: 50, y: 66, req: ['maxhp6'], page: 9, effect: { key: 'defPct', value: 10 } },
  { id: 'regen6', name: 'HP 재생 VI', icon: '💚', desc: '초당 체력 +2 회복', cost: { kind: 'gold', n: 3 }, x: 86, y: 66, req: ['def6'], page: 9, effect: { key: 'regen', value: 2 } },
  // ---- 10페이지 (지역 보스 영혼) ----
  { id: 'atk7', name: '공격력 VII', icon: '💪', desc: '공격력 +12%', cost: { kind: 'gold', n: 3 }, x: 14, y: 22, req: [], page: 10, effect: { key: 'atkPct', value: 12 } },
  { id: 'crit7', name: '치명타 VII', icon: '🎯', desc: '치명타 확률 +6%', cost: { kind: 'gold', n: 3 }, x: 50, y: 22, req: ['atk7'], page: 10, effect: { key: 'crit', value: 6 } },
  { id: 'critdmg7', name: '치명타 피해 VII', icon: '💥', desc: '치명타 피해 +35%', cost: { kind: 'gold', n: 4 }, x: 86, y: 22, req: ['crit7'], page: 10, effect: { key: 'critDmg', value: 35 } },
  { id: 'speed6', name: '이동 속도 VI', icon: '👟', desc: '이동 속도 +10%', cost: { kind: 'gold', n: 3 }, x: 14, y: 66, req: [], page: 10, effect: { key: 'moveSpeedPct', value: 10 } },
  { id: 'atkspeed6', name: '공격 속도 VI', icon: '⚡', desc: '공격 속도 +12%', cost: { kind: 'gold', n: 3 }, x: 50, y: 66, req: ['speed6'], page: 10, effect: { key: 'atkSpeedPct', value: 12 } },
  { id: 'loot5', name: '드롭률 V', icon: '🍀', desc: '장비 드롭 확률 +30%', cost: { kind: 'gold', n: 4 }, x: 86, y: 66, req: ['atkspeed6'], page: 10, effect: { key: 'lootPct', value: 30 } },
];

export const SOUL_KINDS = {
  gray:   { name: '일반 영혼', color: '#c9d2e0' },
  green:  { name: '정예 영혼', color: '#5fe08d' },
  blue:   { name: '중간보스 영혼', color: '#5aa9ff' },
  purple: { name: '에픽보스 영혼', color: '#b46cff' },
  gold:   { name: '지역 보스 영혼', color: '#ffc93c' },
};

// 보스 리스폰 간격 (중간보스 4시간 · 에픽보스 6시간 · 지역 필드보스 24시간)
// 추가 보스(독버섯 4시간 · 쌍둥이/3형제/드래곤 6시간)도 같은 규칙을 따른다
export const BOSS_TIMER = {
  mid: 4 * 60 * 60 * 1000,
  boss: 6 * 60 * 60 * 1000,
  field: 24 * 60 * 60 * 1000,
  shroom: 4 * 60 * 60 * 1000,
  twins: 6 * 60 * 60 * 1000,
  brothers: 6 * 60 * 60 * 1000,
  dragon: 6 * 60 * 60 * 1000,
};
export const BOSS_LABEL = { mid: '중간보스', boss: '에픽보스', field: '지역 필드보스', shroom: '중간보스', twins: '에픽보스', brothers: '에픽보스', dragon: '에픽보스' };

// 같은 등급·같은 아이템을 모으면 빨강(신화) 등급으로 진화한다
export const EVOLVE_NEED = [300, 200, 100, 70, 30];

// ---------- 캐릭터 외형(코스튬) ----------
// mode: 'armor'(장착 방어구) | 'uniform'(기본 교복) | 'costume'(코스튬)
// 기본 교복·장착 방어구는 무료, 코스튬은 외형 뽑기로 해금한다.
export const COSTUMES = [
  { id: 'knight', name: '기사 갑옷', icon: '🛡️', fam: 'ranged', grade: 3, cape: '#b9c8dc', trim: '#ffd257', cls: '기사', desc: '은빛 판금과 황금 장식', stats: { atkPct: 4, defPct: 6, hpPct: 5 } },
  { id: 'mage', name: '마법사 로브', icon: '🔮', fam: 'magic', grade: 4, cape: '#6a4ac0', trim: '#9ff0ff', cls: '마법사', desc: '보랏빛 로브와 빛나는 문양', stats: { atkPct: 6, mpPct: 12, cdr: 4 } },
  { id: 'dark', name: '어둠 망토', icon: '🌑', fam: 'slash', grade: 4, cape: '#2a2438', trim: '#b46cff', cls: '레인저', desc: '검은 망토와 보랏빛 테두리', stats: { crit: 3, critDmg: 8, moveSpeed: 4, evade: 2 } },
  { id: 'royal', name: '황금 예복', icon: '👑', fam: 'blunt', grade: 4, cape: '#d8b34a', trim: '#fff2c0', cls: '수호자', desc: '황금빛 예복과 붉은 장식', stats: { defPct: 8, hpPct: 8, atkPct: 2 } },
  { id: 'ninja', name: '닌자 복장', icon: '🥷', fam: 'slash', grade: 3, cape: '#1f2a33', trim: '#7dff9e', cls: '닌자', desc: '그림자처럼 빠른 검은 복장', stats: { evade: 3, moveSpeed: 5, crit: 2 } },
  { id: 'pirate', name: '해적 선장복', icon: '🏴‍☠️', fam: 'ranged', grade: 3, cape: '#7a2e2e', trim: '#ffd257', cls: '선장', desc: '붉은 코트와 황금 단추', stats: { atkPct: 5, critDmg: 6, hpPct: 4 } },
  { id: 'samurai', name: '사무라이 갑주', icon: '⚔️', fam: 'slash', grade: 4, cape: '#8c1f28', trim: '#e8e8e8', cls: '사무라이', desc: '붉은 갑주와 흰 매듭', stats: { atkPct: 6, defPct: 5, crit: 2 } },
  { id: 'paladin', name: '성기사 예복', icon: '✨', fam: 'blunt', grade: 4, cape: '#f2e6c8', trim: '#ffd257', cls: '성기사', desc: '빛나는 흰 예복과 황금 문양', stats: { defPct: 7, hpPct: 7, mpPct: 6 } },
  { id: 'assassin', name: '암살자 후드', icon: '🗡️', fam: 'slash', grade: 3, cape: '#3a2a4a', trim: '#ff5a7a', cls: '암살자', desc: '보라 후드와 붉은 단검', stats: { crit: 4, critDmg: 6, moveSpeed: 3 } },
  { id: 'druid', name: '드루이드 로브', icon: '🌿', fam: 'magic', grade: 4, cape: '#2e6b34', trim: '#b8ff9e', cls: '드루이드', desc: '숲의 기운이 깃든 초록 로브', stats: { mpPct: 10, hpPct: 6, cdr: 3 } },
];
export const COSTUME_MAP = Object.fromEntries(COSTUMES.map((c) => [c.id, c]));
export const COSTUME_PULL_COST = 500;
// 코스튬 레벨: 1~5. Lv.1 스탯은 기본 수치의 40%에서 시작해 레벨마다 15%씩 올라 Lv.5에서 100%가 된다.
// stats에 적힌 값은 Lv.5 수치다. Lv.6부터는 레벨마다 0.5%씩만 오른다 (Lv.6 100.5% … Lv.99 147%).
// 최대 레벨 코스튬은 뽑기 풀에서 제외된다 (환급 없음).
export const COSTUME_MAX_LEVEL = 99;
export const COSTUME_LEVEL_MULT = [0, 0.40, 0.55, 0.70, 0.85, 1.0];
export function costumeLevelMult(lv) {
  const l = Math.max(1, Math.floor(lv || 1));
  if (l <= 5) return COSTUME_LEVEL_MULT[l];
  return 1 + (l - 5) * 0.005; // Lv.6 100.5% … Lv.99 147%
}
export const COSTUME_STAT_LABEL = {
  atkPct: '공격력', defPct: '방어력', hpPct: '최대 체력', crit: '치명타', critDmg: '치명타 피해',
  evade: '회피', moveSpeed: '이동 속도', mpPct: '최대 마나', cdr: '쿨다운 감소',
};

export const COMPANION_PULL_COST = 1000;
export const COMPANION_CLASSES = {
  // 기본 수치는 낮게 시작하고, 등급이 오를수록 크게 강해진다 (등급당 공격 ×0.20 / 체력 ×0.15).
  tank:   { id: 'tank',   name: '수호 기사', icon: '🛡️', role: '탱커', hp: 272, atk: 9,  range: 2.2, cd: 1.3, color: 0x5b8fd6 },
  healer: { id: 'healer', name: '치유 사제', icon: '💗', role: '힐러', hp: 162, atk: 6,  range: 6.5, cd: 1.6, heal: 14, color: 0xffd0e0 },
  melee:  { id: 'melee',  name: '쌍검 도적', icon: '🗡️', role: '근접 딜러', hp: 196, atk: 14, range: 2.0, cd: 0.85, color: 0x6fcf97 },
  mage:   { id: 'mage',   name: '비전 마법사', icon: '🔮', role: '마법 딜러', hp: 153, atk: 12, range: 7.0, cd: 1.15, color: 0xb58cff, projectile: true },
};

export const COMPANION_NAMES = ['로안', '세라', '미르', '카이', '하늘', '은솔', '린', '도윤', '가온', '시우', '나래', '유진'];

export const CHARMS = {
  antidote: { id: 'antidote', name: '해독 부적', icon: '🧿', desc: '늪지의 독 안개 피해를 막아줍니다' },
  aqua: { id: 'aqua', name: '수중호흡 아티팩트', icon: '🫧', desc: '한강 심해 유적에 들어갈 수 있습니다' },
};

export const SECRET_TOTAL = 28;

// 지구 귀환 게이트 — 9구역(북한산) 북쪽 끝. 9구역 보스를 처치하면 열린다 (보이는 것만, 엔딩 연출은 아직 없음)
export const EARTH_GATE = { x: 96, z: -138 };

// 몬스터 역할별 기본 보상 (구역 배율을 곱한다)
export const MOB_REWARD = {
  normal: { xp: 13, gold: 5 },
  elite: { xp: 34, gold: 14 },
  mid: { xp: 140, gold: 70 },
  boss: { xp: 380, gold: 180 },
  field: { xp: 900, gold: 420 },
};

// 밸런스 기본값 (설정 화면에서 수정 가능)
export function defaultBalance() {
  const weapons = {};
  for (const [id, w] of Object.entries(WEAPONS)) {
    weapons[id] = { range: w.range, cd: w.cd, mult: w.mult };
  }
  const mobs = {};
  for (const z of PLAYABLE) {
    for (const role of ['normal', 'elite', 'mid', 'boss', 'field']) {
      const list = role === 'normal' || role === 'elite' ? z.mobs[role] : [z.mobs[role]];
      if (!list[0]) continue;
      for (const m of list) {
        const r = MOB_REWARD[role];
        mobs[`${z.id}:${m.key}`] = {
          hp: m.hp, atk: m.atk,
          xp: Math.round(r.xp * z.scale.xp), gold: Math.round(r.gold * z.scale.gold),
        };
      }
    }
  }
  return {
    weapons,
    items: { weaponAtk: [...ITEM_STATS.weapon.atk], armorDef: [...ITEM_STATS.armor.def] },
    mobs,
  };
}

// ======================================================================
// 속성 상성 (2차 확장) — 유리 1.5배 · 불리 0.5배
// ======================================================================
export const ELEMENTS = {
  blade: { name: '참격', icon: '⚔️', color: '#cfe3ff' },
  fire: { name: '화염', icon: '🔥', color: '#ff9a4a' },
  ice: { name: '냉기', icon: '❄️', color: '#9fe8ff' },
  nature: { name: '자연', icon: '🌿', color: '#7ed957' },
  water: { name: '수류', icon: '💧', color: '#5ab9ff' },
  shadow: { name: '암흑', icon: '🌑', color: '#b58cff' },
  holy: { name: '신성', icon: '✨', color: '#ffe9a8' },
};
// key 요소가 value 요소들을 이긴다
export const ELEM_BEATS = {
  fire: ['nature', 'ice'],
  nature: ['water'],
  water: ['fire'],
  ice: ['nature', 'water'],
  blade: ['shadow'],
  shadow: ['holy'],
  holy: ['blade'],
};
export const ELEM_OF_SHAPE = {
  slime: 'nature', goblin: 'nature', orc: 'nature', ogre: 'nature', ent: 'nature',
  frog: 'water', lizard: 'nature', wraith: 'shadow', hydra: 'water', witch: 'shadow',
  scorpion: 'fire', mummy: 'shadow', scarab: 'fire', anubis: 'shadow', golem: 'fire',
  merfolk: 'water', naga: 'water', crab: 'water', siren: 'water', kraken: 'water',
  dragon: 'fire', mushroom: 'nature', barbarian: 'blade', skeleton: 'shadow',
};
export const ELEM_OF_WEAPON = {
  sword: 'blade', dagger: 'shadow', axe: 'blade', mace: 'holy',
  bow: 'blade', crossbow: 'blade', staff: 'fire', book: 'ice',
};
for (const w of Object.values(WEAPONS)) w.elem = ELEM_OF_WEAPON[w.id] || 'blade';
for (const z of PLAYABLE) {
  for (const role of ['normal', 'elite']) {
    for (const m of (z.mobs[role] || [])) m.elem = ELEM_OF_SHAPE[m.shape] || 'nature';
  }
  for (const role of ['mid', 'boss', 'field']) {
    const m = z.mobs[role];
    if (m) m.elem = ELEM_OF_SHAPE[m.shape] || 'nature';
  }
}
