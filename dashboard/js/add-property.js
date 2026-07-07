const PROPERTY_TYPES = [
  'أرض', 'فيلا', 'عمارة', 'شقة', 'محل', 'مكتب', 'أرض زراعية', 'استراحة', 'عقار تجاري',
];

const REQUEST_KINDS = ['أرض', 'عمارة', 'فيلا'];
const REQUEST_USAGE = [
  { value: 'residential', label: 'سكني' },
  { value: 'commercial', label: 'تجاري' },
];

let imageQueue = [];
let editId = null;
let dropBound = false;

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  editId = params.get('id');

  await initLayout('add-property', editId ? 'تعديل الإعلان' : 'إضافة إعلان عقاري');
  renderForm();
  bindDropZone();

  if (editId) loadOffer(editId);
  else showCoordsMapHint();
});

async function showCoordsMapHint() {
  try {
    const data = await DashboardAPI.request('/map/coords-warnings');
    if (data?.withoutCoords?.length) {
      const el = document.createElement('div');
      el.className = 'db-banner';
      el.style.marginBottom = '1rem';
      el.innerHTML = `<strong>تنبيه الخريطة</strong><p>${data.withoutCoords.length} إعلاناً منشوراً بدون إحداثيات — لن يظهر على الخريطة.</p>`;
      getPageContent()?.prepend(el);
    }
  } catch { /* ignore */ }
}

function isBuyRequestMode() {
  return document.getElementById('listingType')?.value === 'buy_request';
}

