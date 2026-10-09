(function () {
  const TOKEN_KEY = 'alheef_user_token';
  const SLUG_KEY = 'alheef_user_slug';
  const form = document.getElementById('user-login');
  const phoneStep = document.getElementById('phone-step');
  const otpStep = document.getElementById('otp-step');
  const phoneInput = document.getElementById('phone');
  const otpInput = document.getElementById('otp');
  const errorEl = document.getElementById('login-error');
  const enterBtn = document.getElementById('enter-btn');
  const verifyBtn = document.getElementById('verify-btn');
  let challengeId = '';
  let phone = '';
  let otpAbort = null;
  let verifying = false;

  function showError(message) {
    errorEl.textContent = message || '';
  }

  function digits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
      .replace(/\D/g, '');
  }

  function localPhone(value) {
    let d = digits(value);
    if (d.startsWith('966')) d = d.slice(3);
    if (d.startsWith('5') && d.length === 9) d = `0${d}`;
    return d;
  }

  function storeSession(data) {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(SLUG_KEY, data.slug);
    localStorage.setItem(`alheef_private_token_${data.slug}`, data.token);
  }

  function enterSite() {
    location.replace('/');
  }

  function stopOtpAutofill() {
    if (!otpAbort) return;
    try { otpAbort.abort(); } catch { /* ignore */ }
    otpAbort = null;
  }

  function startOtpAutofill() {
    stopOtpAutofill();
    if (!otpInput || !('OTPCredential' in window) || !navigator.credentials?.get) return;
    otpAbort = new AbortController();
    navigator.credentials.get({
      otp: { transport: ['sms'] },
      signal: otpAbort.signal,
    }).then((cred) => {
      const code = digits(cred?.code).slice(0, 6);
      if (code.length === 6) {
        otpInput.value = code;
        verifyCode();
      }
    }).catch(() => {});
  }

  async function resume() {
    const token = localStorage.getItem(TOKEN_KEY);
    const slug = localStorage.getItem(SLUG_KEY);
    if (!token || !slug) return false;
    const res = await fetch('/api/private-offers/session', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!data.authenticated || !data.slug) return false;
    storeSession(data);
    enterSite();
    return true;
  }

  async function sendCode() {
    phone = localPhone(phoneInput.value);
    phoneInput.value = phone;
    const res = await fetch('/api/private-offers/portal/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'تعذر إرسال الرمز');
    challengeId = data.challengeId;
    phoneStep.hidden = true;
    otpStep.hidden = false;
    otpInput.value = '';
    otpInput.focus();
    startOtpAutofill();
    showError('أُرسل الرمز إلى واتساب. سيُكتب في المربع إن سمح الجوال.');
  }

  async function verifyCode() {
    const code = digits(otpInput.value).slice(0, 6);
    if (!challengeId || code.length !== 6 || verifying) return;
    verifying = true;
    if (verifyBtn) verifyBtn.disabled = true;
    stopOtpAutofill();
    try {
      const res = await fetch('/api/private-offers/portal/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ phone, challengeId, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token || !data.slug) throw new Error(data.message || 'رمز غير صحيح');
      storeSession(data);
      enterSite();
    } catch (error) {
      verifying = false;
      if (verifyBtn) verifyBtn.disabled = false;
      showError(error.message || 'تعذر الدخول');
      startOtpAutofill();
    }
  }

  async function consumeFill(token) {
    const res = await fetch('/api/private-offers/portal/otp/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ fill: token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.code) throw new Error(data.message || 'تعذر تعبئة الرمز');
    phone = localPhone(data.phone);
    phoneInput.value = phone;
    challengeId = data.challengeId;
    phoneStep.hidden = true;
    otpStep.hidden = false;
    otpInput.value = data.code;
    await verifyCode();
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

  const params = new URLSearchParams(location.search);
  const preset = localPhone(params.get('phone') || '');
  if (preset) {
    phoneInput.value = preset;
    phoneInput.readOnly = true;
  }

  const fill = params.get('fill') || '';
  if (fill) {
    consumeFill(fill).catch((error) => showError(error.message || 'تعذر تعبئة الرمز'));
  } else {
    resume().catch(() => {});
  }
})();
