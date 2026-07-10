const PROPERTY_TYPES = [
  { value: 'land', label: 'أرض' },
  { value: 'villa', label: 'فيلا' },
  { value: 'apartment', label: 'شقة' },
  { value: 'building', label: 'عمارة' },
  { value: 'investment', label: 'استثماري' },
  { value: 'other', label: 'غير ذلك' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'متاح' },
  { value: 'reserved', label: 'محجوز' },
  { value: 'sold', label: 'مباع' },
  { value: 'hidden', label: 'مخفي' },
];

let accessInfo = null;
let offersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('private-offers', 'العروض الخاصة');
  setTopbarActions('<button class="btn btn-gold btn-sm" id="btn-add">＋ عرض خاص جديد</button>');
  renderShell();
  await Promise.all([loadAccess(), loadOffers()]);
  document.getElementById('btn-add')?.addEventListener('click', () => openOfferModal());
});

function renderShell() {
  getPageContent().innerHTML = `
    <section class="card" id="access-panel">
      <div class="card__body">
        <h3>رابط المشاركة ورمز الدخول</h3>
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </section>
    <section class="card" style="margin-top:1rem">
      <div class="card__body">
        <h3>قائمة العروض الخاصة</h3>
        <div id="offers-list"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </section>
  `;
}

async function loadAccess() {
  const el = document.getElementById('access-panel')?.querySelector('.card__body');
  if (!el) return;
  try {
    const data = await DashboardAPI.getPrivateOffersAccess();
    accessInfo = data.access;
    const codeDisplay = document.getElementById('access-code-display')?.value || '••••••••';
    el.innerHTML = `
      <h3>رابط المشاركة ورمز الدخول</h3>
      <p class="text-muted">شارك الرابط مع العميل المهتم — لن يظهر في الموقع العام. الرابط مشفّر ولا يكشف نوع الصفحة.</p>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <label>رابط الصفحة الخاصة</label>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <input id="share-url" value="${accessInfo.shareUrl}" readonly dir="ltr" style="flex:1;min-width:200px">
            <button type="button" class="btn btn-outline btn-sm" id="btn-copy-url">نسخ الرابط</button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-copy-both">نسخ الرابط + الرمز</button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-regen-slug">رابط جديد</button>
          </div>
        </div>
        <div class="form-group">
          <label>رمز الدخول</label>
          <input id="access-code-input" placeholder="أدخل رمزًا جديدًا أو أنشئه تلقائيًا">
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end;gap:.5rem;flex-wrap:wrap">
          <button type="button" class="btn btn-gold btn-sm" id="btn-save-code">حفظ الرمز</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-regen-code">إنشاء رمز عشوائي</button>
        </div>
        <div class="form-group">
          <label>حالة الصفحة</label>
          <label><input type="checkbox" id="access-active" ${accessInfo.active ? 'checked' : ''}> الصفحة مفعّلة</label>
        </div>
      </div>
      <p id="generated-code-hint" class="text-muted" style="margin-top:.75rem">${accessInfo.hasCode ? 'كل رابط جديد يُنشئ رمز دخول جديدًا مرتبطًا به — انسخهما معًا' : 'اضغط «رابط جديد» لإنشاء رابط ورمز مرتبطين'}</p>
    `;

    document.getElementById('btn-copy-url')?.addEventListener('click', () => {
      navigator.clipboard.writeText(accessInfo.shareUrl).then(() => showToast('تم نسخ الرابط'));
    });
    document.getElementById('btn-copy-both')?.addEventListener('click', () => {
      const code = document.getElementById('access-code-input')?.value.trim();
      if (!code) return showToast('لا يوجد رمز دخول — أنشئ رمزًا أولاً', 'error');
      const text = `رابط العروض الخاصة:\n${accessInfo.shareUrl}\n\nرمز الدخول:\n${code}`;
      navigator.clipboard.writeText(text).then(() => showToast('تم نسخ الرابط والرمز'));
    });
    document.getElementById('btn-regen-slug')?.addEventListener('click', async () => {
      if (!confirm('سيتوقف الرابط والرمز القديمان. سيتم إنشاء رابط ورمز جديدين مرتبطين. هل تريد المتابعة؟')) return;
      const r = await DashboardAPI.regeneratePrivateSlug();
      accessInfo.shareUrl = r.shareUrl;
      accessInfo.pageSlug = r.pageSlug;
      accessInfo.hasCode = true;
      document.getElementById('share-url').value = r.shareUrl;
      if (r.accessCode) {
        document.getElementById('access-code-input').value = r.accessCode;
        document.getElementById('generated-code-hint').textContent =
          `رابط ورمز جديدان — انسخهما معًا وشاركهما مع العميل. الرمز: ${r.accessCode}`;
      }
      showToast('تم إنشاء رابط ورمز جديدين');
    });
    document.getElementById('btn-save-code')?.addEventListener('click', async () => {
      const code = document.getElementById('access-code-input').value.trim();
      if (!code) return showToast('أدخل رمز الدخول', 'error');
      await DashboardAPI.updatePrivateAccessCode(code);
      document.getElementById('generated-code-hint').textContent = `الرمز المحفوظ: ${code}`;
      showToast('تم حفظ رمز الدخول');
    });
    document.getElementById('btn-regen-code')?.addEventListener('click', async () => {
      if (accessInfo.hasCode && !confirm('سيتوقف الرمز القديم عن العمل فورًا. هل تريد إنشاء رمز جديد؟')) return;
      const r = await DashboardAPI.regeneratePrivateAccessCode();
      accessInfo.hasCode = true;
      document.getElementById('access-code-input').value = r.accessCode;
      document.getElementById('generated-code-hint').textContent = `الرمز الجديد: ${r.accessCode} — انسخه وشاركه مع العميل`;
      showToast('تم إنشاء رمز جديد');
    });
    document.getElementById('access-active')?.addEventListener('change', async (e) => {
      await DashboardAPI.setPrivateAccessActive(e.target.checked);
      showToast(e.target.checked ? 'تم تفعيل الصفحة' : 'تم إيقاف الصفحة');
    });
  } catch {
    el.innerHTML = '<p class="empty-state">تعذر تحميل إعدادات الرابط</p>';
  }
}

