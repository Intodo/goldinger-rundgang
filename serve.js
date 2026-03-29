const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, 'tour-data');
const PORT = parseInt(process.env.PORT || '3000');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const FAKE_AUTH = JSON.stringify({
  success: true, code: 200, message: 'Success',
  response: {
    access: true, granted: true, is_public: true,
    status: 'active', status_id: 200,
    login: { required: false, enabled: false, providers: [] },
    registration: { required: false, enabled: false },
    user: { id: '57df91a0-4118-11eb-a9f9-06ccb66341dc', is_guest: false },
    tour_id: 'dc19acf5-2c01-4f9c-a859-7b18a9c3cb4f',
  },
  metadata: null,
});

// Service Worker registrieren + Seite neu laden sobald SW aktiv ist (beim ersten Besuch)
const PATCH_SCRIPT = `<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(function(reg) {
    if (!navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', function() {
        location.reload();
      });
    }
  });
}
</script>`;

const TOUR_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Goldinger Rundgang</title>
  <style>body{margin:0;padding:0;background:#000} ogulo-tour{display:block;width:100vw;height:100vh}</style>
  ${PATCH_SCRIPT}
  <script src="/proxy/developer.ogulo.com/js/embed.js"></script>
</head>
<body>
  <ogulo-tour tour="VzBD"></ogulo-tour>
</body>
</html>`;

function serveLocal(res, filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || (ext === '' ? 'application/octet-stream' : 'application/octet-stream');
  const headers = {
    'Content-Type': mime,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'public, max-age=86400',
  };
  if (ext === '') {
    const buf = Buffer.alloc(2);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 2, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Type'] = 'application/json';
    } else {
      headers['Content-Type'] = 'application/json';
    }
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
  return true;
}

http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  if (pathname === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/' });
    return fs.createReadStream(path.join(__dirname, 'sw.js')).pipe(res);
  }

  if (pathname === '/' || pathname === '/tour') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(TOUR_HTML);
  }

  if (pathname.startsWith('/proxy/')) {
    const proxyPath = pathname.slice(7);
    const firstSlash = proxyPath.indexOf('/');
    const domain = firstSlash === -1 ? proxyPath : proxyPath.slice(0, firstSlash);
    const filePath = firstSlash === -1 ? '/index.html' : proxyPath.slice(firstSlash);

    const localPath = path.join(DATA_DIR, domain, filePath);

    // Gzip-HTML: <base href="/"> auf /proxy/domain/ patchen damit relative URLs stimmen
    if (fs.existsSync(localPath) && !fs.statSync(localPath).isDirectory()) {
      const buf = fs.readFileSync(localPath);
      if (buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
          const content = zlib.gunzipSync(buf).toString('utf8');
          if (content.includes('<base href="/">')) {
            const patched = content.replace('<base href="/">', `<base href="/proxy/${domain}/">`);
            res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
            console.log('HTML-PATCH:', domain + filePath);
            return res.end(patched);
          }
        } catch (e) { /* kein HTML, normal weitermachen */ }
      }
    }

    if (serveLocal(res, localPath)) {
      console.log('LOCAL:', domain + filePath);
      return;
    }

    if (domain === 'api.ogulo.com' || req.method === 'POST' || req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
      console.log('FAKE:', req.method, domain + filePath);
      return res.end(FAKE_AUTH);
    }

    console.log('404:', domain + filePath);
    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    return res.end('Not found');
  }

  res.writeHead(404);
  res.end('Not found');
}).listen(PORT, () => {
  console.log('Tour läuft auf http://localhost:' + PORT);
});
