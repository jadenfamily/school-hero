// 스쿨히어로 — 계정 저장·무결성 검증
// 게임 본체는 SaveAdapter(load/save/verify)만 알고, 저장 창구는 교체할 수 있다.

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (str) => {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export const SAVE_FORMAT = 1;
export const SAVE_VERSION_KEY = 'sh.save.meta.v1';

export function validateState(s) {
  if (!s || typeof s !== 'object') return 'empty';
  if (!Number.isFinite(s.level) || s.level < 1 || s.level > 300) return 'level';
  if (s.statPts < 0 || s.statPts > s.level * 4 + 30) return 'statPoints';
  if (!Number.isFinite(s.gold) || s.gold < 0 || s.gold > 5000000) return 'gold';
  for (const k of ['str', 'dex', 'vit', 'int']) {
    if (!s.stats || !Number.isFinite(s.stats[k]) || s.stats[k] < 1 || s.stats[k] > 1000) return 'stat';
  }
  const kills = Number.isFinite(s.kills) ? s.kills : 0;
  if (s.level > 1 + kills * 1.5 + 12) return 'levelAnomaly';
  if (s.gold > 300000 + kills * 4000) return 'goldAnomaly';
  const bag = s.bag || {};
  let total = 0;
  for (const [key, n] of Object.entries(bag)) {
    const parts = String(key).split(':');
    if (parts.length !== 3) return 'bagKey';
    const g = Number(parts[2]);
    if (!Number.isFinite(g) || g < 0 || g > 5) return 'grade';
    if (!Number.isFinite(n) || n < 0 || n > 2000) return 'bagCount';
    total += n;
  }
  if (total > 12000) return 'bagTotal';
  if (s.companions && (!Array.isArray(s.companions) || s.companions.length > 200)) return 'companions';
  if (s.unlocked && (!Array.isArray(s.unlocked) || s.unlocked.some((z) => z < 1 || z > 18))) return 'unlocked';
  return null;
}

// ---------- 암호화 · 서명 ----------
function saltFor(userId) {
  return crypto.subtle.digest('SHA-256', enc.encode('school-hero-salt:' + userId));
}

async function deriveKeys(userId, password) {
  const salt = await saltFor(userId);
  const base = await crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
  const encKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  const sigKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'],
  );
  return { encKey, sigKey };
}

async function sign(sigKey, msg) {
  return b64(await crypto.subtle.sign('HMAC', sigKey, enc.encode(msg)));
}

async function verifySig(sigKey, msg, sig) {
  try {
    return await crypto.subtle.verify('HMAC', sigKey, unb64(sig), enc.encode(msg));
  } catch (e) { return false; }
}

async function seal(keys, userId, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.encKey, enc.encode(JSON.stringify(payload)));
  const ivB64 = b64(iv);
  const dataB64 = b64(cipher);
  const sig = await sign(keys.sigKey, `${userId}|${payload.saveVersion}|${payload.updatedAt}|${ivB64}|${dataB64}`);
  return {
    format: SAVE_FORMAT, userId, iv: ivB64, data: dataB64,
    saveVersion: payload.saveVersion, updatedAt: payload.updatedAt, sig,
  };
}

async function open(keys, userId, envelope) {
  if (!envelope || envelope.format !== SAVE_FORMAT) return { ok: false, reason: 'format' };
  if (envelope.userId !== userId) return { ok: false, reason: 'account' };
  const msg = `${userId}|${envelope.saveVersion}|${envelope.updatedAt}|${envelope.iv}|${envelope.data}`;
  if (!(await verifySig(keys.sigKey, msg, envelope.sig))) return { ok: false, reason: 'signature' };
  let payload;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv) }, keys.encKey, unb64(envelope.data));
    payload = JSON.parse(dec.decode(plain));
  } catch (e) { return { ok: false, reason: 'decrypt' } }
  if (payload.userId !== userId || payload.saveVersion !== envelope.saveVersion || payload.updatedAt !== envelope.updatedAt) {
    return { ok: false, reason: 'mismatch' };
  }
  const bad = validateState(payload.state);
  if (bad) return { ok: false, reason: 'anomaly:' + bad };
  return { ok: true, payload };
}

