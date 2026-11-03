const TYPES = ['أرض سكنية', 'أرض تجارية', 'أرض زراعية', 'فيلا', 'عمارة', 'شقة', 'دور', 'دوبلكس', 'استراحة', 'عقار تجاري', 'مزرعة', 'محل', 'مكتب'];
const files = [];
let review = null;

function field(label, name, value, kind) {
  const input = kind === 'select-type'
    ? `<select data-field="${name}"><option value="">حدد نوع العقار</option>${TYPES.map((item) => `<option ${item === value ? 'selected' : ''}>${item}</option>`).join('')}</select>`
    : kind === 'select-listing'
      ? `<select data-field="${name}"><option value="">حدد العملية</option><option value="sale" ${value === 'sale' ? 'selected' : ''}>بيع</option><option value="rent" ${value === 'rent' ? 'selected' : ''}>إيجار</option></select>`
      : `<input data-field="${name}" value="${escapeHtml(value ?? '')}">`;
  return `<label class="map-ad__card"><span>${label}</span>${input}</label>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPhotos() {
  const box = document.getElementById('map-ad-photos');
  box.innerHTML = files.map((file, index) => `
    <div class="map-ad__photo">
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
  review = data;
  const box = document.getElementById('map-ad-review');
  box.hidden = false;
  box.innerHTML = `
    <div class="map-ad__grid">
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
    <p class="map-ad__card">${escapeHtml(data.originalText || '')}</p>
    ${data.needsLocation ? '<p class="map-ad__note">تعذر تحديد الموقع من الرابط. صحح الرابط أو أدخل خط العرض وخط الطول.</p><div class="map-ad__grid"><label class="map-ad__card"><span>خط العرض</span><input id="map-ad-lat" inputmode="decimal"></label><label class="map-ad__card"><span>خط الطول</span><input id="map-ad-lng" inputmode="decimal"></label></div>' : `<p>الموقع: ${escapeHtml(data.latitude)} ، ${escapeHtml(data.longitude)}</p>`}
    ${(data.missing || []).length ? '<p class="map-ad__note">أكمل الحقول الناقصة فقط ثم ارفع الإعلان.</p>' : ''}
  `;
}

async function analyze() {
  const message = document.getElementById('map-ad-message');
  message.textContent = 'جارٍ تحليل الإعلان…';
  const data = await DashboardAPI.request('/map-ads/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: document.getElementById('map-ad-text').value,
      mapsUrl: document.getElementById('map-ad-maps').value,
    }),
  });
  message.textContent = '';
  renderReview(data);
}

async function publish() {
  const message = document.getElementById('map-ad-message');
  const form = new FormData();
  form.set('text', document.getElementById('map-ad-text').value);
  form.set('mapsUrl', document.getElementById('map-ad-maps').value);
  form.set('sourcePhone', document.getElementById('map-ad-phone').value);
  form.set('edits', JSON.stringify(readEdits()));
  const lat = document.getElementById('map-ad-lat');
  const lng = document.getElementById('map-ad-lng');
  if (lat) form.set('latitude', lat.value);
  if (lng) form.set('longitude', lng.value);
  files.forEach((file) => form.append('images', file.file, file.file.name));
  message.textContent = 'جارٍ حفظ الإعلان…';
  const draft = await DashboardAPI.request('/map-ads/draft', { method: 'POST', body: form });
  if (draft.property?.status === 'published' || draft.alreadyPublished) {
    showDone(draft.property);
    return;
  }
  const otp = await DashboardAPI.request(`/map-ads/${draft.property.id}/otp`, { method: 'POST', body: '{}' });
  if (otp.alreadyPublished) {
    showDone(otp);
    return;
  }
  document.getElementById('map-ad-otp').hidden = false;
  document.getElementById('map-ad-otp').dataset.id = draft.property.id;
  document.getElementById('map-ad-otp').dataset.challenge = otp.challengeId;
  message.textContent = 'أُرسل رمز التوثيق إلى واتساب المدير. الإعلان لن يُنشر قبل الرمز.';
}

async function verify() {
  const box = document.getElementById('map-ad-otp');
  const data = await DashboardAPI.request(`/map-ads/${box.dataset.id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: box.dataset.challenge, code: document.getElementById('map-ad-code').value }),
  });
  showDone(data);
}

function showDone(data) {
  const done = document.getElementById('map-ad-done');
  done.hidden = false;
  const url = data.mapUrl || (data.slug ? `/property.html?slug=${encodeURIComponent(data.slug)}` : '/private-offers');
  done.innerHTML = `<p>تم نشر الإعلان على الخريطة.</p><a class="btn btn-primary" href="${url}">عرض العقار على الخريطة</a>`;
  document.getElementById('map-ad-message').textContent = '';
}

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('map-ad', 'إضافة إعلان');
  const page = document.querySelector('.page') || document.getElementById('app');
  const host = document.createElement('div');
  host.className = 'map-ad';
  host.innerHTML = `
    <section class="map-ad__box">
      <h2>+ إضافة إعلان</h2>
      <label>صور العقار<input id="map-ad-files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
      <div class="map-ad__photos" id="map-ad-photos"></div>
      <label>تفاصيل الإعلان<textarea id="map-ad-text" placeholder="الصق نص الإعلان كما هو"></textarea></label>
      <label>رقم جوال المعلن أو مصدر العرض<input id="map-ad-phone" inputmode="tel" placeholder="05xxxxxxxx" dir="ltr"></label>
      <label>رابط موقع العقار<input id="map-ad-maps" placeholder="رابط خرائط جوجل" dir="ltr"></label>
      <div class="map-ad__actions">
        <button type="button" class="btn btn-outline" id="map-ad-analyze">تحليل الإعلان</button>
        <button type="button" class="btn btn-primary" id="map-ad-publish">رفع الإعلان</button>
      </div>
      <p id="map-ad-message"></p>
    </section>
    <section id="map-ad-review" hidden></section>
    <section class="map-ad__box" id="map-ad-otp" hidden>
      <h3>توثيق رفع الإعلان</h3>
      <p>اكتب الرمز الذي وصل على واتساب المدير. لا يظهر الرمز في الموقع.</p>
      <input id="map-ad-code" inputmode="numeric" maxlength="6" dir="ltr" placeholder="رمز التحقق">
      <button type="button" class="btn btn-primary" id="map-ad-verify">توثيق ونشر</button>
    </section>
    <section class="map-ad__box" id="map-ad-done" hidden></section>
  `;
  const content = document.querySelector('.content') || page;
  content.appendChild(host);
  document.getElementById('map-ad-files').addEventListener('change', (event) => {
    [...event.target.files].forEach((file) => files.push({ file, url: URL.createObjectURL(file) }));
    event.target.value = '';
    renderPhotos();
  });
  document.getElementById('map-ad-photos').addEventListener('click', (event) => {
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
  document.getElementById('map-ad-analyze').addEventListener('click', () => analyze().catch((err) => {
    document.getElementById('map-ad-message').textContent = err.message;
  }));
  document.getElementById('map-ad-publish').addEventListener('click', () => publish().catch((err) => {
    document.getElementById('map-ad-message').textContent = err.message;
  }));
  document.getElementById('map-ad-verify').addEventListener('click', () => verify().catch((err) => {
    document.getElementById('map-ad-message').textContent = err.message;
  }));
});
