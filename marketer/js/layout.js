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

  let profile = null;
  try {
    const data = await MarketerAPI.getMe();
    profile = data.marketer || null;
  } catch {
    profile = null;
  }
  MarketerAuth.profile = profile;

  const profileName = profile?.fullName || 'مسوق الهيف';
  const profilePhone = profile?.phone || '';
  const profileHtml = profilePhone
    ? `<div class="marketer-profile" id="marketer-profile">
        <span class="marketer-profile__name">${escapeHtml(profileName)}</span>
        <span class="marketer-profile__sep" aria-hidden="true">·</span>
        <span class="marketer-profile__phone">${escapeHtml(profilePhone)}</span>
      </div>`
    : `<div class="marketer-profile" id="marketer-profile">
        <span class="marketer-profile__name">${escapeHtml(profileName)}</span>
      </div>`;

  const app = document.getElementById('app');
  if (!app) return;

  const navHtml = MARKETER_NAV.map((item) => `
    <a href="${item.href}" class="nav-item${item.page === activePage ? ' active' : ''}">${item.label}</a>
  `).join('');

  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar__brand">
        <a href="/marketer/" class="sidebar__logo">
          <img src="/assets/app-icon.png?v=5" alt="الهيف العقارية" class="sidebar__logo-icon" width="40" height="40">
          <div class="sidebar__logo-text"><strong>الهيف العقارية</strong><span>لوحة مسوق الهيف</span></div>
        </a>
      </div>
      <nav class="sidebar__nav">${navHtml}</nav>
      <div class="sidebar__footer"><a href="/" target="_blank">↗ موقع المكتب</a></div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <main class="main">
      <header class="topbar">
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="القائمة">☰</button>
        <div class="topbar__main">
          <h1 class="topbar__title">${pageTitle}</h1>
          ${profileHtml}
        </div>
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

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
