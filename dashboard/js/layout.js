/**
 * الهيف — Dashboard Layout (Sidebar + Topbar)
 */
const NAV_ITEMS = [
  { section: 'الرئيسية', items: [
    { href: '/dashboard/', icon: '◈', label: 'لوحة التحكم', page: 'index' },
  ]},
  { section: 'الإدارة', items: [
    { href: '/dashboard/add-property.html', icon: '＋', label: 'إضافة إعلان عقاري', page: 'add-property' },
    { href: '/dashboard/offers.html', icon: '◇', label: 'العروض الحالية', page: 'offers' },
    { href: '/dashboard/news.html', icon: '◉', label: 'الأخبار العقارية', page: 'news' },
  ]},
  { section: 'العملاء', items: [
    { href: '/dashboard/requests.html', icon: '◎', label: 'طلبات العملاء', page: 'requests' },
    { href: '/dashboard/subscriptions.html', icon: '◐', label: 'الاشتراكات والتنبيهات', page: 'subscriptions' },
  ]},
  { section: 'النظام', items: [
    { href: '/dashboard/settings.html', icon: '⚙', label: 'الإعدادات', page: 'settings' },
  ]},
];

function initLayout(activePage, pageTitle) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar__brand">
        <a href="/dashboard/" class="sidebar__logo">
          <div class="sidebar__logo-icon">ه</div>
          <div class="sidebar__logo-text">
            <strong>الهيف</strong>
            <span>لوحة التحكم</span>
          </div>
        </a>
      </div>
      <nav class="sidebar__nav">
        ${NAV_ITEMS.map((group) => `
          <p class="sidebar__label">${group.section}</p>
          ${group.items.map((item) => `
            <a href="${item.href}" class="nav-item${item.page === activePage ? ' active' : ''}">
              <span class="nav-item__icon">${item.icon}</span>
              ${item.label}
            </a>
          `).join('')}
        `).join('')}
      </nav>
      <div class="sidebar__footer">
        <a href="/" target="_blank">↗ عرض الموقع</a>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <main class="main">
      <header class="topbar">
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="القائمة">☰</button>
        <h1 class="topbar__title">${pageTitle}</h1>
        <div class="topbar__actions" id="topbar-actions"></div>
      </header>
      <div class="content" id="page-content"></div>
    </main>
  `;

  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('active');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

function setTopbarActions(html) {
  const el = document.getElementById('topbar-actions');
  if (el) el.innerHTML = html;
}

function getPageContent() {
  return document.getElementById('page-content');
}
