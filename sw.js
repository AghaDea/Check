/* Guessino service worker — static shell cache only. API always network. */
const CACHE = 'guessino-shell-v3.5';
const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './favicon.svg',
  './manifest.webmanifest',
  './app/',
  './app/index.html',
  './app/css/style.css',
  './login/',
  './login/index.html',
  './login/css/style.css',
  './Config/load-config.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE.map(function (u) {
        try { return new Request(u, { cache: 'reload' }); } catch (e) { return u; }
      })).catch(function () { /* ignore individual failures */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isApi(url) {
  return /supabase\.co|\/rest\/v1|\/realtime|\/auth\/v1/i.test(url);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  if (isApi(url)) return; // always network for backend

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) {
        if (cached) return cached;
        if (req.mode === 'navigate') return caches.match('./offline.html');
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
