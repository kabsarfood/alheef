document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('offers-admin-page');
  await initLayout('offers', 'إدارة العروض');
  setTopbarActions(`
    <div class="offers-page-toolbar">
      <a href="/dashboard/add-property.html" class="btn btn-outline btn-sm">إضافة كاملة</a>
      <a href="/dashboard/quick-add.html" class="btn btn-gold btn-sm">+ إضافة سريعة</a>
      <a href="/dashboard/private-offers-legacy.html" class="btn btn-outline btn-sm">عملاء العروض</a>
    </div>
  `);

  const content = getPageContent();
  content.innerHTML = `
    <p class="offers-role">إدارة كل العقارات من هنا: الإضافة والتعديل والصور والحالة ورقم الجوال. العقار الذي تسمح بعرضه يظهر للعميل في العروض الخاصة.</p>
    <div class="offers-admin-bar">
      <label for="offers-visibility">الظهور</label>
      <select id="offers-visibility">
        <option value="all">كل العقارات</option>
        <option value="private">ظاهرة في العروض الخاصة</option>
        <option value="hidden">مخفية عن العروض الخاصة</option>
      </select>
    </div>
    <div id="offers-container"><div class="loading"><div class="spinner"></div><p>جاري التحميل...</p></div></div>
    <section id="offers-leads" class="offers-leads"></section>
  `;
  document.getElementById('offers-visibility').addEventListener('change', renderOffers);
  await loadOffers();
  loadLeads();
});

let offersCache = [];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function visibleOffers() {
  const mode = document.getElementById('offers-visibility')?.value || 'all';
  if (mode === 'private') return offersCache.filter((offer) => offer.showOnPrivateOffers !== false);
  if (mode === 'hidden') return offersCache.filter((offer) => offer.showOnPrivateOffers === false);
  return offersCache;
}

async function loadOffers() {
  const container = document.getElementById('offers-container');
  try {
    const rows = [];
    for (let page = 1; page <= 8; page += 1) {
      const batch = await DashboardAPI.request(`/offers?limit=100&page=${page}`);
      const list = Array.isArray(batch) ? batch : [];
      rows.push(...list);
      if (list.length < 100) break;
    }
    offersCache = rows;
    renderOffers();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>تعذر تحميل العروض</p></div>';
  }
}

