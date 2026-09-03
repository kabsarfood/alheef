const MARKETER_NAV_GROUPS = [
  {
    label: 'الرئيسية',
    items: [
      { href: '/marketer/', label: 'لوحة التحكم', page: 'index', icon: '◉' },
    ],
  },
  {
    label: 'إدارة الإعلانات',
    items: [
      { href: '/marketer/add-property.html', label: 'إضافة إعلان جديد', page: 'add-property', icon: '＋' },
      { href: '/marketer/properties.html', label: 'كل إعلاناتي', page: 'properties', icon: '◇' },
    ],
  },
  {
    label: 'حسب الحالة',
    items: [
      { href: '/marketer/properties.html?status=pending_review', label: 'بانتظار المراجعة', page: 'pending', icon: '◎' },
      { href: '/marketer/properties.html?status=needs_changes', label: 'تحتاج تعديل', page: 'needs', icon: '✎' },
      { href: '/marketer/properties.html?status=approved_published', label: 'منشورة', page: 'published', icon: '✓' },
      { href: '/marketer/properties.html?status=expired', label: 'منتهية الترخيص', page: 'expired', icon: '⏱' },
    ],
  },
];

function buildMarketerNav(activePage) {
  return MARKETER_NAV_GROUPS.map((group) => `
    <div class="marketer-nav-group">
      <p class="marketer-nav-group__label">${group.label}</p>
      ${group.items.map((item) => `
        <a href="${item.href}" class="nav-item marketer-nav-item${item.page === activePage ? ' active' : ''}">
          <span class="marketer-nav-item__icon" aria-hidden="true">${item.icon}</span>
          <span class="marketer-nav-item__text">${item.label}</span>
        </a>
      `).join('')}
    </div>
  `).join('');
}

async function initMarketerLayout(activePage, pageTitle) {
  const authed = await MarketerAuth.requireAuth();
  if (!authed) return;

  document.body.classList.add('marketer-app');

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

  const app = document.getElementById('app');
  if (!app) return;

  const navHtml = buildMarketerNav(activePage);

  app.innerHTML = `
    <aside class="sidebar marketer-sidebar" id="sidebar">
      <div class="sidebar__brand">
        <a href="/marketer/" class="sidebar__logo">
          <img src="/assets/app-icon.png?v=6" alt="الهيف العقارية" class="sidebar__logo-icon" width="44" height="44">
          <div class="sidebar__logo-text"><strong>الهيف العقارية</strong><span>لوحة مسوق الهيف</span></div>
        </a>
      </div>
      <nav class="sidebar__nav marketer-sidebar__nav">${navHtml}</nav>
      <div class="sidebar__footer"><a href="/" target="_blank">↗ موقع المكتب</a></div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <main class="main marketer-main">
      <header class="topbar marketer-topbar">
        <div class="marketer-topbar__primary">
          <button class="sidebar-toggle" id="sidebar-toggle" aria-label="القائمة">☰</button>
          <h1 class="topbar__title">${pageTitle}</h1>
          <button type="button" class="btn btn-outline btn-sm marketer-logout-btn" id="logout-btn">
            <span class="marketer-logout-btn__full">تسجيل خروج</span>
            <span class="marketer-logout-btn__short" aria-hidden="true">خروج</span>
          </button>
        </div>
        <div class="marketer-profile-card" id="marketer-profile">
          <div class="marketer-profile-card__info">
            <span class="marketer-profile-card__label">مسجّل الدخول</span>
            <strong class="marketer-profile-card__name">${escapeHtml(profileName)}</strong>
            ${profilePhone ? `<span class="marketer-profile-card__phone" dir="ltr">${escapeHtml(profilePhone)}</span>` : ''}
          </div>
          <div class="marketer-notifications" id="marketer-notifications"></div>
        </div>
      </header>
      <div class="content marketer-content" id="page-content"></div>
    </main>
  `;

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  function setSidebarOpen(open) {
    sidebar?.classList.toggle('open', open);
    overlay?.classList.toggle('active', open);
    document.body.classList.toggle('sidebar-open', open);
  }

  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    setSidebarOpen(!sidebar?.classList.contains('open'));
  });
  overlay?.addEventListener('click', () => setSidebarOpen(false));
  sidebar?.querySelectorAll('.nav-item').forEach((link) => {
    link.addEventListener('click', () => setSidebarOpen(false));
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
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML = '<button type="button" class="btn btn-outline btn-sm marketer-push-btn" id="marketer-enable-push">🔔 تفعيل الإشعارات</button>';
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
