document.addEventListener('DOMContentLoaded', async () => {
  const highlightId = new URLSearchParams(location.search).get('property');
  await initLayout('property-reviews', 'إعلانات بانتظار الموافقة');
  const content = getPageContent();
  content.innerHTML = `
    <div class="card">
      <div class="card__body">
        <p class="form-hint" style="margin-bottom:1rem">إعلانات المسوقين لا تظهر للعامة حتى اعتمادها — بعد الموافقة تُنشر باسم مكتب الهيف للخدمات العقارية.</p>
        <div class="filter-bar" style="margin-bottom:1rem">
          <select id="status-filter" class="form-control" style="max-width:260px">
            <option value="pending_review">بانتظار الموافقة</option>
            <option value="needs_changes">يحتاج تعديل</option>
            <option value="rejected">مرفوض</option>
            <option value="approved_published">معتمد ومنشور</option>
            <option value="hidden">مخفي</option>
            <option value="expired">منتهي الترخيص</option>
            <option value="archived">مؤرشف</option>
          </select>
        </div>
        <div id="list-wrap"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </div>
  `;

  document.getElementById('status-filter').addEventListener('change', load);
  await load();

  if (highlightId) {
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${highlightId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('offer-admin-card--highlight');
    }, 400);
  }

  async function load() {
    const wrap = document.getElementById('list-wrap');
    wrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const status = document.getElementById('status-filter').value;
      const { items } = await DashboardAPI.getPropertyReviews(status);
      wrap.innerHTML = renderList(items || []);
    } catch (err) {
      wrap.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  function renderList(items) {
    if (!items.length) return '<p class="empty-state">لا توجد إعلانات في هذا القسم</p>';
    return `<div class="offers-grid">${items.map((p) => `
      <article class="offer-admin-card" data-id="${p.id}">
        <h3>${p.title}</h3>
        <p><span class="badge">${p.statusLabel || p.status}</span></p>
        <ul class="review-meta">
          <li><strong>المسوق:</strong> ${p.marketerName || '—'}</li>
          <li><strong>نوع العقار:</strong> ${p.propertyType || '—'}</li>
          <li><strong>الحي:</strong> ${p.district || '—'}</li>
          <li><strong>السعر:</strong> ${p.price || '—'} ر.س</li>
          <li><strong>تاريخ الإضافة:</strong> ${formatDate(p.createdAt)}</li>
          ${p.reviewedAt ? `<li><strong>تاريخ المراجعة:</strong> ${formatDate(p.reviewedAt)}</li>` : ''}
          ${p.approvedAt ? `<li><strong>تاريخ الموافقة:</strong> ${formatDate(p.approvedAt)}</li>` : ''}
          ${p.homepagePublished ? '<li><strong>الصفحة الرئيسية:</strong> منشور ✓</li>' : ''}
        </ul>
        ${p.adminFeedback ? `<p class="form-hint">ملاحظات سابقة: ${p.adminFeedback}</p>` : ''}
        <textarea class="form-control review-feedback" rows="2" placeholder="ملاحظات للمسوق (عند الرفض أو طلب التعديل)">${p.adminFeedback || ''}</textarea>
        <div class="review-actions">
          <a href="/dashboard/add-property.html?id=${p.id}" class="btn btn-outline btn-sm">عرض التفاصيل</a>
          ${p.status === 'pending_review' || p.status === 'needs_changes' ? `
            <button type="button" class="btn btn-primary btn-sm" data-action="approve">موافقة ونشر</button>
            <button type="button" class="btn btn-outline btn-sm" data-action="needs_changes">طلب تعديل</button>
            <button type="button" class="btn btn-outline btn-sm" data-action="reject">رفض</button>
          ` : ''}
          ${p.status === 'approved_published' || p.status === 'published' ? `
            <button type="button" class="btn btn-outline btn-sm" data-action="hide">إخفاء</button>
          ` : ''}
          <button type="button" class="btn btn-outline btn-sm" data-action="archive">أرشفة</button>
        </div>
      </article>
    `).join('')}</div>`;
  }

  content.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-id]');
    if (!card) return;
    const id = card.dataset.id;
    const adminFeedback = card.querySelector('.review-feedback')?.value || '';
    const action = btn.dataset.action;
    const confirmMsgs = {
      approve: 'اعتماد الإعلان ونشره على الموقع العام (الرئيسية، العقارات، البحث، الخريطة)؟',
      reject: 'رفض هذا الإعلان؟ لن يظهر للعامة.',
      needs_changes: 'إرسال طلب تعديل للمسوق؟',
      hide: 'إخفاء الإعلان من الموقع العام؟',
    };
    if (confirmMsgs[action] && !confirm(confirmMsgs[action])) return;
    btn.disabled = true;
    try {
      await DashboardAPI.reviewProperty(id, { action, adminFeedback });
      showToast(action === 'approve' ? 'تم اعتماد الإعلان ونشره' : 'تم تحديث الإعلان');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
});