async function loadOffers() {
  const el = document.getElementById('offers-list');
  if (!el) return;
  try {
    offersCache = await DashboardAPI.getPrivateOffers();
    if (!offersCache.length) {
      el.innerHTML = '<p class="empty-state">لا توجد عروض خاصة بعد</p>';
      return;
    }
    el.innerHTML = `<div class="offers-grid">${offersCache.map(renderOfferCard).join('')}</div>`;
    el.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openOfferModal(btn.dataset.edit));
    });
    el.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => removeOffer(btn.dataset.del));
    });
  } catch {
    el.innerHTML = '<p class="empty-state">تعذر تحميل العروض</p>';
  }
}

function typeLabel(v) {
  return PROPERTY_TYPES.find((t) => t.value === v)?.label || v;
}

function statusLabel(v) {
  return STATUS_OPTIONS.find((s) => s.value === v)?.label || v;
}

function renderOfferCard(o) {
  const img = o.coverImage || (o.gallery && o.gallery[0]) || '';
  return `
    <article class="offer-card">
      ${img ? `<img src="${img}" alt="" style="width:100%;height:140px;object-fit:cover">` : '<div style="height:140px;background:#eee"></div>'}
      <div class="offer-card__body">
        <h3>${o.offerNumber}</h3>
        <p>${typeLabel(o.propertyType)} — ${statusLabel(o.status)}</p>
        <p>${o.price != null ? Number(o.price).toLocaleString('ar-SA') + ' ر.س' : '—'}</p>
        <p>${o.active && o.visible ? 'ظاهر للعميل' : 'مخفي / معطّل'}</p>
        <button class="btn btn-outline btn-sm" data-edit="${o.id}">تعديل</button>
        <button class="btn btn-outline btn-sm" data-del="${o.id}">حذف</button>
      </div>
    </article>
  `;
}

