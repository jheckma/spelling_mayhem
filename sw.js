// Lets the game work offline once installed. The core files are saved at install;
// voice clips (about 32 MB in all) are saved the first time each one plays.
// Raise VERSION whenever game files change so players get the update.
const VERSION = 'mayhem-v2';
const CORE = ['./', 'index.html', 'game.js', 'words.js', 'voice.js', 'manifest.json', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // dictionary lookups go straight to the network
  const isAudio = url.pathname.includes('/audio/');
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    // Audio never changes: serve it from the cache. Code: use the network when online so updates arrive, the cache when offline.
    if (hit && isAudio) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && res.status === 200) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      if (hit) return hit;
      throw err;
    }
  }));
});
