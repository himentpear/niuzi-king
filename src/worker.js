import { DurableObject } from 'cloudflare:workers';
import {
  RULES, CATALOG, volume, newPlayer, createOpponent, resolveBattle,
  scoreQte, applyVolumeMultiplier, buyCosmetic, equipCosmetic, rankPlayers,
} from './game.js';

const SESSION_COOKIE = 'nz_session';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BODY_LIMIT = 16 * 1024;
// TODO(USER_DESIGN): Authentication and timing defaults are implementation defaults.
const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 30;
const QTE_TTL_MS = 120000;
// TODO(USER_DESIGN): Allow 1000 ms clock/network tolerance around the configured total duration.
const QTE_TIMING_TOLERANCE_MS = 1000;
const encoder = new TextEncoder();
// Unicode case-fold exceptions to lowercase, generated with Python 3.13 str.casefold().
const CASE_FOLD_OVERRIDES = Object.freeze({"µ":"μ","ß":"ss","ŉ":"ʼn","ſ":"s","ǰ":"ǰ","ͅ":"ι","ΐ":"ΐ","ΰ":"ΰ","ς":"σ","ϐ":"β","ϑ":"θ","ϕ":"φ","ϖ":"π","ϰ":"κ","ϱ":"ρ","ϵ":"ε","և":"եւ","Ꭰ":"Ꭰ","Ꭱ":"Ꭱ","Ꭲ":"Ꭲ","Ꭳ":"Ꭳ","Ꭴ":"Ꭴ","Ꭵ":"Ꭵ","Ꭶ":"Ꭶ","Ꭷ":"Ꭷ","Ꭸ":"Ꭸ","Ꭹ":"Ꭹ","Ꭺ":"Ꭺ","Ꭻ":"Ꭻ","Ꭼ":"Ꭼ","Ꭽ":"Ꭽ","Ꭾ":"Ꭾ","Ꭿ":"Ꭿ","Ꮀ":"Ꮀ","Ꮁ":"Ꮁ","Ꮂ":"Ꮂ","Ꮃ":"Ꮃ","Ꮄ":"Ꮄ","Ꮅ":"Ꮅ","Ꮆ":"Ꮆ","Ꮇ":"Ꮇ","Ꮈ":"Ꮈ","Ꮉ":"Ꮉ","Ꮊ":"Ꮊ","Ꮋ":"Ꮋ","Ꮌ":"Ꮌ","Ꮍ":"Ꮍ","Ꮎ":"Ꮎ","Ꮏ":"Ꮏ","Ꮐ":"Ꮐ","Ꮑ":"Ꮑ","Ꮒ":"Ꮒ","Ꮓ":"Ꮓ","Ꮔ":"Ꮔ","Ꮕ":"Ꮕ","Ꮖ":"Ꮖ","Ꮗ":"Ꮗ","Ꮘ":"Ꮘ","Ꮙ":"Ꮙ","Ꮚ":"Ꮚ","Ꮛ":"Ꮛ","Ꮜ":"Ꮜ","Ꮝ":"Ꮝ","Ꮞ":"Ꮞ","Ꮟ":"Ꮟ","Ꮠ":"Ꮠ","Ꮡ":"Ꮡ","Ꮢ":"Ꮢ","Ꮣ":"Ꮣ","Ꮤ":"Ꮤ","Ꮥ":"Ꮥ","Ꮦ":"Ꮦ","Ꮧ":"Ꮧ","Ꮨ":"Ꮨ","Ꮩ":"Ꮩ","Ꮪ":"Ꮪ","Ꮫ":"Ꮫ","Ꮬ":"Ꮬ","Ꮭ":"Ꮭ","Ꮮ":"Ꮮ","Ꮯ":"Ꮯ","Ꮰ":"Ꮰ","Ꮱ":"Ꮱ","Ꮲ":"Ꮲ","Ꮳ":"Ꮳ","Ꮴ":"Ꮴ","Ꮵ":"Ꮵ","Ꮶ":"Ꮶ","Ꮷ":"Ꮷ","Ꮸ":"Ꮸ","Ꮹ":"Ꮹ","Ꮺ":"Ꮺ","Ꮻ":"Ꮻ","Ꮼ":"Ꮼ","Ꮽ":"Ꮽ","Ꮾ":"Ꮾ","Ꮿ":"Ꮿ","Ᏸ":"Ᏸ","Ᏹ":"Ᏹ","Ᏺ":"Ᏺ","Ᏻ":"Ᏻ","Ᏼ":"Ᏼ","Ᏽ":"Ᏽ","ᏸ":"Ᏸ","ᏹ":"Ᏹ","ᏺ":"Ᏺ","ᏻ":"Ᏻ","ᏼ":"Ᏼ","ᏽ":"Ᏽ","ᲀ":"в","ᲁ":"д","ᲂ":"о","ᲃ":"с","ᲄ":"т","ᲅ":"т","ᲆ":"ъ","ᲇ":"ѣ","ᲈ":"ꙋ","ẖ":"ẖ","ẗ":"ẗ","ẘ":"ẘ","ẙ":"ẙ","ẚ":"aʾ","ẛ":"ṡ","ẞ":"ss","ὐ":"ὐ","ὒ":"ὒ","ὔ":"ὔ","ὖ":"ὖ","ᾀ":"ἀι","ᾁ":"ἁι","ᾂ":"ἂι","ᾃ":"ἃι","ᾄ":"ἄι","ᾅ":"ἅι","ᾆ":"ἆι","ᾇ":"ἇι","ᾈ":"ἀι","ᾉ":"ἁι","ᾊ":"ἂι","ᾋ":"ἃι","ᾌ":"ἄι","ᾍ":"ἅι","ᾎ":"ἆι","ᾏ":"ἇι","ᾐ":"ἠι","ᾑ":"ἡι","ᾒ":"ἢι","ᾓ":"ἣι","ᾔ":"ἤι","ᾕ":"ἥι","ᾖ":"ἦι","ᾗ":"ἧι","ᾘ":"ἠι","ᾙ":"ἡι","ᾚ":"ἢι","ᾛ":"ἣι","ᾜ":"ἤι","ᾝ":"ἥι","ᾞ":"ἦι","ᾟ":"ἧι","ᾠ":"ὠι","ᾡ":"ὡι","ᾢ":"ὢι","ᾣ":"ὣι","ᾤ":"ὤι","ᾥ":"ὥι","ᾦ":"ὦι","ᾧ":"ὧι","ᾨ":"ὠι","ᾩ":"ὡι","ᾪ":"ὢι","ᾫ":"ὣι","ᾬ":"ὤι","ᾭ":"ὥι","ᾮ":"ὦι","ᾯ":"ὧι","ᾲ":"ὰι","ᾳ":"αι","ᾴ":"άι","ᾶ":"ᾶ","ᾷ":"ᾶι","ᾼ":"αι","ι":"ι","ῂ":"ὴι","ῃ":"ηι","ῄ":"ήι","ῆ":"ῆ","ῇ":"ῆι","ῌ":"ηι","ῒ":"ῒ","ΐ":"ΐ","ῖ":"ῖ","ῗ":"ῗ","ῢ":"ῢ","ΰ":"ΰ","ῤ":"ῤ","ῦ":"ῦ","ῧ":"ῧ","ῲ":"ὼι","ῳ":"ωι","ῴ":"ώι","ῶ":"ῶ","ῷ":"ῶι","ῼ":"ωι","ꭰ":"Ꭰ","ꭱ":"Ꭱ","ꭲ":"Ꭲ","ꭳ":"Ꭳ","ꭴ":"Ꭴ","ꭵ":"Ꭵ","ꭶ":"Ꭶ","ꭷ":"Ꭷ","ꭸ":"Ꭸ","ꭹ":"Ꭹ","ꭺ":"Ꭺ","ꭻ":"Ꭻ","ꭼ":"Ꭼ","ꭽ":"Ꭽ","ꭾ":"Ꭾ","ꭿ":"Ꭿ","ꮀ":"Ꮀ","ꮁ":"Ꮁ","ꮂ":"Ꮂ","ꮃ":"Ꮃ","ꮄ":"Ꮄ","ꮅ":"Ꮅ","ꮆ":"Ꮆ","ꮇ":"Ꮇ","ꮈ":"Ꮈ","ꮉ":"Ꮉ","ꮊ":"Ꮊ","ꮋ":"Ꮋ","ꮌ":"Ꮌ","ꮍ":"Ꮍ","ꮎ":"Ꮎ","ꮏ":"Ꮏ","ꮐ":"Ꮐ","ꮑ":"Ꮑ","ꮒ":"Ꮒ","ꮓ":"Ꮓ","ꮔ":"Ꮔ","ꮕ":"Ꮕ","ꮖ":"Ꮖ","ꮗ":"Ꮗ","ꮘ":"Ꮘ","ꮙ":"Ꮙ","ꮚ":"Ꮚ","ꮛ":"Ꮛ","ꮜ":"Ꮜ","ꮝ":"Ꮝ","ꮞ":"Ꮞ","ꮟ":"Ꮟ","ꮠ":"Ꮠ","ꮡ":"Ꮡ","ꮢ":"Ꮢ","ꮣ":"Ꮣ","ꮤ":"Ꮤ","ꮥ":"Ꮥ","ꮦ":"Ꮦ","ꮧ":"Ꮧ","ꮨ":"Ꮨ","ꮩ":"Ꮩ","ꮪ":"Ꮪ","ꮫ":"Ꮫ","ꮬ":"Ꮬ","ꮭ":"Ꮭ","ꮮ":"Ꮮ","ꮯ":"Ꮯ","ꮰ":"Ꮰ","ꮱ":"Ꮱ","ꮲ":"Ꮲ","ꮳ":"Ꮳ","ꮴ":"Ꮴ","ꮵ":"Ꮵ","ꮶ":"Ꮶ","ꮷ":"Ꮷ","ꮸ":"Ꮸ","ꮹ":"Ꮹ","ꮺ":"Ꮺ","ꮻ":"Ꮻ","ꮼ":"Ꮼ","ꮽ":"Ꮽ","ꮾ":"Ꮾ","ꮿ":"Ꮿ","ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"st","ﬆ":"st","ﬓ":"մն","ﬔ":"մե","ﬕ":"մի","ﬖ":"վն","ﬗ":"մխ"});

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) { throw new ApiError(status, code, message); }

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function randomBytes(length) { return crypto.getRandomValues(new Uint8Array(length)); }
function random() { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
}
async function digest(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
async function derivePassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt, iterations,
  }, key, 256));
}
function equalBytes(a, b) {
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function usernameInfo(input) {
  if (typeof input !== 'string') fail(400, 'INVALID_USERNAME', '用户名须为 2 至 24 个文字、数字、下划线、短横线或点。');
  const username = input.normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}_.-]{2,24}$/u.test(username)) {
    fail(400, 'INVALID_USERNAME', '用户名须为 2 至 24 个文字、数字、下划线、短横线或点。');
  }
  const normalized = Array.from(username, char => CASE_FOLD_OVERRIDES[char] ?? char.toLowerCase()).join('').normalize('NFKC');
  return { username, normalized };
}
function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    fail(400, 'INVALID_PASSWORD', '密码长度须为 6 至 128 个字符。');
  }
  return password;
}
function validateRequestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value)) {
    fail(400, 'INVALID_REQUEST_ID', '请提供有效的操作编号。');
  }
  return value;
}
function validateId(value, name = '编号') {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) fail(400, 'INVALID_ID', `${name}无效。`);
  return value;
}
function publicPlayer(player) {
  return player ? { ...player, id: player.userId, volume: volume(player) } : null;
}
function publicUser(account) { return { id: account.id, username: account.username }; }
function cookie(token, url, clear = false) {
  return `${SESSION_COOKIE}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_AGE_MS / 1000}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
function sessionToken(request) {
  const entry = (request.headers.get('Cookie') ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`));
  if (!entry) return null;
  const token = entry.slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
