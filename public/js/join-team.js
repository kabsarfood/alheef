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

  function showMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `form-message show ${type}`;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function hideMsg(el) {
    if (!el) return;
    el.textContent = '';
    el.className = 'form-message';
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

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
      if (!btn) return;

      hideMsg(msg);
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'جاري الإرسال...';

      const fd = new FormData(form);
      const body = {
        fullName: String(fd.get('fullName') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        nationalId: String(fd.get('nationalId') || '').trim(),
        falLicense: String(fd.get('falLicense') || '').trim(),
        marketingZone: fd.get('marketingZone'),
        password: String(fd.get('password') || ''),
        confirmPassword: String(fd.get('confirmPassword') || ''),
      };

      if (!body.fullName || !body.phone || !body.email || !body.nationalId || !body.falLicense || !body.marketingZone) {
        showMsg(msg, 'يرجى تعبئة جميع الحقول المطلوبة', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      if (!isValidEmail(body.email)) {
        showMsg(msg, 'أدخل بريداً إلكترونياً صالحاً', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      if (body.password.length < 6) {
        showMsg(msg, 'كلمة المرور 6 أحرف على الأقل', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      if (body.password !== body.confirmPassword) {
        showMsg(msg, 'كلمتا المرور غير متطابقتين', 'error');
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }

      try {
        const res = await fetch('/api/marketer/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        let data = {};
        try { data = await res.json(); } catch { /* ignore */ }

        if (!res.ok) {
          throw new Error(data.message || 'تعذر إرسال الطلب — حاول لاحقاً');
        }

        showMsg(msg, data.message || 'تم استلام طلبك، وسيتم مراجعته من إدارة مكتب الهيف.', 'success');
        form.reset();
        if (zoneSelect) {
          zoneSelect.innerHTML = '<option value="">اختر نطاق التسويق</option>'
            + ZONES.map((z) => `<option value="${z.value}">${z.label}</option>`).join('');
        }
        setTimeout(closeModal, 2800);
      } catch (err) {
        showMsg(msg, err.message || 'حدث خطأ — تحقق من الاتصال وحاول مرة أخرى', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
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
