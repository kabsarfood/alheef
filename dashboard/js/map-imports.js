document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('map-imports', 'إعلانات مستوردة للمراجعة');
  const content = getPageContent();
  content.innerHTML = '<div id="import-queue"><div class="loading"><div class="spinner"></div><p>جاري التحميل...</p></div></div>';
  await loadQueue();
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function listingLabel(type) {
  if (type === 'rent') return 'إيجار';
  if (type === 'buy_request') return 'طلب شراء';
  return 'بيع';
}

async function loadQueue() {
  const container = document.getElementById('import-queue');
  try {
    const items = await DashboardAPI.request('/map/import-queue');
    if (!items.length) {
      container.innerHTML = '<div class="empty-state"><p>لا توجد إعلانات مستوردة بانتظار المراجعة</p></div>';
      return;
    }
    container.innerHTML = `<div class="offers-grid offers-grid--admin">${items.map(renderCard).join('')}</div>`;
    bindActions();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message || 'تعذر التحميل')}</p></div>`;
  }
}

function renderCard(item) {
  const img = item.coverImage || item.gallery?.[0] || '';
  const sourceHref = /^https:\/\//i.test(item.sourceUrl || '') ? item.sourceUrl : '';
  const mapHref = item.slug ? `/map?slug=${encodeURIComponent(item.slug)}` : '/map';
  return `
    <article class="offer-card offers-admin-card" data-id="${escapeHtml(item.id)}">
      <div class="offer-card__img">
        ${img ? `<img src="${escapeHtml(img)}" alt="">` : '<div class="offer-card__img--empty" aria-hidden="true"></div>'}
      </div>
      <div class="offer-card__body">
        <p class="offer-card__type">${escapeHtml(item.internalRef || 'بدون رقم')} · ${escapeHtml(item.propertyType || '')} · ${listingLabel(item.listingType)}</p>
        <h3 class="offer-card__title">${escapeHtml(item.title)}</h3>
        <p class="offer-card__meta">${escapeHtml(item.location || '')}</p>
        <p class="offer-card__price">${item.price != null ? `${escapeHtml(item.price)} ر.س` : 'بدون سعر'}${item.area != null ? ` · ${escapeHtml(item.area)} م²` : ''}</p>
        <p class="offer-card__meta">المخطط ${escapeHtml(item.planNumber || '—')} · القطعة ${escapeHtml(item.plotNumber || '—')}</p>
        <p class="offer-card__meta">الجوال ${escapeHtml(item.contactPhone || '—')}</p>
        <p class="offer-card__meta">المصدر ${escapeHtml(item.source || '—')}</p>
        <p class="import-note" hidden></p>
        <div class="offer-card__actions">
          <button type="button" class="btn btn-gold btn-sm" data-publish="${escapeHtml(item.id)}">اعتماد ونشر</button>
          <a class="btn btn-outline btn-sm" href="/dashboard/add-property.html?id=${escapeHtml(item.id)}">تعديل</a>
          <button type="button" class="btn btn-outline btn-sm" data-reject="${escapeHtml(item.id)}">رفض</button>
          ${sourceHref ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener">فتح المصدر</a>` : ''}
          <a class="btn btn-outline btn-sm" href="${escapeHtml(mapHref)}" title="يظهر على الخريطة بعد النشر">عرض على الخريطة</a>
        </div>
      </div>
    </article>`;
}

function bindActions() {
  document.querySelectorAll('[data-publish]').forEach((btn) => {
    btn.addEventListener('click', () => decide(btn.dataset.publish, 'publish', btn));
  });
  document.querySelectorAll('[data-reject]').forEach((btn) => {
    btn.addEventListener('click', () => decide(btn.dataset.reject, 'reject', btn));
  });
}

async function decide(id, action, btn) {
  const card = btn.closest('article');
  const note = card?.querySelector('.import-note');
  btn.disabled = true;
  try {
    const data = await DashboardAPI.request(`/map/import-queue/${id}/${action}`, { method: 'POST' });
    if (data.duplicate === 'possible') {
      const lines = (data.candidates || []).map((item) => `${item.internal_ref || item.id} (${item.duplicate_type})`).join('، ');
      if (note) {
        note.hidden = false;
        note.textContent = `تشابه محتمل ولم يُنشر: ${lines}`;
      }
      btn.disabled = false;
      return;
    }
    if (data.duplicate === true) {
      if (note) {
        note.hidden = false;
        note.textContent = `تكرار مع ${data.existing_internal_ref || data.existing_property_id}`;
      }
      btn.disabled = false;
      return;
    }
    await loadQueue();
  } catch (err) {
    if (note) {
      note.hidden = false;
      note.textContent = err.message || 'تعذر التنفيذ';
    }
    btn.disabled = false;
  }
}