function renderOffers() {
  const container = document.getElementById('offers-container');
  if (!container) return;
  const offers = visibleOffers();
  if (!offersCache.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">◇</div>
        <p>لا توجد عروض حالياً</p>
        <a href="/dashboard/quick-add.html" class="btn btn-gold" style="margin-top:1rem">+ إضافة سريعة</a>
      </div>
    `;
    return;
  }
  if (!offers.length) {
    container.innerHTML = '<div class="empty-state"><p>لا توجد عقارات ضمن هذا الظهور</p></div>';
    return;
  }
  container.innerHTML = `<div class="offers-grid offers-grid--admin">${offers.map(renderOfferCard).join('')}</div>`;
  bindActions();
}

function listingBadge(listingType) {
  if (listingType === 'buy_request') {
    return '<span class="badge badge--buy-request">طلب شراء</span>';
  }
  if (listingType === 'rent') return '<span class="badge">إيجار</span>';
  return '';
}

function visibilityBadge(offer) {
  const bits = [];
  bits.push(offer.showOnPrivateOffers === false
    ? '<span class="badge">مخفي عن العروض الخاصة</span>'
    : '<span class="badge badge--ok">في العروض الخاصة</span>');
  if (offer.homepagePublished) bits.push('<span class="badge">على الرئيسية</span>');
  return bits.join('');
}

function renderOfferCard(offer) {
  const img = offer.coverImage || offer.image || offer.gallery?.[0] || '';
  const priceLine = offer.listingType === 'buy_request'
    ? (offer.price != null ? `ميزانية: ${escapeHtml(offer.priceDisplay || offer.price)}` : 'بدون ميزانية')
    : `${escapeHtml(offer.priceDisplay || offer.price)} <small>ر.س</small>`;
  const privateOn = offer.showOnPrivateOffers !== false;
  return `
    <article class="offer-card offers-admin-card" data-id="${offer.id}">
      <div class="offer-card__img">
        ${img
          ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(offer.title)}">`
          : '<div class="offer-card__img--empty" aria-hidden="true"></div>'}
      </div>
      <div class="offer-card__body">
        <p class="offer-card__type">${escapeHtml(offer.propertyType)} ${listingBadge(offer.listingType)} ${visibilityBadge(offer)}</p>
        <h3 class="offer-card__title">${escapeHtml(offer.title)}</h3>
        <p class="offer-card__meta">📍 ${escapeHtml(offer.location)}${offer.internalRef ? ` · ${escapeHtml(offer.internalRef)}` : ''}</p>
        <p class="offer-card__price">${priceLine}</p>
        <div class="offer-card__footer">
          <div class="offer-card__status">${statusBadge(offer.status)}</div>
          <div class="offer-card__actions">
            <button type="button" class="btn btn-outline btn-sm btn-view" data-id="${offer.id}">عرض</button>
            <a href="/dashboard/add-property.html?id=${offer.id}" class="btn btn-outline btn-sm">تعديل</a>
            <button type="button" class="btn btn-outline btn-sm btn-private" data-id="${offer.id}" data-on="${privateOn ? '1' : '0'}">${privateOn ? 'إخفاء من العروض الخاصة' : 'إظهار في العروض الخاصة'}</button>
            <button type="button" class="btn btn-danger btn-sm btn-delete" data-id="${offer.id}">حذف</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function bindActions() {
  document.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;
      try {
        await DashboardAPI.deleteOffer(btn.dataset.id);
        showToast('تم الحذف');
        await loadOffers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  document.querySelectorAll('.btn-view').forEach((btn) => {
    btn.addEventListener('click', () => openOffer(btn.dataset.id));
  });

  document.querySelectorAll('.btn-private').forEach((btn) => {
    btn.addEventListener('click', () => runOfferAction(btn.dataset.id, btn.dataset.on === '1' ? 'offers_off' : 'offers_on'));
  });
}

async function openOffer(id) {
  try {
    const offer = await DashboardAPI.getOffer(id);
    showViewModal(offer);
  } catch {
    showToast('تعذر عرض التفاصيل', 'error');
  }
}

const USAGE_LABELS = { residential: 'سكني', commercial: 'تجاري' };
const STATUS_ACTIONS = [
  ['publish', 'اعتماد ونشر'],
  ['hide', 'إخفاء'],
  ['sold', 'مباع'],
  ['withdrawn', 'أرشفة'],
  ['reactivate', 'إعادة تفعيل'],
  ['map_on', 'إظهار في الخريطة'],
  ['map_off', 'إخفاء من الخريطة'],
  ['homepage_on', 'إرسال إلى الرئيسية'],
  ['homepage_off', 'إزالة من الرئيسية'],
];

function fieldRow(label, value) {
  if (value == null || value === '') return '';
  return `<p class="offer-view-modal__row"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
}

function showViewModal(offer) {
  let modal = document.getElementById('view-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'view-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  const img = offer.coverImage || offer.image || offer.gallery?.[0] || '';
  const isBuy = offer.listingType === 'buy_request' || offer.isBuyRequest;
  const usage = USAGE_LABELS[offer.requestUsage] || offer.requestUsage || '';
  const phone = offer.agentPhone || offer.contactPhone || offer.requestPhone || '';
  const gallery = (offer.gallery || []).map((url) => `<img src="${escapeHtml(url)}" alt="">`).join('');
  const privateOn = offer.showOnPrivateOffers !== false;

  let body = '';
  if (isBuy) {
    body = `
      <div class="offer-view-modal__body">
        <div>${listingBadge(offer.listingType)}</div>
        <p class="offer-view-modal__location">📍 ${escapeHtml(offer.location)}</p>
        <p class="offer-view-modal__row"><strong>نوع العقار:</strong> ${escapeHtml(offer.requestPropertyKind || offer.propertyType || '—')}</p>
        <p class="offer-view-modal__row"><strong>التصنيف:</strong> ${escapeHtml(usage || '—')}</p>
        ${offer.area ? `<p class="offer-view-modal__row"><strong>المساحة المطلوبة:</strong> ${escapeHtml(offer.area)} م²</p>` : ''}
        <p class="offer-view-modal__price">
          الميزانية: ${offer.price != null ? `${escapeHtml(offer.priceDisplay || offer.price)} ر.س` : 'غير محددة'}
        </p>
        ${phone ? `<p class="offer-view-modal__phone"><strong>جوال الطالب (أدمن فقط):</strong> <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>` : ''}
        ${offer.description ? `<p class="offer-view-modal__desc">${escapeHtml(offer.description)}</p>` : ''}
        <p class="form-hint offer-view-modal__hint">لا يظهر رقم الجوال على الخريطة العامة — يظهر في لوحة التحكم فقط.</p>
      </div>
    `;
  } else {
    body = `
      <div class="offer-view-modal__body">
        <p class="offer-view-modal__location">📍 ${escapeHtml(offer.location)}</p>
        <p class="offer-view-modal__price">${escapeHtml(offer.priceDisplay || offer.price)} ر.س</p>
        ${fieldRow('الرقم الداخلي', offer.internalRef)}
        ${fieldRow('المساحة', offer.area ? `${offer.area} م²` : '')}
        ${fieldRow('الحي', offer.district)}
        ${fieldRow('الاتجاه', offer.direction)}
        ${fieldRow('عرض الشارع', offer.streetWidth)}
        ${fieldRow('الشارع', offer.street)}
        ${fieldRow('المخطط', offer.planNumber)}
        ${fieldRow('القطعة', offer.plotNumber)}
        ${offer.contractNumber ? `<p class="offer-view-modal__row"><strong>عقد الوساطة:</strong> ${escapeHtml(offer.contractNumber)}</p>` : ''}
        ${fieldRow('ملاحظات داخلية', offer.internalNotes)}
        ${phone ? `<p class="offer-view-modal__phone"><strong>جوال المعلن (أدمن فقط):</strong> <a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></p>` : ''}
        <p class="offer-view-modal__row"><strong>العروض الخاصة:</strong> ${privateOn ? 'ظاهر للعميل' : 'مخفي عن العميل'}</p>
        <p class="offer-view-modal__row"><strong>الصفحة الرئيسية:</strong> ${offer.homepagePublished ? 'ظاهر' : 'غير ظاهر'}</p>
        ${offer.description ? `<p class="offer-view-modal__desc">${escapeHtml(offer.description)}</p>` : ''}
        <p class="form-hint offer-view-modal__hint">رقم الجوال والملاحظات الداخلية لا يظهران في صفحة العروض الخاصة.</p>
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box modal__box--offer-view" role="dialog" aria-labelledby="offer-view-title">
      <div class="modal__header">
        <h3 class="modal__title" id="offer-view-title">${escapeHtml(offer.title)}</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      ${img ? `<div class="offer-view-modal__img"><img src="${escapeHtml(img)}" alt=""></div>` : ''}
      ${gallery ? `<div class="offer-view-gallery">${gallery}</div>` : ''}
      ${body}
      <div class="offer-view-actions">
        <a href="/dashboard/add-property.html?id=${offer.id}" class="btn btn-outline btn-sm">تعديل الصور والبيانات</a>
        <button type="button" class="btn btn-outline btn-sm" data-action="${privateOn ? 'offers_off' : 'offers_on'}">${privateOn ? 'إخفاء من العروض الخاصة' : 'إظهار في العروض الخاصة'}</button>
        ${STATUS_ACTIONS.map(([action, label]) => `<button type="button" class="btn btn-outline btn-sm" data-action="${action}">${label}</button>`).join('')}
        <button type="button" class="btn btn-gold btn-sm" data-share="${offer.id}">مشاركة مع عميل</button>
      </div>
      ${offer.mapsUrl ? `<a href="${escapeHtml(offer.mapsUrl)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm offer-view-modal__map">فتح الخريطة</a>` : ''}
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.remove('active'));
  });
  modal.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => runOfferAction(offer.id, btn.dataset.action, true));
  });
  modal.querySelector('[data-share]')?.addEventListener('click', () => openClientShare(offer));
}

