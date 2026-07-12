(async function () {
  'use strict';
  const status = new URLSearchParams(location.search).get('status') || '';
  const pageMap = {
    pending_review: 'pending',
    needs_changes: 'needs',
    approved_published: 'published',
    expired: 'expired',
    rejected: 'rejected',
  };
  const titles = {
    '': 'إعلاناتي',
    pending_review: 'بانتظار المراجعة',
    needs_changes: 'تحتاج تعديل / ملاحظات الإدارة',
    rejected: 'مرفوض',
    approved_published: 'منشورة',
    expired: 'منتهية الترخيص',
  };
  await initMarketerLayout(pageMap[status] || status || 'properties', titles[status] || 'إعلاناتي');
  const root = getMarketerContent();
  if (!root) return;
  root.innerHTML = '<p class="loading">جاري التحميل…</p>';

  try {
    const { items } = await MarketerAPI.getProperties(status);
    if (!items.length) {
      root.innerHTML = '<div class="card"><div class="card__body"><p>لا توجد إعلانات في هذا القسم.</p></div></div>';
      return;
    }
    root.innerHTML = `
      <div class="marketer-properties-grid">
        ${items.map((p) => `
          <article class="offer-admin-card">
            <h3>${escapeHtml(p.title)}</h3>
            <p class="form-hint">${escapeHtml(p.city || '')}${p.district ? ' — ' + escapeHtml(p.district) : ''}</p>
            <p><span class="badge">${escapeHtml(p.statusLabel)}</span></p>
            ${p.adminFeedback ? `<p class="form-hint marketer-feedback">ملاحظات الإدارة: ${escapeHtml(p.adminFeedback)}</p>` : ''}
            <p><strong>${escapeHtml(p.price || '—')} ر.س</strong></p>
            <div class="marketer-card-actions">
              ${(p.status === 'draft' || p.status === 'pending_review' || p.status === 'needs_changes')
    ? `<a class="btn btn-outline btn-sm" href="/marketer/add-property.html?id=${p.id}">تعديل</a>` : ''}
              ${(p.status !== 'approved_published' && p.status !== 'published')
    ? `<button type="button" class="btn btn-outline btn-sm" data-del="${p.id}">حذف</button>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    `;
    root.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('حذف هذا الإعلان؟')) return;
        try {
          await MarketerAPI.deleteProperty(btn.dataset.del);
          showToast('تم الحذف');
          location.reload();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    root.innerHTML = `<p class="error">${err.message}</p>`;
  }
})();
