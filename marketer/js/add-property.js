const PROPERTY_TYPES = ['فيلا', 'شقة', 'أرض', 'عمارة', 'محل', 'مكتب', 'عقار تجاري', 'استراحة', 'دوبلكس'];

(async function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const editId = params.get('id');

  MapsUrlField.configure({
    parseEndpoint: '/api/map/parse-coords',
    authHeaders: () => MarketerAuth.authHeaders(),
    mapPageUrl: '/map.html',
  });

  await initMarketerLayout('add-property', editId ? 'تعديل إعلان' : 'إضافة إعلان جديد');
  const root = getMarketerContent();
  if (!root) return;

  const typesOptions = PROPERTY_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

  root.innerHTML = `
    <form id="marketer-property-form" class="card" enctype="multipart/form-data">
      <div class="card__body">
        <p class="form-hint full">يُرسل الإعلان لمراجعة إدارة المكتب — لا يُنشر مباشرة على الموقع العام.</p>
        <div class="form-grid">
          <div class="form-group">
            <label>نوع العقار *</label>
            <select name="propertyType" required><option value="">اختر</option>${typesOptions}</select>
          </div>
          <div class="form-group">
            <label>الغرض *</label>
            <select name="listingType" required><option value="sale">بيع</option><option value="rent">إيجار</option></select>
          </div>
          <div class="form-group">
            <label>المدينة *</label>
            <input type="text" name="city" required placeholder="الرياض">
          </div>
          <div class="form-group">
            <label>الحي *</label>
            <input type="text" name="district" required>
          </div>
          <div class="form-group">
            <label>المساحة (م²)</label>
            <input type="text" name="area" placeholder="450">
          </div>
          <div class="form-group">
            <label>السعر (ر.س) *</label>
            <input type="text" name="price" required dir="ltr">
          </div>
          <div class="form-group">
            <label>الشارع</label>
            <input type="text" name="street">
          </div>
          <div class="form-group">
            <label>الواجهة</label>
            <input type="text" name="facade" placeholder="شمالية / جنوبية">
          </div>
          <div class="form-group full">
            <label>عنوان الإعلان *</label>
            <input type="text" name="title" required>
          </div>
          <div class="form-group full">
            <label>وصف العقار *</label>
            <textarea name="description" rows="8" required placeholder="اكتب تفاصيل العقار كاملة…"></textarea>
          </div>
          ${MapsUrlField.fieldHtml({ required: true })}
          <div class="form-group">
            <label>رقم ترخيص الإعلان العقاري *</label>
            <input type="text" name="licenseNumber" required>
          </div>
          <div class="form-group">
            <label>تاريخ انتهاء الترخيص *</label>
            <input type="date" name="licenseExpiresAt" required>
          </div>
          <div class="form-group">
            <label>رقم عقد الوساطة</label>
            <input type="text" name="brokerageContractNo">
          </div>
          <div class="form-group full">
            <label>ملاحظات داخلية (للإدارة فقط)</label>
            <textarea name="internalNotes" rows="3"></textarea>
          </div>
          <div class="form-group full">
            <label>صور العقار</label>
            <input type="file" name="images" accept="image/*" multiple>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="submit-btn">${editId ? 'حفظ وإرسال للمراجعة' : 'إرسال للمراجعة'}</button>
          <a href="/marketer/properties.html" class="btn btn-outline">إلغاء</a>
        </div>
      </div>
    </form>
  `;

  MapsUrlField.bind();

  if (editId) {
    try {
      const { property: p } = await MarketerAPI.getProperty(editId);
      const f = document.getElementById('marketer-property-form');
      f.propertyType.value = p.propertyType || '';
      f.listingType.value = p.listingType || 'sale';
      f.city.value = p.city || '';
      f.district.value = p.district || '';
      f.area.value = p.area != null ? p.area : '';
      f.price.value = p.price != null ? p.price : '';
      f.street.value = p.street || '';
      f.facade.value = p.facade || '';
      f.title.value = p.title || '';
      f.description.value = p.description || '';
      f.licenseNumber.value = p.contractNumber || '';
      f.licenseExpiresAt.value = p.licenseExpiresAt ? String(p.licenseExpiresAt).slice(0, 10) : '';
      f.brokerageContractNo.value = p.brokerageContractNo || '';
      f.internalNotes.value = p.internalNotes || '';
      await MapsUrlField.loadFromOffer(p);
    } catch {
      showToast('تعذر تحميل الإعلان', 'error');
    }
  }

  document.getElementById('marketer-property-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'جاري التحقق من الرابط...';

    const fd = new FormData(e.target);
    fd.set('location', `${fd.get('city')} — ${fd.get('district')}`);

    const mapsResult = await MapsUrlField.applyToFormData(fd, { validate: true });
    if (!mapsResult.ok) {
      showToast(mapsResult.message, 'error');
      btn.disabled = false;
      btn.textContent = editId ? 'حفظ وإرسال للمراجعة' : 'إرسال للمراجعة';
      return;
    }

    btn.textContent = editId ? 'جاري الحفظ...' : 'جاري الإرسال...';
    try {
      await MarketerAPI.saveProperty(fd, editId);
      showToast('تم إرسال الإعلان لمراجعة إدارة المكتب');
      setTimeout(() => { window.location.href = '/marketer/properties.html'; }, 900);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = editId ? 'حفظ وإرسال للمراجعة' : 'إرسال للمراجعة';
    }
  });
})();
