const PROPERTY_TYPES = [
  { value: 'land', label: 'أرض' },
  { value: 'villa', label: 'فيلا' },
  { value: 'apartment', label: 'شقة' },
  { value: 'building', label: 'عمارة' },
  { value: 'farm', label: 'مزرعة' },
  { value: 'investment', label: 'استثماري' },
  { value: 'other', label: 'غير ذلك' },
];

const LISTING_TYPES = [
  { value: 'sale', label: 'بيع' },
  { value: 'rent', label: 'إيجار' },
];

const CLIENT_REQUEST_TYPES = [
  { value: 'buy', label: 'شراء' },
  { value: 'rent', label: 'إيجار' },
];

const CLIENT_PROPERTY_KINDS = [
  { value: 'land', label: 'أرض' },
  { value: 'villa', label: 'فيلا' },
  { value: 'building', label: 'عمارة' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'متاح' },
  { value: 'reserved', label: 'محجوز' },
  { value: 'sold', label: 'مباع' },
  { value: 'rented', label: 'مؤجر' },
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

function clientRequestLabel(v) {
  return CLIENT_REQUEST_TYPES.find((t) => t.value === v)?.label || 'شراء';
}

function clientPropertyKindLabel(v) {
  return CLIENT_PROPERTY_KINDS.find((t) => t.value === v)?.label || 'أرض';
}

function formatClientArea(area) {
  if (area == null || area === '') return '—';
  return `${Number(area).toLocaleString('ar-SA')} م²`;
}

function optionHtml(list, selected) {
  return list.map((t) => `<option value="${t.value}" ${selected === t.value ? 'selected' : ''}>${t.label}</option>`).join('');
}

function renderClientsList() {
  const list = document.getElementById('clients-list');
  if (!list) return;
  if (!clientsCache.length) {
    list.innerHTML = '<p class="empty-state">لا يوجد عملاء بعد — اضغط «عميل جديد» لإنشاء رابط ورمز</p>';
    return;
  }

  list.innerHTML = `
    <div class="po-clients-list">
      ${clientsCache.map((c) => `
        <details class="po-client-accordion" data-client="${c.id}">
          <summary class="po-client-accordion__summary">
            <div class="po-client-accordion__summary-main">
              <strong class="po-client-accordion__name">${escapeHtml(c.clientLabel || 'عميل')}</strong>
              <span class="po-client-accordion__phone" dir="ltr">${escapeHtml(c.phone || 'بدون رقم')}</span>
            </div>
            <div class="po-client-accordion__summary-meta">
              <span class="po-client-pill po-client-pill--${c.requestType === 'rent' ? 'rent' : 'buy'}">${escapeHtml(clientRequestLabel(c.requestType))}</span>
              <span class="po-client-pill">${escapeHtml(clientPropertyKindLabel(c.propertyKind))}</span>
              <span class="po-client-pill po-client-pill--area">${escapeHtml(formatClientArea(c.requiredArea))}</span>
              <span class="po-client-card__badge ${c.active ? 'po-client-card__badge--active' : 'po-client-card__badge--inactive'}">
                ${c.active ? 'نشط' : 'موقوف'}
              </span>
              <span class="po-client-accordion__chevron" aria-hidden="true">▾</span>
            </div>
          </summary>
          <div class="po-client-accordion__body">
            <form class="po-client-details-form" data-id="${c.id}">
              <div class="po-client-details-grid">
                <div class="form-group">
                  <label>اسم العميل</label>
                  <input name="clientLabel" value="${escapeHtml(c.clientLabel || '')}" placeholder="اسم العميل" required>
                </div>
                <div class="form-group">
                  <label>رقم الجوال</label>
                  <input name="phone" value="${escapeHtml(c.phone || '')}" placeholder="05xxxxxxxx" dir="ltr">
                </div>
                <div class="form-group">
                  <label>نوع الطلب</label>
                  <select name="requestType">
                    ${optionHtml(CLIENT_REQUEST_TYPES, c.requestType || 'buy')}
                  </select>
                </div>
                <div class="form-group">
                  <label>نوع العقار المطلوب</label>
                  <select name="propertyKind">
                    ${optionHtml(CLIENT_PROPERTY_KINDS, c.propertyKind || 'land')}
                  </select>
                </div>
                <div class="form-group">
                  <label>المساحة المطلوبة (م²)</label>
                  <input name="requiredArea" type="number" min="1" step="0.01" value="${c.requiredArea != null ? escapeHtml(String(c.requiredArea)) : ''}" placeholder="مثال: 500">
                </div>
                <div class="form-group po-client-details-grid__full">
                  <label>رابط الدخول</label>
                  <div class="po-client-card__url-row">
                    <input readonly value="${escapeHtml(c.shareUrl)}" dir="ltr" aria-label="رابط العميل">
                  </div>
                </div>
              </div>
              <p class="po-client-card__meta">
                <strong>${c.loginCount || 0}</strong> مرة دخول
                ${c.lastVisitAt ? ` — آخر زيارة: ${formatVisitDate(c.lastVisitAt)}` : ''}
              </p>
              <div class="po-client-card__actions">
                <button type="submit" class="btn btn-gold btn-sm">حفظ البيانات</button>
                <button type="button" class="btn btn-outline btn-sm" data-copy="${c.id}">نسخ الرابط والرمز</button>
                <button type="button" class="btn btn-outline btn-sm" data-regen="${c.id}">رابط جديد</button>
                <button type="button" class="btn btn-outline btn-sm" data-toggle="${c.id}">${c.active ? 'إيقاف' : 'تفعيل'}</button>
              </div>
            </form>
          </div>
        </details>
      `).join('')}
    </div>
  `;

  list.querySelectorAll('.po-client-details-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = form.dataset.id;
      const fd = new FormData(form);
      const btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'جاري الحفظ…';
      }
      try {
        const r = await DashboardAPI.updatePrivateClient(id, {
          clientLabel: String(fd.get('clientLabel') || '').trim(),
          phone: String(fd.get('phone') || '').trim(),
          requestType: fd.get('requestType'),
          propertyKind: fd.get('propertyKind'),
          requiredArea: fd.get('requiredArea'),
        });
        const idx = clientsCache.findIndex((c) => c.id === id);
        if (idx >= 0) clientsCache[idx] = { ...r.client, shareUrl: r.client.shareUrl };
        showToast('تم حفظ بيانات العميل');
        renderClientsList();
        const open = document.querySelector(`.po-client-accordion[data-client="${id}"]`);
        if (open) open.open = true;
      } catch (err) {
        showToast(err.message || 'تعذر الحفظ', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'حفظ البيانات';
        }
      }
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
        أدخل بيانات الطلب. سيتم إنشاء <strong>رابط مستقل</strong> و<strong>رمز دخول خاص</strong> لهذا العميل.
      </p>
      <form id="client-form" class="po-modal-form">
        <div class="form-group">
          <label for="client-label-input">اسم العميل *</label>
          <input id="client-label-input" name="clientLabel" placeholder="مثال: أحمد" required autocomplete="off">
        </div>
        <div class="form-group">
          <label for="client-phone-input">رقم الجوال *</label>
          <input id="client-phone-input" name="phone" placeholder="05xxxxxxxx" required dir="ltr" autocomplete="tel">
        </div>
        <div class="form-group">
          <label for="client-request-type">نوع الطلب *</label>
          <select id="client-request-type" name="requestType" required>
            ${optionHtml(CLIENT_REQUEST_TYPES, 'buy')}
          </select>
        </div>
        <div class="form-group">
          <label for="client-property-kind">نوع العقار المطلوب *</label>
          <select id="client-property-kind" name="propertyKind" required>
            ${optionHtml(CLIENT_PROPERTY_KINDS, 'land')}
          </select>
        </div>
        <div class="form-group">
          <label for="client-required-area">المساحة المطلوبة (م²) *</label>
          <input id="client-required-area" name="requiredArea" type="number" min="1" step="0.01" placeholder="مثال: 500" required>
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
    const fd = new FormData(e.target);
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإنشاء…';
    try {
      const r = await DashboardAPI.createPrivateClient({
        clientLabel: String(fd.get('clientLabel') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        requestType: fd.get('requestType'),
        propertyKind: fd.get('propertyKind'),
        requiredArea: fd.get('requiredArea'),
      });
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
    el.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => openOfferPreview(btn.dataset.view));
    });
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

function listingLabel(v) {
  return LISTING_TYPES.find((t) => t.value === v)?.label || 'بيع';
}

function statusLabel(v) {
  return STATUS_OPTIONS.find((s) => s.value === v)?.label || v;
}

function formatOfferPrice(o) {
  if (o.price == null) return '—';
  const amount = `${Number(o.price).toLocaleString('ar-SA')} ر.س`;
  return o.listingType === 'rent' ? `${amount} / إيجار` : amount;
}

function offerImages(o) {
  return (o.gallery && o.gallery.length) ? o.gallery : (o.coverImage ? [o.coverImage] : []);
}

function offerDistrict(o) {
  const desc = String(o.shortDescription || '').trim();
  if (desc) {
    const first = desc.split('\n').map((s) => s.trim()).find(Boolean);
    if (first) return first;
  }
  return String(o.street || '').trim();
}

function offerExtraDesc(o) {
  const desc = String(o.shortDescription || '').trim();
  if (!desc) return '';
  const lines = desc.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length <= 1) return desc;
  return lines.slice(1).join('\n');
}

