(function () {
  'use strict';

  const loginForm = document.getElementById('login-form');
  const otpForm = document.getElementById('otp-form');
  const phoneInput = document.getElementById('login-phone');
  const otpInput = document.getElementById('otp-code');
  let challengeId = '';
  let otpAbort = null;
  let verifying = false;

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `login-message ${type || ''}`;
  }

  function digits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
      .replace(/\D/g, '');
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
    }).then((cred) => offerCode(cred?.code)).catch(() => {});
  }

  async function offerCode(code) {
    const accepted = window.AlheefOtpConsent
      ? await window.AlheefOtpConsent.ask(code)
      : digits(code).slice(0, 6);
    if (accepted.length !== 6) return;
    otpInput.value = accepted;
    await verifyCode(accepted);
  }

  function showOtpStep(id, message) {
    challengeId = id;
    verifying = false;
    loginForm.hidden = true;
    otpForm.hidden = false;
    showMsg(document.getElementById('otp-message'), message || 'تم إرسال رمز التحقق إلى واتساب', 'success');
    otpInput.value = '';
    otpInput.focus();
    startOtpAutofill();
  }

  function hideOtpStep() {
    stopOtpAutofill();
    challengeId = '';
    otpForm.hidden = true;
    loginForm.hidden = false;
  }

  async function verifyCode(code) {
    const cleaned = digits(code).slice(0, 6);
    if (!challengeId || cleaned.length !== 6 || verifying) return;
    verifying = true;
    const btn = document.getElementById('otp-btn');
    const msg = document.getElementById('otp-message');
    if (btn) btn.disabled = true;
    stopOtpAutofill();
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code: cleaned }),
      });
      const data = await res.json();
      if (!res.ok || !data.token || data.role !== 'marketer') throw new Error(data.message || 'رمز غير صحيح');
      MarketerAuth.setToken(data.token);
      window.location.href = '/marketer/';
    } catch (err) {
      verifying = false;
      if (btn) btn.disabled = false;
      showMsg(msg, err.message);
      startOtpAutofill();
    }
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('login-message');
    const btn = loginForm.querySelector('[type="submit"]');
    btn.disabled = true;
    showMsg(msg, '');
    try {
      const res = await fetch('/api/auth/marketer/otp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneInput.value }),
      });
      const data = await res.json();
      if (!res.ok || !data.challengeId) throw new Error(data.message || 'تعذر إرسال الرمز');
      showOtpStep(data.challengeId, 'وصل رمز واتساب. اضغط موافق لينزل في المربع.');
      offerCode(data.code);
    } catch (err) {
      showMsg(msg, err.message);
    } finally {
      btn.disabled = false;
    }
  });

  otpForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    verifyCode(otpInput.value);
  });

  document.getElementById('otp-resend')?.addEventListener('click', async () => {
    const msg = document.getElementById('otp-message');
    if (!challengeId) return;
    try {
      const res = await fetch('/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'تعذر إعادة الإرسال');
      if (data.challengeId) challengeId = data.challengeId;
      showMsg(msg, 'وصل رمز واتساب. اضغط موافق لينزل في المربع.', 'success');
      startOtpAutofill();
      offerCode(data.code);
    } catch (err) {
      showMsg(msg, err.message);
    }
  });

  document.getElementById('otp-back')?.addEventListener('click', hideOtpStep);

  const fill = new URLSearchParams(location.search).get('fill') || '';
  if (fill) {
    fetch('/api/auth/otp/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fill }),
    }).then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.purpose !== 'marketer' || !data.code) throw new Error(data.message || 'تعذر تعبئة الرمز');
        showOtpStep(data.challengeId, 'وصل رمز واتساب. اضغط موافق لينزل في المربع.');
        offerCode(data.code);
      })
      .catch((err) => showMsg(document.getElementById('login-message'), err.message));
  }
})();
