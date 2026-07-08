(async function () {
  'use strict';
  await initMarketerLayout('index', 'لوحة مسوق الهيف');
  const root = getMarketerContent();
  if (!root) return;

  root.innerHTML = '<p class="loading">جاري التحميل…</p>';

  try {
    const { counts } = await MarketerAPI.getStats();
    root.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><span class="stat-card__label">إجمالي إعلاناتي</span><strong class="stat-card__value">${counts.all}</strong></div>
        <div class="stat-card"><span class="stat-card__label">بانتظار المراجعة</span><strong class="stat-card__value">${counts.pending_review}</strong></div>
        <div class="stat-card"><span class="stat-card__label">تحتاج تعديل</span><strong class="stat-card__value">${counts.needs_changes}</strong></div>
        <div class="stat-card"><span class="stat-card__label">منشورة</span><strong class="stat-card__value">${counts.published}</strong></div>
        <div class="stat-card"><span class="stat-card__label">منتهية الترخيص</span><strong class="stat-card__value">${counts.expired}</strong></div>
      </div>
      <div class="card" style="margin-top:1.5rem">
        <div class="card__body">
          <h3>مرحباً بك في فريق الهيف</h3>
          <p class="form-hint">أضف إعلاناتك المرخصة فقط — تُراجع من إدارة المكتب قبل النشر على الموقع العام باسم مكتب الهيف للخدمات العقارية.</p>
          <a href="/marketer/add-property.html" class="btn btn-primary" style="margin-top:1rem">إضافة إعلان جديد</a>
        </div>
      </div>
    `;
  } catch (err) {
    root.innerHTML = `<p class="error">${err.message}</p>`;
  }
})();