async function readJson(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) fail(403, 'ORIGIN_MISMATCH', '请求来源无效。');
  if ((request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'JSON_REQUIRED', '请使用 JSON 请求。');
  }
  if (Number(request.headers.get('Content-Length')) > BODY_LIMIT) fail(413, 'BODY_TOO_LARGE', '请求过大。');
  const reader = request.body?.getReader();
  let length = 0;
  const chunks = [];
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BODY_LIMIT) {
        await reader.cancel();
        fail(413, 'BODY_TOO_LARGE', '请求过大。');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail(400, 'INVALID_JSON', 'JSON 格式无效。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_JSON', '请求内容须为 JSON 对象。');
  return body;
}

export class GameWorld extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  tx(work) { return this.ctx.storage.transactionSync(work); }
  get(key) { return this.ctx.storage.kv.get(key); }
  put(key, value) { this.ctx.storage.kv.put(key, value); }
  delete(key) { this.ctx.storage.kv.delete(key); }

  auth(hash, now = Date.now()) {
    const session = hash && this.get(`session:${hash}`);
    if (!session || session.expiresAt <= now) {
      if (session) this.delete(`session:${hash}`);
      fail(401, 'AUTH_REQUIRED', '请先登录。');
    }
    const account = this.get(`account:${session.userId}`);
    if (!account) fail(401, 'AUTH_REQUIRED', '请重新登录。');
    return account;
  }

  requirePlayer(userId) {
    const player = this.get(`player:${userId}`);
    if (!player) fail(409, 'PLAYER_REQUIRED', '请先在牛子身份证栏目注册一根牛子。');
    return player;
  }

  savePlayer(player, previous, now = Date.now()) {
    const next = { ...player, updatedAt: now, version: (previous?.version ?? 0) + 1 };
    // Persist source dimensions only; displayed volume is always derived server-side.
    delete next.id;
    delete next.volume;
    this.put(`player:${next.userId}`, next);
    return next;
  }

  async action(hash, route, body, payload, work) {
    const requestId = validateRequestId(body.requestId);
    const fingerprint = await digest(stableJson({ route, payload }));
    return this.tx(() => {
      const account = this.auth(hash);
      const key = `action:${account.id}:${requestId}`;
      const receipt = this.get(key);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) fail(409, 'REQUEST_ID_REUSED', '该操作编号已用于其他请求。');
        return receipt.response;
      }
      const now = Date.now();
      const response = work(account, now);
      this.put(key, { fingerprint, response, createdAt: now });
      this.put(`audit:${String(now).padStart(13, '0')}:${crypto.randomUUID()}`, {
        userId: account.id, route, requestId, createdAt: now,
      });
      return response;
    });
  }

  async register(request, body, url) {
    const { username, normalized } = usernameInfo(body.username);
    const password = validatePassword(body.password);
    const salt = randomBytes(16);
    const passwordHash = base64url(await derivePassword(password, salt));
    const token = base64url(randomBytes(32));
    const hash = await digest(token);
    const response = this.tx(() => {
      if (this.get(`username:${normalized}`)) fail(409, 'USERNAME_TAKEN', '该用户名已被注册。');
      const now = Date.now();
      const account = {
        id: crypto.randomUUID(), username, normalizedUsername: normalized, createdAt: now,
        password: { algorithm: 'PBKDF2-SHA256', iterations: PASSWORD_ITERATIONS, salt: base64url(salt), hash: passwordHash },
      };
      this.put(`username:${normalized}`, account.id);
      this.put(`account:${account.id}`, account);
      this.put(`session:${hash}`, { userId: account.id, createdAt: now, expiresAt: now + SESSION_AGE_MS });
      return { user: publicUser(account), player: null };
    });
    return json({ ok: true, ...response }, 201, { 'Set-Cookie': cookie(token, url) });
  }

  async login(request, body, url) {
    const { normalized } = usernameInfo(body.username);
    const password = validatePassword(body.password);
    const source = request.headers.get('CF-Connecting-IP') || 'local';
    const rateKey = `login-rate:${await digest(source)}`;
    const account = this.tx(() => {
      const now = Date.now();
      let rate = this.get(rateKey);
      if (!rate || now - rate.startedAt >= LOGIN_WINDOW_MS) rate = { startedAt: now, attempts: 0 };
      if (rate.attempts >= LOGIN_ATTEMPT_LIMIT) fail(429, 'LOGIN_RATE_LIMIT', '登录尝试过多，请稍后再试。');
      rate.attempts++;
      this.put(rateKey, rate);
      const id = this.get(`username:${normalized}`);
      return id ? this.get(`account:${id}`) : null;
    });
    // Unknown accounts still perform the password derivation.
    const salt = account ? decode64(account.password.salt) : new Uint8Array(16);
    const candidate = await derivePassword(password, salt, account?.password.iterations ?? PASSWORD_ITERATIONS);
    const expected = account ? decode64(account.password.hash) : new Uint8Array(32);
    if (!equalBytes(candidate, expected) || !account) fail(401, 'INVALID_CREDENTIALS', '用户名或密码错误。');
    const token = base64url(randomBytes(32));
    const hash = await digest(token);
    const response = this.tx(() => {
      const now = Date.now();
      this.put(`session:${hash}`, { userId: account.id, createdAt: now, expiresAt: now + SESSION_AGE_MS });
      return { user: publicUser(account), player: publicPlayer(this.get(`player:${account.id}`)) };
    });
    return json({ ok: true, ...response }, 200, { 'Set-Cookie': cookie(token, url) });
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      const route = url.pathname.replace(/\/$/, '');
      if (!['GET', 'POST'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持。');
      const body = request.method === 'POST' ? await readJson(request) : null;
      if (route === '/api/config' && request.method === 'GET') return json({ ok: true, rules: RULES, catalog: CATALOG });
      if (route === '/api/auth/register' && request.method === 'POST') return await this.register(request, body, url);
      if (route === '/api/auth/login' && request.method === 'POST') return await this.login(request, body, url);
      const token = sessionToken(request);
      const hash = token ? await digest(token) : null;
      if (route === '/api/auth/logout' && request.method === 'POST') {
        if (hash) this.tx(() => this.delete(`session:${hash}`));
        return json({ ok: true }, 200, { 'Set-Cookie': cookie('', url, true) });
      }
      if (route === '/api/me' && request.method === 'GET') {
        return json({ ok: true, ...this.tx(() => {
          const account = this.auth(hash);
          return { user: publicUser(account), player: publicPlayer(this.get(`player:${account.id}`)) };
        }) });
      }
      if ((route === '/api/players' || route === '/api/leaderboard') && request.method === 'GET') {
        const metric = url.searchParams.get('metric') ?? 'volume';
        const order = url.searchParams.get('order') ?? 'desc';
        if (!['volume', 'length', 'diameter'].includes(metric) || !['asc', 'desc'].includes(order)) {
          fail(400, 'INVALID_SORT', '排序参数无效。');
        }
        const players = this.tx(() => {
          this.auth(hash);
          const list = [...this.ctx.storage.kv.list({ prefix: 'player:' })].map(([, player]) => player);
          return rankPlayers(list, metric, order).map(publicPlayer);
        });
        return json({ ok: true, players });
      }
      if (request.method !== 'POST') fail(404, 'NOT_FOUND', '接口不存在。');
      let result;
      if (route === '/api/player/create') {
        result = await this.action(hash, route, body, {}, (account, now) => {
          if (this.get(`player:${account.id}`)) fail(409, 'PLAYER_EXISTS', '你已经注册过牛子了，别贪心。');
          const player = newPlayer(account.id, account.username, random, now);
          this.put(`player:${account.id}`, player);
          return { player: publicPlayer(player) };
        });
      } else if (route === '/api/appearance/colors') {
        const colors = body.colors;
        if (!colors || typeof colors !== 'object' || Array.isArray(colors) || !['a', 'b', 'c'].every(slot => typeof colors[slot] === 'string' && /^#[0-9a-f]{6}$/i.test(colors[slot]))) {
          fail(400, 'INVALID_COLORS', '龟头、茎部、阴囊三处都要选颜色。');
        }
        const normalized = Object.fromEntries(['a', 'b', 'c'].map(slot => [slot, colors[slot].toLowerCase()]));
        result = await this.action(hash, route, body, { colors: normalized }, account => {
          const old = this.requirePlayer(account.id);
          return { player: publicPlayer(this.savePlayer({ ...old, colors: normalized }, old)) };
        });
      } else if (route === '/api/appearance/purchase') {
        const itemId = validateId(body.itemId, '装饰编号');
        result = await this.action(hash, route, body, { itemId }, account => {
          const old = this.requirePlayer(account.id);
          const purchased = buyCosmetic(old, itemId);
          return { player: publicPlayer(this.savePlayer(purchased.player, old)), cost: purchased.cost, item: purchased.item };
        });
      } else if (route === '/api/appearance/equip') {
        const slot = body.slot;
        if (!['a', 'b', 'c'].includes(slot)) fail(400, 'INVALID_SLOT', '装饰部位无效。');
        const itemId = body.itemId === null ? null : validateId(body.itemId, '装饰编号');
        result = await this.action(hash, route, body, { slot, itemId }, account => {
          const old = this.requirePlayer(account.id);
          return { player: publicPlayer(this.savePlayer(equipCosmetic(old, slot, itemId), old)) };
        });
      } else if (route === '/api/battles/pvp' || route === '/api/battles/pve') {
        const opponentId = route.endsWith('/pvp') ? validateId(body.opponentId, '对手编号') : null;
        const winnerSide = ['a', 'b', 'draw'].includes(body.winnerSide) ? body.winnerSide : null;
        result = await this.action(hash, route, body, { opponentId, ...(winnerSide ? { winnerSide } : {}) }, (account, now) => {
          const a = this.requirePlayer(account.id);
          if (opponentId === account.id) fail(400, 'SELF_CHALLENGE', '自己跟自己比，赢了也不光彩。');
          const b = opponentId ? this.get(`player:${opponentId}`) : createOpponent(a, random);
          if (!b) fail(404, 'OPPONENT_NOT_FOUND', '对手尚未注册或不存在。');
          const resolved = resolveBattle(a, b, random, winnerSide);
          const afterA = this.savePlayer(resolved.after.a, a, now);
          const afterB = opponentId ? this.savePlayer(resolved.after.b, b, now) : resolved.after.b;
          const battle = {
            id: crypto.randomUUID(), kind: opponentId ? 'pvp' : 'pve', createdAt: now,
            playerA: publicPlayer(a), playerB: publicPlayer(b),
            result: { ...resolved, after: { a: publicPlayer(afterA), b: publicPlayer(afterB) } },
          };
          this.put(`battle:${battle.id}`, battle);
          return { battle, player: publicPlayer(afterA) };
        });
      } else if (route === '/api/qte/start') {
        result = await this.action(hash, route, body, {}, (account, now) => {
          this.requirePlayer(account.id);
          const activeId = this.get(`qte-active:${account.id}`);
          const active = activeId && this.get(`qte:${activeId}`);
          if (active && !active.claimedAt && active.expiresAt > now) return { qte: active.public };
          // TODO(USER_DESIGN): Timing and random target centers are generic QTE defaults.
          const qte = {
            id: crypto.randomUUID(),
            centers: Array.from({ length: RULES.qte.stages }, () => RULES.qte.centerMin + random() * (RULES.qte.centerMax - RULES.qte.centerMin)),
            durationMs: RULES.qte.stageDurationMs, startedAt: now, expiresAt: now + QTE_TTL_MS,
          };
          this.put(`qte:${qte.id}`, { userId: account.id, ...qte, public: qte });
          this.put(`qte-active:${account.id}`, qte.id);
          return { qte };
        });
      } else if (route === '/api/qte/finish') {
        const qteId = validateId(body.qteId, 'QTE 编号');
        const positions = body.positions;
        if (!Array.isArray(positions) || positions.length !== 3 || positions.some(position => position !== null && (typeof position !== 'number' || !Number.isFinite(position) || position < 0 || position > 1))) {
          fail(400, 'INVALID_POSITIONS', '须提供三个 0 至 1 的位置或空值。');
        }
        result = await this.action(hash, route, body, { qteId, positions }, (account, now) => {
          const qte = this.get(`qte:${qteId}`);
          if (!qte || qte.userId !== account.id) fail(404, 'QTE_NOT_FOUND', 'QTE 不存在。');
          if (qte.claimedAt) {
            if (stableJson(qte.positions) !== stableJson(positions)) fail(409, 'QTE_ALREADY_FINISHED', '该次 QTE 已结算。');
            return qte.receipt;
          }
          if (now >= qte.expiresAt) fail(409, 'QTE_EXPIRED', '该次 QTE 已过期，请重新开始。');
          if (now - qte.startedAt < Math.max(0, qte.durationMs * RULES.qte.stages - QTE_TIMING_TOLERANCE_MS)) fail(409, 'QTE_TOO_EARLY', '请完成三段操作后再结算。');
          const old = this.requirePlayer(account.id);
          const scored = scoreQte(positions, qte.centers);
          const next = this.savePlayer(applyVolumeMultiplier(old, scored.volumeMultiplier), old, now);
          const receipt = {
            result: { ...scored, volumeBefore: volume(old), volumeAfter: volume(next) },
            player: publicPlayer(next),
          };
          this.put(`qte:${qteId}`, { ...qte, claimedAt: now, positions, receipt });
          if (this.get(`qte-active:${account.id}`) === qteId) this.delete(`qte-active:${account.id}`);
          return receipt;
        });
      } else {
        fail(404, 'NOT_FOUND', '接口不存在。');
      }
      return json({ ok: true, ...result });
    } catch (error) {
      // An early rejection must stop the forwarded request-body pump before
      // returning the response (notably when Origin/media headers are invalid).
      if (request.body && !request.body.locked) {
        try { await request.body.cancel(); } catch { /* the upstream may already be closed */ }
      }
      if (error instanceof ApiError) return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
      // Rule errors contain public validation text, never credentials or request bodies.
      if (typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code)) {
        return json({ ok: false, error: { code: error.code, message: error.message } }, 400);
      }
      console.error('Game API unexpected error', error?.name ?? 'Error');
      return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时无法处理请求。' } }, 500);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        if (!['GET', 'POST'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持。');
        let forwarded = request;
        if (request.method === 'POST') {
          // Own and bound the body at the HTTP edge before crossing the DO RPC.
          // Forwarding a live stream and rejecting it early inside the DO leaves
          // workerd's upstream body pump alive after the response has finished.
          const body = await readJson(request);
          const headers = new Headers(request.headers);
          headers.delete('Content-Length');
          forwarded = new Request(request.url, { method: 'POST', headers, body: JSON.stringify(body) });
        } else if (request.body) fail(400, 'BODY_NOT_ALLOWED', 'GET 请求不可携带正文。');
        return await env.GAME_WORLD.getByName('friend-world-v1').fetch(forwarded);
      } catch (error) {
        if (error instanceof ApiError) return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
        console.error('Game edge unexpected error', error?.name ?? 'Error');
        return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时无法处理请求。' } }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
