// 게임 에셋(고퀄 2.5D 도트 PNG) 로더
// 시안에서 생성·검수한 PNG를 그대로 THREE.Texture / <img>로 씁니다.

export const HERO_IDS = ['boyA', 'girlA', 'boyB', 'girlB'];
export const MONSTER_KEYS = [
  'slime', 'goblin', 'orc', 'ogre', 'ent', 'frog', 'lizard', 'wraith', 'hydra', 'witch',
  'scorpion', 'mummy', 'scarab', 'anubis', 'golem', 'merfolk', 'naga', 'crab', 'siren', 'kraken',
];
export const COMPANION_IDS = ['tank', 'healer', 'melee', 'mage'];
export const GOLD_KEYS = ['ogre', 'hydra', 'anubis', 'kraken'];

export const ASSET_URL = {
  hero: (id) => `./assets/heroes/${id}.png`,
  portrait: (id) => `./assets/heroes/portrait-${id}.png`,
  monster: (key) => `./assets/monsters/${key}.png`,
  companion: (id) => `./assets/companions/${id}.png`,
  prop: (name) => `./assets/props/${name}.png`,
  fx: (name) => `./assets/fx/${name}.png`,
};

const texCache = new Map();
const silCache = new Map();
const failed = new Set();

function tune(THREE, t) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function getTexture(THREE, url) {
  let t = texCache.get(url);
  if (t) return t;
  t = tune(THREE, new THREE.TextureLoader().load(url, (loaded) => {
    if (loaded) loaded.needsUpdate = true;
  }, undefined, () => { failed.add(url); }));
  texCache.set(url, t);
  return t;
}

// 이미지 원본 비율 (높이 1 기준 폭)
export function aspectOf(THREE, url) {
  const t = texCache.get(url) || getTexture(THREE, url);
  const im = t.image;
  if (im && im.width && im.height) return im.width / im.height;
  return 0.75;
}

// 피격 시 흰색 실루엣 텍스처
export function getSilhouette(THREE, url) {
  if (silCache.has(url)) return silCache.get(url);
  const t = texCache.get(url);
  const im = t && t.image;
  if (!im || !im.width) return null;
  const c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  const st = new THREE.CanvasTexture(c);
  st.magFilter = THREE.NearestFilter;
  st.colorSpace = THREE.SRGBColorSpace;
  silCache.set(url, st);
  return st;
}

export async function preloadAssets(THREE, onProgress) {
  const urls = [];
  for (const id of HERO_IDS) { urls.push(ASSET_URL.hero(id), ASSET_URL.portrait(id)); }
  for (const k of MONSTER_KEYS) urls.push(ASSET_URL.monster(k));
  for (const k of GOLD_KEYS) urls.push(ASSET_URL.monster(`gold-${k}`));
  for (const k of COMPANION_IDS) urls.push(ASSET_URL.companion(k));
  urls.push(ASSET_URL.prop('gravestone'), ASSET_URL.prop('chest'), ASSET_URL.fx('impact'));

  let done = 0;
  const total = urls.length;
  await Promise.all(urls.map((url) => new Promise((resolve) => {
    const loader = new THREE.TextureLoader();
    const t = tune(THREE, loader.load(url, () => { done++; onProgress && onProgress(done / total); resolve(); },
      undefined, () => { failed.add(url); done++; resolve(); }));
    texCache.set(url, t);
  })));
  return { total, failed: [...failed] };
}
