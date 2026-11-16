// FortDay - serves the single-page game (index.html) and a health check for the host.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const PORT = process.env.PORT || 3000;
const PAGE = path.join(__dirname, 'index.html');

// The page is one large file, so it is read and compressed once at start instead of on every visit.
let html = null, gz = null;
function load() {
  html = fs.readFileSync(PAGE);
  gz = zlib.gzipSync(html, { level: 9 });
}
try { load(); } catch (e) { console.error('could not read index.html:', e.message); }

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

server.listen(PORT, () => console.log(`FortDay running on http://localhost:${PORT}`));
