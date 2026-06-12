// GROOVE POP — Service Worker
// Bump CACHE_VERSION to invalidate all cached assets on next deploy.
const CACHE_VERSION = 'gp-v6';

const SHELL_ASSETS = [
  '/offline.html',
  '/GPicon.png',
  '/GPicon-192.png',
  '/GPicon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500&family=Caveat:wght@400;600&display=swap',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
// HTML pages      → network-first (always get the latest app.html)
// API / functions → network-only (never cache)
// Assets          → cache-first (logos, icons, fonts)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Network-only: API calls + well-known paths (e.g. assetlinks.json for TWA verification)
  const networkOnly = [
    'openai.azure.com', 'azurewebsites.net', 'res.cloudinary.com', 'api.cloudinary.com',
    'stripe.com', 'netlify.com', '/.netlify/', '/.well-known/',
  ];
  if (networkOnly.some((p) => url.href.includes(p))) return;

  // Network-first: HTML navigation — always fetch fresh, cache as fallback
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/offline.html')))
    );
    return;
  }

  // Cache-first: everything else (logos, icons, fonts, JS)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {});
    })
  );
});
