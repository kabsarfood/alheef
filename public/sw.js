/* eslint-disable no-restricted-globals */
/**
 * Service Worker — مكتب الهيف للخدمات العقارية
 * BUILD_ID يُستبدل عند التقديم من الخادم مع كل نشر
 */
const BUILD_ID = '__APP_BUILD__';
const CACHE_NAME = `alheef-pwa-${BUILD_ID}`;

const PRECACHE = [
  '/manifest.webmanifest',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable-512.png',
];

function isHtmlRequest(request, url) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  if (url.pathname === '/' || url.pathname.endsWith('.html')) return true;
  return false;
}

function isStaticAsset(url) {
  return /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)
    || url.pathname.startsWith('/assets/')
    || url.pathname.startsWith('/css/')
    || url.pathname.startsWith('/js/')
    || url.pathname.startsWith('/images/');
}

function isStaffPath(url) {
  return url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/marketer');
}

function isPrivatePath(url) {
  return /^\/(?:v|p)\/[A-Za-z0-9_-]{8,64}\/?$/.test(url.pathname);
}

function isReviewPath(url) {
  return url.pathname.startsWith('/ejar/review') || url.pathname === '/ejar-review.html';
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((res) => {
      if (res && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    networkFetch.catch(() => {});
    return cached;
  }

  const res = await networkFetch;
  if (res) return res;
  const fallback = await cache.match('/index.html');
  if (fallback) return fallback;
  return new Response('غير متصل', { status: 503, statusText: 'Offline' });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  if (isStaffPath(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response('يتطلب اتصالاً بالإنترنت', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }))
    );
    return;
  }

  if (isHtmlRequest(request, url)) {
    if (isReviewPath(url)) {
      event.respondWith(networkFirst(request, '/ejar-review.html'));
      return;
    }
    if (isPrivatePath(url)) {
      event.respondWith(networkFirst(request));
      return;
    }
    if (url.pathname === '/map' || url.pathname === '/map.html') {
      event.respondWith(networkFirst(request, '/map.html'));
      return;
    }
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request, '/index.html'));
});

function parsePushData(event) {
  try {
    if (!event.data) return {};
    const raw = event.data.json();
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    const text = event.data ? event.data.text() : '';
    return { title: 'إشعار جديد', body: text || 'إشعار جديد' };
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushData(event);
  const title = data.title || 'إشعار جديد';
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
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const dashboardVisible = clients.some(
        (client) => client.visibilityState === 'visible' && /\/dashboard/i.test(client.url || '')
      );

      if (typeof data.badgeCount === 'number' && 'setAppBadge' in navigator) {
        try {
          if (data.badgeCount > 0) await navigator.setAppBadge(data.badgeCount);
          else await navigator.clearAppBadge();
        } catch {
          /* ignore */
        }
      }

      if (dashboardVisible) return;

      await self.registration.showNotification(title, options);
    })()
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
