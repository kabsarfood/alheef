(function () {
  const KEY = 'alheef_visit_key';
  const SKIP_KEY = 'alheef_skip_analytics';
  const ADMIN_TOKEN_KEY = 'alheef_admin_token';

  function shouldSkipTracking() {
    try {
      if (localStorage.getItem(SKIP_KEY) === '1') return true;
      if (localStorage.getItem(ADMIN_TOKEN_KEY)) return true;
      if (window.location.pathname.startsWith('/dashboard')) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function sessionKey() {
    if (shouldSkipTracking()) return '';
    try {
      let k = localStorage.getItem(KEY);
      if (!k) {
        k = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `v${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(KEY, k);
      }
      return k;
    } catch {
      return `v${Date.now()}`;
    }
  }

  function track() {
    if (shouldSkipTracking()) return;
    const path = (window.location.pathname || '/').slice(0, 200);
    const key = sessionKey();
    if (!key) return;
    fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, sessionKey: key }),
      keepalive: true,
    }).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track, { once: true });
  } else {
    track();
  }
})();
