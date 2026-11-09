// Hexalia accounts: sign up, sign in, sign out, profile and the rating table.
const redis = require('../lib/redis.js');
const Users = require('../lib/users.js');

const bodyOf = (req) => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis.configured()) return res.status(503).json({ error: 'Falta conectar la base de datos Upstash Redis en Vercel.' });
  const q = req.query || {};
  try {
    if (req.method === 'GET') {
      if (q.op === 'me') {
        const me = await Users.fromRequest(req);
        if (!me) return res.status(401).json({ error: 'Tu sesión terminó. Vuelve a entrar.' });
        return res.status(200).json({ user: me, history: await Users.history(Users.keyFromPid(me.id)) });
      }
      if (q.op === 'ranking') return res.status(200).json({ top: await Users.ranking(50) });
      if (q.op === 'profile') {
        const key = Users.keyOf(q.name);
        const u = await Users.getUser(key);
        if (!u) return res.status(404).json({ error: 'No existe ese jugador.' });
        return res.status(200).json({ user: Users.publicUser(key, u), history: await Users.history(key) });
      }
    }
    if (req.method === 'POST') {
      const body = bodyOf(req);
      if (body.op === 'register') return res.status(200).json(await Users.register(body.name, body.password));
      if (body.op === 'login') return res.status(200).json(await Users.login(body.name, body.password));
      if (body.op === 'logout') {
        await Users.logout(String(req.headers.authorization || '').replace(/^Bearer\s+/, ''));
        return res.status(200).json({ ok: true });
      }
    }
    return res.status(400).json({ error: 'Petición no válida.' });
  } catch (e) {
    if (e instanceof Users.AuthError) return res.status(400).json({ error: e.message });
    return res.status(500).json({ error: 'Error del servidor: ' + e.message });
  }
};