// ---------- 저장 어댑터 ----------
export class DeviceAdapter {
  constructor(prefix = 'sh.device') { this.prefix = prefix; }
  key(userId) { return `${this.prefix}.${userId}`; }
  async load(userId) {
    try {
      const raw = localStorage.getItem(this.key(userId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  async save(userId, envelope) {
    localStorage.setItem(this.key(userId), JSON.stringify(envelope));
    return { ok: true };
  }
  async verify() { return true; }
}

export class CloudAdapter {
  constructor(token, repo = 'jadenfamily/kids-dashboard-data', branch = 'main') {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
  }
  url(userId) {
    return `https://api.github.com/repos/${this.repo}/contents/school-hero/saves/${encodeURIComponent(userId)}.json`;
  }
  headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }
  async load(userId) {
    const res = await fetch(`${this.url(userId)}?ref=${this.branch}`, { headers: this.headers(), cache: 'no-store' });
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('auth'), { code: 'auth' });
    if (!res.ok) throw Object.assign(new Error('load'), { code: 'network' });
    const json = await res.json();
    const content = json.content ? dec.decode(unb64(json.content.replace(/\n/g, ''))) : '';
    let env = null;
    try { env = JSON.parse(content); } catch (e) { env = null; }
    return env ? { ...env, _sha: json.sha } : null;
  }
  async save(userId, envelope) {
    const body = {
      message: `스쿨히어로 저장: ${userId} (v${envelope.saveVersion})`,
      content: b64(enc.encode(JSON.stringify(envelope))),
      branch: this.branch,
    };
    let sha = null;
    try {
      const head = await fetch(`${this.url(userId)}?ref=${this.branch}`, { headers: this.headers(), cache: 'no-store' });
      if (head.ok) { const j = await head.json(); sha = j.sha; }
    } catch (e) { /* 오프라인이면 새로 쓰기 시도 */ }
    if (sha) body.sha = sha;
    const res = await fetch(this.url(userId), { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('auth'), { code: 'auth' });
    if (!res.ok) throw Object.assign(new Error('save'), { code: 'network' });
    return { ok: true };
  }
  async verify() { return true; }
}

// ---------- 저장 관리자 ----------
export class SaveManager {
  constructor({ cloud = null, device = new DeviceAdapter() } = {}) {
    this.cloud = cloud;
    this.device = device;
    this.userId = null;
    this.mode = 'guest';
    this.keys = null;
    this.status = { savedAt: 0, version: 0, where: 'device', repaired: false, error: null };
  }

  get hasCloud() { return !!this.cloud; }

  async login(userId, password, { cloud = this.cloud } = {}) {
    const clean = String(userId || '').trim().replace(/[^\w가-힣-]/g, '').slice(0, 20);
    this.userId = clean || 'guest';
    this.cloud = cloud;
    this.password = String(password || '');
    this.keys = await deriveKeys(this.userId, this.password);
    this.mode = this.userId === 'guest' ? 'guest' : 'account';
    return true;
  }

  async logout() {
    this.userId = null;
    this.keys = null;
    this.mode = 'guest';
  }

  async readRemote() {
    if (this.cloud) {
      try { return await this.cloud.load(this.userId); }
      catch (e) {
        if (e.code === 'auth') { this.status.error = 'auth'; return await this.device.load(this.userId); }
        this.status.error = 'network';
      }
    }
    return await this.device.load(this.userId);
  }

  async load() {
    if (!this.keys) return { state: null, repaired: false };
    this.status.repaired = false;
    const cached = await this.device.load(this.userId);
    let remote = null;
    try { remote = await this.readRemote(); } catch (e) { remote = null; }

    const candidates = [remote, cached].filter(Boolean);
    this.status.hadSave = candidates.length > 0;
    if (!candidates.length) return { state: null, version: 0, repaired: false, hadSave: false };

    // 버전 크로스체크: 높은 저장 버전을 우선
    candidates.sort((a, b) => (b.saveVersion || 0) - (a.saveVersion || 0));
    for (const env of candidates) {
      const opened = await open(this.keys, this.userId, env);
      if (opened.ok) {
        await this.device.save(this.userId, env);
        this.status.version = env.saveVersion;
        this.status.where = env === remote ? 'cloud' : 'device';
        this.status.savedAt = Date.parse(env.updatedAt || '') || 0;
        return { state: opened.payload.state, version: env.saveVersion, repaired: false, where: this.status.where, hadSave: true };
      }
      this.status.lastReason = opened.reason;
    }

    // 변조/손상 감지 → 마지막 정상본 복구
    const lastGood = await this.readLastGood();
    if (lastGood) {
      const opened = await open(this.keys, this.userId, lastGood);
      if (opened.ok) {
        this.status.repaired = true;
        this.status.version = lastGood.saveVersion;
        this.status.where = 'lastGood';
        await this.device.save(this.userId, lastGood);
        if (this.cloud) { try { await this.cloud.save(this.userId, lastGood); } catch (e) { /* 복구본은 다음 저장 때 다시 시도 */ } }
        return { state: opened.payload.state, version: lastGood.saveVersion, repaired: true, reason: this.status.lastReason, hadSave: true };
      }
    }
    return { state: null, version: 0, repaired: true, reason: this.status.lastReason || 'corrupt', hadSave: true };
  }

  async readLastGood() {
    try {
      const raw = localStorage.getItem(`sh.lastgood.${this.userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async writeLastGood(env) {
    try { localStorage.setItem(`sh.lastgood.${this.userId}`, JSON.stringify(env)); } catch (e) { /* 저장 공간 부족 */ }
  }

  async save(state, { force = false } = {}) {
    if (!this.keys) return { ok: false, reason: 'noAccount' };
    const bad = validateState(state);
    if (bad && !force) {
      this.status.error = 'anomaly:' + bad;
      return { ok: false, reason: 'anomaly:' + bad };
    }
    let remote = null;
    try { remote = await this.readRemote(); } catch (e) { remote = null; }
    const remoteV = remote && Number.isFinite(remote.saveVersion) ? remote.saveVersion : 0;
    const prevV = this.status.version || 0;
    const version = Math.max(remoteV, prevV) + 1;
    const updatedAt = new Date().toISOString();
    const payload = { userId: this.userId, saveVersion: version, updatedAt, state };
    const env = await seal(this.keys, this.userId, payload);
    await this.device.save(this.userId, env);
    await this.writeLastGood(env);
    let where = 'device';
    if (this.cloud) {
      try { await this.cloud.save(this.userId, env); where = 'cloud'; }
      catch (e) { this.status.error = e.code || 'network'; where = 'device'; }
    }
    this.status.version = version;
    this.status.savedAt = Date.now();
    this.status.where = where;
    this.status.error = null;
    return { ok: true, version, where };
  }

  async clearLocal() {
    try {
      localStorage.removeItem(`sh.device.${this.userId}`);
      localStorage.removeItem(`sh.lastgood.${this.userId}`);
    } catch (e) { /* 무시 */ }
  }

  // 저장 파일 무결성만 따로 확인 (테스트/진단용)
  async verify(envelope) {
    if (!this.keys) return { ok: false, reason: 'noAccount' };
    const r = await open(this.keys, this.userId, envelope);
    return r.ok ? { ok: true, state: r.payload.state } : { ok: false, reason: r.reason };
  }
}

export function createSaveManager(opts) { return new SaveManager(opts); }
