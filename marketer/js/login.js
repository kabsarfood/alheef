(function () {
  'use strict';

  const loginForm = document.getElementById('login-form');
  const setupForm = document.getElementById('setup-form');
  const forgotForm = document.getElementById('forgot-form');
  const otpForm = document.getElementById('otp-form');
  const tabs = document.querySelectorAll('.login-tab');
  const tabsBar = document.querySelector('.login-tabs');
  let challengeId = '';
  let otpReturnTab = 'login';

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `login-message ${type || ''}`;
  }

  function showOtpStep(id, message) {
    challengeId = id;
    otpReturnTab = setupForm && !setupForm.hidden ? 'setup' : 'login';
    loginForm.hidden = true;
    setupForm.hidden = true;
    forgotForm.hidden = true;
    otpForm.hidden = false;
    if (tabsBar) tabsBar.hidden = true;
    const msg = document.getElementById('otp-message');
    showMsg(msg, message || 'تم إرسال رمز التحقق إلى واتساب', 'success');
    const input = document.getElementById('otp-code');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function hideOtpStep() {
    challengeId = '';
    otpForm.hidden = true;
    if (tabsBar) tabsBar.hidden = false;
    if (otpReturnTab === 'setup' && tabs[1]) tabs[1].click();
    else if (tabs[0]) tabs[0].click();
    else loginForm.hidden = false;
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
      if (otpForm) otpForm.hidden = true;
      if (tabsBar) tabsBar.hidden = false;
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
      if (data.needsOtp && data.challengeId) {
        showOtpStep(data.challengeId, data.message);
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
      if (data.needsOtp && data.challengeId) {
        showOtpStep(data.challengeId, data.message);
        return;
      }
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

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('otp-message');
    const btn = document.getElementById('otp-btn');
    btn.disabled = true;
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
      MarketerAuth.setToken(data.token);
      window.location.href = '/marketer/';
    } catch (err) {
      showMsg(msg, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('otp-resend')?.addEventListener('click', async () => {
    const msg = document.getElementById('otp-message');
    try {
      const res = await fetch('/api/auth/otp/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'تعذر إعادة الإرسال');
      if (data.challengeId) challengeId = data.challengeId;
      showMsg(msg, data.message || 'تم إعادة إرسال الرمز', 'success');
    } catch (err) {
      showMsg(msg, err.message, 'error');
    }
  });

  document.getElementById('otp-back')?.addEventListener('click', hideOtpStep);

  MarketerAuth.requireAuth();
})();
