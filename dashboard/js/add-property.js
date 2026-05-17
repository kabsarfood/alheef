const PROPERTY_TYPES = [
  'أرض', 'فيلا', 'عمارة', 'شقة', 'أرض زراعية', 'استراحة', 'عقار تجاري',
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
});

function renderForm() {
  const content = getPageContent();
  const typesOptions = PROPERTY_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

  if (editId) {
    setTopbarActions('<a href="/dashboard/offers.html" class="btn btn-outline btn-sm">← العودة للعروض</a>');
  }

  content.innerHTML = `
    <form id="property-form" class="card">
      <div class="card__body">
        <section class="form-section">
          <h3 class="form-section__title">معلومات العقار</h3>
          <div class="form-grid">
            <div class="form-group">
              <label>نوع العقار <span class="required">*</span></label>
              <select name="propertyType" id="propertyType" required>
                <option value="">اختر النوع</option>
                ${typesOptions}
              </select>
            </div>
            <div class="form-group">
              <label>مساحة العقار</label>
              <input type="text" name="area" id="area" placeholder="مثال: 450">
              <span class="form-hint">اختياري — بالمتر المربع</span>
            </div>
            <div class="form-group">
              <label>رقم عقد الوساطة</label>
              <input type="text" name="contractNumber" id="contractNumber" placeholder="رقم العقد">
            </div>
            <div class="form-group">
              <label>السعر <span class="required">*</span></label>
              <input type="text" name="price" id="price" placeholder="مثال: 3200000" required dir="ltr">
            </div>
            <div class="form-group full">
              <label>الموقع / اللوكيشن <span class="required">*</span></label>
              <input type="text" name="location" id="location" placeholder="مثال: الرياض — حي النرجس" required>
            </div>
            <div class="form-group full">
              <label>رابط Google Maps</label>
              <input type="url" name="mapsUrl" id="mapsUrl" placeholder="https://maps.google.com/..." dir="ltr">
              <span class="form-hint">اختياري — أو اكتفِ بحقل الموقع النصي</span>
            </div>
            <div class="form-group full">
              <label>تفاصيل العقار</label>
              <textarea name="details" id="details" placeholder="اكتب وصفاً تفصيلياً للعقار..."></textarea>
            </div>
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
        <section class="form-section">
          <h3 class="form-section__title">صور العقار</h3>
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

  document.getElementById('property-form').addEventListener('submit', handleSubmit);
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

async function loadOffer(id) {
  try {
    const offer = await DashboardAPI.getOffer(id);
    document.getElementById('propertyType').value = offer.propertyType || '';
    document.getElementById('area').value = String(offer.area || '').replace(/\s*م²\s*/, '');
    document.getElementById('contractNumber').value = offer.contractNumber || '';
    document.getElementById('price').value = offer.price || '';
    document.getElementById('location').value = offer.location || '';
    document.getElementById('mapsUrl').value = offer.mapsUrl || '';
    document.getElementById('details').value = offer.details || '';
    document.getElementById('status').value = offer.status || 'published';
    imageQueue = (offer.images || []).map((url) => ({ url, isExisting: true }));
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

  const fd = new FormData(e.target);
  fd.append('existingImages', JSON.stringify(
    imageQueue.filter((i) => i.isExisting).map((i) => i.url)
  ));
  imageQueue.filter((i) => i.file).forEach((i) => fd.append('images', i.file));

  try {
    const result = await DashboardAPI.saveOffer(fd, editId);
    showToast(result.message || 'تم الحفظ بنجاح');
    setTimeout(() => { window.location.href = '/dashboard/offers.html'; }, 800);
  } catch (err) {
    showToast(err.message || 'حدث خطأ', 'error');
    btn.disabled = false;
    btn.textContent = editId ? 'حفظ التعديلات' : 'حفظ الإعلان';
  }
}
