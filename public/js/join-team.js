/**
 * انضمام فريق المسوقين — نموذج عام
 */
(function () {
  'use strict';

  const ZONES = [
    { value: 'west_riyadh', label: 'تسويق غرب الرياض' },
    { value: 'north_riyadh', label: 'تسويق شمال الرياض' },
    { value: 'south_riyadh', label: 'تسويق جنوب الرياض' },
    { value: 'east_riyadh', label: 'تسويق شرق الرياض' },
    { value: 'center_riyadh', label: 'تسويق وسط الرياض' },
  ];

  function init() {
    const openBtns = [
      document.getElementById('join-team-btn'),
      document.getElementById('join-team-btn-hero'),
    ].filter(Boolean);
    const modal = document.getElementById('join-team-modal');
    const form = document.getElementById('join-team-form');
    const closeBtns = modal?.querySelectorAll('[data-close-join]');
    const zoneSelect = document.getElementById('join-zone');

    if (zoneSelect) {
      zoneSelect.innerHTML = '<option value="">اختر نطاق التسويق</option>'
        + ZONES.map((z) => `<option value="${z.value}">${z.label}</option>`).join('');
    }

    openBtns.forEach((btn) => btn.addEventListener('click', (e) => {
      e.preventDefault();
      modal?.classList.add('active');
      modal?.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      window.AlheefNav?.close?.();
    }));

    closeBtns?.forEach((btn) => btn.addEventListener('click', closeModal));
    modal?.querySelector('.modal__backdrop')?.addEventListener('click', closeModal);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('join-team-message');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      if (msg) { msg.textContent = ''; msg.className = 'form-message'; }

      const fd = new FormData(form);
      const body = {
        fullName: fd.get('fullName'),
        phone: fd.get('phone'),
        nationalId: fd.get('nationalId'),
        falLicense: fd.get('falLicense'),
        marketingZone: fd.get('marketingZone'),
      };

      try {
        const res = await fetch('/api/marketer/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'تعذر الإرسال');
        if (msg) {
          msg.textContent = data.message || 'تم استلام طلبك، وسيتم مراجعته من إدارة مكتب الهيف.';
          msg.className = 'form-message success';
        }
        form.reset();
        setTimeout(closeModal, 2800);
      } catch (err) {
        if (msg) {
          msg.textContent = err.message || 'حدث خطأ';
          msg.className = 'form-message error';
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function closeModal() {
    const modal = document.getElementById('join-team-modal');
    modal?.classList.remove('active');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
