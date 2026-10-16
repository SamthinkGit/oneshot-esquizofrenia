// Función de Vercel: el mismo endpoint /api que la de Netlify, pero guardando
// la partida en Upstash Redis (Vercel → Storage → Upstash for Redis). Habla con
// Redis por su API REST, sin dependencias.
import { newState, applyAction, viewFor, lobbyView, Fail } from '../lib/game.mjs';

const KEY = 'oneshot:state';
const VER = 'oneshot:ver';

// La integración de Vercel crea KV_REST_API_*; una base de Upstash suelta, UPSTASH_REDIS_REST_*.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Escribe solo si nadie ha escrito desde que leímos (mismo número de versión).
const CAS = `
local v = redis.call('GET', KEYS[2])
if (v or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('INCR', KEYS[2])
return 1`;

async function redis(cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Fail('Falta conectar la base de datos: en Vercel, Storage → Upstash for Redis.', 503);
  }
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + REDIS_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => ({ error: 'Respuesta inválida de Redis.' }));
  if (j.error) throw new Fail('Base de datos: ' + j.error, 503);
  return j.result;
}

async function loadState() {
  const [raw, ver] = await redis(['MGET', KEY, VER]);
  return { state: raw ? JSON.parse(raw) : newState(), ver: ver || '' };
}

// Lectura -> modificación -> escritura condicional, con reintentos.
async function mutate(fn, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    const { state, ver } = await loadState();
    const result = fn(state);
    const saved = await redis(['EVAL', CAS, '2', KEY, VER, ver, JSON.stringify(state)]);
    if (saved === 1) return { state, result };
  }
  throw new Fail('El servidor está saturado, prueba otra vez.', 503);
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const failed = err => json({ error: (err && err.message) || 'Error interno.' }, (err && err.code) || 500);

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const op = url.searchParams.get('op') || 'view';
    const as = url.searchParams.get('as') || '';
    const token = url.searchParams.get('token') || '';
    const { state } = await loadState();
    if (op === 'lobby') return json(lobbyView(state));
    if (op === 'view') return json(viewFor(state, as, token));
    return json({ error: 'Operación desconocida.' }, 400);
  } catch (err) {
    return failed(err);
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    // 'ping' solo toca lastSeen: si choca con otra escritura, da igual perderlo.
    if (body.op === 'ping') {
      await mutate(st => applyAction(st, body), 1).catch(() => {});
      return json({ ok: true });
    }
    const { state, result } = await mutate(st => applyAction(st, body));
    const payload = { ...result };
    if (body.withView !== false && body.op !== 'join') {
      try { payload.view = viewFor(state, body.as, body.token); } catch (_) { /* ignora */ }
    }
    return json(payload);
  } catch (err) {
    return failed(err);
  }
}
