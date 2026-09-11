function loginRedirect() {
  const params = new URLSearchParams(location.search);
  const ret = params.get('return');
  if (ret && ret.startsWith('/') && !ret.startsWith('//') && ret !== '/dashboard' && ret !== '/dashboard/') {
    return ret;
  }
  return Auth.HOME_PATH || '/dashboard/index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await Auth.verify();
  if (ok) {
    window.location.replace(loginRedirect());
    return;
  }

  const form = document.getElementById('login-form');
  const otpForm = document.getElementById('otp-form');
  const errorEl = document.getElementById('login-error');
  const otpError = document.getElementById('otp-error');
  const btn = document.getElementById('login-btn');
  const otpBtn = document.getElementById('otp-btn');
  let challengeId = '';

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function showOtpStep(id, message) {
    challengeId = id;
    form.hidden = true;
    otpForm.hidden = false;
    showError(otpError, '');
    if (message) showError(otpError, message);
    document.getElementById('otp-code').value = '';
    document.getElementById('otp-code').focus();
  }

  function showLoginStep() {
    challengeId = '';
    otpForm.hidden = true;
    form.hidden = false;
    showError(otpError, '');
    btn.disabled = false;
    btn.textContent = 'دخول';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(errorEl, '');
    btn.disabled = true;
    btn.textContent = 'جاري الدخول...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: document.getElementById('phone').value.trim(),
          password: document.getElementById('password').value,
        }),
      });
      const data = await res.json();

      if (data.needsOtp && data.challengeId) {
        showOtpStep(data.challengeId);
        btn.disabled = false;
        btn.textContent = 'دخول';
        return;
      }

      if (!res.ok || !data.token) {
        throw new Error(data.message || 'فشل تسجيل الدخول');
      }

      Auth.setSession(data.token, data.phone);
      window.location.replace(loginRedirect());
    } catch (err) {
      showError(errorEl, err.message || 'كلمة المرور غير صحيحة');
      btn.disabled = false;
      btn.textContent = 'دخول';
    }
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(otpError, '');
    otpBtn.disabled = true;
    otpBtn.textContent = 'جاري التحقق...';
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code: document.getElementById('otp-code').value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.message || 'رمز التحقق غير صحيح');
      Auth.setSession(data.token, data.phone);
      window.location.replace(loginRedirect());
    } catch (err) {
      showError(otpError, err.message);
      otpBtn.disabled = false;
      otpBtn.textContent = 'تأكيد الرمز';
    }
  });

  document.getElementById('otp-resend')?.addEventListener('click', async () => {
    showError(otpError, '');
    try {
      const res = await fetch('/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'تعذر إعادة الإرسال');
      if (data.challengeId) challengeId = data.challengeId;
      showError(otpError, data.message || 'تم إعادة إرسال الرمز');
    } catch (err) {
      showError(otpError, err.message);
    }
  });

  document.getElementById('otp-back')?.addEventListener('click', showLoginStep);
});