function syncListingMode() {
  const buy = isBuyRequestMode();
  const saleBlock = document.getElementById('sale-fields-block');
  const buyBlock = document.getElementById('buy-request-fields');
  const sectionTitle = document.getElementById('form-section-main-title');
  const priceEl = document.getElementById('price');
  const propertyTypeEl = document.getElementById('propertyType');
  const contractEl = document.getElementById('contractNumber');

  if (saleBlock) saleBlock.hidden = buy;
  if (buyBlock) {
    buyBlock.hidden = !buy;
    if (buy) buyBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (sectionTitle) {
    sectionTitle.textContent = buy ? 'طلب شراء عقار' : 'معلومات العقار';
  }

  if (priceEl) {
    priceEl.required = !buy;
    priceEl.placeholder = buy ? 'اختياري — الميزانية' : 'مثال: 3200000';
  }

  if (propertyTypeEl) propertyTypeEl.required = !buy;
  if (contractEl) contractEl.required = false;

  document.querySelectorAll('[data-buy-only]').forEach((el) => {
    el.required = buy;
    el.disabled = !buy;
  });
  document.querySelectorAll('.data-sale-only').forEach((el) => {
    if (el.id === 'price' || el.id === 'property-description') return;
    el.required = !buy;
    el.disabled = buy;
  });
  document.querySelectorAll('#sale-fields-block input, #sale-fields-block select, #sale-fields-block textarea').forEach((el) => {
    if (el.classList.contains('data-sale-only')) return;
    el.disabled = buy;
  });
  if (propertyTypeEl) propertyTypeEl.disabled = buy;
  if (priceEl) priceEl.disabled = buy;
  const descEl = document.getElementById('property-description');
  if (descEl) descEl.disabled = buy;
}

function renderForm() {
  const content = getPageContent();
  const typesOptions = PROPERTY_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');
  const requestKinds = REQUEST_KINDS.map((t) => `<option value="${t}">${t}</option>`).join('');
  const usageOptions = REQUEST_USAGE.map((u) => `<option value="${u.value}">${u.label}</option>`).join('');

  if (editId) {
    setTopbarActions('<a href="/dashboard/offers.html" class="btn btn-outline btn-sm">← العودة للعروض</a>');
  }

  content.innerHTML = `
    <form id="property-form" class="card">
      <div class="card__body">
        <section class="form-section">
          <h3 class="form-section__title" id="form-section-main-title">معلومات العقار</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>نوع الإعلان <span class="required">*</span></label>
              <select name="listingType" id="listingType" required>
                <option value="sale">بيع</option>
                <option value="rent">إيجار</option>
                <option value="buy_request">طلب شراء</option>
              </select>
            </div>

            <div id="buy-request-fields" class="buy-request-fields full" hidden>
              <p class="form-hint full buy-request-fields__intro">حقول الطلب — يظهر للزوار على الخريطة بدون رقم الجوال (للأدمن فقط).</p>
              <div class="form-grid buy-request-fields__grid">
                <div class="form-group">
                  <label>نوع العقار المطلوب <span class="required">*</span></label>
                  <select name="requestPropertyKind" id="requestPropertyKind" data-buy-only>
                    <option value="">اختر</option>
                    ${requestKinds}
                  </select>
                </div>
                <div class="form-group">
                  <label>تصنيف الطلب <span class="required">*</span></label>
                  <select name="requestUsage" id="requestUsage" data-buy-only>
                    <option value="">اختر</option>
                    ${usageOptions}
                  </select>
                </div>
                <div class="form-group">
                  <label>المساحة المطلوبة (م²) <span class="required">*</span></label>
                  <input type="number" name="area" id="areaBuy" data-buy-only min="1" placeholder="مثال: 500">
                </div>
                <div class="form-group">
                  <label>الميزانية (ر.س)</label>
                  <input type="number" name="budget" id="budget" min="0" placeholder="اختياري" dir="ltr">
                </div>
                <div class="form-group full">
                  <label>تفاصيل الطلب <span class="required">*</span></label>
                  <textarea name="buy_description" id="detailsBuy" data-buy-only rows="4" placeholder="صف احتياجك: الحي المفضل، مواصفات، مدة الشراء..."></textarea>
                </div>
                <div class="form-group full">
                  <label>رقم الجوال (للأدمن فقط) <span class="required">*</span></label>
                  <input type="tel" name="requestPhone" id="requestPhone" data-buy-only placeholder="05xxxxxxxx" dir="ltr">
                  <span class="form-hint">لا يُعرض على الخريطة العامة — يظهر في لوحة التحكم فقط</span>
                </div>
              </div>
            </div>

            <div id="sale-fields-block" class="sale-fields-block full">
              <div class="form-group full">
                <label>عنوان الإعلان <span class="required">*</span></label>
                <input type="text" name="title" id="title" class="data-sale-only" placeholder="مثال: فيلا فاخرة — حي النرجس">
              </div>
              <div class="form-group">
                <label>نوع العقار <span class="required">*</span></label>
                <select name="propertyType" id="propertyType" class="data-sale-only" required>
                  <option value="">اختر النوع</option>
                  ${typesOptions}
                </select>
              </div>
              <div class="form-group">
                <label>مساحة العقار</label>
                <input type="text" name="area" id="area" class="data-sale-only" placeholder="مثال: 450">
                <span class="form-hint">اختياري — بالمتر المربع</span>
              </div>
              <div class="form-group">
                <label>عدد الغرف</label>
                <input type="number" name="bedrooms" id="bedrooms" class="data-sale-only" min="0" placeholder="اختياري">
              </div>
              <div class="form-group">
                <label>رقم الإعلان المرخص</label>
                <input type="text" name="contractNumber" id="contractNumber" class="data-sale-only" placeholder="رقم الترخيص / فال">
              </div>
              <div class="form-group">
                <label>السعر <span class="required">*</span></label>
                <input type="text" name="price" id="price" class="data-sale-only" placeholder="مثال: 3200000" required dir="ltr">
              </div>
              <div class="form-group full">
                <label>وصف العقار</label>
                <textarea name="description" id="property-description" class="data-sale-only" rows="8" placeholder="اكتب وصفاً تفصيلياً للعقار: المساحة، الشارع، القطعة، المخطط، السعر للمتر، رقم الترخيص..."></textarea>
                <span class="form-hint">يظهر للزوار في صفحة الإعلان ونافذة التفاصيل</span>
              </div>
            </div>

            <div class="form-group full">
              <label>الموقع / اللوكيشن <span class="required">*</span></label>
              <input type="text" name="location" id="location" placeholder="مثال: الرياض — حي النرجس" required>
            </div>
            <div class="form-group full">
              <label>رابط Google Maps</label>
              <input type="url" name="mapsUrl" id="mapsUrl" placeholder="https://maps.google.com/..." dir="ltr">
              <span class="form-hint">الصق الرابط لاستخراج الإحداثيات تلقائياً، أو أدخلها يدوياً أدناه</span>
            </div>
            <div class="form-group">
              <label>خط العرض (Latitude)</label>
              <input type="text" name="latitude" id="latitude" placeholder="24.7136" dir="ltr">
            </div>
            <div class="form-group">
              <label>خط الطول (Longitude)</label>
              <input type="text" name="longitude" id="longitude" placeholder="46.6753" dir="ltr">
            </div>
            <p class="form-hint full" style="margin-top:-0.5rem">عند إدخال الإحداثيات يظهر على <a href="/map.html" target="_blank">الخريطة العقارية</a></p>
            <div class="form-group">
              <label>حالة الإعلان</label>
              <select name="status" id="status">
                <option value="published">منشور</option>
                <option value="draft">مسودة</option>
                <option value="archived">مؤرشف</option>
              </select>
            </div>
          </div>
        </section>
        <section class="form-section" id="images-section">
          <h3 class="form-section__title">صور العقار</h3>
          <p class="form-hint" id="images-hint">اختياري لطلب الشراء</p>
          <label class="image-upload" id="image-drop">
            <input type="file" id="image-input" accept="image/jpeg,image/png,image/webp" multiple>
            <div class="image-upload__icon">📷</div>
            <p class="image-upload__text">اسحب الصور هنا أو انقر للاختيار</p>
            <p class="image-upload__hint">حتى 12 صورة — اسحب لإعادة الترتيب</p>
          </label>
          <div class="image-gallery" id="image-gallery"></div>
        </section>
        <div class="form-actions">
          <button type="submit" class="btn btn-gold" id="submit-btn">${editId ? 'حفظ التعديلات' : 'حفظ الإعلان'}</button>
          <a href="/dashboard/offers.html" class="btn btn-outline">إلغاء</a>
        </div>
      </div>
    </form>
  `;

  document.getElementById('listingType').addEventListener('change', syncListingMode);
  syncListingMode();

  document.getElementById('property-form').addEventListener('submit', handleSubmit);
  document.getElementById('mapsUrl')?.addEventListener('change', applyCoordsFromMapsUrl);
  document.getElementById('image-input').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });
  document.getElementById('image-gallery').addEventListener('click', (e) => {
    const btn = e.target.closest('.image-item__remove');
    if (!btn) return;
    const idx = Number(btn.closest('.image-item').dataset.index);
    imageQueue.splice(idx, 1);
    renderGallery();
  });
}

