// FortDay - serves the single-page game (index.html), a health check for the host,
// and a WebSocket relay at /ws that lets friends share a match by room code.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const PAGE = path.join(__dirname, 'index.html');

// The page is one large file, so it is read and compressed once at start instead of on every visit.
let html = null, gz = null;
try { html = fs.readFileSync(PAGE); gz = zlib.gzipSync(html, { level: 9 }); } catch (e) { console.error('could not read index.html:', e.message); }

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
  if (u === '/' || u === '/index.html') {
    if (!html) { res.writeHead(500); res.end('could not read index.html'); return; }
    const head = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Vary': 'Accept-Encoding' };
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { head['Content-Encoding'] = 'gzip'; res.writeHead(200, head); res.end(gz); }
    else { res.writeHead(200, head); res.end(html); }
    return;
  }
  res.writeHead(404); res.end('not found');
});

// ---------------------------------------------------------------- multiplayer rooms
// The server only groups players into rooms and passes messages along. The room's host runs the match.
const MAX_PLAYERS = 8, LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rooms = new Map();   // code -> { code, host, members: Map(id -> { id, ws, name, eq }) }
let nextClient = 1;
const clean = (s, n) => String(s == null ? '' : s).replace(/[^\w \-'.!]/g, '').trim().slice(0, n);
const cleanEq = eq => { const o = {}; if (eq && typeof eq === 'object') for (const k of ['outfit', 'body', 'backpack', 'pickaxe', 'glider', 'wrap', 'emote']) if (typeof eq[k] === 'string') o[k] = clean(eq[k], 24); return o; };
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const roster = r => ({ t: 'room', code: r.code, host: r.host, members: [...r.members.values()].map(m => ({ id: m.id, name: m.name, eq: m.eq })) });
const tellAll = r => { for (const m of r.members.values()) send(m.ws, Object.assign({ you: m.id }, roster(r))); };
function newCode() { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)]; if (!rooms.has(c)) return c; } }
function leave(ws) {
  const r = ws.room; if (!r) return; ws.room = null;
  r.members.delete(ws.cid);
  if (ws.cid === r.host || r.members.size === 0) {   // the host runs the match, so the room ends with them
    for (const m of r.members.values()) { send(m.ws, { t: 'closed' }); m.ws.room = null; }
    rooms.delete(r.code); return;
  }
  for (const m of r.members.values()) send(m.ws, { t: 'left', id: ws.cid });
  tellAll(r);
}
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });
wss.on('connection', ws => {
  ws.cid = nextClient++; ws.room = null; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'x') {   // relay inside the room: to the host ('h'), to everyone else ('*'), or to one player
      const r = ws.room; if (!r) return; const out = JSON.stringify({ t: 'x', from: ws.cid, d: m.d });
      if (m.to === 'h') { const h = r.members.get(r.host); if (h && h.ws !== ws && h.ws.readyState === 1) h.ws.send(out); }
      else if (m.to === '*') { for (const o of r.members.values()) if (o.ws !== ws && o.ws.readyState === 1) o.ws.send(out); }
      else { const o = r.members.get(m.to); if (o && o.ws.readyState === 1) o.ws.send(out); }
    } else if (m.t === 'create') {
      leave(ws);
      const r = { code: newCode(), host: ws.cid, members: new Map() }; rooms.set(r.code, r);
      r.members.set(ws.cid, { id: ws.cid, ws, name: clean(m.name, 16) || 'Player', eq: cleanEq(m.eq) }); ws.room = r; tellAll(r);
    } else if (m.t === 'join') {
      const r = rooms.get(clean(m.code, 4).toUpperCase());
      if (!r) { send(ws, { t: 'error', msg: 'No room with that code. Check the letters and try again.' }); return; }
      if (r.members.size >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That room is full.' }); return; }
      leave(ws);
      r.members.set(ws.cid, { id: ws.cid, ws, name: clean(m.name, 16) || 'Player', eq: cleanEq(m.eq) }); ws.room = r; tellAll(r);
    } else if (m.t === 'me') {   // name or outfit changed while in the room
      const r = ws.room, me = r && r.members.get(ws.cid); if (!me) return;
      me.name = clean(m.name, 16) || me.name; me.eq = cleanEq(m.eq); tellAll(r);
    } else if (m.t === 'leave') leave(ws);
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});
// drop connections that stopped answering, and keep the rest alive through proxies
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { /* closing */ } } }, 25000);

server.listen(PORT, () => console.log(`FortDay running on http://localhost:${PORT}`));
