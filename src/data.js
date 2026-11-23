// 스쿨히어로 — 게임 설정 데이터
export const GRADES = [
  { i: 0, name: '일반', color: '#b8c2d4', glow: 'rgba(184,194,212,.22)' },
  { i: 1, name: '고급', color: '#43d17a', glow: 'rgba(67,209,122,.4)' },
  { i: 2, name: '희귀', color: '#4aa3ff', glow: 'rgba(74,163,255,.45)' },
  { i: 3, name: '영웅', color: '#b46cff', glow: 'rgba(180,108,255,.5)' },
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

export const GRADE_ADJ = ['낡은', '단단한', '빛나는', '영웅의', '전설의', '신화의'];
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
};

const DROP_W = {
  1: [58, 30, 10, 2, 0, 0],
  2: [40, 32, 20, 7, 1, 0],
  3: [24, 30, 27, 14, 4.4, 0.6],
  4: [14, 24, 30, 21, 9.6, 1.4],
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
    npc: { name: '숲지기 노인', x: 4, z: 22, icon: '🧙‍♂️' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -32 }, mid: { x: -19, z: -6 },
    scale: SCALE[1], dropW: DROP_W[1],
    mobs: {
      normal: [
        E({ key: 'slime', name: '풀슬라임', shape: 'slime', color: 0x6cdc8a, dark: 0x3aa85c, hp: 34, atk: 8, speed: 1.55, atkRange: 1.5, atkCd: 1.3, aggro: 6.5, style: 'melee', soul: 'gray' }),
        E({ key: 'goblin', name: '고블린', shape: 'goblin', color: 0x8fbf5a, dark: 0x4c7a2e, hp: 46, atk: 10, speed: 2.1, atkRange: 1.7, atkCd: 1.25, aggro: 7.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'orc', name: '오크 정예', shape: 'orc', color: 0x6e9450, dark: 0x3c5a28, hp: 120, atk: 16, speed: 1.9, atkRange: 2.0, atkCd: 1.5, aggro: 8.5, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'ogre', name: '거대 오우거', shape: 'ogre', color: 0xb08a5a, dark: 0x6b4a25, hp: 380, atk: 26, speed: 1.7, atkRange: 2.6, atkCd: 1.7, aggro: 9, style: 'aoe', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'ent', name: '숲의 거대 엔트', shape: 'ent', color: 0x7c5b34, dark: 0x3e6b32, hp: 760, atk: 34, speed: 1.35, atkRange: 3.2, atkCd: 1.9, aggro: 12, style: 'aoe', boss: 'boss', soul: 'purple' }),
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
    npc: { name: '늪지 약초꾼', x: -5, z: 22, icon: '🧝‍♀️' },
    spawn: { x: 0, z: 23 }, boss: { x: 2, z: -32 }, mid: { x: 20, z: -8 },
    scale: SCALE[2], dropW: DROP_W[2],
    mobs: {
      normal: [
        E({ key: 'frog', name: '독개구리', shape: 'frog', color: 0x93c94f, dark: 0x4e7722, hp: 90, atk: 15, speed: 1.75, atkRange: 6.5, atkCd: 2.2, aggro: 8, style: 'poison', soul: 'gray' }),
        E({ key: 'lizard', name: '리자드맨', shape: 'lizard', color: 0x5d9a76, dark: 0x2f5c44, hp: 110, atk: 18, speed: 2.25, atkRange: 2.1, atkCd: 1.35, aggro: 8.5, style: 'melee', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'wraith', name: '늪지 망령', shape: 'wraith', color: 0x8f7fc4, dark: 0x3b2f5e, hp: 260, atk: 24, speed: 1.6, atkRange: 7, atkCd: 2.3, aggro: 9.5, style: 'ranged', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'hydra', name: '늪지 히드라', shape: 'hydra', color: 0x6fae68, dark: 0x2f6136, hp: 1200, atk: 36, speed: 1.5, atkRange: 3.4, atkCd: 1.8, aggro: 10, style: 'poison', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'witch', name: '부패한 늪지 마녀', shape: 'witch', color: 0x9b6fbf, dark: 0x3d2450, hp: 2400, atk: 46, speed: 1.45, atkRange: 7.5, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
    },
    chests: [{ x: 14, z: 14, hide: 'deadTree' }, { x: -20, z: -2, hide: 'rock' }, { x: 8, z: -24, hide: 'wall' }],
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
    npc: { name: '사막 대상인', x: 5, z: 22, icon: '🧕' },
    spawn: { x: 0, z: 23 }, boss: { x: -2, z: -32 }, mid: { x: 18, z: -4 },
    scale: SCALE[3], dropW: DROP_W[3],
    mobs: {
      normal: [
        E({ key: 'scorpion', name: '모래 전갈', shape: 'scorpion', color: 0xd08a3e, dark: 0x8a5220, hp: 175, atk: 26, speed: 2.3, atkRange: 1.9, atkCd: 1.15, aggro: 9, style: 'melee', soul: 'gray' }),
        E({ key: 'mummy', name: '미라', shape: 'mummy', color: 0xd8cfa8, dark: 0x8f8258, hp: 210, atk: 30, speed: 1.25, atkRange: 7.5, atkCd: 2.4, aggro: 10, style: 'ranged', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'scarab', name: '스카라브 정예', shape: 'scarab', color: 0x3f8f9a, dark: 0x1e4f57, hp: 460, atk: 38, speed: 2.5, atkRange: 2.0, atkCd: 1.3, aggro: 10.5, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'anubis', name: '아누비스 전사', shape: 'anubis', color: 0x2f3247, dark: 0xc9a13a, hp: 2200, atk: 52, speed: 2.0, atkRange: 2.6, atkCd: 1.4, aggro: 11, style: 'melee', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'golem', name: '고대 모래 골렘', shape: 'golem', color: 0xc9a468, dark: 0x7a5a2c, hp: 4200, atk: 62, speed: 1.3, atkRange: 3.8, atkCd: 2.0, aggro: 13, style: 'aoe', boss: 'boss', soul: 'purple' }),
    },
    chests: [{ x: -16, z: 8, hide: 'sandRock' }, { x: 18, z: 12, hide: 'pillar' }, { x: -9, z: -20, hide: 'sandRock' }],
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
    npc: { name: '심해의 기록관', x: 6, z: 22, icon: '🧜' },
    spawn: { x: 0, z: 23 }, boss: { x: 0, z: -33 }, mid: { x: -20, z: -5 },
    scale: SCALE[4], dropW: DROP_W[4],
    mobs: {
      normal: [
        E({ key: 'merrow', name: '어인 머록', shape: 'merfolk', color: 0x4aa3b8, dark: 0x1e5566, hp: 380, atk: 44, speed: 2.3, atkRange: 2.1, atkCd: 1.2, aggro: 9.5, style: 'melee', soul: 'gray' }),
        E({ key: 'naga', name: '심해 나가', shape: 'naga', color: 0x6f7fd0, dark: 0x2c3566, hp: 420, atk: 50, speed: 1.9, atkRange: 7.5, atkCd: 2.2, aggro: 10.5, style: 'ranged', soul: 'gray' }),
      ],
      elite: [
        E({ key: 'crab', name: '갑각 크랩 정예', shape: 'crab', color: 0xd2703e, dark: 0x7a3a1c, hp: 980, atk: 62, speed: 2.2, atkRange: 2.3, atkCd: 1.3, aggro: 11, style: 'melee', elite: true, soul: 'green' }),
      ],
      mid: E({ key: 'siren', name: '세이렌', shape: 'siren', color: 0x7fe0d0, dark: 0x2a6a7a, hp: 3800, atk: 78, speed: 1.8, atkRange: 7.8, atkCd: 1.9, aggro: 12, style: 'aoe', elite: true, boss: 'mid', soul: 'blue' }),
      boss: E({ key: 'kraken', name: '심해 크라켄', shape: 'kraken', color: 0x7a4fa8, dark: 0x3a1c5a, hp: 7000, atk: 96, speed: 1.4, atkRange: 4.2, atkCd: 1.9, aggro: 14, style: 'aoe', boss: 'boss', soul: 'purple' }),
    },
    chests: [{ x: 16, z: 10, hide: 'coral' }, { x: -14, z: -14, hide: 'ruinPillar' }, { x: 12, z: -26, hide: 'bubbleRock' }],
    quests: {
      title: '가라앉은 기록', npc: '심해의 기록관',
      steps: [
        { text: '심해 몬스터 처치', type: 'kill', n: 12, reward: { gold: 600, pt: 2, xp: 900 } },
        { text: '세이렌 처치', type: 'mid', n: 1, reward: { gold: 800, item: 4, xp: 1200 } },
        { text: '심해 크라켄 처치', type: 'boss', n: 1, reward: { gold: 1200, soul: 'purple', soulN: 6, xp: 1600 } },
      ],
    },
  },
  { id: 5, key: 'namsan', name: '남산 하늘 유적', short: '남산', icon: '🏯', comingSoon: true, sub: '2단계 업데이트 예정' },
  { id: 6, key: 'gwanak', name: '관악 용암 화산', short: '관악', icon: '🌋', comingSoon: true, sub: '2단계 업데이트 예정' },
  { id: 7, key: 'gangnam', name: '강남 달표면 황무지', short: '강남', icon: '🌑', comingSoon: true, sub: '2단계 업데이트 예정' },
  { id: 8, key: 'dobong', name: '도봉 수정 빙하', short: '도봉', icon: '🧊', comingSoon: true, sub: '2단계 업데이트 예정' },
  { id: 9, key: 'bukhansan', name: '북한산 설산 정상', short: '북한산', icon: '🏔️', comingSoon: true, sub: '지구 귀환 게이트 · 2단계' },
];

export const PLAYABLE = ZONES.filter((z) => !z.comingSoon);

export const MEDAL_TIERS = [12, 30, 60, 100, 150];
export const MEDAL_STEP = 0.14;

export const TALENTS = [
  { id: 'magnet', name: '자석 범위', icon: '🧲', desc: '아이템을 끌어당기는 범위 +40%', cost: { kind: 'gray', n: 5 }, x: 14, y: 12, req: [] },
  { id: 'autoloot', name: '자동 루팅', icon: '🎣', desc: '드롭 아이템이 멀리서도 날아옵니다', cost: { kind: 'gray', n: 12 }, x: 50, y: 12, req: ['magnet'] },
  { id: 'regen', name: 'HP 재생', icon: '💚', desc: '초당 체력 +1.5 회복', cost: { kind: 'green', n: 8 }, x: 86, y: 26, req: ['autoloot'] },
  { id: 'atk', name: '공격력', icon: '💪', desc: '공격력 +9%', cost: { kind: 'green', n: 6 }, x: 14, y: 46, req: [] },
  { id: 'crit', name: '치명타', icon: '🎯', desc: '치명타 확률 +6%', cost: { kind: 'blue', n: 6 }, x: 50, y: 46, req: ['atk'] },
  { id: 'critdmg', name: '치명타 피해', icon: '💥', desc: '치명타 피해 +30%', cost: { kind: 'blue', n: 10 }, x: 86, y: 46, req: ['crit'] },
  { id: 'speed', name: '이동 속도', icon: '👟', desc: '이동 속도 +10%', cost: { kind: 'blue', n: 8 }, x: 14, y: 72, req: [] },
  { id: 'atkspeed', name: '공격 속도', icon: '⚡', desc: '공격 속도 +12%', cost: { kind: 'purple', n: 10 }, x: 50, y: 72, req: ['speed'] },
  { id: 'maxhp', name: '최대 체력', icon: '❤️', desc: '최대 체력 +15%', cost: { kind: 'purple', n: 12 }, x: 86, y: 72, req: [] },
  { id: 'loot', name: '드롭률', icon: '🍀', desc: '장비 드롭 확률 +30%', cost: { kind: 'purple', n: 16 }, x: 50, y: 92, req: ['atkspeed'] },
];

export const SOUL_KINDS = {
  gray:   { name: '일반 영혼', color: '#c9d2e0' },
  green:  { name: '정예 영혼', color: '#5fe08d' },
  blue:   { name: '중간보스 영혼', color: '#5aa9ff' },
  purple: { name: '보스 영혼', color: '#b46cff' },
};

export const COMPANION_CLASSES = {
  tank:   { id: 'tank',   name: '수호 기사', icon: '🛡️', role: '탱커', hp: 320, atk: 10, range: 2.2, cd: 1.3, color: 0x5b8fd6 },
  healer: { id: 'healer', name: '치유 사제', icon: '💗', role: '힐러', hp: 190, atk: 7,  range: 6.5, cd: 1.6, heal: 14, color: 0xffd0e0 },
  melee:  { id: 'melee',  name: '쌍검 도적', icon: '🗡️', role: '근접 딜러', hp: 230, atk: 16, range: 2.0, cd: 0.85, color: 0x6fcf97 },
  mage:   { id: 'mage',   name: '비전 마법사', icon: '🔮', role: '마법 딜러', hp: 180, atk: 14, range: 7.0, cd: 1.15, color: 0xb58cff, projectile: true },
};

export const COMPANION_NAMES = ['로안', '세라', '미르', '카이', '하늘', '은솔', '린', '도윤', '가온', '시우', '나래', '유진'];

export const CHARMS = {
  antidote: { id: 'antidote', name: '해독 부적', icon: '🧿', desc: '늪지의 독 안개 피해를 막아줍니다' },
  aqua: { id: 'aqua', name: '수중호흡 아티팩트', icon: '🫧', desc: '한강 심해 유적에 들어갈 수 있습니다' },
};

export const SECRET_TOTAL = 13;

// 몬스터 역할별 기본 보상 (구역 배율을 곱한다)
export const MOB_REWARD = {
  normal: { xp: 13, gold: 5 },
  elite: { xp: 34, gold: 14 },
  mid: { xp: 140, gold: 70 },
  boss: { xp: 380, gold: 180 },
};

// 밸런스 기본값 (설정 화면에서 수정 가능)
export function defaultBalance() {
  const weapons = {};
  for (const [id, w] of Object.entries(WEAPONS)) {
    weapons[id] = { range: w.range, cd: w.cd, mult: w.mult };
  }
  const mobs = {};
  for (const z of PLAYABLE) {
    for (const role of ['normal', 'elite', 'mid', 'boss']) {
      const list = role === 'normal' || role === 'elite' ? z.mobs[role] : [z.mobs[role]];
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