function bindDropZone() {
  if (dropBound) return;
  const drop = document.getElementById('image-drop');
  if (!drop) return setTimeout(bindDropZone, 50);
  dropBound = true;
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });
}

function parseCoordsFromMapsUrl(url) {
  if (!url) return null;
  const at = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (at) return { lat: at[1], lng: at[2] };
  const q = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (q) return { lat: q[1], lng: q[2] };
  const ll = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (ll) return { lat: ll[1], lng: ll[2] };
  return null;
}

function applyCoordsFromMapsUrl() {
  const url = document.getElementById('mapsUrl')?.value?.trim();
  const coords = parseCoordsFromMapsUrl(url);
  if (!coords) return;
  const latEl = document.getElementById('latitude');
  const lngEl = document.getElementById('longitude');
  if (latEl && !latEl.value) latEl.value = coords.lat;
  if (lngEl && !lngEl.value) lngEl.value = coords.lng;
}

function parseFeatures(offer) {
  const f = offer.features;
  if (f && typeof f === 'object' && !Array.isArray(f)) return f;
  return {};
}

async function loadOffer(id) {
  try {
    const offer = await DashboardAPI.getOffer(id);
    const f = parseFeatures(offer);
    const listingEl = document.getElementById('listingType');
    if (listingEl) listingEl.value = offer.listingType || 'sale';
    syncListingMode();

    if (offer.listingType === 'buy_request') {
      document.getElementById('requestPropertyKind').value = offer.requestPropertyKind || f.request_property_kind || offer.propertyType || '';
      document.getElementById('requestUsage').value = offer.requestUsage || f.request_usage || '';
      const areaBuy = document.getElementById('areaBuy');
      if (areaBuy) areaBuy.value = offer.area != null ? offer.area : '';
      document.getElementById('budget').value = offer.price != null ? offer.price : '';
      document.getElementById('detailsBuy').value = offer.description || '';
      document.getElementById('requestPhone').value = offer.requestPhone || f.request_phone || '';
      const titleEl = document.getElementById('title');
      if (titleEl) titleEl.value = offer.title || '';
    } else {
      const titleEl = document.getElementById('title');
      if (titleEl) titleEl.value = offer.title || '';
      document.getElementById('propertyType').value = offer.propertyType || '';
      document.getElementById('area').value = offer.area != null ? String(offer.area) : '';
      const bedEl = document.getElementById('bedrooms');
      if (bedEl) bedEl.value = offer.bedrooms != null ? offer.bedrooms : '';
      document.getElementById('contractNumber').value = offer.contractNumber || '';
      document.getElementById('price').value = offer.price != null ? offer.price : '';
      document.getElementById('property-description').value = offer.description || offer.details || '';
    }

    document.getElementById('location').value = offer.location || [offer.city, offer.district].filter(Boolean).join(' — ');
    document.getElementById('mapsUrl').value = offer.mapsUrl || '';
    const latEl = document.getElementById('latitude');
    const lngEl = document.getElementById('longitude');
    if (latEl) latEl.value = offer.latitude != null ? offer.latitude : '';
    if (lngEl) lngEl.value = offer.longitude != null ? offer.longitude : '';
    document.getElementById('status').value = offer.status || 'published';
    const urls = offer.gallery?.length ? offer.gallery : (offer.images || []).map((i) => (typeof i === 'string' ? i : i.url));
    imageQueue = urls.filter(Boolean).map((url) => ({ url, isExisting: true }));
    renderGallery();
  } catch {
    showToast('تعذر تحميل الإعلان', 'error');
  }
}

