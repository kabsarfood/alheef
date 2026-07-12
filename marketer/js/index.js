(async function () {
  'use strict';
  await initMarketerLayout('index', 'لوحة مسوق الهيف');
  const root = getMarketerContent();
  if (!root) return;

  root.innerHTML = '<p class="loading">جاري التحميل…</p>';

  try {
    const { counts } = await MarketerAPI.getStats();
    const profile = MarketerAuth.profile || {};
    const name = profile.fullName || 'مسوق الهيف';
    const phone = profile.phone || '';
    root.innerHTML = `
      <div class="marketer-home">
        <div class="card marketer-welcome-card">
          <div class="card__body">
            <p class="marketer-welcome-name">مرحباً، ${escapeHtml(name)}</p>
            ${phone ? `<p class="marketer-welcome-phone">جوالك: <strong>${escapeHtml(phone)}</strong></p>` : ''}
            <p class="form-hint">لوحتك الخاصة — أضف إعلاناتك المرخصة وسُتنشر على موقع مكتب الهيف.</p>
            <a href="/marketer/add-property.html" class="btn btn-primary" style="margin-top:0.85rem">＋ إضافة إعلان جديد</a>
          </div>
        </div>

        <div class="marketer-quick-actions" aria-label="إجراءات سريعة">
          <a href="/marketer/add-property.html" class="marketer-quick-action">
            <span class="marketer-quick-action__icon">＋</span>
            <span>إضافة إعلان</span>
          </a>
          <a href="/marketer/properties.html" class="marketer-quick-action">
            <span class="marketer-quick-action__icon">◇</span>
            <span>كل إعلاناتي</span>
          </a>
          <a href="/marketer/properties.html?status=approved_published" class="marketer-quick-action">
            <span class="marketer-quick-action__icon">✓</span>
            <span>المنشورة</span>
          </a>
        </div>

        <p class="marketer-stats-title">ملخص إعلاناتك</p>
        <div class="stats-grid marketer-stats">
          <div class="stat-card"><span class="stat-card__label">الإجمالي</span><strong class="stat-card__value">${counts.all}</strong></div>
          <div class="stat-card"><span class="stat-card__label">بانتظار المراجعة</span><strong class="stat-card__value">${counts.pending_review}</strong></div>
          <div class="stat-card"><span class="stat-card__label">تحتاج تعديل</span><strong class="stat-card__value">${counts.needs_changes}</strong></div>
          <div class="stat-card"><span class="stat-card__label">منشورة</span><strong class="stat-card__value">${counts.published}</strong></div>
          <div class="stat-card"><span class="stat-card__label">منتهية الترخيص</span><strong class="stat-card__value">${counts.expired}</strong></div>
        </div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<p class="error">${err.message}</p>`;
  }
})();
