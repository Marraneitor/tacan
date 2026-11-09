// Thin client for the Upstash Redis REST API. Tests and the local dev server swap in an in-memory version with setRedis().
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

let impl = async (...cmd) => {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
};
let configured = !!(URL_ && TOKEN);

const redis = (...cmd) => impl(...cmd.map(String));
redis.configured = () => configured;
redis.setRedis = (fn) => { impl = fn; configured = true; };

module.exports = redis;
