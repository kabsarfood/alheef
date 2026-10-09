(function () {
  let current = null;

  function digits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
      .replace(/\D/g, '')
      .slice(0, 6);
  }

  function close(result) {
    const open = current;
    current = null;
    if (!open) return;
    open.root.remove();
    document.removeEventListener('keydown', open.onKey);
    open.resolve(result || '');
  }

  function ask(code) {
    const clean = digits(code);
    if (clean.length !== 6) return Promise.resolve('');
    if (current && current.code === clean) return current.promise;
    if (current) close('');

    const root = document.createElement('div');
    root.className = 'otp-consent';
    root.innerHTML = `
      <div class="otp-consent__backdrop" data-dismiss></div>
      <section class="otp-consent__card" role="dialog" aria-modal="true" aria-labelledby="otp-consent-title">
        <p class="otp-consent__label">واتساب</p>
        <h2 id="otp-consent-title">رمز التوثيق</h2>
        <p class="otp-consent__code" dir="ltr">${clean}</p>
        <p class="otp-consent__hint">اضغط موافق لينزل الرمز في مربع التوثيق.</p>
        <button type="button" class="otp-consent__accept" data-accept>موافق</button>
        <button type="button" class="otp-consent__later" data-dismiss>ليس الآن</button>
      </section>
    `;
    document.body.appendChild(root);

    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const onKey = (event) => {
      if (event.key === 'Escape') close('');
      if (event.key === 'Enter') close(clean);
    };
    current = { root, code: clean, promise, resolve, onKey };
    root.querySelector('[data-accept]')?.addEventListener('click', () => close(clean));
    root.querySelectorAll('[data-dismiss]').forEach((el) => {
      el.addEventListener('click', () => close(''));
    });
    document.addEventListener('keydown', onKey);
    root.querySelector('[data-accept]')?.focus();
    return promise;
  }

  const style = document.createElement('style');
  style.textContent = `
    .otp-consent { position: fixed; inset: 0; z-index: 80; display: grid; place-items: end center; }
    .otp-consent__backdrop { position: absolute; inset: 0; background: rgba(18, 28, 24, 0.46); }
    .otp-consent__card {
      position: relative; width: min(100%, 420px); margin: 0 0.8rem 1rem;
      background: #fff; color: #1c2824; border-radius: 18px;
      padding: 1.2rem 1.1rem 1rem; text-align: center;
      box-shadow: 0 18px 50px rgba(18, 28, 24, 0.28);
      font-family: Cairo, sans-serif;
    }
    .otp-consent__label { margin: 0; color: #8a1f1f; font-weight: 700; }
    .otp-consent__card h2 { margin: 0.15rem 0 0.7rem; font-size: 1.25rem; }
    .otp-consent__code {
      margin: 0; font-size: 2rem; font-weight: 800; letter-spacing: 0.28em;
      background: #f6f3ee; border-radius: 12px; padding: 0.7rem 0.4rem;
    }
    .otp-consent__hint { margin: 0.75rem 0 0.9rem; color: #3d4b5c; line-height: 1.7; }
    .otp-consent__accept, .otp-consent__later {
      width: 100%; border: 0; border-radius: 12px; font: inherit; font-weight: 700; cursor: pointer;
    }
    .otp-consent__accept { background: #123524; color: #f7f3ea; min-height: 48px; }
    .otp-consent__later { margin-top: 0.4rem; background: transparent; color: #3d4b5c; min-height: 40px; }
  `;
  document.head.appendChild(style);

  window.AlheefOtpConsent = { ask };
})();
