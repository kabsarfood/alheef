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
    { href: '/dashboard/subscriptions.html', icon: '◐', label: 'الاشتراكات والتنبيهات', page: 'subscriptions' },
  ]},
  { section: 'النظام', items: [
    { href: '/dashboard/settings.html', icon: '⚙', label: 'إعدادات الموقع', page: 'settings' },
  ]},
];

async function initLayout(activePage, pageTitle) {
  const authed = await Auth.requireAuth();
  if (!authed) return;

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

  app.innerHTML = [
    '<aside class="sidebar" id="sidebar">',
    '  <div class="sidebar__brand">',
    '    <a href="/dashboard/" class="sidebar__logo">',
    '      <img src="/assets/app-icon.png?v=5" alt="الهيف العقارية" class="sidebar__logo-icon" width="40" height="40">',
    '      <div class="sidebar__logo-text"><strong>الهيف العقارية</strong><span>لوحة التحكم</span></div>',
    '    </a>',
    '  </div>',
    `  <nav class="sidebar__nav">${navHtml}</nav>`,
    '  <div class="sidebar__footer"><a href="/" target="_blank">↗ عرض الموقع</a></div>',
    '</aside>',
    '<div class="sidebar-overlay" id="sidebar-overlay"></div>',
    '<main class="main">',
    '  <header class="topbar">',
    '    <button class="sidebar-toggle" id="sidebar-toggle" aria-label="القائمة">☰</button>',
    `    <h1 class="topbar__title">${pageTitle}</h1>`,
    '    <div class="topbar__actions" id="topbar-actions">',
    '      <div class="admin-notifications" id="admin-notifications"></div>',
    '      <button type="button" class="btn btn-outline btn-sm" id="logout-btn">تسجيل خروج</button>',
    '    </div>',
    '  </header>',
    '  <div class="content" id="page-content"></div>',
    '</main>',
  ].join('\n');

  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
  bindLogout();
  showSupabaseStatusBanner();
  initAdminNotifications();
}

let _knownNotificationIds = new Set();
let _notificationsPollTimer = null;

async function initAdminNotifications() {
  const host = document.getElementById('admin-notifications');
  if (!host) return;

  async function render() {
    try {
      const { items = [], unreadCount = 0 } = await DashboardAPI.getNotifications();
      if (window.AlheefPWA) window.AlheefPWA.setBadge(unreadCount);
      const unread = items.filter((n) => !n.isRead);
      const display = unread.length ? unread : items.slice(0, 5);
      const pushPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
      const showPushEnable = pushPermission === 'default' && window.AlheefPWA;

      unread.forEach((n) => {
        if (!_knownNotificationIds.has(n.id)) {
          _knownNotificationIds.add(n.id);
          if (_knownNotificationIds.size > 1) {
            showToast(n.title);
          }
        }
      });

      host.innerHTML = `
        ${showPushEnable ? '<button type="button" class="btn btn-outline btn-sm" id="enable-push-btn">تفعيل إشعارات الجوال</button>' : ''}
        <div class="notif-bell-wrap">
          <button type="button" class="notif-bell" id="notif-toggle" aria-label="الإشعارات">
            🔔
            ${unreadCount > 0 ? `<span class="notif-bell__badge">${unreadCount}</span>` : ''}
          </button>
          <div class="notif-panel" id="notif-panel" hidden>
            <div class="notif-panel__head">
              <strong>إشعارات المراجعة</strong>
              ${unreadCount > 0 ? '<button type="button" class="notif-panel__read-all" id="notif-read-all">تعليم الكل كمقروء</button>' : ''}
            </div>
            <div class="notif-panel__list">
              ${display.length ? display.map(renderNotificationItem).join('') : '<p class="notif-panel__empty">لا توجد إشعارات</p>'}
            </div>
          </div>
        </div>
      `;

      document.getElementById('notif-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById('notif-panel');
        panel.hidden = !panel.hidden;
      });

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
    } catch {
      host.innerHTML = '';
    }
  }

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notif-panel');
    if (!panel || panel.hidden) return;
    if (!e.target.closest('.notif-bell-wrap')) panel.hidden = true;
  });

  await render();
  clearInterval(_notificationsPollTimer);
  _notificationsPollTimer = setInterval(render, 30000);
}

function renderNotificationItem(n) {
  const p = n.payload || {};
  const marketerName = n.marketerName || p.marketerName || '—';
  const propertyType = n.propertyType || p.propertyType || '—';
  const district = n.district || p.district || '—';
  const price = n.price || p.price || '—';
  const createdAt = n.propertyCreatedAt || p.createdAt || n.createdAt;
  return `
    <article class="notif-item${n.isRead ? ' notif-item--read' : ''}">
      <h4 class="notif-item__title">${n.title}</h4>
      <ul class="notif-item__meta">
        <li><span>المسوق:</span> ${marketerName}</li>
        <li><span>النوع:</span> ${propertyType}</li>
        <li><span>الحي:</span> ${district}</li>
        <li><span>السعر:</span> ${price} ر.س</li>
        <li><span>تاريخ الإضافة:</span> ${formatDate(createdAt)}</li>
      </ul>
      <button type="button" class="btn btn-primary btn-sm" data-notif-review data-notif-id="${n.id}" data-property-id="${n.propertyId || ''}">مراجعة الإعلان</button>
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
  const el = document.getElementById('topbar-actions');
  if (!el) return;
  const logoutBtn = '<button type="button" class="btn btn-outline btn-sm" id="logout-btn">تسجيل خروج</button>';
  el.innerHTML = html ? `${html} ${logoutBtn}` : logoutBtn;
  bindLogout();
}

function getPageContent() {
  return document.getElementById('page-content');
}
