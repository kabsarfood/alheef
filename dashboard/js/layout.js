/**
 * الهيف — Dashboard Layout (Sidebar + Topbar)
 */
const NAV_ITEMS = [
  { section: 'الرئيسية', items: [
    { href: '/dashboard/', icon: '◈', label: 'لوحة التحكم', page: 'index' },
  ]},
  { section: 'الإدارة', items: [
    { href: '/dashboard/add-property.html', icon: '＋', label: 'إضافة عقار', page: 'add-property' },
    { href: '/dashboard/offers.html', icon: '◇', label: 'العقارات', page: 'offers' },
    { href: '/dashboard/private-offers.html', icon: '◈', label: 'العروض الخاصة', page: 'private-offers' },
    { href: '/dashboard/banners.html', icon: '▣', label: 'البنرات', page: 'banners' },
    { href: '/dashboard/news.html', icon: '◉', label: 'الأخبار', page: 'news' },
    { href: '/dashboard/testimonials.html', icon: '★', label: 'آراء العملاء', page: 'testimonials' },
  ]},
  { section: 'فريق المسوقين', items: [
    { href: '/dashboard/marketer-requests.html', icon: '◆', label: 'طلبات الانضمام', page: 'marketer-requests' },
    { href: '/dashboard/property-reviews.html', icon: '◈', label: 'إعلانات بانتظار الموافقة', page: 'property-reviews' },
    { href: '/dashboard/marketers.html', icon: '◎', label: 'المسوقون', page: 'marketers' },
  ]},
  { section: 'العملاء', items: [
    { href: '/dashboard/requests.html', icon: '◎', label: 'طلبات العملاء', page: 'requests' },
    { href: '/dashboard/ejar-reviews.html', icon: '★', label: 'تقييمات عقود الإيجار', page: 'ejar-reviews' },
    { href: '/dashboard/subscriptions.html', icon: '◐', label: 'الاشتراكات والتنبيهات', page: 'subscriptions' },
  ]},
  { section: 'النظام', items: [
    { href: '/dashboard/settings.html', icon: '⚙', label: 'إعدادات الموقع', page: 'settings' },
  ]},
];

async function initLayout(activePage, pageTitle) {
  const authed = await Auth.requireAuth();
  if (!authed) return;

  await loadAdminNotificationSound();

  document.body.classList.add('admin-app');

  const adminPhone = Auth.getPhone();
  const adminProfileHtml = adminPhone
    ? `<div class="admin-profile-bar">
        <span class="admin-profile-bar__label">مسجّل الدخول</span>
        <span class="admin-profile-bar__phone" dir="ltr">${escapeLayoutHtml(adminPhone)}</span>
      </div>`
    : '';

  const app = document.getElementById('app');
  if (!app) return;

  const navHtml = NAV_ITEMS.map((group) => `
    <p class="sidebar__label">${group.section}</p>
    ${group.items.map((item) => `
      <a href="${item.href}" class="nav-item${item.page === activePage ? ' active' : ''}">
        <span class="nav-item__icon">${item.icon}</span>
        ${item.label}
      </a>
    `).join('')}
  `).join('');

  const sidebarPhoneHtml = adminPhone
    ? `<p class="sidebar__signed-in"><span>مسجّل الدخول</span><strong dir="ltr">${escapeLayoutHtml(adminPhone)}</strong></p>`
    : '';

  app.innerHTML = [
    '<aside class="sidebar" id="sidebar">',
    '  <div class="sidebar__brand">',
    '    <a href="/dashboard/" class="sidebar__logo">',
    '      <img src="/assets/app-icon.png?v=6" alt="الهيف العقارية" class="sidebar__logo-icon" width="44" height="44">',
    '      <div class="sidebar__logo-text"><strong>الهيف العقارية</strong><span>لوحة التحكم</span></div>',
    '    </a>',
    '  </div>',
    `  <nav class="sidebar__nav">${navHtml}</nav>`,
    '  <div class="sidebar__footer">',
    sidebarPhoneHtml,
    '    <a href="/" target="_blank">↗ عرض الموقع</a>',
    '  </div>',
    '</aside>',
    '<div class="sidebar-overlay" id="sidebar-overlay"></div>',
    '<main class="main">',
    '  <header class="topbar admin-topbar">',
    '    <button class="sidebar-toggle" id="sidebar-toggle" aria-label="القائمة">☰</button>',
    '    <div class="topbar__main admin-topbar__main">',
    `      <h1 class="topbar__title">${pageTitle}</h1>`,
    `      ${adminProfileHtml}`,
    '    </div>',
    '    <div class="topbar-extras" id="topbar-extras" hidden></div>',
    '    <div class="topbar__actions" id="topbar-actions">',
    '      <div class="admin-notifications" id="admin-notifications"></div>',
    '      <button type="button" class="btn btn-outline btn-sm topbar-logout" id="logout-btn">',
    '        <span class="logout-label logout-label--full">تسجيل خروج</span>',
    '        <span class="logout-label logout-label--short">خروج</span>',
    '      </button>',
    '    </div>',
    '  </header>',
    '  <div class="content" id="page-content"></div>',
    '</main>',
  ].join('\n');

  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
  document.getElementById('sidebar')?.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-item')) return;
    if (window.matchMedia('(max-width: 1099px)').matches) closeSidebar();
  });
  bindLogout();
  showSupabaseStatusBanner();
  initAdminNotifications();
}

