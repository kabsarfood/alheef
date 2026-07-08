(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const form = document.getElementById('reset-form');
  const msg = document.getElementById('reset-message');

  function show(text, type) {
    if (!msg) return;
    msg.textContent = text;
    msg.className = `login-message ${type || ''}`;
  }

  if (!token) {
    show('رابط غير صالح — اطلب رابطاً جديداً من صفحة تسجيل الدخول', 'error');
    form?.querySelector('button')?.setAttribute('disabled', 'true');
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!token) return;

    const fd = new FormData(form);
    const password = fd.get('password');
    const confirmPassword = fd.get('confirmPassword');
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;

    try {
      const res = await fetch('/api/auth/marketer/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      show(data.message, 'success');
      form.reset();
      setTimeout(() => { window.location.href = '/marketer/login.html'; }, 2000);
    } catch (err) {
      show(err.message || 'تعذر الحفظ', 'error');
      btn.disabled = false;
    }
  });
})();
