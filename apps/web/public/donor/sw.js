// Cache only this portal's public shell, never Auth/API or cross-origin responses.
const CACHE = "akshaya-ahar-v3";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('akshaya-ahar-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  const allowed = FILES.some(file => new URL(file, self.registration.scope).href === url.href);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !allowed) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}));
    }
    return res;
  }).catch(() => caches.match(e.request)));
});