let _notificationsPollTimer = null;
let _adminSoundLoadPromise = null;
let _notifPanelOpen = false;
let _notifRenderSeq = 0;
let _notifOutsideClickBound = false;

function loadAdminNotificationSound() {
  if (window.AdminNotificationSound) return Promise.resolve();
  if (_adminSoundLoadPromise) return _adminSoundLoadPromise;
  _adminSoundLoadPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[data-admin-notif-sound]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/dashboard/js/adminNotificationSound.js';
    script.dataset.adminNotifSound = '1';
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
  return _adminSoundLoadPromise;
}

function renderSoundToggleButton() {
  if (!window.AdminNotificationSound) return '';
  const label = AdminNotificationSound.getMuteLabel();
  const aria = AdminNotificationSound.getMuteAria();
  return `<button type="button" class="notif-sound-toggle btn btn-outline btn-sm" id="notif-sound-toggle" aria-label="${escapeLayoutHtml(aria)}" aria-pressed="${AdminNotificationSound.isMuted() ? 'true' : 'false'}">${escapeLayoutHtml(label)}</button>`;
}

async function initAdminNotifications() {
  const host = document.getElementById('admin-notifications');
  if (!host) return;

  async function render() {
    const seq = ++_notifRenderSeq;
    try {
      const { items = [], unreadCount = 0 } = await DashboardAPI.getNotifications();
      if (seq !== _notifRenderSeq) return;
      if (window.AlheefPWA) window.AlheefPWA.setBadge(unreadCount);

      const fresh = window.AdminNotificationSound
        ? await AdminNotificationSound.handlePoll(items)
        : [];
      if (seq !== _notifRenderSeq) return;

      if (fresh.length) {
        showAdminNotificationToast(fresh);
      }

      const unread = items.filter((n) => !n.isRead);
      const read = items.filter((n) => n.isRead);
      const display = [...unread, ...read].slice(0, 20);
      const pushPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
      const showPushEnable = pushPermission === 'default' && window.AlheefPWA;
      const panelWasOpen = _notifPanelOpen || document.getElementById('notif-panel')?.hidden === false;

      host.innerHTML = `
        <div class="notif-bell-wrap">
          <button type="button" class="notif-bell" id="notif-toggle" aria-label="الإشعارات" aria-expanded="${panelWasOpen ? 'true' : 'false'}">
            🔔
            ${unreadCount > 0 ? `<span class="notif-bell__badge">${unreadCount}</span>` : ''}
          </button>
          <div class="notif-panel" id="notif-panel"${panelWasOpen ? '' : ' hidden'}>
            <div class="notif-panel__head">
              <strong>الإشعارات</strong>
              <div class="notif-panel__tools">
                ${renderSoundToggleButton()}
                ${unreadCount > 0 ? '<button type="button" class="notif-panel__read-all" id="notif-read-all">تعليم الكل كمقروء</button>' : ''}
              </div>
            </div>
            ${showPushEnable ? '<div class="notif-panel__push"><button type="button" class="btn btn-outline btn-sm" id="enable-push-btn">تفعيل إشعارات الجوال</button></div>' : ''}
            <p class="notif-sound-hint" id="notif-sound-hint" hidden role="status">اضغط الجرس أو زر الصوت لتفعيل صوت التنبيهات</p>
            <div class="notif-panel__list">
              ${display.length ? display.map(renderNotificationItem).join('') : '<p class="notif-panel__empty">لا توجد إشعارات</p>'}
            </div>
          </div>
        </div>
      `;

      document.getElementById('notif-toggle')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const panel = document.getElementById('notif-panel');
        if (!panel) return;
        panel.hidden = !panel.hidden;
        _notifPanelOpen = !panel.hidden;
        e.currentTarget.setAttribute('aria-expanded', String(_notifPanelOpen));
        if (_notifPanelOpen) maybeShowSoundUnlockHint(true);
      });

      document.getElementById('notif-sound-toggle')?.addEventListener('click', async () => {
        if (!window.AdminNotificationSound) return;
        await AdminNotificationSound.unlock();
        const nextMuted = !AdminNotificationSound.isMuted();
        AdminNotificationSound.setMuted(nextMuted);
        updateSoundToggleUi();
        document.getElementById('notif-sound-hint')?.setAttribute('hidden', '');
      });

      maybeShowSoundUnlockHint();

      document.getElementById('enable-push-btn')?.addEventListener('click', async () => {
        try {
          await window.AlheefPWA.promptRolePush();
          await DashboardAPI.testPushNotification().catch(() => {});
          await render();
        } catch {
          alert('تعذر تفعيل الإشعارات — تحقق من إعدادات المتصفح');
        }
      });

      document.getElementById('notif-read-all')?.addEventListener('click', async () => {
        await DashboardAPI.markAllNotificationsRead();
        if (window.AlheefPWA) await window.AlheefPWA.clearBadge();
        await render();
      });

      host.querySelectorAll('[data-notif-review]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.notifId;
          if (id) await DashboardAPI.markNotificationRead(id).catch(() => {});
          if (window.AlheefPWA) {
            const remaining = Math.max(0, unreadCount - 1);
            window.AlheefPWA.setBadge(remaining);
          }
          window.location.href = `/dashboard/property-reviews.html?property=${btn.dataset.propertyId || ''}`;
        });
      });

      host.querySelectorAll('[data-notif-ejar-review]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.notifId;
          if (id) await DashboardAPI.markNotificationRead(id).catch(() => {});
          if (window.AlheefPWA) {
            const remaining = Math.max(0, unreadCount - 1);
            window.AlheefPWA.setBadge(remaining);
          }
          window.location.href = `/dashboard/ejar-reviews.html?review=${btn.dataset.reviewId || ''}`;
        });
      });

      host.querySelectorAll('[data-notif-client-request]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.notifId;
          if (id) await DashboardAPI.markNotificationRead(id).catch(() => {});
          if (window.AlheefPWA) {
            const remaining = Math.max(0, unreadCount - 1);
            window.AlheefPWA.setBadge(remaining);
          }
          const requestId = btn.dataset.requestId || '';
          const type = btn.dataset.requestType || '';
          window.location.href = type === 'marketer_join'
            ? `/dashboard/marketer-requests.html?request=${requestId}`
            : `/dashboard/requests.html?request=${requestId}`;
        });
      });
    } catch {
      if (!document.getElementById('notif-toggle')) host.innerHTML = '';
    }
  }

  if (!_notifOutsideClickBound) {
    _notifOutsideClickBound = true;
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notif-panel');
      if (!panel || panel.hidden) return;
      if (e.target.closest('.notif-bell-wrap')) return;
      panel.hidden = true;
      _notifPanelOpen = false;
      document.getElementById('notif-toggle')?.setAttribute('aria-expanded', 'false');
    });
  }

  await render();
  clearInterval(_notificationsPollTimer);
  _notificationsPollTimer = setInterval(render, 5000);
}

