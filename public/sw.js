const SHELL_CACHE = 'animonster-shell-v3';
const DATA_CACHE = 'animonster-public-data-v1';
const SHELL_PAGES = [
  '/',
  '/catalog',
  '/statistics',
  '/downloads',
  '/downloads/watch',
];
const FAST_PAGES = new Set(['/', '/catalog', '/statistics']);
const OFFLINE_PAGES = new Set(['/downloads', '/downloads/watch']);
const PUBLIC_DATA = new Set(['/api/catalog', '/api/popular']);
const DATA_TTL_MS = 30_000;
const SHELL_TTL_MS = 5 * 60_000;
const MAX_DATA_ENTRIES = 50;

function isPublicResponse(response, contentType) {
  const policy = response.headers.get('Cache-Control') || '';
  return (
    response.ok &&
    response.type !== 'opaque' &&
    response.headers.get('Content-Type')?.includes(contentType) &&
    !/\b(?:private|no-store|no-cache)\b/i.test(policy) &&
    !response.headers.has('Set-Cookie')
  );
}

function isFresh(response, ttl) {
  if (!response) return false;
  const date = Date.parse(response.headers.get('Date') || '');
  const age = Number(response.headers.get('Age') || 0);
  return (
    Number.isFinite(date) &&
    Number.isFinite(age) &&
    Date.now() - date + age * 1000 < ttl
  );
}

async function cachePage(cache, path, response) {
  if (!isPublicResponse(response, 'text/html')) return;
  try {
    await cache.put(path, response.clone());
  } catch {}
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const assets = new Set([
    '/manifest.webmanifest',
    '/icon.png',
    '/icon-512.png',
  ]);
  for (const path of SHELL_PAGES) {
    try {
      const response = await fetch(path, { cache: 'reload', credentials: 'omit' });
      if (!isPublicResponse(response, 'text/html')) continue;
      await cache.put(path, response.clone());
      const html = await response.text();
      for (const match of html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g))
        assets.add(match[1].replaceAll('&amp;', '&'));
    } catch {}
  }
  await Promise.all(
    [...assets].map(async (path) => {
      try {
        const response = await fetch(path, { credentials: 'omit' });
        if (response.ok && response.type !== 'opaque')
          await cache.put(path, response);
      } catch {}
    }),
  );
}

async function storePublicData(cache, request, response) {
  if (!isPublicResponse(response, 'application/json')) return;
  const copy = response.clone();
  await cache.delete(request);
  await cache.put(request, copy);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_DATA_ENTRIES))
      .map((key) => cache.delete(key)),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith('animonster-shell-') && key !== SHELL_CACHE) ||
              (key.startsWith('animonster-public-data-') && key !== DATA_CACHE),
          )
          .map((key) => caches.delete(key)),
      );
    } catch {}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.cache === 'no-store') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (url.search || (!FAST_PAGES.has(url.pathname) && !OFFLINE_PAGES.has(url.pathname)))
      return;
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(url.pathname);
      const refresh = () =>
        fetch(request).then(async (response) => {
          await cachePage(cache, url.pathname, response);
          return response;
        });
      if (FAST_PAGES.has(url.pathname) && isFresh(cached, SHELL_TTL_MS)) {
        event.waitUntil(refresh().catch(() => {}));
        return cached;
      }
      try {
        return await refresh();
      } catch {
        return cached || Response.error();
      }
    })().catch(() => fetch(request)));
    return;
  }

  if (PUBLIC_DATA.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(request);
      if (isFresh(cached, DATA_TTL_MS)) return cached;
      try {
        const response = await fetch(request);
        if (isPublicResponse(response, 'application/json'))
          event.waitUntil(storePublicData(cache, request, response).catch(() => {}));
        return response.ok ? response : cached || response;
      } catch {
        return cached || Response.error();
      }
    })().catch(() => fetch(request)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.headers.get('Cache-Control')?.includes('immutable'))
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      return response;
    })().catch(() => fetch(request)));
  }
});
