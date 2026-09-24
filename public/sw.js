const VERSION = 'animonster-shell-v1';
const SHELL = [
  '/',
  '/downloads',
  '/downloads/watch',
  '/manifest.webmanifest',
  '/icon.png',
  '/icon-512.png',
];

async function precacheShell() {
  const cache = await caches.open(VERSION);
  const assets = new Set(SHELL);
  for (const path of ['/', '/downloads', '/downloads/watch']) {
    try {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) continue;
      await cache.put(path, response.clone());
      const html = await response.text();
      for (const match of html.matchAll(/["'](\/_next\/static\/[^"']+)["']/g))
        assets.add(match[1].replaceAll('&amp;', '&'));
    } catch {}
  }
  await Promise.all(
    [...assets].map(async (path) => {
      if (await cache.match(path)) return;
      try {
        const response = await fetch(path);
        if (response.ok) await cache.put(path, response);
      } catch {}
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('animonster-shell-') && key !== VERSION,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches
            .open(VERSION)
            .then((cache) => cache.put(url.pathname, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(VERSION);
          return (
            (await cache.match(url.pathname)) ||
            (url.pathname.startsWith('/downloads')
              ? await cache.match(
                  url.pathname.startsWith('/downloads/watch')
                    ? '/downloads/watch'
                    : '/downloads',
                )
              : await cache.match('/'))
          );
        }),
    );
    return;
  }
  if (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:png|jpg|jpeg|webp|svg|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
