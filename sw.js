// Service worker: offline app shell, cached TMDB images, network-first TMDB API.
const VERSION = 'wt-v0.5.2';
const SHELL = `${VERSION}-shell`;
const IMAGES = 'wt-images';
const API = 'wt-api';
const SHELL_FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/tmdb.js', 'js/updates.js', 'js/sync.js', 'js/trakt.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.endsWith('-shell') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache Google sign-in or Drive traffic.
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) return;

  if (url.hostname === 'image.tmdb.org') {
    e.respondWith((async () => {
      const c = await caches.open(IMAGES);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(IMAGES, 600); }
      return res;
    })());
    return;
  }

  if (url.hostname === 'api.themoviedb.org') {
    e.respondWith((async () => {
      const c = await caches.open(API);
      try {
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()); trim(API, 400); }
        return res;
      } catch (err) {
        const hit = await c.match(req);
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    // config.js: network first so edits show up, cached copy when offline.
    if (url.pathname.endsWith('/config.js')) {
      e.respondWith((async () => {
        const c = await caches.open(SHELL);
        try {
          // Skip the browser's HTTP cache so key changes show up right away.
          const res = await fetch(req, { cache: 'no-cache' });
          if (res.ok) c.put(req, res.clone());
          return res;
        } catch {
          return (await c.match(req)) || new Response('', { headers: { 'content-type': 'text/javascript' } });
        }
      })());
      return;
    }
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') return c.match('index.html');
      return new Response('', { status: 504 });
    })());
  }
});
