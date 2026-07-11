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
  await initLayout('private-offers', 'العروض الخاصة');
  setTopbarActions(`
    <button class="btn btn-outline btn-sm" id="btn-add-client">＋ عميل جديد</button>
    <button class="btn btn-gold btn-sm" id="btn-add">＋ عرض خاص جديد</button>
  `);
  renderShell();
  await Promise.all([loadClientsPanel(), loadOffers()]);
  document.getElementById('btn-add')?.addEventListener('click', () => openOfferModal());
  document.getElementById('btn-add-client')?.addEventListener('click', () => openAddClientModal());
});

function renderShell() {
  getPageContent().innerHTML = `
    <section class="card" id="clients-panel">
      <div class="card__body">
        <h3>عملاء العروض الخاصة — رابط وكلمة سر لكل عميل</h3>
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
      <h3>عملاء العروض الخاصة — رابط وكلمة سر لكل عميل</h3>
      <p class="text-muted">كل عميل يطلب العروض يحصل على <strong>رابط مستقل</strong> و<strong>رمز دخول خاص</strong> — لا علاقة بين العملاء.</p>
      ${!settingsInfo.active ? `
        <div class="access-warning">
          <strong>⚠ صفحة العروض الخاصة موقوفة</strong>
          <p>لن يتمكن أي عميل من الدخول حتى التفعيل.</p>
        </div>
      ` : ''}
      <div class="form-group" style="margin:.75rem 0">
        <label><input type="checkbox" id="global-active" ${settingsInfo.active ? 'checked' : ''}> تفعيل صفحة العروض الخاصة (عام)</label>
      </div>
      <div class="stats-grid" style="margin-bottom:1rem">
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
    <div class="table-wrap">
      <table class="table table--cards">
        <thead>
          <tr>
            <th>العميل</th>
            <th>الرابط</th>
            <th>الدخول</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${clientsCache.map((c) => `
            <tr data-client="${c.id}">
              <td data-label="العميل">
                <input class="client-label-input" data-id="${c.id}" value="${c.clientLabel || ''}" style="min-width:120px">
              </td>
              <td data-label="الرابط" dir="ltr">
                <input readonly value="${c.shareUrl}" style="min-width:200px;font-size:.85rem" data-url="${c.id}">
              </td>
              <td data-label="الدخول">${c.loginCount || 0} — آخر: ${formatVisitDate(c.lastVisitAt)}</td>
              <td data-label="الحالة">${c.active ? 'نشط' : 'موقوف'}</td>
              <td data-label="إجراءات">
                <button type="button" class="btn btn-outline btn-sm" data-copy="${c.id}">نسخ</button>
                <button type="button" class="btn btn-outline btn-sm" data-regen="${c.id}">رابط جديد</button>
                <button type="button" class="btn btn-outline btn-sm" data-toggle="${c.id}">${c.active ? 'إيقاف' : 'تفعيل'}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
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
    const text = `رابط العروض الخاصة:\n${client.shareUrl}\n\nرمز الدخول:\n${r.accessCode}`;
    await navigator.clipboard.writeText(text);
    showToast(`تم إنشاء رابط ورمز جديدين — الرمز: ${r.accessCode}`);
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

function openAddClientModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="card" style="max-width:480px;margin:2rem auto;position:relative;z-index:2">
      <form id="client-form">
        <h3>عميل جديد — رابط ورمز مستقل</h3>
        <div class="form-group">
          <label>اسم العميل (للتذكير فقط)</label>
          <input name="clientLabel" placeholder="مثال: أحمد — عميل VIP" required>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-gold">إنشاء الرابط والرمز</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.modal__backdrop').onclick = () => wrap.remove();
  wrap.querySelector('#client-form').onsubmit = async (e) => {
    e.preventDefault();
    const label = new FormData(e.target).get('clientLabel');
    try {
      const r = await DashboardAPI.createPrivateClient(String(label || '').trim());
      clientsCache.unshift({ ...r.client, shareUrl: r.client.shareUrl });
      wrap.remove();
      renderClientsList();
      if (r.accessCode) {
        clientPlainCodes.set(r.client.id, r.accessCode);
        const text = `رابط العروض الخاصة:\n${r.client.shareUrl}\n\nرمز الدخول:\n${r.accessCode}`;
        await navigator.clipboard.writeText(text);
        showToast(`تم الإنشاء — الرمز: ${r.accessCode} (تم النسخ)`);
      } else {
        showToast('تم إنشاء العميل');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
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
