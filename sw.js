// Offline support. Stale-while-revalidate: the cached copy is served straight
// away so the app opens with no signal, and a fresh copy is fetched in the
// background for next time.
//
// Bump CACHE whenever a release should force everyone onto new files.

const CACHE = 'wsplanner-v1';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'js/util.js',
  'js/time.js',
  'js/store.js',
  'js/share.js',
  'js/gamedata.js',
  'js/views/dashboard.js',
  'js/views/vsduel.js',
  'js/views/calendar.js',
  'js/views/growth.js',
  'js/views/inventory.js',
  'js/views/roster.js',
  'js/views/gamedata.js',
  'js/views/settings.js',
  'js/views/import.js',
  'data/vsduel.json',
  'data/events.json',
  'data/buildings.json',
  'data/research.json',
  'data/troops.json',
  'icons/icon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any single file 404s, so add them
      // individually and let the rest through.
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
