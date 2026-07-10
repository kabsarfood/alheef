/**
 * PWA — تنزيل / تحديث التطبيق، الإشعارات، والشارة
 */
(function () {
  'use strict';

  const CLIENT_KEY = 'alheef_client_key';
  const PUSH_CONSENT_KEY = 'alheef_push_offers_consent';
  const INSTALL_KEY = 'alheef_pwa_installed';
  const IOS_HINT = 'اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» لتثبيت تطبيق الهيف';

  const LABELS = {
    download: 'تنزيل',
    update: 'تحديث',
  };

  let deferredInstallPrompt = null;
  let vapidPublicKey = null;
  let swRegistration = null;
  let pendingSwWorker = null;
  let isReloadingForUpdate = false;
  let hasPendingUpdate = false;
  let buttonMode = 'download';

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isPWASupported() {
    return 'serviceWorker' in navigator;
  }

  function getClientKey() {
    let key = localStorage.getItem(CLIENT_KEY);
    if (!key) {
      key = (crypto.randomUUID && crypto.randomUUID()) || `c-${Date.now()}`;
      localStorage.setItem(CLIENT_KEY, key);
    }
    return key;
  }

  function getAuthContext() {
    const adminToken = localStorage.getItem('alheef_admin_token');
    const marketerToken = localStorage.getItem('alheef_marketer_token');
    if (adminToken) return { role: 'admin', token: adminToken };
    if (marketerToken) return { role: 'marketer', token: marketerToken };
    return { role: 'client', token: null };
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  async function fetchVapidKey() {
    if (vapidPublicKey) return vapidPublicKey;
    try {
      const res = await fetch('/api/push/vapid-public-key');
      const data = await res.json();
      vapidPublicKey = data.publicKey || null;
    } catch {
      vapidPublicKey = null;
    }
    return vapidPublicKey;
  }

  async function isAppInstalled() {
    if (isStandalone()) return true;

    if ('getInstalledRelatedApps' in navigator) {
      try {
        const apps = await navigator.getInstalledRelatedApps();
        if (apps && apps.length > 0) {
          localStorage.setItem(INSTALL_KEY, '1');
          return true;
        }
        localStorage.removeItem(INSTALL_KEY);
        return false;
      } catch {
        /* fall through */
      }
    }

    return localStorage.getItem(INSTALL_KEY) === '1';
  }

  function createAppButton(variant) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pwa-app-btn pwa-app-btn--${variant}`;
    btn.dataset.mode = 'download';
    btn.setAttribute('aria-label', 'تنزيل تطبيق الهيف');
    btn.innerHTML = `
      <span class="pwa-app-btn__label">${LABELS.download}</span>
      <span class="pwa-app-btn__badge" aria-hidden="true"></span>
    `;
    btn.addEventListener('click', onAppButtonClick);
    return btn;
  }

  function ensureAppButtons() {
    if (window.location.pathname.startsWith('/dashboard') || window.location.pathname.startsWith('/marketer')) {
      return;
    }

    const placements = [
      { root: '#nav', position: 'prepend', variant: 'nav' },
      { root: '.header__actions', position: 'prepend', variant: 'header' },
      { root: '#topbar-actions', position: 'prepend', variant: 'topbar' },
      { root: '.login-card', position: 'append', variant: 'login' },
    ];

    placements.forEach(({ root, position, variant }) => {
      const container = document.querySelector(root);
      if (!container) return;
      if (container.querySelector(`.pwa-app-btn--${variant}`)) return;

      const btn = createAppButton(variant);
      if (variant === 'header' || variant === 'topbar' || variant === 'login') {
        btn.classList.add('btn', 'btn-outline', 'btn-sm');
      }
      if (variant === 'login') {
        btn.style.marginTop = '1rem';
        btn.style.width = '100%';
      }

      if (position === 'prepend') container.prepend(btn);
      else container.appendChild(btn);
    });
  }

  function ensureIosHint() {
    if (window.location.pathname.startsWith('/dashboard') || window.location.pathname.startsWith('/marketer')) {
      return;
    }
    if (!isIOS() || isStandalone()) return;
    const targets = [
      document.querySelector('.header__actions'),
      document.querySelector('#nav'),
      document.querySelector('#topbar-actions'),
      document.querySelector('.login-card'),
    ].filter(Boolean);
    if (!targets.length || document.getElementById('pwa-ios-hint')) return;

    const hint = document.createElement('p');
    hint.id = 'pwa-ios-hint';
    hint.className = 'pwa-ios-hint';
    hint.textContent = IOS_HINT;
    targets[0].appendChild(hint);
  }

  function syncPendingUpdateState() {
    hasPendingUpdate = !!(pendingSwWorker || swRegistration?.waiting);
  }

  async function refreshAppButtonState() {
    if (!isPWASupported()) {
      document.querySelectorAll('.pwa-app-btn').forEach((btn) => {
        btn.hidden = true;
      });
      return;
    }

    syncPendingUpdateState();
    const installed = await isAppInstalled();
    buttonMode = installed ? 'update' : 'download';

    const showDownload = !installed && (deferredInstallPrompt || isIOS() || !installed);
    const visible = installed || showDownload;

    document.querySelectorAll('.pwa-app-btn').forEach((btn) => {
      btn.hidden = !visible;
      btn.dataset.mode = buttonMode;
      const label = btn.querySelector('.pwa-app-btn__label');
      if (label) label.textContent = LABELS[buttonMode];

      btn.classList.toggle('pwa-app-btn--download', buttonMode === 'download');
      btn.classList.toggle('pwa-app-btn--update', buttonMode === 'update');
      btn.classList.toggle('pwa-app-btn--notify', buttonMode === 'update' && hasPendingUpdate);

      if (buttonMode === 'update') {
        btn.setAttribute('aria-label', hasPendingUpdate ? 'تحديث التطبيق — يتوفر إصدار جديد' : 'تحديث التطبيق');
      } else {
        btn.setAttribute('aria-label', 'تنزيل تطبيق الهيف');
      }
    });

    const hint = document.getElementById('pwa-ios-hint');
    if (hint) hint.hidden = installed || !isIOS();
  }

  async function onAppButtonClick() {
    if (buttonMode === 'download') {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (outcome === 'accepted') {
          localStorage.setItem(INSTALL_KEY, '1');
        }
        await refreshAppButtonState();
        return;
      }
      if (isIOS()) {
        alert(IOS_HINT);
      } else {
        alert('التثبيت غير متاح حالياً من هذا المتصفح. جرّب Chrome أو Edge على الجوال أو سطح المكتب.');
      }
      return;
    }

    if (hasPendingUpdate) {
      applyPendingUpdate();
      return;
    }

    try {
      await swRegistration?.update();
    } catch { /* ignore */ }

    if (!hasPendingUpdate) {
      alert('أنت تستخدم أحدث نسخة من التطبيق.');
    }
  }

  async function registerServiceWorker() {
    if (!isPWASupported()) return null;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      swRegistration = reg;

      navigator.serviceWorker.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg && msg.type === 'ALHEEF_NAVIGATE' && msg.url) {
          window.location.href = msg.url;
        }
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isReloadingForUpdate) return;
        isReloadingForUpdate = true;
        window.location.reload();
      });

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        trackSwUpdate(worker);
      });

      if (reg.waiting) {
        pendingSwWorker = reg.waiting;
        refreshAppButtonState();
      }

      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
          refreshAppButtonState();
        }
      });

      return reg;
    } catch (err) {
      console.warn('[PWA] SW registration failed:', err);
      return null;
    }
  }

  function trackSwUpdate(worker) {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        pendingSwWorker = worker;
        refreshAppButtonState();
      }
    });
  }

  function applyPendingUpdate() {
    const worker = pendingSwWorker || swRegistration?.waiting;
    if (!worker) {
      window.location.reload();
      return;
    }
    isReloadingForUpdate = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
    setTimeout(() => window.location.reload(), 1500);
  }

  async function subscribePush(options = {}) {
    if (!isPWASupported() || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    const publicKey = await fetchVapidKey();
    if (!publicKey) return { ok: false, reason: 'no_vapid' };

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const auth = getAuthContext();
    const body = {
      subscription: sub.toJSON(),
      role: options.role || auth.role,
      clientKey: getClientKey(),
      preferences: options.preferences || {},
      offersEnabled: options.offersEnabled !== false,
      email: options.email || null,
    };

    const headers = { 'Content-Type': 'application/json' };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل الاشتراك');

    if (options.offersEnabled) {
      localStorage.setItem(PUSH_CONSENT_KEY, '1');
    }
    return { ok: true, data };
  }

  async function unsubscribePush() {
    if (!isPWASupported()) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, clientKey: getClientKey() }),
      }).catch(() => {});
    }
    localStorage.removeItem(PUSH_CONSENT_KEY);
  }

  function hasOffersConsent() {
    return localStorage.getItem(PUSH_CONSENT_KEY) === '1';
  }

  async function setBadge(count) {
    const n = Math.max(0, Number(count) || 0);
    if ('setAppBadge' in navigator) {
      try {
        if (n > 0) await navigator.setAppBadge(n);
        else await navigator.clearAppBadge();
      } catch { /* ignore */ }
    }
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: n > 0 ? 'SET_BADGE' : 'CLEAR_BADGE',
        count: n,
      });
    }
  }

  async function clearBadge() {
    return setBadge(0);
  }

  async function autoSubscribeRole() {
    const auth = getAuthContext();
    if (auth.role === 'client') return;
    if (Notification.permission !== 'granted') return;
    try {
      await subscribePush({ role: auth.role, offersEnabled: false });
    } catch {
      /* اختياري */
    }
  }

  async function promptRolePush() {
    const auth = getAuthContext();
    if (auth.role === 'client') return { ok: false, reason: 'client' };
    return subscribePush({ role: auth.role, offersEnabled: false });
  }

  function bindSubscribeForm() {
    const form = document.getElementById('subscribe-form');
    if (!form || form.dataset.pwaBound) return;
    form.dataset.pwaBound = '1';

    const pushWrap = document.createElement('div');
    pushWrap.className = 'form-group pwa-push-consent';
    pushWrap.innerHTML = `
      <label class="pwa-push-consent__label">
        <input type="checkbox" id="sub-push" name="pushOffers">
        أوافق على استقبال إشعارات العروض العقارية على هذا الجهاز
      </label>
      <button type="button" class="btn btn-outline btn-sm pwa-push-stop" id="sub-push-stop" hidden>إيقاف إشعارات العروض</button>
    `;
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) form.insertBefore(pushWrap, submitBtn);

    const stopBtn = document.getElementById('sub-push-stop');
    const pushCheck = document.getElementById('sub-push');

    if (hasOffersConsent()) {
      if (pushCheck) pushCheck.checked = true;
      if (stopBtn) stopBtn.hidden = false;
    }

    stopBtn?.addEventListener('click', async () => {
      await unsubscribePush();
      if (pushCheck) pushCheck.checked = false;
      stopBtn.hidden = true;
      const msg = document.getElementById('subscribe-message');
      if (msg) {
        msg.textContent = 'تم إيقاف إشعارات العروض على هذا الجهاز';
        msg.className = 'form-message success';
      }
    });

    form.addEventListener('submit', async () => {
      if (!pushCheck?.checked) return;
      setTimeout(async () => {
        const msg = document.getElementById('subscribe-message');
        if (msg && msg.classList.contains('error')) return;
        try {
          const email = (document.getElementById('sub-email')?.value || '').trim();
          await subscribePush({ role: 'client', offersEnabled: true, email });
          if (stopBtn) stopBtn.hidden = false;
        } catch (err) {
          if (msg) {
            msg.textContent = err.message || 'تعذر تفعيل الإشعارات';
            msg.className = 'form-message error';
          }
        }
      }, 800);
    }, true);
  }

  function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      refreshAppButtonState();
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      localStorage.setItem(INSTALL_KEY, '1');
      refreshAppButtonState();
    });

    window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
      refreshAppButtonState();
    });
  }

  async function init() {
    ensureAppButtons();
    ensureIosHint();
    initInstallPrompt();
    bindSubscribeForm();
    await registerServiceWorker();
    await refreshAppButtonState();

    const auth = getAuthContext();
    if (auth.role !== 'client' && Notification.permission === 'granted') {
      autoSubscribeRole();
    } else if (auth.role === 'client' && hasOffersConsent() && Notification.permission === 'granted') {
      subscribePush({ role: 'client', offersEnabled: true }).catch(() => {});
    }
  }

  window.AlheefPWA = {
    subscribePush,
    unsubscribePush,
    setBadge,
    clearBadge,
    hasOffersConsent,
    isStandalone,
    getClientKey,
    promptInstall: onAppButtonClick,
    promptRolePush,
    checkForUpdates: () => swRegistration?.update(),
    applyUpdate: applyPendingUpdate,
    refreshAppButtonState,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
