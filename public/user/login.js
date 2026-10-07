(function () {
  const TOKEN_KEY = 'alheef_user_token';
  const SLUG_KEY = 'alheef_user_slug';
  const form = document.getElementById('user-login');
  const phoneStep = document.getElementById('phone-step');
  const otpStep = document.getElementById('otp-step');
  const phoneInput = document.getElementById('phone');
  const otpInput = document.getElementById('otp');
  const errorEl = document.getElementById('login-error');
  let challengeId = '';
  let phone = '';

  function showError(message) {
    errorEl.textContent = message || '';
  }

  function digits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
      .replace(/\D/g, '');
  }

  async function resume() {
    const token = localStorage.getItem(TOKEN_KEY);
    const slug = localStorage.getItem(SLUG_KEY);
    if (!token || !slug) return;
    const res = await fetch('/api/private-offers/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!data.authenticated || !data.slug) return;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(SLUG_KEY, data.slug);
    localStorage.setItem(`alheef_private_token_${data.slug}`, data.token);
    location.replace(`/v/${data.slug}`);
  }

  async function sendCode() {
    phone = digits(phoneInput.value);
    const res = await fetch('/api/private-offers/portal/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'تعذر إرسال الرمز');
    challengeId = data.challengeId;
    phoneStep.hidden = true;
    otpStep.hidden = false;
    otpInput.focus();
    showError('أُرسل الرمز إلى واتساب');
  }

  async function verifyCode() {
    const code = digits(otpInput.value).slice(0, 6);
    const res = await fetch('/api/private-offers/portal/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, challengeId, code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token || !data.slug) throw new Error(data.message || 'رمز غير صحيح');
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(SLUG_KEY, data.slug);
    localStorage.setItem(`alheef_private_token_${data.slug}`, data.token);
    location.replace(`/v/${data.slug}`);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      if (otpStep.hidden) await sendCode();
      else await verifyCode();
    } catch (error) {
      showError(error.message || 'تعذر الدخول');
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.getElementById('resend').addEventListener('click', async () => {
    showError('');
    try {
      await sendCode();
    } catch (error) {
      showError(error.message || 'تعذر إعادة الإرسال');
    }
  });

  resume().catch(() => {});
})();
