function loginRedirect() {
  const params = new URLSearchParams(location.search);
  const ret = params.get('return');
  if (ret && ret.startsWith('/') && !ret.startsWith('//')) return ret;
  return '/dashboard/';
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await Auth.verify();
  if (ok) {
    window.location.href = loginRedirect();
    return;
  }

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'جاري الدخول...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: document.getElementById('password').value }),
      });
      const data = await res.json();

      if (!res.ok || !data.token) {
        throw new Error(data.message || 'فشل تسجيل الدخول');
      }

      Auth.setToken(data.token);
      window.location.href = loginRedirect();
    } catch (err) {
      errorEl.textContent = err.message || 'كلمة المرور غير صحيحة';
      errorEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'دخول';
    }
  });
});