function notificationCreatedAt(n) {
  return n.createdAt || n.payload?.createdAt || n.propertyCreatedAt || '';
}

function renderNotifTime(n) {
  const iso = notificationCreatedAt(n);
  return `<time class="notif-item__time" datetime="${escapeLayoutHtml(iso)}">${escapeLayoutHtml(formatDateTime(iso))}</time>`;
}

function renderNotifCta({ isRead, attrs, label }) {
  if (isRead) {
    return `<button type="button" class="btn btn-outline btn-sm notif-item__cta notif-item__cta--read" ${attrs}>مقروء</button>`;
  }
  return `<button type="button" class="btn btn-primary btn-sm notif-item__cta" ${attrs}>${escapeLayoutHtml(label)}</button>`;
}

function renderNotificationItem(n) {
  if (n.type === 'ejar_review_received') {
    const p = n.payload || {};
    const body = p.body || `وصل تقييم جديد ${'⭐'.repeat(p.rating || 0)} ويحتاج إلى مراجعتك قبل النشر.`;
    return `
      <article class="notif-item${n.isRead ? ' notif-item--read' : ''}">
        <h4 class="notif-item__title">${escapeLayoutHtml(n.title || 'تقييم جديد لعقد إيجار')}</h4>
        ${renderNotifTime(n)}
        <p class="notif-item__body">${escapeLayoutHtml(body)}</p>
        ${renderNotifCta({
          isRead: n.isRead,
          attrs: `data-notif-ejar-review data-notif-id="${n.id}" data-review-id="${p.reviewId || ''}"`,
          label: 'مراجعة التقييم',
        })}
      </article>
    `;
  }

  if (n.type === 'customer_request_received') {
    const p = n.payload || {};
    const body = p.body || 'وصل طلب عميل جديد ويحتاج إلى المتابعة.';
    return `
      <article class="notif-item${n.isRead ? ' notif-item--read' : ''}">
        <h4 class="notif-item__title">${escapeLayoutHtml(n.title || 'طلب عميل جديد')}</h4>
        ${renderNotifTime(n)}
        <p class="notif-item__body">${escapeLayoutHtml(body)}</p>
        ${renderNotifCta({
          isRead: n.isRead,
          attrs: `data-notif-client-request data-notif-id="${n.id}" data-request-id="${p.requestId || ''}" data-request-type="${escapeLayoutHtml(p.requestType || '')}"`,
          label: 'عرض الطلب',
        })}
      </article>
    `;
  }

  const p = n.payload || {};
  const marketerName = n.marketerName || p.marketerName || '—';
  const propertyType = n.propertyType || p.propertyType || '—';
  const district = n.district || p.district || '—';
  const price = n.price || p.price || '—';
  const createdAt = n.propertyCreatedAt || p.createdAt || n.createdAt;
  return `
    <article class="notif-item${n.isRead ? ' notif-item--read' : ''}">
      <h4 class="notif-item__title">${escapeLayoutHtml(n.title)}</h4>
      ${renderNotifTime({ createdAt, payload: p })}
      <ul class="notif-item__meta">
        <li><span>المسوق:</span> ${escapeLayoutHtml(marketerName)}</li>
        <li><span>النوع:</span> ${escapeLayoutHtml(propertyType)}</li>
        <li><span>الحي:</span> ${escapeLayoutHtml(district)}</li>
        <li><span>السعر:</span> ${escapeLayoutHtml(String(price))} ر.س</li>
        <li><span>تاريخ الإضافة:</span> ${escapeLayoutHtml(formatDateTime(createdAt))}</li>
      </ul>
      ${renderNotifCta({
        isRead: n.isRead,
        attrs: `data-notif-review data-notif-id="${n.id}" data-property-id="${n.propertyId || ''}"`,
        label: 'مراجعة الإعلان',
      })}
    </article>
  `;
}

