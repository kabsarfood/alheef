(function () {
  const TOKEN_KEY = 'alheef_user_token';
  const SLUG_KEY = 'alheef_user_slug';
  const NAME_KEY = 'alheef_user_name';
  const PHONE_KEY = 'alheef_user_phone';

  function addLink(href) {
    const nav = document.getElementById('nav');
    if (nav && !nav.querySelector('[data-private-offers]')) {
      const link = document.createElement('a');
      link.href = href;
      link.className = 'nav__link';
      link.dataset.privateOffers = '1';
      link.title = 'العروض الخاصة';
      link.textContent = 'العروض الخاصة';
      const offers = Array.from(nav.querySelectorAll('a.nav__link')).find((el) => el.textContent.trim() === 'العروض');
      if (offers) offers.after(link);
      else nav.prepend(link);
    }
    document.querySelectorAll('.header__login-menu').forEach((menu) => {
      if (menu.querySelector('[data-private-offers]')) return;
      const item = document.createElement('a');
      item.href = href;
      item.className = 'header__login-item';
      item.dataset.privateOffers = '1';
      item.setAttribute('role', 'menuitem');
      item.textContent = 'العروض الخاصة';
      menu.prepend(item);
    });
  }

  function identityLabel(name, phone) {
    const label = String(name || '').trim() || String(phone || '').trim();
    return label;
  }

  function showIdentity(name, phone) {
    const label = identityLabel(name, phone);
    if (!label) return;
    document.querySelectorAll('.header__login').forEach((box) => {
      box.classList.add('is-signed-in');
      const summary = box.querySelector('.header__login-toggle');
      if (summary) {
        summary.textContent = label;
        summary.title = label;
      }
    });
  }

  function clearIdentity() {
    document.querySelectorAll('.header__login').forEach((box) => {
      box.classList.remove('is-signed-in');
      const summary = box.querySelector('.header__login-toggle');
      if (summary) {
        summary.textContent = 'دخول';
        summary.removeAttribute('title');
      }
    });
  }

  function rememberIdentity(name, phone) {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
    if (phone) localStorage.setItem(PHONE_KEY, phone);
    else localStorage.removeItem(PHONE_KEY);
  }

  function addLogout(nav) {
    if (!nav || nav.querySelector('[data-user-logout]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav__link';
    button.dataset.userLogout = '1';
    button.textContent = 'خروج';
    button.style.background = 'transparent';
    button.style.border = '0';
    button.style.cursor = 'pointer';
    button.style.font = 'inherit';
    button.addEventListener('click', async () => {
      button.disabled = true;
      if (window.AlheefLogoutAlerts) {
        try { await window.AlheefLogoutAlerts.offer(); } catch { /* يخرج حتى لو تعذر الإشعار */ }
      }
      const token = localStorage.getItem(TOKEN_KEY);
      const slug = localStorage.getItem(SLUG_KEY);
      if (token) {
        fetch('/api/private-offers/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SLUG_KEY);
      localStorage.removeItem(NAME_KEY);
      localStorage.removeItem(PHONE_KEY);
      if (slug) localStorage.removeItem(`alheef_private_token_${slug}`);
      location.reload();
    });
    nav.appendChild(button);
    document.querySelectorAll('.header__login-menu').forEach((menu) => {
      if (menu.querySelector('[data-user-logout]')) return;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'header__login-item';
      item.dataset.userLogout = '1';
      item.textContent = 'خروج';
      item.style.width = '100%';
      item.style.textAlign = 'right';
      item.style.background = 'transparent';
      item.style.border = '0';
      item.style.cursor = 'pointer';
      item.style.font = 'inherit';
      item.addEventListener('click', () => button.click());
      menu.appendChild(item);
    });
  }

  function lockHero() {
    const button = document.getElementById('hero-btn-offers');
    if (!button) return;
    button.textContent = 'العروض الخاصة';
    button.href = '/user/login.html';
    button.classList.add('is-alert');
    button.title = 'العروض الخاصة تفتح بعد تسجيل الدخول وموافقة الأدمن';
  }

  function armHero(href) {
    const button = document.getElementById('hero-btn-offers');
    if (!button) return;
    button.textContent = 'العروض الخاصة';
    button.href = href;
    button.classList.add('is-alert');
    button.title = 'افتح العروض الخاصة';
  }

  async function run() {
    lockHero();
    const token = localStorage.getItem(TOKEN_KEY);
    const slug = localStorage.getItem(SLUG_KEY);
    if (!token || !slug) return;
    showIdentity(localStorage.getItem(NAME_KEY), localStorage.getItem(PHONE_KEY));
    const res = await fetch('/api/private-offers/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!data.authenticated || !data.slug) {
      clearIdentity();
      return;
    }
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(`alheef_private_token_${data.slug}`, data.token);
    }
    localStorage.setItem(SLUG_KEY, data.slug);
    rememberIdentity(data.clientName, data.phone);
    showIdentity(data.clientName, data.phone);
    const href = `/v/${encodeURIComponent(data.slug)}`;
    armHero(href);
    addLink(href);
    addLogout(document.getElementById('nav'));
  }

  run().catch(() => {});
})();
