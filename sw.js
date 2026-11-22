/* Sahara & Associates: keeps the app available offline. Network first, so updates show as soon as you are online. */
const CACHE = 'sahara-books-v4';
const SHELL = ['./', 'index.html', 'style.css', 'engine.js', 'ui.js', 'cloud.js', 'store.js', 'forms.js', 'scan.js', 'tally.js', 'security.js', 'pwa.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
