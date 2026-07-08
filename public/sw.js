/* eslint-disable no-restricted-globals */
/**
 * Service Worker — مكتب الهيف للخدمات العقارية
 */
const CACHE_NAME = 'alheef-pwa-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/main.css',
  '/css/mobile.css',
  '/css/pwa.css',
  '/js/pwa.js',
  '/js/main.js',
  '/js/nav-mobile.js',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
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
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === 'opaque') return res;
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});

function parsePushData(event) {
  try {
    if (!event.data) return {};
    const raw = event.data.json();
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    const text = event.data ? event.data.text() : '';
    return { title: 'الهيف', body: text || 'إشعار جديد' };
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushData(event);
  const title = data.title || 'مكتب الهيف للخدمات العقارية';
  const options = {
    body: data.body || '',
    icon: data.icon || '/assets/icon-192.png',
    badge: data.badge || '/assets/icon-192.png',
    tag: data.tag || data.type || 'alheef-notification',
    renotify: true,
    data: {
      url: data.url || '/',
      badgeCount: data.badgeCount,
      notificationId: data.notificationId || null,
    },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      typeof data.badgeCount === 'number' && 'setAppBadge' in navigator
        ? (data.badgeCount > 0 ? navigator.setAppBadge(data.badgeCount) : navigator.clearAppBadge()).catch(() => {})
        : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      if ('clearAppBadge' in navigator) {
        try { await navigator.clearAppBadge(); } catch { /* ignore */ }
      }
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(url);
          } else {
            client.postMessage({ type: 'ALHEEF_NAVIGATE', url });
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'SET_BADGE' && typeof msg.count === 'number' && 'setAppBadge' in navigator) {
    const fn = msg.count > 0 ? navigator.setAppBadge(msg.count) : navigator.clearAppBadge();
    if (fn && fn.catch) fn.catch(() => {});
  }
  if (msg.type === 'CLEAR_BADGE' && 'clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }
});
