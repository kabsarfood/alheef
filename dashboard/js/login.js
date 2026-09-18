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
  const otpCodeInput = document.getElementById('otp-code');
  const otpPhoneDisplay = document.getElementById('otp-phone-display');
  let challengeId = '';
  let lastPhone = '';
  let otpAbort = null;
  let verifying = false;

  function showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
  }

  function stopOtpAutofill() {
    if (otpAbort) {
      try {
        otpAbort.abort();
      } catch {
        /* ignore */
      }
      otpAbort = null;
    }
  }

  /** WebOTP / لوحة مفاتيح الجوال — يملأ الرمز تلقائيًا إن دعمه المتصفح */
  function startOtpAutofill() {
    stopOtpAutofill();
    if (!otpCodeInput) return;

    if ('OTPCredential' in window && navigator.credentials?.get) {
      otpAbort = new AbortController();
      navigator.credentials
        .get({
          otp: { transport: ['sms'] },
          signal: otpAbort.signal,
        })
        .then((cred) => {
          const code = String(cred?.code || '').replace(/\D/g, '').slice(0, 6);
          if (code.length === 6) {
            otpCodeInput.value = code;
            otpForm?.requestSubmit();
          }
        })
        .catch(() => {
          /* المستخدم أغلق الاقتراح أو غير مدعوم */
        });
    }
  }

  async function verifyOtpCode(code) {
    const cleaned = String(code || '').replace(/\D/g, '').slice(0, 6);
    if (!challengeId || cleaned.length !== 6 || verifying) return;
    verifying = true;
    showError(otpError, '');
    otpBtn.disabled = true;
    otpBtn.textContent = 'جاري التحقق...';
    stopOtpAutofill();
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code: cleaned }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.message || 'رمز التحقق غير صحيح');
      if (data.role !== 'admin') throw new Error('غير مصرح بالدخول إلى لوحة التحكم');
      Auth.setSession(data.token, data.phone);
      window.location.replace(loginRedirect());
    } catch (err) {
      showError(otpError, err.message);
      otpBtn.disabled = false;
      otpBtn.textContent = 'تحقق ودخول';
      verifying = false;
      startOtpAutofill();
    }
  }

  function showOtpStep(id) {
    challengeId = id;
    verifying = false;
    form.hidden = true;
    otpForm.hidden = false;
    showError(otpError, '');
    if (otpPhoneDisplay) {
      otpPhoneDisplay.textContent = lastPhone ? `واتساب: ${lastPhone}` : '';
      otpPhoneDisplay.hidden = !lastPhone;
    }
    otpCodeInput.value = '';
    otpBtn.disabled = false;
    otpBtn.textContent = 'تحقق ودخول';
    otpCodeInput.focus({ preventScroll: false });
    startOtpAutofill();
  }

  function showLoginStep() {
    stopOtpAutofill();
    challengeId = '';
    verifying = false;
    otpForm.hidden = true;
    form.hidden = false;
    showError(otpError, '');
    btn.disabled = false;
    btn.textContent = 'إرسال رمز التحقق عبر واتساب';
  }

  otpCodeInput?.addEventListener('input', () => {
    const cleaned = otpCodeInput.value.replace(/\D/g, '').slice(0, 6);
    if (otpCodeInput.value !== cleaned) otpCodeInput.value = cleaned;
    if (cleaned.length === 6) verifyOtpCode(cleaned);
  });

  otpCodeInput?.addEventListener('change', () => {
    const cleaned = otpCodeInput.value.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length === 6) verifyOtpCode(cleaned);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(errorEl, '');
    btn.disabled = true;
    const phone = document.getElementById('phone').value.trim();
    lastPhone = phone;

    try {
      btn.textContent = 'جاري الإرسال...';
      const res = await fetch('/api/auth/otp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok || !data.challengeId) {
        throw new Error(data.message || 'تعذر إرسال رمز التحقق');
      }
      showOtpStep(data.challengeId);
      btn.disabled = false;
      btn.textContent = 'إرسال رمز التحقق عبر واتساب';
    } catch (err) {
      showError(errorEl, err.message || 'تعذر تسجيل الدخول');
      btn.disabled = false;
      btn.textContent = 'إرسال رمز التحقق عبر واتساب';
    }
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await verifyOtpCode(otpCodeInput.value);
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
      otpCodeInput.value = '';
      startOtpAutofill();
      showError(otpError, data.message || 'تم إعادة إرسال الرمز إلى واتساب');
      otpCodeInput.focus();
    } catch (err) {
      showError(otpError, err.message);
    }
  });

  document.getElementById('otp-back')?.addEventListener('click', showLoginStep);
});
