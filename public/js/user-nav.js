(function () {
  const TOKEN_KEY = 'alheef_user_token';
  const SLUG_KEY = 'alheef_user_slug';

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
      if (slug) localStorage.removeItem(`alheef_private_token_${slug}`);
      location.reload();
    });
    nav.appendChild(button);
  }

  async function run() {
    const token = localStorage.getItem(TOKEN_KEY);
    const slug = localStorage.getItem(SLUG_KEY);
    if (!token || !slug) return;
    const res = await fetch('/api/private-offers/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!data.authenticated || !data.slug) return;
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(`alheef_private_token_${data.slug}`, data.token);
    }
    localStorage.setItem(SLUG_KEY, data.slug);
    const href = `/v/${encodeURIComponent(data.slug)}`;
    addLink(href);
    addLogout(document.getElementById('nav'));
  }

  run().catch(() => {});
})();