async function runOfferAction(id, action, reopen) {
  try {
    await DashboardAPI.request(`/offer-board/${id}/action`, {
      method: 'POST',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action }),
    });
    showToast('تم تحديث العقار');
    await loadOffers();
    if (reopen) openOffer(id);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function maskAdminPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  let local = digits.startsWith('966') ? `0${digits.slice(3)}` : digits;
  if (/^5\d{8}$/.test(local)) local = `0${local}`;
  if (!/^05\d{8}$/.test(local)) return '05••• ••';
  return `${local.slice(0, 2)}••• ••${local.slice(-2)}`;
}

async function openClientShare(offer) {
  let clients = [];
  try {
    clients = await DashboardAPI.getPrivateClients();
  } catch {
    clients = [];
  }
  const active = clients.filter((client) => client.active !== false);
  const old = document.getElementById('offer-share-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'offer-share-modal';
  modal.className = 'modal active';
  const options = active.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.clientLabel || 'عميل')} — ${escapeHtml(maskAdminPhone(client.phone))}</option>`).join('');
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box" role="dialog">
      <div class="modal__header">
        <h3 class="modal__title">مشاركة الإعلان مع عميل</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <p>${escapeHtml(offer.internalRef || offer.title || '')}</p>
      ${active.length ? `<label for="offer-share-client">العميل</label>
        <select id="offer-share-client">${options}</select>
        <p class="form-hint">تُرسل صور العقار ومعلوماته مع جوال المنصة فقط، دون رابط الإعلان ودون رقم المعلن.</p>
        <button type="button" class="btn btn-gold" id="offer-share-send">إرسال إلى واتساب العميل</button>
        <p id="offer-share-result" hidden></p>` : '<p>لا يوجد عميل نشط. أضف العميل من «عملاء العروض».</p>'}
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => modal.remove()));
  modal.querySelector('#offer-share-send')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const result = modal.querySelector('#offer-share-result');
    try {
      const data = await DashboardAPI.request(`/offer-board/${offer.id}/share`, {
        method: 'POST',
        headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ clientId: modal.querySelector('#offer-share-client').value }),
      });
      result.hidden = false;
      result.textContent = data.message || 'تم إرسال الإعلان إلى واتساب العميل';
      loadLeads();
    } catch (error) {
      result.hidden = false;
      result.textContent = error.message || 'تعذر الإرسال';
      button.disabled = false;
    }
  });
}

async function loadLeads() {
  const host = document.getElementById('offers-leads');
  if (!host) return;
  host.innerHTML = '<h2>متابعة العملاء والعروض</h2><p>جاري التحميل…</p>';
  try {
    const data = await DashboardAPI.request('/private-offer-leads');
    const items = data.items || [];
    if (!items.length) {
      host.innerHTML = '<h2>متابعة العملاء والعروض</h2><p>لا توجد مشاركات بعد.</p>';
      return;
    }
    host.innerHTML = `<h2>متابعة العملاء والعروض</h2><div class="offers-leads__list">${items.map((item) => `
      <article>
        <strong>${escapeHtml(item.clientName || 'عميل')}</strong>
        <span dir="ltr">${escapeHtml(item.phone || '')}</span>
        <span>${escapeHtml(item.statusLabel || '')}</span>
        <p>العقار: ${escapeHtml(item.internalRef || item.propertyTitle || '—')}</p>
        <div class="offer-card__actions">
          ${item.status === 'negotiating' ? '' : `<button type="button" class="btn btn-outline btn-sm" data-lead-talk="${escapeHtml(item.id)}">تحت التفاوض</button>`}
          <button type="button" class="btn btn-outline btn-sm" data-lead-pause="${escapeHtml(item.clientId)}" data-paused="${item.followupPaused ? '1' : '0'}">${item.followupPaused ? 'إعادة تفعيل المتابعة' : 'إيقاف الإشعارات'}</button>
        </div>
      </article>`).join('')}</div>`;
    host.querySelectorAll('[data-lead-talk]').forEach((btn) => btn.addEventListener('click', async () => {
      await DashboardAPI.request(`/private-offer-leads/${btn.dataset.leadTalk}/negotiating`, { method: 'PUT' });
      loadLeads();
    }));
    host.querySelectorAll('[data-lead-pause]').forEach((btn) => btn.addEventListener('click', async () => {
      await DashboardAPI.request(`/private-offer-leads/clients/${btn.dataset.leadPause}/followup`, {
        method: 'PUT',
        headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ paused: btn.dataset.paused !== '1' }),
      });
      loadLeads();
    }));
  } catch {
    host.innerHTML = '<h2>متابعة العملاء والعروض</h2><p>تعذر تحميل المتابعة.</p>';
  }
}
