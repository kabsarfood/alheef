(function () {
  'use strict';

  const loginForm = document.getElementById('login-form');
  const setupForm = document.getElementById('setup-form');
  const tabs = document.querySelectorAll('.login-tab');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isSetup = tab.dataset.tab === 'setup';
      loginForm.hidden = isSetup;
      setupForm.hidden = !isSetup;
    });
  });

  document.getElementById('forgot-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const res = await fetch('/api/auth/marketer/forgot-password', { method: 'POST' });
    const data = await res.json();
    alert(data.message || 'تواصل مع إدارة المكتب');
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('login-message');
    const fd = new FormData(loginForm);
    try {
      const res = await fetch('/api/auth/marketer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fd.get('phone'), password: fd.get('password') }),
      });
      const data = await res.json();
      if (data.needsPasswordSetup) {
        tabs[1].click();
        setupForm.querySelector('[name="phone"]').value = fd.get('phone');
        if (msg) msg.textContent = data.message;
        return;
      }
      if (!res.ok) throw new Error(data.message);
      MarketerAuth.setToken(data.token);
      window.location.href = '/marketer/';
    } catch (err) {
      if (msg) msg.textContent = err.message;
    }
  });

  setupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('setup-message');
    const fd = new FormData(setupForm);
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
      alert(data.message);
      window.location.href = '/marketer/';
    } catch (err) {
      if (msg) msg.textContent = err.message;
    }
  });

  MarketerAuth.requireAuth();
})();
