const MARKETER_NAV = [
  { href: '/marketer/', label: 'لوحة مسوق الهيف', page: 'index' },
  { href: '/marketer/add-property.html', label: 'إضافة إعلان جديد', page: 'add-property' },
  { href: '/marketer/properties.html', label: 'إعلاناتي', page: 'properties' },
  { href: '/marketer/properties.html?status=pending_review', label: 'بانتظار المراجعة', page: 'pending' },
  { href: '/marketer/properties.html?status=needs_changes', label: 'تحتاج تعديل / ملاحظات الإدارة', page: 'needs' },
  { href: '/marketer/properties.html?status=approved_published', label: 'منشورة', page: 'published' },
  { href: '/marketer/properties.html?status=expired', label: 'منتهية الترخيص', page: 'expired' },
];

async function initMarketerLayout(activePage, pageTitle) {
  const authed = await MarketerAuth.requireAuth();
  if (!authed) return;

  const app = document.getElementById('app');
  if (!app) return;

  const navHtml = MARKETER_NAV.map((item) => `
    <a href="${item.href}" class="nav-item${item.page === activePage ? ' active' : ''}">${item.label}</a>
  `).join('');

  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar__brand">
        <a href="/marketer/" class="sidebar__logo">
          <div class="sidebar__logo-icon">ه</div>
          <div class="sidebar__logo-text"><strong>الهيف</strong><span>لوحة مسوق الهيف</span></div>
        </a>
      </div>
      <nav class="sidebar__nav">${navHtml}</nav>
      <div class="sidebar__footer"><a href="/" target="_blank">↗ موقع المكتب</a></div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <main class="main">
      <header class="topbar">
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="القائمة">☰</button>
        <h1 class="topbar__title">${pageTitle}</h1>
        <div class="topbar__actions" id="topbar-actions">
          <div class="marketer-notifications" id="marketer-notifications"></div>
          <button type="button" class="btn btn-outline btn-sm" id="logout-btn">تسجيل خروج</button>
        </div>
      </header>
      <div class="content" id="page-content"></div>
    </main>
  `;

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('active');
  });
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
  });
  document.getElementById('logout-btn')?.addEventListener('click', () => MarketerAuth.logout());
  initMarketerPushPrompt();
}

function initMarketerPushPrompt() {
  const host = document.getElementById('marketer-notifications');
  if (!host || typeof Notification === 'undefined') return;

  function render() {
    if (Notification.permission !== 'default' || !window.AlheefPWA) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = '<button type="button" class="btn btn-outline btn-sm" id="marketer-enable-push">تفعيل إشعارات الجوال</button>';
    document.getElementById('marketer-enable-push')?.addEventListener('click', async () => {
      try {
        await window.AlheefPWA.promptRolePush();
        render();
      } catch {
        alert('تعذر تفعيل الإشعارات');
      }
    });
  }

  render();
}

function getMarketerContent() {
  return document.getElementById('page-content');
}
