const PROPERTY_TYPES = [
  { value: 'land', label: 'أرض' },
  { value: 'villa', label: 'فيلا' },
  { value: 'apartment', label: 'شقة' },
  { value: 'building', label: 'عمارة' },
  { value: 'farm', label: 'مزرعة' },
  { value: 'investment', label: 'استثماري' },
  { value: 'other', label: 'غير ذلك' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'متاح' },
  { value: 'reserved', label: 'محجوز' },
  { value: 'sold', label: 'مباع' },
  { value: 'hidden', label: 'مخفي' },
];

let settingsInfo = { active: true };
let clientsCache = [];
let offersCache = [];
const clientPlainCodes = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('po-admin-page');
  await initLayout('private-offers', 'العروض الخاصة');
  setTopbarActions(`
    <div class="po-topbar-actions">
      <button type="button" class="btn btn-outline btn-sm" id="btn-add-client">
        <span class="po-btn-label po-btn-label--desktop">＋ عميل جديد</span>
        <span class="po-btn-label po-btn-label--mobile">عميل جديد</span>
      </button>
      <button type="button" class="btn btn-gold btn-sm" id="btn-add">
        <span class="po-btn-label po-btn-label--desktop">＋ عرض خاص جديد</span>
        <span class="po-btn-label po-btn-label--mobile">عرض جديد</span>
      </button>
    </div>
  `);
  renderShell();
  await Promise.all([loadClientsPanel(), loadOffers()]);
  document.getElementById('btn-add')?.addEventListener('click', () => openOfferModal());
  document.getElementById('btn-add-client')?.addEventListener('click', () => openAddClientModal());
});

function renderShell() {
  getPageContent().innerHTML = `
    <section class="card po-panel" id="clients-panel">
      <div class="card__body">
        <div class="po-section-head">
          <h3>عملاء العروض الخاصة</h3>
          <p class="text-muted po-page-intro">رابط مستقل وكلمة سر لكل عميل</p>
        </div>
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </section>
    <section class="card po-panel" id="offers-panel">
      <div class="card__body">
        <div class="po-section-head">
          <h3>قائمة العروض الخاصة</h3>
        </div>
        <div id="offers-list"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </section>
  `;
}

function formatVisitDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

async function loadClientsPanel() {
  const el = document.getElementById('clients-panel')?.querySelector('.card__body');
  if (!el) return;
  try {
    const data = await DashboardAPI.getPrivateOffersSettings();
    settingsInfo = data.settings || { active: true };
    clientsCache = await DashboardAPI.getPrivateClients();
    const summary = data.summary || {};

    el.innerHTML = `
      <div class="po-section-head">
        <h3>عملاء العروض الخاصة</h3>
        <p class="text-muted po-page-intro">كل عميل يحصل على <strong>رابط مستقل</strong> و<strong>رمز دخول خاص</strong>.</p>
      </div>
      ${!settingsInfo.active ? `
        <div class="access-warning">
          <strong>⚠ صفحة العروض الخاصة موقوفة</strong>
          <p>لن يتمكن أي عميل من الدخول حتى التفعيل.</p>
        </div>
      ` : ''}
      <div class="form-group" style="margin:.75rem 0">
        <label><input type="checkbox" id="global-active" ${settingsInfo.active ? 'checked' : ''}> تفعيل صفحة العروض الخاصة (عام)</label>
      </div>
      <div class="stats-grid po-stats">
        <div class="stat-card"><p class="stat-card__label">عملاء</p><p class="stat-card__value">${summary.totalClients || 0}</p></div>
        <div class="stat-card"><p class="stat-card__label">نشطون</p><p class="stat-card__value">${summary.activeClients || 0}</p></div>
        <div class="stat-card"><p class="stat-card__label">مرات الدخول</p><p class="stat-card__value">${summary.totalLogins || 0}</p></div>
      </div>
      <div id="clients-list"></div>
    `;

    document.getElementById('global-active')?.addEventListener('change', async (e) => {
      await DashboardAPI.setPrivateGlobalActive(e.target.checked);
      settingsInfo.active = e.target.checked;
      showToast(e.target.checked ? 'تم تفعيل الصفحة' : 'تم إيقاف الصفحة');
    });

    renderClientsList();
  } catch {
    el.innerHTML = '<p class="empty-state">تعذر تحميل بيانات العملاء</p>';
  }
}

