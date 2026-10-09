(function () {
  const TYPES = [
    { id: 'all', label: 'جميع العروض' },
    { id: 'land', label: 'أرض' },
    { id: 'villa', label: 'فيلا' },
    { id: 'apartment', label: 'شقة' },
    { id: 'building', label: 'عمارة' },
    { id: 'farm', label: 'مزرعة' },
  ];

  function selectedTypes(root) {
    return Array.from(root.querySelectorAll('[data-alert-type].is-on')).map((btn) => btn.dataset.alertType);
  }

  function paint(root, id) {
    const buttons = Array.from(root.querySelectorAll('[data-alert-type]'));
    const current = buttons.find((btn) => btn.dataset.alertType === id);
    if (!current) return;
    const turningOn = !current.classList.contains('is-on');
    if (id === 'all') {
      buttons.forEach((btn) => btn.classList.toggle('is-on', btn.dataset.alertType === 'all' && turningOn));
      return;
    }
    buttons.forEach((btn) => {
      if (btn.dataset.alertType === 'all') btn.classList.remove('is-on');
    });
    current.classList.toggle('is-on', turningOn);
  }

  async function subscribe(types) {
    if (!window.AlheefPWA || typeof window.AlheefPWA.subscribePush !== 'function') return;
    await window.AlheefPWA.subscribePush({
      offersEnabled: true,
      preferences: { alertTypes: types },
    });
  }

  function offer() {
    return new Promise((resolve) => {
      if (document.getElementById('alheef-logout-alerts')) {
        resolve();
        return;
      }
      const wrap = document.createElement('div');
      wrap.id = 'alheef-logout-alerts';
      wrap.innerHTML = `
        <style>
          #alheef-logout-alerts { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 1rem; background: rgba(18, 28, 24, .45); }
          #alheef-logout-alerts .box { width: min(100%, 440px); background: #fff; color: #1E2A38; border-radius: 18px; padding: 1.3rem 1.1rem 1.1rem; font-family: Cairo, sans-serif; text-align: center; }
          #alheef-logout-alerts h2 { margin: 0 0 .4rem; font-size: 1.25rem; }
          #alheef-logout-alerts p { margin: 0 0 .9rem; line-height: 1.7; }
          #alheef-logout-alerts .types { display: flex; flex-wrap: wrap; gap: .45rem; justify-content: center; margin-bottom: .9rem; }
          #alheef-logout-alerts .types button { border: 1px solid #e4ddd2; background: #fff; border-radius: 999px; padding: .45rem .8rem; font: inherit; cursor: pointer; }
          #alheef-logout-alerts .types button.is-on { background: #1E2A38; color: #fff; border-color: #1E2A38; }
          #alheef-logout-alerts .actions { display: grid; gap: .45rem; }
          #alheef-logout-alerts .actions button { border: 0; border-radius: 12px; padding: .75rem; font: inherit; font-weight: 700; cursor: pointer; }
          #alheef-logout-alerts .go { background: #1E2A38; color: #fff; }
          #alheef-logout-alerts .skip { background: transparent; color: #1E2A38; }
          #alheef-logout-alerts .note { min-height: 1.2em; color: #8a1f1f; margin: 0 0 .4rem; }
        </style>
        <div class="box" role="dialog" aria-modal="true" aria-labelledby="alheef-logout-title">
          <h2 id="alheef-logout-title">إشعارات الإعلانات</h2>
          <p>هل تريد إشعارات الإعلانات الجديدة في موقع الهيف؟ اختر ما يصلك ثم اخرج.</p>
          <div class="types">
            ${TYPES.map((item) => `<button type="button" data-alert-type="${item.id}">${item.label}</button>`).join('')}
          </div>
          <p class="note" data-note></p>
          <div class="actions">
            <button type="button" class="go" data-accept>أوافق وأخرج</button>
            <button type="button" class="skip" data-skip>خروج بدون إشعارات</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const note = wrap.querySelector('[data-note]');
      wrap.querySelectorAll('[data-alert-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          paint(wrap, btn.dataset.alertType);
        });
      });
      const finish = () => {
        wrap.remove();
        resolve();
      };
      wrap.querySelector('[data-skip]').addEventListener('click', finish);
      wrap.querySelector('[data-accept]').addEventListener('click', async () => {
        const types = selectedTypes(wrap);
        if (!types.length) {
          note.textContent = 'اختر نوعًا واحدًا على الأقل، أو اخرج بدون إشعارات.';
          return;
        }
        note.textContent = '';
        try {
          await subscribe(types);
        } catch {
          note.textContent = 'تعذر تفعيل الإشعار. سيتم الخروج.';
        }
        finish();
      });
    });
  }

  window.AlheefLogoutAlerts = { offer };
})();
