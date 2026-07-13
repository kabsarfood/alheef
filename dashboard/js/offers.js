document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.add('offers-admin-page');
  await initLayout('offers', 'العروض الحالية');
  setTopbarActions(`
    <div class="offers-page-toolbar">
      <a href="/dashboard/add-property.html" class="btn btn-gold btn-sm">
        <span class="btn-label btn-label--desktop">＋ إضافة إعلان</span>
        <span class="btn-label btn-label--mobile">إضافة إعلان</span>
      </a>
    </div>
  `);

  const content = getPageContent();
  content.innerHTML = '<div id="offers-container"><div class="loading"><div class="spinner"></div><p>جاري التحميل...</p></div></div>';

  await loadOffers();
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadOffers() {
  const container = document.getElementById('offers-container');
  try {
    const offers = await DashboardAPI.getOffers();

    if (!offers.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">◇</div>
          <p>لا توجد عروض حالياً</p>
          <a href="/dashboard/add-property.html" class="btn btn-gold" style="margin-top:1rem">إضافة أول إعلان</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="offers-grid offers-grid--admin">${offers.map(renderOfferCard).join('')}</div>`;
    bindActions();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>تعذر تحميل العروض</p></div>';
  }
}

function listingBadge(listingType) {
  if (listingType === 'buy_request') {
    return '<span class="badge badge--buy-request">طلب شراء</span>';
  }
  if (listingType === 'rent') return '<span class="badge">إيجار</span>';
  return '';
}

function renderOfferCard(offer) {
  const img = offer.coverImage || offer.image || offer.gallery?.[0] || '';
  const priceLine = offer.listingType === 'buy_request'
    ? (offer.price != null ? `ميزانية: ${escapeHtml(offer.priceDisplay || offer.price)}` : 'بدون ميزانية')
    : `${escapeHtml(offer.priceDisplay || offer.price)} <small>ر.س</small>`;
  return `
    <article class="offer-card offers-admin-card" data-id="${offer.id}">
      <div class="offer-card__img">
        ${img
          ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(offer.title)}">`
          : '<div class="offer-card__img--empty" aria-hidden="true"></div>'}
      </div>
      <div class="offer-card__body">
        <p class="offer-card__type">${escapeHtml(offer.propertyType)} ${listingBadge(offer.listingType)}</p>
        <h3 class="offer-card__title">${escapeHtml(offer.title)}</h3>
        <p class="offer-card__meta">📍 ${escapeHtml(offer.location)}</p>
        <p class="offer-card__price">${priceLine}</p>
        <div class="offer-card__footer">
          <div class="offer-card__status">${statusBadge(offer.status)}</div>
          <div class="offer-card__actions">
            <button type="button" class="btn btn-outline btn-sm btn-view" data-id="${offer.id}">عرض</button>
            <a href="/dashboard/add-property.html?id=${offer.id}" class="btn btn-outline btn-sm">تعديل</a>
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
    btn.addEventListener('click', async () => {
      try {
        const offer = await DashboardAPI.getOffer(btn.dataset.id);
        showViewModal(offer);
      } catch {
        showToast('تعذر عرض التفاصيل', 'error');
      }
    });
  });
}

const USAGE_LABELS = { residential: 'سكني', commercial: 'تجاري' };

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
        ${offer.requestPhone ? `<p class="offer-view-modal__phone"><strong>جوال الطالب (أدمن فقط):</strong> <a href="tel:${escapeHtml(offer.requestPhone)}">${escapeHtml(offer.requestPhone)}</a></p>` : ''}
        ${offer.description ? `<p class="offer-view-modal__desc">${escapeHtml(offer.description)}</p>` : ''}
        <p class="form-hint offer-view-modal__hint">لا يظهر رقم الجوال على الخريطة العامة — يظهر في لوحة التحكم فقط.</p>
      </div>
    `;
  } else {
    body = `
      <div class="offer-view-modal__body">
        <p class="offer-view-modal__location">📍 ${escapeHtml(offer.location)}</p>
        <p class="offer-view-modal__price">${escapeHtml(offer.priceDisplay || offer.price)} ر.س</p>
        ${offer.contractNumber ? `<p class="offer-view-modal__row"><strong>عقد الوساطة:</strong> ${escapeHtml(offer.contractNumber)}</p>` : ''}
        ${offer.area ? `<p class="offer-view-modal__row"><strong>المساحة:</strong> ${escapeHtml(offer.area)}</p>` : ''}
        ${offer.description ? `<p class="offer-view-modal__desc">${escapeHtml(offer.description)}</p>` : ''}
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
      ${body}
      ${offer.mapsUrl ? `<a href="${escapeHtml(offer.mapsUrl)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm offer-view-modal__map">فتح الخريطة</a>` : ''}
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.remove('active'));
  });
}