function renderClientsList() {
  const list = document.getElementById('clients-list');
  if (!list) return;
  if (!clientsCache.length) {
    list.innerHTML = '<p class="empty-state">لا يوجد عملاء بعد — اضغط «عميل جديد» لإنشاء رابط ورمز</p>';
    return;
  }

  list.innerHTML = `
    <div class="po-clients-grid">
      ${clientsCache.map((c) => `
        <article class="po-client-card" data-client="${c.id}">
          <div class="po-client-card__head">
            <div class="po-client-card__name">
              <label>اسم العميل</label>
              <input class="client-label-input" data-id="${c.id}" value="${escapeHtml(c.clientLabel || '')}" placeholder="اسم العميل">
            </div>
            <span class="po-client-card__badge ${c.active ? 'po-client-card__badge--active' : 'po-client-card__badge--inactive'}">
              ${c.active ? 'نشط' : 'موقوف'}
            </span>
          </div>
          <div class="po-client-card__url">
            <label>رابط الدخول</label>
            <div class="po-client-card__url-row">
              <input readonly value="${escapeHtml(c.shareUrl)}" dir="ltr" aria-label="رابط العميل">
            </div>
          </div>
          <p class="po-client-card__meta">
            <strong>${c.loginCount || 0}</strong> مرة دخول
            ${c.lastVisitAt ? ` — آخر زيارة: ${formatVisitDate(c.lastVisitAt)}` : ''}
          </p>
          <div class="po-client-card__actions">
            <button type="button" class="btn btn-gold btn-sm" data-copy="${c.id}">نسخ الرابط والرمز</button>
            <button type="button" class="btn btn-outline btn-sm" data-regen="${c.id}">رابط جديد</button>
            <button type="button" class="btn btn-outline btn-sm" data-toggle="${c.id}">${c.active ? 'إيقاف' : 'تفعيل'}</button>
          </div>
        </article>
      `).join('')}
    </div>
  `;

  list.querySelectorAll('.client-label-input').forEach((input) => {
    input.addEventListener('change', async () => {
      await DashboardAPI.updatePrivateClientLabel(input.dataset.id, input.value.trim());
      showToast('تم تحديث اسم العميل');
    });
  });

  list.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyClientCredentials(btn.dataset.copy));
  });

  list.querySelectorAll('[data-regen]').forEach((btn) => {
    btn.addEventListener('click', () => regenerateClient(btn.dataset.regen));
  });

  list.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleClient(btn.dataset.toggle));
  });
}

async function copyClientCredentials(id) {
  const client = clientsCache.find((c) => c.id === id);
  if (!client) return;
  const code = clientPlainCodes.get(id);
  const text = code
    ? `رابط العروض الخاصة:\n${client.shareUrl}\n\nرمز الدخول:\n${code}`
    : client.shareUrl;
  await navigator.clipboard.writeText(text);
  showToast(code ? 'تم نسخ الرابط والرمز' : 'تم نسخ الرابط — الرمز يظهر عند الإنشاء أو «رابط جديد»');
}

async function regenerateClient(id) {
  if (!confirm('سيتوقف الرابط والرمز القديمان لهذا العميل. هل تريد إنشاء رابط ورمز جديدين؟')) return;
  const r = await DashboardAPI.regeneratePrivateClient(id);
  const idx = clientsCache.findIndex((c) => c.id === id);
  if (idx >= 0) {
    clientsCache[idx] = { ...r.client, shareUrl: r.client.shareUrl };
  }
  renderClientsList();
  if (r.accessCode) {
    clientPlainCodes.set(id, r.accessCode);
    const client = clientsCache.find((c) => c.id === id);
    showClientSuccessModal(client, r.accessCode);
  } else {
    showToast('تم إنشاء رابط ورمز جديدين');
  }
}

async function toggleClient(id) {
  const client = clientsCache.find((c) => c.id === id);
  if (!client) return;
  const r = await DashboardAPI.setPrivateClientActive(id, !client.active);
  const idx = clientsCache.findIndex((c) => c.id === id);
  if (idx >= 0) clientsCache[idx] = { ...r.client, shareUrl: r.client.shareUrl };
  renderClientsList();
  showToast(r.client.active ? 'تم تفعيل رابط العميل' : 'تم إيقاف رابط العميل');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openAddClientModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box modal__box--po" role="dialog" aria-labelledby="po-client-modal-title">
      <div class="modal__header">
        <h3 class="modal__title" id="po-client-modal-title">عميل جديد</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <p class="po-modal-hint">
        أدخل اسم العميل للتذكير فقط. سيتم إنشاء <strong>رابط مستقل</strong> و<strong>رمز دخول خاص</strong> لا يشاركه مع أي عميل آخر.
      </p>
      <form id="client-form" class="po-modal-form">
        <div class="form-group">
          <label for="client-label-input">اسم العميل</label>
          <input id="client-label-input" name="clientLabel" placeholder="مثال: أحمد — عميل VIP" required autocomplete="off">
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" data-close>إلغاء</button>
          <button type="submit" class="btn btn-gold">إنشاء الرابط والرمز</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  wrap.querySelector('#client-label-input')?.focus();

  wrap.querySelector('#client-form').onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = wrap.querySelector('[type="submit"]');
    const label = new FormData(e.target).get('clientLabel');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإنشاء…';
    try {
      const r = await DashboardAPI.createPrivateClient(String(label || '').trim());
      clientsCache.unshift({ ...r.client, shareUrl: r.client.shareUrl });
      if (r.accessCode) clientPlainCodes.set(r.client.id, r.accessCode);
      renderClientsList();
      showClientSuccessModal(r.client, r.accessCode);
      wrap.remove();
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إنشاء الرابط والرمز';
      showToast(err.message, 'error');
    }
  };
}

