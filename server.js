// Dead Hours - serves the single-page game (index.html) and a health check for the host.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 3000;
const PAGE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/health') { res.end('ok'); return; }
  if (u === '/' || u === '/index.html') {
    fs.readFile(PAGE, (err, html) => {
      if (err) { res.writeHead(500); res.end('could not read index.html'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log(`Dead Hours running on http://localhost:${PORT}`));
