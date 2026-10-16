import { getStore } from '@netlify/blobs';
import { newState, applyAction, viewFor, lobbyView, Fail } from '../../lib/game.mjs';

const KEY = 'state';

function store() {
  return getStore({ name: 'oneshot', consistency: 'strong' });
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function loadState(s) {
  try {
    const res = await s.getWithMetadata(KEY, { type: 'json' });
    if (res && res.data) return { state: res.data, etag: res.etag };
  } catch (_) { /* primera vez */ }
  return { state: newState(), etag: null };
}

// Lectura -> modificación -> escritura condicional, con reintentos.
async function mutate(fn, attempts = 5) {
  const s = store();
  for (let i = 0; i < attempts; i++) {
    const { state, etag } = await loadState(s);
    const result = fn(state);
    try {
      const opts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
      const w = await s.setJSON(KEY, state, opts);
      if (w && w.modified === false) continue; // otro escribió antes: reintenta
      return { state, result };
    } catch (_) {
      // El runtime no soporta escritura condicional: escribe sin ella.
      await s.setJSON(KEY, state);
      return { state, result };
    }
  }
  throw new Fail('El servidor está saturado, prueba otra vez.', 503);
}

export default async (req) => {
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const op = url.searchParams.get('op') || 'view';
      const as = url.searchParams.get('as') || '';
      const token = url.searchParams.get('token') || '';
      const { state } = await loadState(store());

      if (op === 'lobby') return json(lobbyView(state));
      if (op === 'view') return json(viewFor(state, as, token));
      return json({ error: 'Operación desconocida.' }, 400);
    }

    if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

    const body = await req.json();

    // 'ping' sólo toca lastSeen: si falla la escritura no pasa nada.
    const { state, result } = await mutate((st) => applyAction(st, body));

    const wantsView = body.withView !== false && body.op !== 'join';
    const payload = { ...result };
    if (wantsView) {
      try { payload.view = viewFor(state, body.as, body.token); } catch (_) { /* ignora */ }
    }
    return json(payload);
  } catch (err) {
    const status = err && err.code ? err.code : 500;
    return json({ error: (err && err.message) || 'Error interno.' }, status);
  }
};
