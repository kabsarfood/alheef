(function () {
  'use strict';

  const TYPES = ['أرض سكنية', 'أرض تجارية', 'أرض زراعية', 'فيلا', 'عمارة', 'شقة', 'دور', 'دوبلكس', 'استراحة', 'عقار تجاري', 'مزرعة', 'محل', 'مكتب'];
  const files = [];

  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function field(label, name, value, kind) {
    const input = kind === 'select-type'
      ? `<select data-field="${name}"><option value="">حدد نوع العقار</option>${TYPES.map((item) => `<option ${item === value ? 'selected' : ''}>${item}</option>`).join('')}</select>`
      : kind === 'select-listing'
        ? `<select data-field="${name}"><option value="">حدد العملية</option><option value="sale" ${value === 'sale' ? 'selected' : ''}>بيع</option><option value="rent" ${value === 'rent' ? 'selected' : ''}>إيجار</option></select>`
        : `<input data-field="${name}" value="${escapeHtml(value ?? '')}">`;
    return `<label class="add-ad__card"><span>${label}</span>${input}</label>`;
  }

  function message(text) {
    const box = document.getElementById('add-ad-message');
    if (box) box.textContent = text || '';
  }

  async function request(path, options) {
    const res = await fetch(`/api/map-ads${path}`, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'تعذر إكمال الطلب');
    return data;
  }

  function renderPhotos() {
    const box = document.getElementById('add-ad-photos');
    box.innerHTML = files.map((file, index) => `
      <div class="add-ad__photo">
        <img src="${file.url}" alt="">
        <button type="button" data-move="${index}" aria-label="تقديم">↑</button>
        <button type="button" data-remove="${index}" aria-label="حذف">×</button>
      </div>`).join('');
  }

  function readEdits() {
    const edits = {};
    document.querySelectorAll('[data-field]').forEach((input) => {
      edits[input.dataset.field] = input.value;
    });
    return edits;
  }

  function renderReview(data) {
    const box = document.getElementById('add-ad-review');
    box.hidden = false;
    box.innerHTML = `
      <h2>راجع البيانات قبل الرفع</h2>
      <div class="add-ad__grid">
        ${field('نوع العملية', 'listingType', data.listingType, 'select-listing')}
        ${field('نوع العقار', 'propertyType', data.propertyType, 'select-type')}
        ${field('المدينة', 'city', data.city)}
        ${field('الحي', 'district', data.district)}
        ${field('المساحة', 'area', data.area)}
        ${field('السعر', 'price', data.price ?? '')}
        ${field('سعر المتر', 'pricePerMeter', data.pricePerMeter ?? '')}
        ${field('حالة السعر', 'priceType', data.priceType)}
        ${field('المخطط', 'planNumber', data.planNumber)}
        ${field('القطعة', 'plotNumber', data.plotNumber)}
        ${field('الواجهة', 'facade', data.facade)}
        ${field('الغرف', 'bedrooms', data.bedrooms)}
        ${field('الأدوار', 'floors', data.floors)}
      </div>
      <p class="add-ad__card">${escapeHtml(data.originalText || '')}</p>
      ${data.needsLocation
        ? '<p class="add-ad__note">تعذر تحديد الموقع من الرابط. صحح الرابط أو أدخل خط العرض وخط الطول.</p><div class="add-ad__grid"><label class="add-ad__card"><span>خط العرض</span><input id="add-ad-lat" inputmode="decimal" dir="ltr"></label><label class="add-ad__card"><span>خط الطول</span><input id="add-ad-lng" inputmode="decimal" dir="ltr"></label></div>'
        : `<p>الموقع: ${escapeHtml(data.latitude)} ، ${escapeHtml(data.longitude)}</p>`}
      ${(data.missing || []).length ? '<p class="add-ad__note">أكمل الحقول الناقصة ثم ارفع الإعلان.</p>' : ''}
    `;
  }

  async function analyze() {
    message('جارٍ تحليل الإعلان…');
    const data = await request('/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: document.getElementById('add-ad-text').value,
        mapsUrl: document.getElementById('add-ad-maps').value,
      }),
    });
    message('');
    renderReview(data);
  }

  function showDone(data) {
    const done = document.getElementById('add-ad-done');
    done.hidden = false;
    const url = data.mapUrl || (data.slug ? `/property.html?slug=${encodeURIComponent(data.slug)}` : '/map');
    done.innerHTML = `<p>تم نشر الإعلان.</p><a class="btn btn-primary" href="${url}">عرض العقار</a>`;
    message('');
  }

  async function publish() {
    const form = new FormData();
    form.set('text', document.getElementById('add-ad-text').value);
    form.set('mapsUrl', document.getElementById('add-ad-maps').value);
    form.set('sourcePhone', document.getElementById('add-ad-phone').value);
    form.set('verifyPhone', document.getElementById('add-ad-owner-phone').value);
    form.set('edits', JSON.stringify(readEdits()));
    const lat = document.getElementById('add-ad-lat');
    const lng = document.getElementById('add-ad-lng');
    if (lat) form.set('latitude', lat.value);
    if (lng) form.set('longitude', lng.value);
    files.forEach((file) => form.append('images', file.file, file.file.name));
    message('جارٍ حفظ الإعلان…');
    const draft = await request('/draft', { method: 'POST', body: form });
    if (draft.property?.status === 'published' || draft.alreadyPublished) {
      showDone(draft.property || draft);
      return;
    }
    const otp = await request(`/${draft.property.id}/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: document.getElementById('add-ad-owner-phone').value }),
    });
    if (otp.alreadyPublished) {
      showDone(otp);
      return;
    }
    const box = document.getElementById('add-ad-otp');
    box.hidden = false;
    box.dataset.id = draft.property.id;
    box.dataset.challenge = otp.challengeId;
    message('أُرسل رمز التوثيق إلى واتساب جوال التوثيق. الإعلان يُنشر بعد إدخال الرمز.');
    document.getElementById('add-ad-code').focus();
  }

  async function verify() {
    const box = document.getElementById('add-ad-otp');
    message('جارٍ التحقق من الرمز…');
    const data = await request(`/${box.dataset.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: box.dataset.challenge,
        code: document.getElementById('add-ad-code').value,
      }),
    });
    showDone(data);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('add-ad-files').addEventListener('change', (event) => {
      [...event.target.files].forEach((file) => files.push({ file, url: URL.createObjectURL(file) }));
      event.target.value = '';
      renderPhotos();
    });
    document.getElementById('add-ad-photos').addEventListener('click', (event) => {
      const move = event.target.closest('[data-move]');
      if (move) {
        const index = Number(move.dataset.move);
        if (index > 0) {
          const [item] = files.splice(index, 1);
          files.splice(index - 1, 0, item);
          renderPhotos();
        }
        return;
      }
      const button = event.target.closest('[data-remove]');
      if (!button) return;
      const index = Number(button.dataset.remove);
      const [removed] = files.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      renderPhotos();
    });
    document.getElementById('add-ad-analyze').addEventListener('click', () => analyze().catch((err) => message(err.message)));
    document.getElementById('add-ad-publish').addEventListener('click', () => publish().catch((err) => message(err.message)));
    document.getElementById('add-ad-verify').addEventListener('click', () => verify().catch((err) => message(err.message)));
  });
})();