async function showSupabaseStatusBanner() {
  const content = document.getElementById('page-content');
  if (!content) return;
  try {
    const { supabase } = await DashboardAPI.getSystemStatus();
    if (supabase?.connected) return;

    const reason = supabase?.reason === 'schema_missing'
      ? 'الجداول غير منشأة — نفّذ ملف supabase/schema.sql في Supabase → SQL Editor'
      : 'أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Railway → Variables ثم Redeploy';

    const banner = document.createElement('div');
    banner.className = 'db-banner';
    banner.innerHTML = `
      <strong>⚠ قاعدة البيانات غير متصلة</strong>
      <p>${reason}</p>
      ${supabase?.url ? `<p class="db-banner__meta">المشروع: ${supabase.url}</p>` : ''}
    `;
    content.prepend(banner);
  } catch {
    /* تجاهل */
  }
}

function bindLogout() {
  document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());
}

function toggleSidebar() {
  const open = !document.getElementById('sidebar')?.classList.contains('open');
  setSidebarOpen(open);
}

function closeSidebar() {
  setSidebarOpen(false);
}

function setSidebarOpen(open) {
  document.getElementById('sidebar')?.classList.toggle('open', open);
  document.getElementById('sidebar-overlay')?.classList.toggle('active', open);
  document.body.classList.toggle('sidebar-open', open);
}

function setTopbarActions(html) {
  const extras = document.getElementById('topbar-extras');
  if (!extras) return;
  extras.innerHTML = html || '';
  extras.hidden = !html;
}

function getPageContent() {
  return document.getElementById('page-content');
}

function escapeLayoutHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let _adminNotifToastEl = null;
let _adminNotifToastTimer = null;

function getNotificationBody(n) {
  const p = n.payload || {};
  if (n.type === 'ejar_review_received') {
    return p.body || `وصل تقييم جديد ${'⭐'.repeat(p.rating || 0)} ويحتاج إلى مراجعتك قبل النشر.`;
  }
  if (n.type === 'customer_request_received') {
    return p.body || 'وصل طلب عميل جديد ويحتاج إلى المتابعة.';
  }
  return n.title || 'إشعار جديد';
}