function isUrlText(s) {
  return /^https?:\/\//i.test(String(s).trim());
}

function formatMultiline(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function locationPreviewContent(location) {
  const loc = String(location || '').trim();
  if (!loc) return '';
  if (isUrlText(loc)) {
    return `<a href="${escapeHtml(loc)}" target="_blank" rel="noopener">📍 عرض على الخريطة</a>`;
  }
  return formatMultiline(loc);
}

function previewChip(text, mod = '') {
  const cls = mod ? ` po-chip--${mod}` : '';
  return `<span class="po-chip${cls}">${escapeHtml(text)}</span>`;
}

function buildClientPreviewCard(o) {
  const imgs = offerImages(o);
  const cover = imgs[0] || '';
  const district = offerDistrict(o);
  const extraDesc = offerExtraDesc(o);
  const location = o.showLocation !== false ? (o.location || '') : '';
  const locationHtml = location ? locationPreviewContent(location) : '';
  const priceDisplay = formatOfferPrice(o);

  const chips = [
    previewChip(typeLabel(o.propertyType)),
    previewChip(listingLabel(o.listingType), 'listing'),
    o.area != null && o.area !== '' ? previewChip(`${Number(o.area).toLocaleString('ar-SA')} م²`, 'area') : '',
    district ? previewChip(district, 'district') : '',
  ].filter(Boolean).join('');

  const mediaInner = cover
    ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy">`
    : '<div class="po-card__media-placeholder">بدون صورة</div>';
  const badge = imgs.length > 1 ? `<span class="po-card__photos-badge">${imgs.length} صور</span>` : '';

  return `
    <article class="po-card" id="offer-${escapeHtml(o.id)}">
      <div class="po-card__media po-card__media--static">${mediaInner}${badge}</div>
      <div class="po-card__body">
        <div class="po-card__chips">${chips}</div>
        <div class="po-card__price">${escapeHtml(priceDisplay)}</div>
        ${locationHtml ? `<div class="po-card__location">${locationHtml}</div>` : ''}
        ${extraDesc ? `<p class="po-card__desc">${formatMultiline(extraDesc)}</p>` : ''}
        <div class="po-card__footer">
          <span class="po-card__number">${escapeHtml(o.offerNumber)}</span>
        </div>
      </div>
    </article>
  `;
}

function getActiveClientShareUrl() {
  const client = clientsCache.find((c) => c.active && c.shareUrl);
  return client?.shareUrl || '';
}

function openOfferPreview(id) {
  const offer = offersCache.find((o) => o.id === id);
  if (!offer) {
    showToast('تعذر العثور على العرض', 'error');
    return;
  }

  const visibleToClient = offer.active && offer.visible && offer.status !== 'hidden';
  const shareUrl = getActiveClientShareUrl();
  const clientPageUrl = shareUrl ? `${shareUrl}#offer-${encodeURIComponent(id)}` : '';

  const wrap = document.createElement('div');
  wrap.className = 'modal active po-preview-modal';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box" role="dialog" aria-labelledby="po-preview-title">
      <div class="modal__header">
        <h3 class="modal__title" id="po-preview-title">معاينة العرض — ${escapeHtml(offer.offerNumber)}</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <div class="modal__body">
        ${visibleToClient
          ? '<p class="po-preview-note">هكذا يظهر العرض للعميل داخل صفحة العروض الخاصة.</p>'
          : '<p class="po-preview-note po-preview-note--hidden">هذا العرض <strong>مخفي</strong> عن العملاء حالياً — المعاينة لمراجعة الشكل فقط.</p>'}
        <div class="po-preview-wrap">
          ${buildClientPreviewCard(offer)}
        </div>
        <div class="po-preview-actions">
          ${clientPageUrl
            ? `<a href="${escapeHtml(clientPageUrl)}" target="_blank" rel="noopener" class="btn btn-gold btn-sm">فتح في صفحة العروض الخاصة</a>`
            : '<span class="form-hint">لا يوجد عميل نشط — أنشئ عميلاً للحصول على رابط العروض الخاصة</span>'}
          <button type="button" class="btn btn-outline btn-sm" data-close>إغلاق</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
}

function renderOfferCard(o) {
  const img = o.coverImage || (o.gallery && o.gallery[0]) || '';
  return `
    <article class="offer-card po-offer-card">
      ${img
        ? `<div class="offer-card__img"><img src="${escapeHtml(img)}" alt=""></div>`
        : '<div class="offer-card__img offer-card__img--empty" aria-hidden="true"></div>'}
      <div class="offer-card__body">
        <p class="offer-card__type">${escapeHtml(typeLabel(o.propertyType))} · ${escapeHtml(listingLabel(o.listingType))}</p>
        <h3 class="offer-card__title">${escapeHtml(o.offerNumber)}</h3>
        <p class="offer-card__meta">${escapeHtml(statusLabel(o.status))} · ${o.active && o.visible ? 'ظاهر للعميل' : 'مخفي'}</p>
        <p class="offer-card__price">${escapeHtml(formatOfferPrice(o))}</p>
        <div class="offer-card__footer">
          <div class="offer-card__actions po-offer-card__actions">
            <button type="button" class="btn btn-outline btn-sm" data-view="${o.id}">عرض</button>
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
  const galleryJson = encodeURIComponent(JSON.stringify(existing?.gallery || []));
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box modal__box--po-offer" role="dialog">
      <div class="modal__header">
        <h3 class="modal__title">${id ? 'تعديل عرض خاص' : 'عرض خاص جديد'}</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <form id="offer-form" class="po-offer-form" novalidate>
        ${existing ? `<p class="text-muted" style="margin-bottom:1rem"><strong>رقم العرض:</strong> ${escapeHtml(existing.offerNumber)}</p>` : ''}
        <div class="form-grid">
          <div class="form-group">
            <label>نوع العرض *</label>
            <select name="listingType" required>
              ${LISTING_TYPES.map((t) => `<option value="${t.value}" ${(existing?.listingType || 'sale') === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>نوع العقار *</label>
            <select name="propertyType" required>
              ${PROPERTY_TYPES.map((t) => `<option value="${t.value}" ${existing?.propertyType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>المساحة (م²)</label>
            <input name="area" type="number" step="0.01" value="${existing?.area != null ? escapeHtml(String(existing.area)) : ''}">
          </div>
          <div class="form-group">
            <label>الشارع</label>
            <input name="street" value="${escapeHtml(existing?.street || '')}">
          </div>
          <div class="form-group">
            <label>رقم القطعة</label>
            <input name="plotNumber" value="${escapeHtml(existing?.plotNumber || '')}">
          </div>
          <div class="form-group">
            <label>رقم المخطط</label>
            <input name="planNumber" value="${escapeHtml(existing?.planNumber || '')}">
          </div>
          <div class="form-group">
            <label id="price-label">${(existing?.listingType || 'sale') === 'rent' ? 'سعر الإيجار (ر.س)' : 'السعر (ر.س)'}</label>
            <input name="price" type="number" step="0.01" value="${existing?.price != null ? escapeHtml(String(existing.price)) : ''}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>الموقع / اللوكيشن</label>
            <input name="location" value="${escapeHtml(existing?.location || '')}" placeholder="مثال: التقاطع السادس — أو سطر ثانٍ برابط الخريطة">
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="showLocation" value="true" ${existing?.showLocation !== false ? 'checked' : ''}> إظهار الموقع للعميل</label>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>وصف مختصر</label>
            <textarea name="shortDescription" rows="3" placeholder="السطر الأول: اسم الحي (مثل المهدية) — باقي الأسطر: وصف إضافي">${escapeHtml(existing?.shortDescription || '')}</textarea>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>صور العقار ${id ? '(اختياري — تُضاف للمعرض)' : '*'}</label>
            <input type="file" name="images" id="offer-images" accept="image/*" multiple ${id ? '' : 'required'}>
            <span class="form-hint" id="offer-images-hint">${id ? 'اختياري عند التعديل' : 'مطلوب صورة واحدة على الأقل عند الإنشاء'}</span>
          </div>
          <div class="form-group">
            <label>حالة العرض</label>
            <select name="status">
              ${STATUS_OPTIONS.map((s) => `<option value="${s.value}" ${existing?.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>الترتيب</label>
            <input name="sortOrder" type="number" value="${escapeHtml(String(existing?.sortOrder ?? 0))}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>ملاحظات داخلية (لا تظهر للعميل)</label>
            <textarea name="internalNotes" rows="2">${escapeHtml(existing?.internalNotes || '')}</textarea>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="visible" value="true" ${existing?.visible !== false ? 'checked' : ''}> ظاهر في صفحة العميل</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="active" value="true" ${existing?.active !== false ? 'checked' : ''}> مفعّل</label>
          </div>
        </div>
        ${existing?.gallery?.length ? `<p class="text-muted">الصور الحالية: ${existing.gallery.length}</p>` : ''}
        <input type="hidden" name="gallery" value="${galleryJson}">
        <div class="form-actions po-offer-form__actions">
          <button type="submit" class="btn btn-gold" id="offer-save-btn">حفظ</button>
          <button type="button" class="btn btn-outline" data-close>إلغاء</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  const close = () => {
    if (wrap.dataset.saving === '1') return;
    wrap.remove();
  };
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  const listingSelect = wrap.querySelector('[name="listingType"]');
  const priceLabel = wrap.querySelector('#price-label');
  listingSelect?.addEventListener('change', () => {
    if (priceLabel) {
      priceLabel.textContent = listingSelect.value === 'rent' ? 'سعر الإيجار (ر.س)' : 'السعر (ر.س)';
    }
  });

  const form = wrap.querySelector('#offer-form');
  const saveBtn = wrap.querySelector('#offer-save-btn');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (wrap.dataset.saving === '1' || saveBtn.disabled) return;

    const imagesInput = form.querySelector('#offer-images');
    if (!id && (!imagesInput?.files || imagesInput.files.length === 0)) {
      showToast('يرجى إرفاق صورة واحدة على الأقل', 'error');
      imagesInput?.focus();
      return;
    }

    const fd = new FormData(form);
    if (!fd.get('showLocation')) fd.set('showLocation', 'false');
    if (!fd.get('visible')) fd.set('visible', 'false');
    if (!fd.get('active')) fd.set('active', 'false');

    wrap.dataset.saving = '1';
    saveBtn.disabled = true;
    saveBtn.classList.add('is-loading');
    saveBtn.textContent = 'جاري الحفظ…';
    form.querySelectorAll('input, select, textarea, button').forEach((el) => {
      if (el !== saveBtn) el.disabled = true;
    });

    try {
      await DashboardAPI.savePrivateOffer(fd, id);
      showToast('تم حفظ العرض بنجاح');
      wrap.dataset.saving = '0';
      wrap.remove();
      await loadOffers();
    } catch (err) {
      wrap.dataset.saving = '0';
      form.querySelectorAll('input, select, textarea, button').forEach((el) => {
        el.disabled = false;
      });
      saveBtn.disabled = false;
      saveBtn.classList.remove('is-loading');
      saveBtn.textContent = 'حفظ';
      showToast(err.message || 'تعذر حفظ العرض', 'error');
    }
  });
}

async function removeOffer(id) {
  if (!confirm('حذف هذا العرض؟')) return;
  await DashboardAPI.deletePrivateOffer(id);
  showToast('تم الحذف');
  loadOffers();
}
