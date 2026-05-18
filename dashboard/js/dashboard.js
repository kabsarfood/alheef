function parseRequestRow(r) {
  let type = r.requestType || '—';
  let name = r.customerName || '—';
  const phone = r.customerPhone || '—';
  if (r.message) {
    try {
      const d = JSON.parse(r.message);
      if (d.propertyType) type = d.propertyType;
      if (d.city) name = d.city;
    } catch { /* plain text */ }
  }
  return { type, name, phone };
}

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('index', 'لوحة التحكم');
  const content = getPageContent();

  content.innerHTML = [
    '<div class="stats-grid" id="stats-grid">',
    '  <div class="loading"><div class="spinner"></div></div>',
    '</div>',
    '<div class="card" style="margin-bottom:1.5rem">',
    '  <div class="card__header"><h2 class="card__title">إجراءات سريعة</h2></div>',
    '  <div class="card__body">',
    '    <div class="quick-actions">',
    '      <a href="/dashboard/add-property.html" class="quick-action">',
    '        <div class="quick-action__icon">＋</div>',
    '        <div class="quick-action__text"><strong>إضافة إعلان</strong><span>نشر عقار جديد</span></div>',
    '      </a>',
    '      <a href="/dashboard/offers.html" class="quick-action">',
    '        <div class="quick-action__icon">◇</div>',
    '        <div class="quick-action__text"><strong>العروض</strong><span>إدارة الإعلانات</span></div>',
    '      </a>',
    '      <a href="/dashboard/news.html" class="quick-action">',
    '        <div class="quick-action__icon">◉</div>',
    '        <div class="quick-action__text"><strong>الأخبار</strong><span>محتوى السوق العقاري</span></div>',
    '      </a>',
    '      <a href="/dashboard/requests.html" class="quick-action">',
    '        <div class="quick-action__icon">◎</div>',
    '        <div class="quick-action__text"><strong>الطلبات</strong><span>طلبات العملاء</span></div>',
    '      </a>',
    '    </div>',
    '  </div>',
    '</div>',
    '<div class="card">',
    '  <div class="card__header"><h2 class="card__title">آخر الطلبات</h2></div>',
    '  <div class="card__body" id="recent-requests">',
    '    <div class="loading"><div class="spinner"></div></div>',
    '  </div>',
    '</div>',
  ].join('\n');

  try {
    const stats = await DashboardAPI.getStats();
    document.getElementById('stats-grid').innerHTML = [
      `<div class="stat-card"><p class="stat-card__label">إجمالي العروض</p><p class="stat-card__value stat-card__value--gold">${stats.offers}</p></div>`,
      `<div class="stat-card"><p class="stat-card__label">منشور</p><p class="stat-card__value">${stats.published}</p></div>`,
      `<div class="stat-card"><p class="stat-card__label">الأخبار</p><p class="stat-card__value">${stats.news}</p></div>`,
      `<div class="stat-card"><p class="stat-card__label">طلبات العملاء</p><p class="stat-card__value">${stats.requests}</p></div>`,
      `<div class="stat-card"><p class="stat-card__label">الاشتراكات</p><p class="stat-card__value">${stats.subscriptions}</p></div>`,
    ].join('');

    const rawReq = await DashboardAPI.getRequests();
    const requests = Array.isArray(rawReq) ? rawReq : rawReq.data || [];
    const recent = requests.slice(0, 5);
    const el = document.getElementById('recent-requests');

    if (!recent.length) {
      el.innerHTML = '<div class="empty-state"><p>لا توجد طلبات بعد</p></div>';
    } else {
      el.innerHTML = `
        <div class="table-wrap">
          <table class="table table--cards">
            <thead><tr><th>النوع</th><th>العميل</th><th>الجوال</th><th>التاريخ</th></tr></thead>
            <tbody>
              ${recent.map((r) => {
                const d = parseRequestRow(r);
                return `<tr>
                  <td data-label="النوع">${d.type}</td>
                  <td data-label="العميل">${d.name}</td>
                  <td data-label="الجوال" dir="ltr">${d.phone}</td>
                  <td data-label="التاريخ">${formatDate(r.createdAt)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch {
    document.getElementById('stats-grid').innerHTML =
      '<div class="empty-state"><p>تعذر تحميل الإحصائيات</p></div>';
  }
});
