/**
 * PWA — تنزيل / تحديث التطبيق، الإشعارات، والشارة
 */
(function () {
  'use strict';

  const CLIENT_KEY = 'alheef_client_key';
  const PUSH_CONSENT_KEY = 'alheef_push_offers_consent';
  const PUSH_PRIVATE_CONSENT_KEY = 'alheef_push_private_consent';
  const PUSH_PROMPTED_KEY = 'alheef_push_install_prompted';
  const INSTALL_KEY = 'alheef_pwa_installed';
  const BUILD_KEY = 'alheef_app_build';
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

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    refreshAppButtonState().catch(() => {});
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.setItem(INSTALL_KEY, '1');
    closeInstallGuide();
    refreshAppButtonState().catch(() => {});
    setTimeout(() => promptPushAfterInstall(), 1200);
  });

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|LinkedInApp|Snapchat/i.test(ua);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function canUseNativeInstall() {
    return !!deferredInstallPrompt;
  }

  function canShowInstallOption() {
    if (isStandalone()) return false;
    if (canUseNativeInstall()) return true;
    if (isIOS()) return true;
    if (isInAppBrowser()) return true;
    const ua = navigator.userAgent || '';
    if (isAndroid()) {
      return /Chrome|Edg|SamsungBrowser|CriOS|OPR/i.test(ua);
    }
    return /Chrome|Edg|OPR/i.test(ua);
  }

  function getInstallGuide() {
    if (isInAppBrowser()) {
      return {
        title: 'افتح الموقع في المتصفح أولاً',
        steps: [
          'اضغط ⋯ أو «المزيد» في أعلى الشاشة',
          'اختر «فتح في Chrome» أو «فتح في Safari»',
          'بعد فتح الموقع في المتصفح، اضغط «تنزيل» مرة أخرى',
        ],
      };
    }
    if (isIOS()) {
      return {
        title: 'تثبيت تطبيق الهيف على iPhone',
        steps: [
          'اضغط زر المشاركة □↑ في أسفل Safari',
          'مرّر واختر «إضافة إلى الشاشة الرئيسية»',
          'اضغط «إضافة» — ستظهر أيقونة الهيف على شاشتك',
        ],
      };
    }
    const ua = navigator.userAgent || '';
    if (/SamsungBrowser/i.test(ua)) {
      return {
        title: 'تثبيت من Samsung Internet',
        steps: [
          'اضغط ≡ (القائمة) أسفل الشاشة',
          'اختر «إضافة الصفحة إلى»',
          'اختر «الشاشة الرئيسية»',
        ],
      };
    }
    if (/Edg\//i.test(ua)) {
      return {
        title: 'تثبيت من Microsoft Edge',
        steps: [
          'اضغط ⋯ في أسفل أو أعلى المتصفح',
          'اختر «التطبيقات» ثم «تثبيت هذا الموقع كتطبيق»',
          'أو ابحث عن أيقونة ➕ في شريط العنوان',
        ],
      };
    }
    if (isAndroid()) {
      return {
        title: 'تثبيت من Chrome على الجوال',
        steps: [
          'اضغط ⋮ (القائمة) أعلى يمين Chrome',
          'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»',
          'اضغط «تثبيت» — ستظهر أيقونة الهيف',
        ],
      };
    }
    return {
      title: 'تثبيت على الكمبيوتر',
      steps: [
        'من Chrome: ابحث عن أيقونة ➕ أو ⬇ في شريط العنوان واضغط «تثبيت»',
        'أو من القائمة ⋮ → «تثبيت الهيف» / «Install الهيف»',
        'من Edge: القائمة ⋯ → «التطبيقات» → «تثبيت هذا الموقع»',
      ],
    };
  }

  function closeInstallGuide() {
    document.getElementById('pwa-install-guide')?.remove();
    document.body.classList.remove('pwa-install-open');
  }

  function showInstallGuide() {
    closeInstallGuide();
    const guide = getInstallGuide();
    const wrap = document.createElement('div');
    wrap.id = 'pwa-install-guide';
    wrap.className = 'pwa-install-guide';
    wrap.innerHTML = `
      <div class="pwa-install-guide__backdrop" data-close></div>
      <div class="pwa-install-guide__box" role="dialog" aria-labelledby="pwa-install-title">
        <button type="button" class="pwa-install-guide__close" data-close aria-label="إغلاق">×</button>
        <h3 id="pwa-install-title">${guide.title}</h3>
        <ol class="pwa-install-guide__steps">
          ${guide.steps.map((s) => `<li>${s}</li>`).join('')}
        </ol>
        <p class="pwa-install-guide__note">إذا لم يظهر خيار التثبيت، تأكد أنك تستخدم Chrome أو Edge وليس متصفح داخل واتساب أو تطبيق آخر.</p>
        <button type="button" class="btn btn-gold btn-sm" data-close>فهمت</button>
      </div>
    `;
    document.body.appendChild(wrap);
    document.body.classList.add('pwa-install-open');
    wrap.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', closeInstallGuide);
    });
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

  async function fetchRemoteBuild() {
    try {
      const res = await fetch('/api/pwa-meta', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.build || '').trim() || null;
    } catch {
      return null;
    }
  }

  function getStoredBuild() {
    return (localStorage.getItem(BUILD_KEY) || '').trim() || null;
  }

  function storeBuild(build) {
    if (build) localStorage.setItem(BUILD_KEY, build);
  }

  function markUpdateAvailable() {
    hasPendingUpdate = true;
    refreshAppButtonState().catch(() => {});
    showUpdateBanner();
  }

  function dismissUpdateBanner() {
    document.getElementById('pwa-update-banner')?.remove();
    document.body.classList.remove('pwa-update-visible');
  }

  function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;
    if (!isStandalone() && localStorage.getItem(INSTALL_KEY) !== '1') return;

    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.className = 'pwa-update-banner';
    banner.innerHTML = `
      <div class="pwa-update-banner__inner">
        <p class="pwa-update-banner__text">يتوفر تحديث جديد لتطبيق الهيف — اضغط «تحديث الآن» لعرض آخر التعديلات.</p>
        <div class="pwa-update-banner__actions">
          <button type="button" class="btn btn-gold btn-sm" data-update-apply>تحديث الآن</button>
          <button type="button" class="btn btn-outline btn-sm" data-update-later>لاحقاً</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);
    document.body.classList.add('pwa-update-visible');
    banner.querySelector('[data-update-apply]')?.addEventListener('click', () => {
      dismissUpdateBanner();
      applyPendingUpdate();
    });
    banner.querySelector('[data-update-later]')?.addEventListener('click', () => {
      dismissUpdateBanner();
    });
  }

  async function checkBuildUpdate() {
    const remote = await fetchRemoteBuild();
    if (!remote) return;

    const stored = getStoredBuild();
    if (!stored) {
      storeBuild(remote);
      return;
    }

    if (remote !== stored && navigator.serviceWorker?.controller) {
      markUpdateAvailable();
      try {
        await swRegistration?.update();
      } catch { /* ignore */ }
    }
  }

  async function confirmBuildSynced() {
    if (pendingSwWorker || swRegistration?.waiting) return;
    const remote = await fetchRemoteBuild();
    if (!remote) return;

    const stored = getStoredBuild();
    if (stored === remote) {
      hasPendingUpdate = false;
      dismissUpdateBanner();
      refreshAppButtonState().catch(() => {});
      return;
    }

    if (!stored) {
      storeBuild(remote);
      hasPendingUpdate = false;
      dismissUpdateBanner();
      refreshAppButtonState().catch(() => {});
    }
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

    const showDownload = !installed && canShowInstallOption();
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
        try {
          deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          if (outcome === 'accepted') {
            localStorage.setItem(INSTALL_KEY, '1');
          }
        } catch {
          showInstallGuide();
        }
        await refreshAppButtonState();
        return;
      }
      showInstallGuide();
      return;
    }

    if (hasPendingUpdate) {
      applyPendingUpdate();
      return;
    }

    try {
      await swRegistration?.update();
      await checkBuildUpdate();
    } catch { /* ignore */ }

    syncPendingUpdateState();
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
        markUpdateAvailable();
      }

      reg.update().catch(() => {});
      await checkBuildUpdate();

      setInterval(() => {
        reg.update().catch(() => {});
        checkBuildUpdate().catch(() => {});
      }, 5 * 60 * 1000);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
          checkBuildUpdate().catch(() => {});
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
        markUpdateAvailable();
      }
    });
  }

  function applyPendingUpdate() {
    const worker = pendingSwWorker || swRegistration?.waiting;
    isReloadingForUpdate = true;

    fetchRemoteBuild().then((build) => {
      if (build) storeBuild(build);
    }).catch(() => {});

    if (!worker) {
      setTimeout(() => window.location.reload(), 300);
      return;
    }
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
      offersEnabled: !!options.offersEnabled,
      privateOffersEnabled: !!options.privateOffersEnabled,
      email: options.email || null,
    };
    if (options.privateSlug) {
      body.privateSlug = options.privateSlug;
      body.preferences = { ...body.preferences, privateSlug: options.privateSlug };
    }

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
    if (options.privateOffersEnabled) {
      localStorage.setItem(PUSH_PRIVATE_CONSENT_KEY, '1');
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

  function hasPrivateConsent() {
    return localStorage.getItem(PUSH_PRIVATE_CONSENT_KEY) === '1';
  }

  function showPushBanner(message, onEnable) {
    if (document.getElementById('pwa-push-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-push-banner';
    banner.className = 'pwa-push-banner';
    banner.innerHTML = `
      <p>${message}</p>
      <div class="pwa-push-banner__actions">
        <button type="button" class="btn btn-gold btn-sm" data-push-enable>تفعيل الإشعارات</button>
        <button type="button" class="btn btn-outline btn-sm" data-push-dismiss>لاحقاً</button>
      </div>
    `;
    document.body.appendChild(banner);
    banner.querySelector('[data-push-enable]')?.addEventListener('click', async () => {
      try {
        await onEnable();
        banner.remove();
      } catch {
        /* ignore */
      }
    });
    banner.querySelector('[data-push-dismiss]')?.addEventListener('click', () => banner.remove());
  }

  async function promptOffersPush() {
    if (!isPWASupported() || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' };
    }
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
    return subscribePush({ role: 'client', offersEnabled: true, privateOffersEnabled: hasPrivateConsent() });
  }

  async function promptPrivateOffersPush(privateSlug) {
    if (!isPWASupported() || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' };
    }
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
    return subscribePush({
      role: 'client',
      offersEnabled: hasOffersConsent(),
      privateOffersEnabled: true,
      privateSlug: privateSlug || null,
    });
  }

  async function promptPushAfterInstall() {
    if (!isPWASupported() || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    if (localStorage.getItem(PUSH_PROMPTED_KEY)) return;
    localStorage.setItem(PUSH_PROMPTED_KEY, '1');

    if (Notification.permission === 'granted') {
      await subscribePush({
        role: 'client',
        offersEnabled: true,
        privateOffersEnabled: hasPrivateConsent(),
      }).catch(() => {});
      return;
    }

    showPushBanner(
      'فعّل الإشعارات لتصلك الإعلانات العقارية الجديدة على أيقونة التطبيق',
      () => subscribePush({ role: 'client', offersEnabled: true }),
    );
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
    window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
      refreshAppButtonState().catch(() => {});
    });
  }

  async function init() {
    ensureAppButtons();
    ensureIosHint();
    initInstallPrompt();
    bindSubscribeForm();
    await registerServiceWorker();
    await refreshAppButtonState();
    await confirmBuildSynced();

    setTimeout(() => {
      refreshAppButtonState().catch(() => {});
      checkBuildUpdate().catch(() => {});
    }, 2500);

    const auth = getAuthContext();
    if (auth.role !== 'client' && Notification.permission === 'granted') {
      autoSubscribeRole();
    } else if (auth.role === 'client' && hasOffersConsent() && Notification.permission === 'granted') {
      subscribePush({ role: 'client', offersEnabled: true, privateOffersEnabled: hasPrivateConsent() }).catch(() => {});
    }

    if (isStandalone() && auth.role === 'client' && Notification.permission === 'default') {
      setTimeout(() => promptPushAfterInstall(), 2000);
    }
  }

  window.AlheefPWA = {
    subscribePush,
    unsubscribePush,
    setBadge,
    clearBadge,
    hasOffersConsent,
    hasPrivateConsent,
    isStandalone,
    getClientKey,
    promptInstall: onAppButtonClick,
    showInstallGuide,
    closeInstallGuide,
    promptRolePush,
    promptOffersPush,
    promptPrivateOffersPush,
    promptPushAfterInstall,
    checkForUpdates: async () => {
      await swRegistration?.update();
      await checkBuildUpdate();
    },
    applyUpdate: applyPendingUpdate,
    refreshAppButtonState,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
