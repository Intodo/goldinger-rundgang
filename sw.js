const OGULO = new Set([
  'api.ogulo.com',
  'tour.ogulo.com',
  'developer.ogulo.com',
  'live-alpha-ogulo.s3.eu-central-1.amazonaws.com',
  'rundgang.goldinger.ch',
]);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  let url;
  try { url = new URL(event.request.url); } catch { return; }
  if (!OGULO.has(url.hostname)) return;

  const proxyPath = '/proxy/' + url.hostname + url.pathname + (url.search || '');

  if (event.request.mode === 'navigate') {
    // iframe-Navigationen auf unseren Proxy umleiten (damit der iframe auf unserem Origin bleibt)
    event.respondWith(Response.redirect(new URL(proxyPath, self.location.origin).href));
  } else {
    event.respondWith(
      fetch(proxyPath, { method: event.request.method })
        .catch(() => new Response('Not found', { status: 404 }))
    );
  }
});
