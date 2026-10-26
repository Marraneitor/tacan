// Hexalia game server for Vercel: stores each table in Upstash Redis and applies every move with the shared rules engine.
const Engine = require('../lib/engine.js');

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const TTL = 60 * 60 * 24 * 14; // tables expire after 14 days without moves
const CODE_RE = /^[A-Z0-9]{5}$/;

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

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
  if (ok !== 1) return false;
  const summary = JSON.stringify({ code, phase: state.phase, names: state.players.map((p) => p.name), pids: state.players.map((p) => p.id), updatedAt: Date.now() });
  await redis('SET', `hexalia:sum:${code}`, summary, 'EX', String(TTL));
  if (state.phase === 'lobby') await redis('SADD', 'hexalia:lobby', code);
  else await redis('SREM', 'hexalia:lobby', code);
  return true;
}

function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}

function validNewGame(s) {
  return s && s.phase === 'lobby' && Array.isArray(s.players) && s.players.length === 1 && s.board && Array.isArray(s.board.hexes) && s.board.hexes.length === 19;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  if (q.op === 'ping') return res.status(URL_ && TOKEN ? 200 : 503).json({ ok: !!(URL_ && TOKEN) });
  if (!URL_ || !TOKEN) return res.status(503).json({ error: 'Falta conectar la base de datos Upstash Redis en Vercel.' });

  try {
    if (req.method === 'GET') {
      if (q.op === 'list') {
        const lobby = (await redis('SMEMBERS', 'hexalia:lobby')) || [];
        const mine = String(q.codes || '').split(',').filter((c) => CODE_RE.test(c)).slice(0, 8);
        const codes = [...new Set([...lobby.slice(0, 30), ...mine])];
        const sums = codes.length ? await redis('MGET', ...codes.map((c) => `hexalia:sum:${c}`)) : [];
        const all = sums.filter(Boolean).map((x) => JSON.parse(x));
        const gone = lobby.filter((c) => !all.some((g) => g.code === c));
        if (gone.length) await redis('SREM', 'hexalia:lobby', ...gone);
        return res.status(200).json({ open: all.filter((g) => g.phase === 'lobby'), mine: all.filter((g) => mine.includes(g.code)) });
      }
      const code = String(q.code || '').toUpperCase();
      if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Código no válido.' });
      const g = await load(code);
      if (!g) return res.status(404).json({ error: 'No existe una partida con ese código.' });
      if (q.v !== undefined && Number(q.v) === g.v) return res.status(200).json({ v: g.v });
      return res.status(200).json(g);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      if (body.op === 'create') {
        if (!validNewGame(body.state)) return res.status(400).json({ error: 'Partida no válida.' });
        for (let i = 0; i < 6; i++) {
          const code = randomCode();
          if (await save(code, body.state, 0)) return res.status(200).json({ code, v: 1 });
        }
        return res.status(500).json({ error: 'No se pudo crear la partida. Inténtalo otra vez.' });
      }
      if (body.op === 'act') {
        const code = String(body.code || '').toUpperCase();
        if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Código no válido.' });
        const pid = String(body.pid || '').slice(0, 64);
        for (let i = 0; i < 8; i++) {
          const g = await load(code);
          if (!g) return res.status(404).json({ error: 'La partida ya no existe.' });
          const r = Engine.apply(g.state, body.action, pid);
          if (!r.ok) return res.status(200).json(r);
          if (await save(code, r.state, g.v)) return res.status(200).json({ ok: true, state: r.state, v: g.v + 1 });
          await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 120));
        }
        return res.status(409).json({ error: 'Mucha gente jugando a la vez. Inténtalo otra vez.' });
      }
    }
    return res.status(400).json({ error: 'Petición no válida.' });
  } catch (e) {
    return res.status(500).json({ error: 'Error del servidor: ' + e.message });
  }
};
