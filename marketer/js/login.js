(function () {
  'use strict';

  const loginForm = document.getElementById('login-form');
  const setupForm = document.getElementById('setup-form');
  const forgotForm = document.getElementById('forgot-form');
  const tabs = document.querySelectorAll('.login-tab');

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `login-message ${type || ''}`;
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const tabName = tab.dataset.tab;
      loginForm.hidden = tabName !== 'login';
      setupForm.hidden = tabName !== 'setup';
      forgotForm.hidden = tabName !== 'forgot';
    });
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('login-message');
    const fd = new FormData(loginForm);
    const btn = loginForm.querySelector('[type="submit"]');
    btn.disabled = true;
    showMsg(msg, '');
    try {
      const res = await fetch('/api/auth/marketer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: fd.get('login'), password: fd.get('password') }),
      });
      const data = await res.json();
      if (data.needsPasswordSetup) {
        tabs[1].click();
        setupForm.querySelector('[name="phone"]').value = String(fd.get('login') || '').includes('@') ? '' : fd.get('login');
        showMsg(msg, data.message);
        return;
      }
      if (!res.ok) throw new Error(data.message);
      MarketerAuth.setToken(data.token);
      window.location.href = '/marketer/';
    } catch (err) {
      showMsg(msg, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  setupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('setup-message');
    const fd = new FormData(setupForm);
    const btn = setupForm.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/marketer/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fd.get('phone'),
          nationalId: fd.get('nationalId'),
          password: fd.get('password'),
          confirmPassword: fd.get('confirmPassword'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      MarketerAuth.setToken(data.token);
      window.location.href = '/marketer/';
    } catch (err) {
      showMsg(msg, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  forgotForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('forgot-message');
    const fd = new FormData(forgotForm);
    const btn = forgotForm.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'جاري الإرسال...';
    try {
      const res = await fetch('/api/auth/marketer/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email') }),
      });
      const data = await res.json();
      showMsg(msg, data.message || 'تحقق من بريدك الإلكتروني', 'success');
      forgotForm.reset();
    } catch (err) {
      showMsg(msg, err.message || 'تعذر الإرسال', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'إرسال رابط الاستعادة';
    }
  });

  MarketerAuth.requireAuth();
})();