function addFiles(fileList) {
  Array.from(fileList).forEach((file) => {
    if (!file.type.startsWith('image/')) return;
    if (imageQueue.length >= 12) {
      showToast('الحد الأقصى 12 صورة', 'error');
      return;
    }
    imageQueue.push({ file, url: URL.createObjectURL(file), isExisting: false });
  });
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById('image-gallery');
  if (!gallery) return;

  gallery.innerHTML = imageQueue.map((item, i) => `
    <div class="image-item" data-index="${i}" draggable="true">
      <img src="${item.url}" alt="">
      <span class="image-item__order">${i + 1}</span>
      <button type="button" class="image-item__remove" aria-label="حذف">×</button>
    </div>
  `).join('');

  let dragIndex = null;
  gallery.querySelectorAll('.image-item').forEach((el) => {
    el.addEventListener('dragstart', () => {
      dragIndex = Number(el.dataset.index);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIndex = Number(el.dataset.index);
      if (dragIndex === null || dragIndex === dropIndex) return;
      const [moved] = imageQueue.splice(dragIndex, 1);
      imageQueue.splice(dropIndex, 0, moved);
      renderGallery();
    });
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  const buy = isBuyRequestMode();
  const fd = new FormData(e.target);
  const location = fd.get('location') || '';
  const parts = location.split('—').map((s) => s.trim());
  fd.set('city', parts[0] || location);
  fd.set('district', parts[1] || '');
  fd.set('listingType', fd.get('listingType') || 'sale');

  if (buy) {
    const kind = document.getElementById('requestPropertyKind')?.value || '';
    const usage = document.getElementById('requestUsage')?.value || '';
    const area = document.getElementById('areaBuy')?.value || '';
    const budget = document.getElementById('budget')?.value || '';
    const details = document.getElementById('detailsBuy')?.value || '';
    const phone = document.getElementById('requestPhone')?.value || '';

    if (!kind || !usage || !area || !details || !phone) {
      showToast('أكمل حقول طلب الشراء المطلوبة', 'error');
      btn.disabled = false;
      btn.textContent = editId ? 'حفظ التعديلات' : 'حفظ الإعلان';
      return;
    }

    const usageLabel = REQUEST_USAGE.find((u) => u.value === usage)?.label || usage;
    fd.set('requestPropertyKind', kind);
    fd.set('requestUsage', usage);
    fd.set('propertyType', kind);
    fd.set('area', area);
    fd.set('description', (document.getElementById('detailsBuy')?.value || '').trim());
    fd.delete('buy_description');
    fd.set('requestPhone', phone);
    if (budget) fd.set('price', budget);
    else fd.delete('price');
    fd.set('title', `طلب شراء ${kind} ${usageLabel} — ${location}`);
    fd.delete('bedrooms');
    fd.delete('contractNumber');
  } else {
    if (!fd.get('title')) fd.set('title', `${fd.get('propertyType')} — ${location}`);
    const desc = (document.getElementById('property-description')?.value || '').trim();
    fd.set('description', desc);
    fd.delete('details');
    fd.delete('buy_description');
    if (!fd.get('price')) {
      showToast('السعر مطلوب لإعلانات البيع والإيجار', 'error');
      btn.disabled = false;
      btn.textContent = editId ? 'حفظ التعديلات' : 'حفظ الإعلان';
      return;
    }
  }

  fd.set('mapsUrl', fd.get('mapsUrl') || '');
  if (!fd.get('latitude') || !fd.get('longitude')) applyCoordsFromMapsUrl();
  const latEl = document.getElementById('latitude');
  const lngEl = document.getElementById('longitude');
  if (latEl?.value) fd.set('latitude', String(latEl.value).trim());
  if (lngEl?.value) fd.set('longitude', String(lngEl.value).trim());

  const lat = fd.get('latitude');
  const lng = fd.get('longitude');
  const status = fd.get('status') || 'published';
  if (status === 'published' && (!lat || !lng)) {
    showToast('لن يظهر على الخريطة بدون خط العرض والطول — أضف الإحداثيات أو رابط خرائط Google', 'error');
    btn.disabled = false;
    btn.textContent = editId ? 'حفظ التعديلات' : 'حفظ الإعلان';
    return;
  }

  if (fd.get('bedrooms') === '') fd.delete('bedrooms');
  fd.append('existingImages', JSON.stringify(
    imageQueue.filter((i) => i.isExisting).map((i) => i.url)
  ));
  imageQueue.filter((i) => i.file).forEach((i) => fd.append('images', i.file));

  try {
    const result = await DashboardAPI.saveOffer(fd, editId);
    let msg = result.message || 'تم الحفظ بنجاح';
    if (buy) msg = 'تم حفظ طلب الشراء — الجوال للأدمن فقط';
    if (status === 'published' && lat && lng) msg += ' — سيظهر على الخريطة العقارية';
    else if (status === 'published') msg += ' — لم يُضف للخريطة (بدون إحداثيات)';
    showToast(msg);
    setTimeout(() => { window.location.href = '/dashboard/offers.html'; }, 800);
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    btn.disabled = false;
    btn.textContent = editId ? 'حفظ التعديلات' : 'حفظ الإعلان';
  }
}
