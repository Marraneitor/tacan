// Accounts, sessions and ratings, stored in Redis.
//   hexalia:user:<key>   hash  name, salt, hash, rating, games, wins, peak, created
//   hexalia:sess:<token> string  account key, expires after SESSION_TTL
//   hexalia:ratings      sorted set  account key -> rating (players with at least one rated game)
//   hexalia:stats        hash  account key -> JSON {name, rating, games, wins} for the ranking table
//   hexalia:hist:<key>   list  last 20 rated games, newest first
const crypto = require('crypto');
const redis = require('./redis.js');
const Elo = require('./elo.js');

const SESSION_TTL = 60 * 60 * 24 * 60; // 60 days
const NAME_RE = /^[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_.-]{3,18}$/;
const keyOf = (name) => String(name || '').trim().toLowerCase();
const pidOf = (key) => 'u:' + key;
const keyFromPid = (pid) => (String(pid).startsWith('u:') ? String(pid).slice(2) : null);

class AuthError extends Error {}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function hashToObj(arr) {
  const o = {};
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

async function getUser(key) {
  if (!key) return null;
  const u = hashToObj(await redis('HGETALL', 'hexalia:user:' + key));
  if (!u.name) return null;
  return u;
}

function publicUser(key, u) {
  return { id: pidOf(key), name: u.name, rating: Number(u.rating || Elo.START), games: Number(u.games || 0), wins: Number(u.wins || 0), peak: Number(u.peak || u.rating || Elo.START) };
}

async function newSession(key) {
  const token = crypto.randomBytes(24).toString('base64url');
  await redis('SET', 'hexalia:sess:' + token, key, 'EX', SESSION_TTL);
  return token;
}

async function register(name, password) {
  name = String(name || '').trim();
  if (!NAME_RE.test(name)) throw new AuthError('El usuario debe tener de 3 a 18 letras o números (sin espacios).');
  if (String(password || '').length < 6) throw new AuthError('La contraseña debe tener al menos 6 caracteres.');
  if (String(password).length > 200) throw new AuthError('La contraseña es demasiado larga.');
  const key = keyOf(name);
  const created = await redis('HSETNX', 'hexalia:user:' + key, 'name', name);
  if (Number(created) !== 1) throw new AuthError('Ese usuario ya existe. Elige otro o inicia sesión.');
  const salt = crypto.randomBytes(16).toString('hex');
  await redis('HSET', 'hexalia:user:' + key, 'salt', salt, 'hash', hashPassword(password, salt), 'rating', Elo.START, 'peak', Elo.START, 'games', 0, 'wins', 0, 'created', Date.now());
  const token = await newSession(key);
  return { token, user: publicUser(key, { name, rating: Elo.START, games: 0, wins: 0 }) };
}

async function login(name, password) {
  const key = keyOf(name);
  const failKey = 'hexalia:fail:' + key;
  const fails = Number((await redis('GET', failKey)) || 0);
  if (fails >= 8) throw new AuthError('Demasiados intentos. Espera 15 minutos e inténtalo otra vez.');
  const u = await getUser(key);
  const ok = u && u.salt && crypto.timingSafeEqual(Buffer.from(hashPassword(password, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
  if (!ok) {
    await redis('INCR', failKey);
    await redis('EXPIRE', failKey, 15 * 60);
    throw new AuthError('Usuario o contraseña incorrectos.');
  }
  await redis('DEL', failKey);
  return { token: await newSession(key), user: publicUser(key, u) };
}

async function logout(token) {
  if (token) await redis('DEL', 'hexalia:sess:' + token);
}

function tokenOf(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{10,80})$/.exec(h);
  return m ? m[1] : null;
}

// The signed-in account for a request, or null.
async function fromRequest(req) {
  const token = tokenOf(req);
  if (!token) return null;
  const key = await redis('GET', 'hexalia:sess:' + token);
  if (!key) return null;
  const u = await getUser(key);
  return u ? publicUser(key, u) : null;
}

async function history(key) {
  const rows = (await redis('LRANGE', 'hexalia:hist:' + key, 0, 19)) || [];
  return rows.map((r) => JSON.parse(r));
}

async function ranking(limit = 50) {
  const keys = (await redis('ZREVRANGE', 'hexalia:ratings', 0, limit - 1)) || [];
  if (!keys.length) return [];
  const rows = await redis('HMGET', 'hexalia:stats', ...keys);
  return keys.map((k, i) => ({ id: pidOf(k), ...JSON.parse(rows[i] || '{}') })).filter((r) => r.name);
}

// Applies the Elo change for a finished game, once. Returns the per-player results, or null when it does not apply.
async function rateGame(Engine, code, s) {
  if (s.phase !== 'ended' || s.rating) return null;
  const keys = s.players.map((p) => keyFromPid(p.id));
  if (keys.some((k) => !k) || s.players.length < 2) return null;
  const first = await redis('SET', 'hexalia:rated:' + code, '1', 'NX', 'EX', 60 * 60 * 24 * 30);
  if (first !== 'OK') return null;
  const users = await Promise.all(keys.map((k) => getUser(k)));
  if (users.some((u) => !u)) return null;
  const now = Date.now();
  const res = Elo.rate(users.map((u) => ({ rating: Number(u.rating), games: Number(u.games), peak: Number(u.peak) })), Elo.standings(Engine, s));
  await Promise.all(keys.map(async (k, i) => {
    const r = res[i], u = users[i];
    const games = Number(u.games) + 1, wins = Number(u.wins) + (i === s.winner ? 1 : 0);
    // Increments keep the rating right even if two of this player's games end at the same moment.
    const rating = Number(await redis('HINCRBY', 'hexalia:user:' + k, 'rating', r.delta));
    await redis('HINCRBY', 'hexalia:user:' + k, 'games', 1);
    if (i === s.winner) await redis('HINCRBY', 'hexalia:user:' + k, 'wins', 1);
    if (rating > Number(u.peak || 0)) await redis('HSET', 'hexalia:user:' + k, 'peak', rating);
    await redis('ZADD', 'hexalia:ratings', rating, k);
    await redis('HSET', 'hexalia:stats', k, JSON.stringify({ name: u.name, rating, games, wins }));
    const rivals = s.players.filter((_, j) => j !== i).map((p) => p.name);
    await redis('LPUSH', 'hexalia:hist:' + k, JSON.stringify({ code, at: now, place: r.place, n: s.players.length, delta: r.delta, rating, rivals, vp: Engine.victoryPoints(s, i, true), out: !!s.players[i].out }));
    await redis('LTRIM', 'hexalia:hist:' + k, 0, 19);
    r.after = rating;
    r.before = rating - r.delta;
  }));
  return s.players.map((p, i) => ({ id: p.id, name: p.name, place: res[i].place, before: res[i].before, after: res[i].after, delta: res[i].delta }));
}

module.exports = { AuthError, register, login, logout, fromRequest, getUser, publicUser, history, ranking, rateGame, keyOf, keyFromPid, pidOf };
