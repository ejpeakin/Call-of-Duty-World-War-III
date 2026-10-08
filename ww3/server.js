// Call of Duty: World War Three - multiplayer server (Node.js + ws)
// Serves the game and relays room traffic between players over WebSockets.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const HTML = path.join(__dirname, 'public', 'index.html');

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
  if (u === '/' || u === '/index.html') {
    fs.readFile(HTML, 'utf8', (err, html) => {
      if (err) { res.writeHead(500); res.end('public/index.html is missing'); return; }
      html = html.replace('<head>', '<head><script>window.WW3_MP=true</script>'); // switches multiplayer on
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const rooms = new Map();
let nextId = 1;

const pub = r => [...r.p.values()].map(p => ({ id: p.id, name: p.name, o: p.o, team: p.team, k: p.k, d: p.d }));
const bc = (r, m, except) => { const s = JSON.stringify(m); for (const p of r.p.values()) if (p.id !== except && p.ws.readyState === 1) p.ws.send(s); };
const sendPl = r => bc(r, { t: 'pl', pl: pub(r), host: r.host, mode: r.mode, limit: r.limit, started: r.started });

function leave(ws) {
  const p = ws.pl; if (!p) return;
  const r = rooms.get(p.room); if (!r) return;
  r.p.delete(p.id);
  if (!r.p.size) { rooms.delete(p.room); return; }
  if (r.host === p.id) r.host = [...r.p.keys()][0];
  if (r.started && r.p.size < 2) { r.started = false; bc(r, { t: 'end', win: { name: [...r.p.values()][0].name, id: [...r.p.values()][0].id }, pl: pub(r), tk: [0, 0] }); }
  bc(r, { t: 'left', id: p.id });
  sendPl(r);
}

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  let last = 0, burst = 0;
  ws.on('message', raw => {
    const now = Date.now(); if (now - last > 1000) { last = now; burst = 0; } if (++burst > 120) return; // flood guard
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const p = ws.pl;
    if (m.t === 'join') {
      if (p) return;
      const code = String(m.room || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); if (!code) return;
      let r = rooms.get(code);
      if (!r) { r = { code, p: new Map(), host: null, mode: 'ffa', limit: 25, started: false }; rooms.set(code, r); }
      if (r.p.size >= 8) { ws.send(JSON.stringify({ t: 'err', msg: 'ROOM FULL' })); return; }
      if (r.started) { ws.send(JSON.stringify({ t: 'err', msg: 'MATCH IN PROGRESS' })); return; }
      const id = nextId++;
      const pl = { id, room: code, ws, name: String(m.name || 'Soldier').replace(/[^\w \-]/g, '').slice(0, 14) || 'Soldier', o: String(m.o || 'woodland').replace(/[^\w]/g, '').slice(0, 12), team: 0, k: 0, d: 0 };
      ws.pl = pl; r.p.set(id, pl); if (r.host === null) r.host = id;
      ws.send(JSON.stringify({ t: 'joined', id, room: code })); sendPl(r); return;
    }
    if (!p) return;
    const r = rooms.get(p.room); if (!r) return;
    switch (m.t) {
      case 'cfg': if (r.host === p.id && !r.started) { if (m.mode === 'ffa' || m.mode === 'tdm') r.mode = m.mode; if ([15, 25, 40].includes(m.limit)) r.limit = m.limit; sendPl(r); } break;
      case 'start': {
        if (r.host !== p.id || r.started) break;
        r.started = true; let i = 0; const teams = {};
        for (const q of r.p.values()) { q.k = 0; q.d = 0; q.team = (i++) % 2; teams[q.id] = q.team; }
        bc(r, { t: 'start', mode: r.mode, limit: r.limit, teams }); sendPl(r); break;
      }
      case 's': bc(r, { t: 's', id: p.id, x: m.x, y: m.y, z: m.z, yaw: m.yaw, p: m.p, w: m.w }, p.id); break;
      case 'shot': bc(r, { t: 'shot', id: p.id, o: m.o, e: m.e, s: m.s }, p.id); break;
      case 'nade': bc(r, { t: 'nade', id: p.id, p: m.p, v: m.v }, p.id); break;
      case 'hit': { const q = r.p.get(m.to); if (q && r.started && q !== p && q.ws.readyState === 1) q.ws.send(JSON.stringify({ t: 'hit', from: p.id, d: Math.min(150, Math.max(0, +m.d || 0)), hs: m.hs ? 1 : 0 })); break; }
      case 'kill': {
        if (!r.started) break;
        p.d++; const k = r.p.get(m.by);
        if (k && k !== p) k.k++; else if (k === p) p.k = Math.max(0, p.k - 1);
        const tk = [0, 0]; for (const q of r.p.values()) tk[q.team] += q.k;
        bc(r, { t: 'kf', by: k ? k.id : null, to: p.id, hs: m.hs ? 1 : 0, pl: pub(r), tk });
        let win = null;
        if (r.mode === 'ffa') { for (const q of r.p.values()) if (q.k >= r.limit) win = { id: q.id, name: q.name }; }
        else if (tk[0] >= r.limit * 2 || tk[1] >= r.limit * 2) win = { team: tk[0] > tk[1] ? 0 : 1 };
        if (win) { r.started = false; bc(r, { t: 'end', win, pl: pub(r), tk }); sendPl(r); }
        break;
      }
      case 'med': if (r.host === p.id) bc(r, { t: 'med', id: m.id, x: m.x, z: m.z }, p.id); break;
      case 'take': bc(r, { t: 'take', id: m.id }, p.id); break;
      case 'chat': bc(r, { t: 'chat', id: p.id, name: p.name, msg: String(m.msg || '').slice(0, 120) }); break;
    }
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => { wss.clients.forEach(c => { if (!c.isAlive) return c.terminate(); c.isAlive = false; c.ping(); }); }, 25000);
server.listen(PORT, () => console.log('World War Three server listening on port ' + PORT));