function getNotificationAction(n) {
  const p = n.payload || {};
  if (n.type === 'ejar_review_received') {
    return { url: `/dashboard/ejar-reviews.html?review=${p.reviewId || ''}`, label: n.isRead ? 'مقروء' : 'فتح التقييم' };
  }
  if (n.type === 'customer_request_received') {
    if (p.requestType === 'marketer_join') {
      return { url: `/dashboard/marketer-requests.html?request=${p.requestId || ''}`, label: n.isRead ? 'مقروء' : 'عرض الطلب' };
    }
    return { url: `/dashboard/requests.html?request=${p.requestId || ''}`, label: n.isRead ? 'مقروء' : 'عرض الطلب' };
  }
  return { url: `/dashboard/property-reviews.html?property=${n.propertyId || ''}`, label: n.isRead ? 'مقروء' : 'فتح' };
}

function dismissAdminNotificationToast() {
  if (!_adminNotifToastEl) return;
  _adminNotifToastEl.classList.remove('show');
  clearTimeout(_adminNotifToastTimer);
}

async function openAdminNotificationToast(n) {
  if (n?.id) await DashboardAPI.markNotificationRead(n.id).catch(() => {});
  dismissAdminNotificationToast();
  window.location.href = getNotificationAction(n).url;
}

function showAdminNotificationToast(freshNotifications) {
  if (!freshNotifications?.length) return;

  const latest = freshNotifications[0];
  const extraCount = freshNotifications.length - 1;
  const body = getNotificationBody(latest);
  const action = getNotificationAction({ ...latest, isRead: false });
  const title = latest.title || 'إشعار جديد';
  const when = formatDateTime(notificationCreatedAt(latest));

  if (!_adminNotifToastEl) {
    _adminNotifToastEl = document.createElement('div');
    _adminNotifToastEl.id = 'admin-notif-toast';
    _adminNotifToastEl.className = 'admin-notif-toast';
    _adminNotifToastEl.setAttribute('role', 'alert');
    _adminNotifToastEl.setAttribute('aria-live', 'assertive');
    document.body.appendChild(_adminNotifToastEl);
  }

  _adminNotifToastEl.innerHTML = `
    <div class="admin-notif-toast__inner">
      <button type="button" class="admin-notif-toast__close" data-toast-close aria-label="إغلاق الإشعار">×</button>
      <div class="admin-notif-toast__head">
        <span class="admin-notif-toast__icon" aria-hidden="true">🔔</span>
        <div class="admin-notif-toast__copy">
          <strong class="admin-notif-toast__title">${escapeLayoutHtml(title)}</strong>
          <p class="admin-notif-toast__body">${escapeLayoutHtml(body)}</p>
          <p class="admin-notif-toast__time">${escapeLayoutHtml(when)}</p>
        </div>
        ${extraCount > 0 ? `<span class="admin-notif-toast__more">+${extraCount}</span>` : ''}
      </div>
      <button type="button" class="btn btn-primary btn-sm admin-notif-toast__open" data-toast-open>${escapeLayoutHtml(action.label)}</button>
    </div>
  `;

  _adminNotifToastEl.querySelector('[data-toast-close]')?.addEventListener('click', dismissAdminNotificationToast);
  _adminNotifToastEl.querySelector('[data-toast-open]')?.addEventListener('click', () => openAdminNotificationToast(latest));

  requestAnimationFrame(() => _adminNotifToastEl.classList.add('show'));
  clearTimeout(_adminNotifToastTimer);
  _adminNotifToastTimer = setTimeout(dismissAdminNotificationToast, 7000);
}

function updateSoundToggleUi() {
  if (!window.AdminNotificationSound) return;
  const btn = document.getElementById('notif-sound-toggle');
  if (!btn) return;
  btn.textContent = AdminNotificationSound.getMuteLabel();
  btn.setAttribute('aria-label', AdminNotificationSound.getMuteAria());
  btn.setAttribute('aria-pressed', AdminNotificationSound.isMuted() ? 'true' : 'false');
}

function maybeShowSoundUnlockHint(fromBell) {
  if (!window.AdminNotificationSound?.needsUnlock?.()) return;
  if (!window.matchMedia('(max-width: 767px)').matches) return;
  if (sessionStorage.getItem('alheef_admin_sound_hint_v1') && !fromBell) return;
  if (fromBell) sessionStorage.setItem('alheef_admin_sound_hint_v1', '1');
  const hint = document.getElementById('notif-sound-hint');
  if (hint) hint.hidden = false;
}
