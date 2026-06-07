const CACHE_NAME = 'shiftable-v5';

self.addEventListener('install', (event) => {
  // No pre-caching of HTML — fetch fresh on every load so deploys take effect immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-first: all page navigations (covers /, /login, /dashboard, all SPA routes),
  // API calls, manifest, icons — must be fresh
  if (
    request.mode === 'navigate' ||
    url.pathname.includes('/api/') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.includes('/icons/')
  ) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for Vite's content-hashed bundles (JS, CSS)
  // Same URL always means same content — safe to cache indefinitely
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Shiftable', body: 'You have a new notification.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    console.error('[sw] push payload parse error', e);
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Shiftable', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: data.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      const existing = clients.find((c) => c.url.startsWith(url) && 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
