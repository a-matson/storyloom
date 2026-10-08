// Offline shell. Hashed assets are immutable, so cache-first is safe for them; the page itself is
// network-first so a new release shows up on the next online load. Everything else (the same-origin
// llama-server API, `models/`) passes through untouched.
const CACHE = 'storyloom-shell';
const scope = self.registration.scope;
const assets = `${scope}assets/`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const html = await (await fetch(scope, { cache: 'no-store' })).text();
      const urls = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => new URL(m[1], scope).href);
      const cache = await caches.open(CACHE);
      await cache.addAll([scope, `${scope}icon.svg`, `${scope}manifest.webmanifest`, ...urls]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ponytail: one cache, never pruned; old hashed assets pile up one release at a time. Prune on
// `activate` against the new index's list if the cache size ever matters.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // Hash routing: the shell is only ever the scope root, so other navigations (`/health`) pass through.
  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin + url.pathname === scope) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) await (await caches.open(CACHE)).put(scope, response.clone());
          return response;
        } catch {
          return (await caches.match(scope)) ?? Response.error();
        }
      })(),
    );
  } else if (request.url.startsWith(assets)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
        return response;
      })(),
    );
  }
});
