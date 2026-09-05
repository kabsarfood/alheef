(function () {
  const TOKEN = readToken();
  const card = document.getElementById('review-card');
  const loading = document.getElementById('review-loading');
  let selectedRating = 0;

  if (!TOKEN) {
    showMessage('invalid', 'الرابط غير صالح', 'تعذر فتح صفحة التقييم. تواصل مع مكتب الهيف إذا احتجت مساعدة.');
    return;
  }

  document.body.classList.add('ejar-review-page--ready');
  init();

  function readToken() {
    const fromPath = (location.pathname.match(/\/ejar\/review\/([A-Za-z0-9_-]+)/) || [])[1] || '';
    if (fromPath) return fromPath;
    const params = new URLSearchParams(location.search);
    return String(params.get('t') || params.get('token') || '').trim();
  }

  function focusReview() {
    window.scrollTo(0, 0);
    const target = document.getElementById('ejar-rating-section') || card;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const firstStar = document.querySelector('.ejar-star');
    if (firstStar && typeof firstStar.focus === 'function') {
      setTimeout(() => firstStar.focus(), 80);
    }
  }

  async function init() {
    try {
      const res = await fetch(`/api/ejar/review/${encodeURIComponent(TOKEN)}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.state === 'active') {
        renderForm(data.city || '');
        focusReview();
        return;
      }
      if (data.state === 'used') {
        showMessage('success', 'شكرًا لك', data.message || 'تم تسجيل تقييمك مسبقًا.');
        return;
      }
      if (data.state === 'expired') {
        showMessage('expired', 'انتهت صلاحية الرابط', data.message);
        return;
      }
      showMessage('invalid', 'الرابط غير صالح', data.message || 'تعذر فتح صفحة التقييم.');
    } catch {
      showMessage('invalid', 'خطأ', 'تعذر تحميل الصفحة. حاول مرة أخرى أو افتح الرابط في المتصفح.');
    }
  }

  function showMessage(kind, title, text) {
    loading?.remove();
    card.hidden = false;
    card.innerHTML = `
      <div class="ejar-review-state ejar-review-state--${kind}">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(text)}</p>
        <a href="/ejar" class="btn btn-primary">العودة لصفحة عقود الإيجار</a>
      </div>
    `;
    window.scrollTo(0, 0);
  }

  function renderForm(defaultCity) {
    loading?.remove();
    card.hidden = false;
    card.innerHTML = `
      <header class="ejar-review-card__head">
        <p class="ejar-review-kicker">تقييم الخدمة</p>
        <h1>قيّم تجربتك مع خدمة عقود الإيجار</h1>
        <p>اختر النجوم أولًا، ثم أرسل التقييم ليظهر في صفحة العقود داخل المنصة.</p>
      </header>
      <form id="review-form" class="ejar-review-form" novalidate>
        <input type="text" name="website" class="ejar-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="form-group ejar-review-form__rating" id="ejar-rating-section">
          <label>التقييم</label>
          <div class="ejar-stars" id="stars" role="radiogroup" aria-label="اختر عدد النجوم">
            ${[5, 4, 3, 2, 1].map((n) => `<button type="button" class="ejar-star" data-value="${n}" aria-label="${n} نجوم">★</button>`).join('')}
          </div>
          <p class="form-hint" id="rating-hint">اضغط على النجوم من 1 إلى 5</p>
        </div>
        <div class="form-group">
          <label for="comment">تعليقك (اختياري)</label>
          <textarea id="comment" name="comment" rows="4" maxlength="1000" placeholder="شاركنا تجربتك مع خدمة عقود الإيجار"></textarea>
        </div>
        <div class="form-group">
          <label for="display-type">الظهور بالاسم</label>
          <select id="display-type" name="displayNameType">
            <option value="anonymous">بدون اسم (عميل)</option>
            <option value="first">الاسم الأول فقط</option>
            <option value="city">عميل من المدينة</option>
          </select>
        </div>
        <div class="form-group" id="name-wrap" hidden>
          <label for="display-name">الاسم الأول</label>
          <input type="text" id="display-name" name="displayName" maxlength="80">
        </div>
        <div class="form-group">
          <label for="city">المدينة (اختياري)</label>
          <input type="text" id="city" name="city" maxlength="60" value="${escapeAttr(defaultCity)}">
        </div>
        <label class="ejar-consent">
          <input type="checkbox" id="publish-consent" name="publishConsent" checked>
          <span>أوافق على نشر تقييمي في صفحة عقود الإيجار</span>
        </label>
        <button type="submit" class="btn btn-primary" id="submit-btn">إرسال التقييم</button>
        <p class="form-error" id="form-error" hidden></p>
      </form>
    `;

    const stars = card.querySelectorAll('.ejar-star');
    stars.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedRating = parseInt(btn.dataset.value, 10);
        stars.forEach((s) => s.classList.toggle('is-active', parseInt(s.dataset.value, 10) <= selectedRating));
        document.getElementById('rating-hint').textContent = `اخترت ${selectedRating} ${selectedRating === 1 ? 'نجمة' : 'نجوم'}`;
      });
    });

    document.getElementById('display-type').addEventListener('change', (e) => {
      const showName = e.target.value === 'first';
      document.getElementById('name-wrap').hidden = !showName;
    });

    document.getElementById('review-form').addEventListener('submit', submitForm);
  }

  async function submitForm(e) {
    e.preventDefault();
    const errEl = document.getElementById('form-error');
    errEl.hidden = true;
    if (!selectedRating) {
      errEl.textContent = 'يرجى اختيار تقييم من 1 إلى 5 نجوم';
      errEl.hidden = false;
      document.getElementById('ejar-rating-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'جاري الإرسال…';

    const body = {
      rating: selectedRating,
      comment: document.getElementById('comment').value,
      displayNameType: document.getElementById('display-type').value,
      displayName: document.getElementById('display-name').value,
      city: document.getElementById('city').value,
      publishConsent: document.getElementById('publish-consent').checked,
      website: document.querySelector('[name="website"]').value,
    };

    try {
      const res = await fetch(`/api/ejar/review/${encodeURIComponent(TOKEN)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.state === 'used') {
          showMessage('success', 'شكرًا لك', data.message);
          return;
        }
        throw new Error(data.message || 'تعذر إرسال التقييم');
      }
      showMessage('success', 'شكرًا لتقييمك', 'تم استلام تقييمك وسيظهر في صفحة العقود داخل المنصة.');
    } catch (err) {
      errEl.textContent = err.message || 'تعذر إرسال التقييم';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'إرسال التقييم';
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
})();
