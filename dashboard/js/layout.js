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
    { href: '/dashboard/banners.html', icon: '▣', label: 'البنرات', page: 'banners' },
    { href: '/dashboard/news.html', icon: '◉', label: 'الأخبار', page: 'news' },
    { href: '/dashboard/testimonials.html', icon: '★', label: 'آراء العملاء', page: 'testimonials' },
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
    '      <div class="sidebar__logo-icon">ه</div>',
    '      <div class="sidebar__logo-text"><strong>الهيف</strong><span>لوحة التحكم</span></div>',
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