function openOfferModal(id) {
  const existing = id ? offersCache.find((o) => o.id === id) : null;
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="card" style="max-width:640px;margin:2rem auto;position:relative;z-index:2;max-height:90vh;overflow:auto">
      <form id="offer-form">
        <h3>${id ? 'تعديل عرض خاص' : 'عرض خاص جديد'}</h3>
        ${existing ? `<p><strong>رقم العرض:</strong> ${existing.offerNumber}</p>` : ''}
        <div class="form-grid">
          <div class="form-group">
            <label>نوع العقار *</label>
            <select name="propertyType" required>
              ${PROPERTY_TYPES.map((t) => `<option value="${t.value}" ${existing?.propertyType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>المساحة (م²)</label>
            <input name="area" type="number" step="0.01" value="${existing?.area ?? ''}">
          </div>
          <div class="form-group">
            <label>الشارع</label>
            <input name="street" value="${existing?.street || ''}">
          </div>
          <div class="form-group">
            <label>رقم القطعة</label>
            <input name="plotNumber" value="${existing?.plotNumber || ''}">
          </div>
          <div class="form-group">
            <label>رقم المخطط</label>
            <input name="planNumber" value="${existing?.planNumber || ''}">
          </div>
          <div class="form-group">
            <label>السعر (ر.س)</label>
            <input name="price" type="number" step="0.01" value="${existing?.price ?? ''}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>الموقع / اللوكيشن</label>
            <input name="location" value="${existing?.location || ''}" placeholder="رابط خرائط أو وصف الموقع">
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="showLocation" value="true" ${existing?.showLocation !== false ? 'checked' : ''}> إظهار الموقع للعميل</label>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>وصف مختصر</label>
            <textarea name="shortDescription" rows="3">${existing?.shortDescription || ''}</textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>صور العقار ${id ? '(اختياري — تُضاف للمعرض)' : '*'}</label>
            <input type="file" name="images" accept="image/*" multiple ${id ? '' : 'required'}>
          </div>
          <div class="form-group">
            <label>حالة العرض</label>
            <select name="status">
              ${STATUS_OPTIONS.map((s) => `<option value="${s.value}" ${existing?.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>الترتيب</label>
            <input name="sortOrder" type="number" value="${existing?.sortOrder ?? 0}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>ملاحظات داخلية (لا تظهر للعميل)</label>
            <textarea name="internalNotes" rows="2">${existing?.internalNotes || ''}</textarea>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="visible" value="true" ${existing?.visible !== false ? 'checked' : ''}> ظاهر في صفحة العميل</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="active" value="true" ${existing?.active !== false ? 'checked' : ''}> مفعّل</label>
          </div>
        </div>
        ${existing?.gallery?.length ? `<p class="text-muted">الصور الحالية: ${existing.gallery.length}</p>` : ''}
        <input type="hidden" name="gallery" value='${existing?.gallery ? JSON.stringify(existing.gallery) : '[]'}'>
        <div class="form-actions"><button type="submit" class="btn btn-gold">حفظ</button></div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.modal__backdrop').onclick = () => wrap.remove();
  wrap.querySelector('#offer-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('showLocation')) fd.append('showLocation', 'false');
    if (!fd.get('visible')) fd.append('visible', 'false');
    if (!fd.get('active')) fd.append('active', 'false');
    try {
      await DashboardAPI.savePrivateOffer(fd, id);
      showToast('تم الحفظ');
      wrap.remove();
      loadOffers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function removeOffer(id) {
  if (!confirm('حذف هذا العرض؟')) return;
  await DashboardAPI.deletePrivateOffer(id);
  showToast('تم الحذف');
  loadOffers();
}
