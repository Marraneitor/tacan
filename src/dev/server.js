// Local test server: serves the built site and runs the /api functions against an in-memory Redis.
// Usage, from the repository root after `sh src/build-vercel.sh`:  node src/dev/server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const redis = require(path.join(ROOT, 'lib/redis.js'));

const kv = new Map();
const get = (k, make) => { if (!kv.has(k) && make) kv.set(k, make()); return kv.get(k); };
const C = {
  GET: (k) => (typeof kv.get(k) === 'string' ? kv.get(k) : null),
  SET: (k, v, ...o) => { if (o.includes('NX') && kv.has(k)) return null; kv.set(k, v); return 'OK'; },
  MGET: (...ks) => ks.map((k) => C.GET(k)),
  DEL: (...ks) => ks.filter((k) => kv.delete(k)).length,
  INCR: (k) => { const n = Number(kv.get(k) || 0) + 1; kv.set(k, String(n)); return n; },
  EXPIRE: () => 1,
  HSETNX: (k, f, v) => { const h = get(k, () => new Map()); if (h.has(f)) return 0; h.set(f, v); return 1; },
  HSET: (k, ...fv) => { const h = get(k, () => new Map()); for (let i = 0; i < fv.length; i += 2) h.set(fv[i], fv[i + 1]); return fv.length / 2; },
  HGETALL: (k) => [...(kv.get(k) || new Map())].flat(),
  HMGET: (k, ...fs) => fs.map((f) => (kv.get(k) || new Map()).get(f) ?? null),
  HINCRBY: (k, f, d) => { const h = get(k, () => new Map()); const n = Number(h.get(f) || 0) + Number(d); h.set(f, String(n)); return n; },
  ZADD: (k, sc, m) => { get(k, () => new Map()).set(m, Number(sc)); return 1; },
  ZREVRANGE: (k, a, b) => [...(kv.get(k) || new Map())].sort((x, y) => y[1] - x[1]).slice(Number(a), Number(b) + 1).map((x) => x[0]),
  LPUSH: (k, ...vs) => { const l = get(k, () => []); vs.forEach((v) => l.unshift(v)); return l.length; },
  LTRIM: (k, a, b) => { kv.set(k, (kv.get(k) || []).slice(Number(a), Number(b) + 1)); return 'OK'; },
  LRANGE: (k, a, b) => (kv.get(k) || []).slice(Number(a), Number(b) + 1),
  SADD: (k, ...ms) => { const s = get(k, () => new Set()); ms.forEach((m) => s.add(m)); return ms.length; },
  SREM: (k, ...ms) => { const s = kv.get(k); if (s) ms.forEach((m) => s.delete(m)); return ms.length; },
  SMEMBERS: (k) => [...(kv.get(k) || [])],
  // Only the compare-and-set script from api/game.js is used.
  EVAL: (script, n, k1, k2, prev, val, next) => { if ((C.GET(k2) || '0') !== prev) return 0; kv.set(k1, val); kv.set(k2, next); return 1; },
};
redis.setRedis(async (cmd, ...args) => {
  if (!C[cmd]) throw new Error('dev redis: unsupported ' + cmd);
  return C[cmd](...args);
});

const handlers = { '/api/game': require(path.join(ROOT, 'api/game.js')), '/api/auth': require(path.join(ROOT, 'api/auth.js')) };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const h = handlers[url.pathname];
  if (h) {
    let raw = '';
    for await (const c of req) raw += c;
    req.query = Object.fromEntries(url.searchParams);
    req.body = raw ? JSON.parse(raw) : {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    return h(req, res);
  }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('no'); }
  res.end(fs.readFileSync(file));
}).listen(Number(process.argv[2] || 3000), () => console.log('Hexalia dev server on http://localhost:' + (process.argv[2] || 3000)));
