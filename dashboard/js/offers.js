document.addEventListener('DOMContentLoaded', async () => {
  initLayout('offers', 'العروض الحالية');
  setTopbarActions('<a href="/dashboard/add-property.html" class="btn btn-gold btn-sm">＋ إضافة إعلان</a>');

  const content = getPageContent();
  content.innerHTML = '<div id="offers-container"><div class="loading"><div class="spinner"></div><p>جاري التحميل...</p></div></div>';

  await loadOffers();
});

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

    container.innerHTML = `<div class="offers-grid">${offers.map(renderOfferCard).join('')}</div>`;
    bindActions();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>تعذر تحميل العروض</p></div>';
  }
}

function renderOfferCard(offer) {
  const img = offer.image || offer.images?.[0] || '';
  return `
    <article class="offer-card" data-id="${offer.id}">
      <div class="offer-card__img">
        ${img ? `<img src="${img}" alt="${offer.title}">` : '<div style="height:100%;background:#f0eeeb"></div>'}
      </div>
      <div class="offer-card__body">
        <p class="offer-card__type">${offer.propertyType}</p>
        <h3 class="offer-card__title">${offer.title}</h3>
        <p class="offer-card__meta">📍 ${offer.location}</p>
        <p class="offer-card__price">${offer.priceDisplay || offer.price} <small>ر.س</small></p>
        <div class="offer-card__footer">
          ${statusBadge(offer.status)}
          <div class="offer-card__actions">
            <button class="btn btn-outline btn-sm btn-view" data-id="${offer.id}">عرض</button>
            <a href="/dashboard/add-property.html?id=${offer.id}" class="btn btn-outline btn-sm">تعديل</a>
            <button class="btn btn-danger btn-sm btn-delete" data-id="${offer.id}">حذف</button>
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

function showViewModal(offer) {
  let modal = document.getElementById('view-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'view-modal';
    modal.className = 'modal';
    document.body.appendChild(modal);
  }

  const img = offer.image || offer.images?.[0] || '';
  modal.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box" style="max-width:640px">
      <div class="modal__header">
        <h3 class="modal__title">${offer.title}</h3>
        <button class="modal__close" data-close>×</button>
      </div>
      ${img ? `<div style="aspect-ratio:16/9;border-radius:8px;overflow:hidden;margin-bottom:1rem"><img src="${img}" style="width:100%;height:100%;object-fit:cover" alt=""></div>` : ''}
      <p style="color:#8a8580;margin-bottom:1rem">📍 ${offer.location}</p>
      <p style="font-size:1.25rem;font-weight:600;color:#b8956a;margin-bottom:1rem">${offer.priceDisplay || offer.price} ر.س</p>
      ${offer.contractNumber ? `<p style="margin-bottom:0.5rem"><strong>عقد الوساطة:</strong> ${offer.contractNumber}</p>` : ''}
      ${offer.area ? `<p style="margin-bottom:0.5rem"><strong>المساحة:</strong> ${offer.area}</p>` : ''}
      ${offer.details ? `<p style="line-height:1.8;color:#4a4a4a">${offer.details}</p>` : ''}
      ${offer.mapsUrl ? `<a href="${offer.mapsUrl}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:1rem">فتح الخريطة</a>` : ''}
    </div>
  `;
  modal.classList.add('active');
  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.remove('active'));
  });
}
