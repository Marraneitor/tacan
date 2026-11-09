// Hexalia game server for Vercel: stores each table in Upstash Redis and applies every move with the shared rules engine.
// Every move needs a signed-in account; the player is whoever owns the session token, never what the browser claims.
const Engine = require('../lib/engine.js');
const redis = require('../lib/redis.js');
const Users = require('../lib/users.js');

const TTL = 60 * 60 * 24 * 14; // tables expire after 14 days without moves
const CODE_RE = /^[A-Z0-9]{5}$/;

// Compare-and-set: write only if nobody moved since we read version `v`.
const CAS = `
local cur = redis.call('GET', KEYS[2]) or '0'
if cur ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 1`;

const keyOf = (code) => [`hexalia:game:${code}`, `hexalia:ver:${code}`];

async function load(code) {
  const [k, kv] = keyOf(code);
  const [raw, v] = await redis('MGET', k, kv);
  if (!raw) return null;
  return { state: JSON.parse(raw), v: Number(v || 0) };
}

async function save(code, state, prevV) {
  const [k, kv] = keyOf(code);
  const ok = await redis('EVAL', CAS, '2', k, kv, String(prevV), JSON.stringify(state), String(prevV + 1), String(TTL));
  if (Number(ok) !== 1) return false;
  const summary = JSON.stringify({ code, phase: state.phase, names: state.players.map((p) => p.name), pids: state.players.map((p) => p.id), updatedAt: Date.now() });
  await redis('SET', `hexalia:sum:${code}`, summary, 'EX', String(TTL));
  if (state.phase === 'lobby') {
    await redis('SADD', 'hexalia:lobby', code);
    for (const p of state.players) {
      const key = Users.keyFromPid(p.id);
      if (key) { await redis('SADD', `hexalia:mine:${key}`, code); await redis('EXPIRE', `hexalia:mine:${key}`, String(TTL)); }
    }
  } else await redis('SREM', 'hexalia:lobby', code);
  return true;
}

// Apply a change with retries, so two players acting at once never overwrite each other.
async function update(code, fn) {
  for (let i = 0; i < 8; i++) {
    const g = await load(code);
    if (!g) return { status: 404, body: { error: 'La partida ya no existe.' } };
    const r = fn(g.state);
    if (!r.ok) return { status: 200, body: r };
    if (await save(code, r.state, g.v)) return { status: 200, body: { ok: true, state: r.state, v: g.v + 1, now: Date.now() } };
    await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 120));
  }
  return { status: 409, body: { error: 'Mucha gente jugando a la vez. Inténtalo otra vez.' } };
}

function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

const bodyOf = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  if (q.op === 'ping') return res.status(redis.configured() ? 200 : 503).json({ ok: redis.configured() });
  if (!redis.configured()) return res.status(503).json({ error: 'Falta conectar la base de datos Upstash Redis en Vercel.' });

  try {
    if (req.method === 'GET') {
      if (q.op === 'list') {
        const me = await Users.fromRequest(req);
        const lobby = (await redis('SMEMBERS', 'hexalia:lobby')) || [];
        const mine = me ? ((await redis('SMEMBERS', `hexalia:mine:${Users.keyFromPid(me.id)}`)) || []).filter((c) => CODE_RE.test(c)) : [];
        const codes = [...new Set([...lobby.slice(0, 30), ...mine.slice(0, 20)])];
        const sums = codes.length ? await redis('MGET', ...codes.map((c) => `hexalia:sum:${c}`)) : [];
        const all = sums.filter(Boolean).map((x) => JSON.parse(x));
        const gone = lobby.filter((c) => !all.some((g) => g.code === c));
        if (gone.length) await redis('SREM', 'hexalia:lobby', ...gone);
        const staleMine = mine.filter((c) => !all.some((g) => g.code === c && g.phase !== 'ended'));
        if (me && staleMine.length) await redis('SREM', `hexalia:mine:${Users.keyFromPid(me.id)}`, ...staleMine);
        return res.status(200).json({ open: all.filter((g) => g.phase === 'lobby'), mine: all.filter((g) => mine.includes(g.code) && g.phase !== 'ended') });
      }
      const code = String(q.code || '').toUpperCase();
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Código no válido.' });
      const g = await load(code);
      if (!g) return res.status(404).json({ error: 'No existe una partida con ese código.' });
      if (q.v !== undefined && Number(q.v) === g.v) return res.status(200).json({ v: g.v, now: Date.now() });
      return res.status(200).json({ ...g, now: Date.now() });
    }

    if (req.method === 'POST') {
      const body = bodyOf(req);
      const me = await Users.fromRequest(req);
      if (!me) return res.status(401).json({ error: 'Inicia sesión para jugar.' });

      if (body.op === 'create') {
        if (!Engine.validBoard(body.board)) return res.status(400).json({ error: 'Mapa no válido.' });
        const state = Engine.newGame(me.id, me.name);
        state.board = body.board;
        state.ranked = true;
        state.players[0].rating = me.rating;
        for (let i = 0; i < 6; i++) {
          const code = randomCode();
          if ((await load(code)) === null && (await save(code, state, 0))) return res.status(200).json({ code, v: 1, state });
        }
        return res.status(500).json({ error: 'No se pudo crear la partida. Inténtalo otra vez.' });
      }

      if (body.op === 'act') {
        const code = String(body.code || '').toUpperCase();
        if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Código no válido.' });
        const action = { ...(body.action || {}) };
        if (action.type === 'join') { action.name = me.name; action.rating = me.rating; } // the table shows your account
        const r = await update(code, (st) => Engine.apply(st, action, me.id, Date.now()));
        // When a move ends the game, settle the ratings once and record the result in the game.
        if (r.body.ok && r.body.state.phase === 'ended' && !r.body.state.rating) {
          const result = await Users.rateGame(Engine, code, r.body.state);
          if (result) {
            const r2 = await update(code, (st) => ({ ok: true, state: { ...st, rating: result } }));
            if (r2.body.ok) return res.status(200).json(r2.body);
          }
        }
        return res.status(r.status).json(r.body);
      }
    }
    return res.status(400).json({ error: 'Petición no válida.' });
  } catch (e) {
    return res.status(500).json({ error: 'Error del servidor: ' + e.message });
  }
};