function showClientSuccessModal(client, accessCode) {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box modal__box--po" role="dialog">
      <div class="modal__header">
        <h3 class="modal__title">تم إنشاء العميل</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <div class="po-success-panel">
        <div class="po-success-panel__icon" aria-hidden="true">✓</div>
        <p class="po-modal-hint" style="margin:0;text-align:center">
          انسخ الرابط والرمز وأرسلهما للعميل <strong>${escapeHtml(client.clientLabel || '')}</strong>
        </p>
        <div class="po-credential-box">
          <label>رابط العروض الخاصة</label>
          <input readonly dir="ltr" value="${escapeHtml(client.shareUrl)}" id="po-success-url">
        </div>
        <div class="po-credential-box">
          <label>رمز الدخول</label>
          <div class="po-credential-value po-credential-value--code" id="po-success-code">${escapeHtml(accessCode || '—')}</div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-gold" id="po-copy-both">نسخ الرابط والرمز</button>
          <button type="button" class="btn btn-outline" data-close>تم</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  wrap.querySelector('#po-copy-both')?.addEventListener('click', async () => {
    const text = `رابط العروض الخاصة:\n${client.shareUrl}\n\nرمز الدخول:\n${accessCode || ''}`;
    await navigator.clipboard.writeText(text);
    showToast('تم نسخ الرابط والرمز');
  });
  if (accessCode) {
    navigator.clipboard.writeText(
      `رابط العروض الخاصة:\n${client.shareUrl}\n\nرمز الدخول:\n${accessCode}`,
    ).catch(() => {});
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
    <article class="offer-card po-offer-card">
      ${img
        ? `<div class="offer-card__img"><img src="${escapeHtml(img)}" alt=""></div>`
        : '<div class="offer-card__img offer-card__img--empty" aria-hidden="true"></div>'}
      <div class="offer-card__body">
        <p class="offer-card__type">${escapeHtml(typeLabel(o.propertyType))}</p>
        <h3 class="offer-card__title">${escapeHtml(o.offerNumber)}</h3>
        <p class="offer-card__meta">${escapeHtml(statusLabel(o.status))} · ${o.active && o.visible ? 'ظاهر للعميل' : 'مخفي'}</p>
        <p class="offer-card__price">${o.price != null ? Number(o.price).toLocaleString('ar-SA') + ' ر.س' : '—'}</p>
        <div class="offer-card__footer">
          <div class="offer-card__actions">
            <button type="button" class="btn btn-outline btn-sm" data-edit="${o.id}">تعديل</button>
            <button type="button" class="btn btn-outline btn-sm" data-del="${o.id}">حذف</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function openOfferModal(id) {
  const existing = id ? offersCache.find((o) => o.id === id) : null;
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box modal__box--po-offer" role="dialog">
      <div class="modal__header">
        <h3 class="modal__title">${id ? 'تعديل عرض خاص' : 'عرض خاص جديد'}</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <form id="offer-form">
        ${existing ? `<p class="text-muted" style="margin-bottom:1rem"><strong>رقم العرض:</strong> ${existing.offerNumber}</p>` : ''}
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
            <input name="location" value="${existing?.location || ''}" placeholder="مثال: التقاطع السادس — أو سطر ثانٍ برابط الخريطة">
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="showLocation" value="true" ${existing?.showLocation !== false ? 'checked' : ''}> إظهار الموقع للعميل</label>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>وصف مختصر</label>
            <textarea name="shortDescription" rows="3" placeholder="السطر الأول: اسم الحي (مثل المهدية) — باقي الأسطر: وصف إضافي">${existing?.shortDescription || ''}</textarea>
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
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
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
