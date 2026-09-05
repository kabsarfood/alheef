document.addEventListener('DOMContentLoaded', async () => {
  const highlightId = new URLSearchParams(location.search).get('review');
  await initLayout('ejar-reviews', 'تقييمات عقود الإيجار');
  const content = getPageContent();
  content.innerHTML = `
    <div class="card">
      <div class="card__body">
        <div class="ejar-reviews-head">
          <p class="form-hint">التقييمات الجديدة تصل كـ pending — اعتمادها أو إخفاؤها منفصل عن قراءة الإشعار.</p>
          <span class="badge badge--gold" id="pending-badge" hidden></span>
        </div>
        <div class="filter-bar" style="margin-bottom:1rem">
          <select id="status-filter" class="form-control" style="max-width:260px">
            <option value="all">الكل</option>
            <option value="pending">بانتظار المراجعة</option>
            <option value="approved">معتمد</option>
            <option value="hidden">مخفي</option>
          </select>
        </div>
        <div id="list-wrap"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </div>
  `;

  document.getElementById('status-filter').addEventListener('change', load);
  await load();

  if (highlightId) {
    await DashboardAPI.markEjarReviewNotificationRead(highlightId).catch(() => {});
    setTimeout(() => {
      const el = document.querySelector(`[data-review-id="${highlightId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('offer-admin-card--highlight');
    }, 400);
  }

  async function load() {
    const wrap = document.getElementById('list-wrap');
    wrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const status = document.getElementById('status-filter').value;
      const { items = [], pendingCount = 0 } = await DashboardAPI.getEjarReviews(status);
      const badge = document.getElementById('pending-badge');
      if (pendingCount > 0) {
        badge.hidden = false;
        badge.textContent = `${pendingCount} تقييم${pendingCount === 1 ? '' : 'ات'} جديد${pendingCount === 1 ? '' : 'ة'}`;
      } else {
        badge.hidden = true;
      }

      if (!items.length) {
        wrap.innerHTML = '<p class="empty-state">لا توجد تقييمات في هذا التصنيف</p>';
        return;
      }

      wrap.innerHTML = items.map(renderCard).join('');
      wrap.querySelectorAll('[data-approve]').forEach((btn) => {
        btn.addEventListener('click', () => act(btn.dataset.approve, 'approve'));
      });
      wrap.querySelectorAll('[data-hide]').forEach((btn) => {
        btn.addEventListener('click', () => act(btn.dataset.hide, 'hide'));
      });
    } catch {
      wrap.innerHTML = '<p class="empty-state">تعذر تحميل التقييمات</p>';
    }
  }

  async function act(id, action) {
    if (action === 'approve' && !confirm('اعتماد هذا التقييم؟')) return;
    if (action === 'hide' && !confirm('إخفاء هذا التقييم؟')) return;
    try {
      if (action === 'approve') await DashboardAPI.approveEjarReview(id);
      else await DashboardAPI.hideEjarReview(id);
      await load();
    } catch (err) {
      alert(err.message || 'تعذر تنفيذ الإجراء');
    }
  }

  function renderCard(r) {
    const stars = '⭐'.repeat(r.rating);
    const statusLabel = r.status === 'pending' ? 'بانتظار المراجعة' : r.status === 'approved' ? 'معتمد' : 'مخفي';
    const consent = r.publishConsent ? 'موافق على النشر' : 'بدون موافقة نشر';
    const submitted = new Date(r.submittedAt || r.createdAt || 0).getTime();
    const isNew = Number.isFinite(submitted) && Date.now() - submitted < 14 * 24 * 60 * 60 * 1000;
    return `
      <article class="offer-admin-card${isNew ? ' offer-admin-card--highlight' : ''}" data-review-id="${r.id}">
        <div class="offer-admin-card__head">
          <strong>${stars}</strong>
          <span class="badge">${isNew ? 'تقييم جديد — ' : ''}${statusLabel}</span>
        </div>
        <p>${escapeHtml(r.comment || '—')}</p>
        <ul class="offer-admin-card__meta">
          <li><span>الاسم:</span> ${escapeHtml(r.displayName || 'عميل')}</li>
          <li><span>المدينة:</span> ${escapeHtml(r.city || '—')}</li>
          <li><span>النشر:</span> ${consent}</li>
          <li><span>التاريخ:</span> ${formatDate(r.submittedAt)}</li>
        </ul>
        ${r.status === 'pending' ? `
          <div class="offer-admin-card__actions">
            <button type="button" class="btn btn-primary btn-sm" data-approve="${r.id}">اعتماد</button>
            <button type="button" class="btn btn-outline btn-sm" data-hide="${r.id}">إخفاء</button>
          </div>` : ''}
      </article>
    `;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
});
