(function () {
  const KEY = 'alheef_visit_key';

  function sessionKey() {
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
    const path = (window.location.pathname || '/').slice(0, 200);
    fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, sessionKey: sessionKey() }),
      keepalive: true,
    }).catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', track, { once: true });
  } else {
    track();
  }
})();
