// Servidor local de desarrollo: sirve /public y emula la función de Netlify.
// Uso: node dev-server.mjs   ->   http://localhost:8787
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newState, applyAction, viewFor, lobbyView } from './lib/game.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const SAVE = path.join(ROOT, '.dev-state.json');
const PORT = Number(process.env.PORT || 8787);

let state;
try { state = JSON.parse(fs.readFileSync(SAVE, 'utf8')); } catch { state = newState(); }
const persist = () => { try { fs.writeFileSync(SAVE, JSON.stringify(state)); } catch {} };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    try {
      if (req.method === 'GET') {
        const op = url.searchParams.get('op') || 'view';
        const as = url.searchParams.get('as') || '';
        const token = url.searchParams.get('token') || '';
        if (op === 'lobby') return send(res, 200, lobbyView(state));
        return send(res, 200, viewFor(state, as, token));
      }
      if (req.method === 'POST') {
        let raw = '';
        for await (const c of req) raw += c;
        const body = JSON.parse(raw || '{}');
        const result = applyAction(state, body);
        persist();
        const payload = { ...result };
        if (body.withView !== false && body.op !== 'join') {
          try { payload.view = viewFor(state, body.as, body.token); } catch {}
        }
        return send(res, 200, payload);
      }
      return send(res, 405, { error: 'Método no permitido.' });
    } catch (err) {
      return send(res, err.code || 500, { error: err.message || 'Error interno.' });
    }
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const abs = path.join(PUB, path.normalize(file).replace(/^[/\\]+/, ''));
  if (!abs.startsWith(PUB)) return send(res, 403, 'no');
  fs.readFile(abs, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(abs)] || 'application/octet-stream');
  });
}).listen(PORT, () => console.log('dev -> http://localhost:' + PORT));
