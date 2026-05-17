document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('subscriptions', 'الاشتراكات والتنبيهات');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="table-wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  try {
    const subs = await DashboardAPI.getSubscriptions();
    const wrap = content.querySelector('#table-wrap');

    if (!subs.length) {
      wrap.innerHTML = '<div class="empty-state"><p>لا توجد اشتراكات بعد</p></div>';
      return;
    }

    wrap.innerHTML = `
      <p style="color:#8a8580;margin-bottom:1rem;font-size:0.85rem">جاهزة للربط لاحقاً مع واتساب API</p>
      <div class="table-wrap">
        <table class="table table--cards">
          <thead><tr><th>الاسم</th><th>الجوال</th><th>الاهتمامات</th><th>التاريخ</th></tr></thead>
          <tbody>
            ${subs.map((s) => `
              <tr>
                <td data-label="الاسم">${s.name}</td>
                <td data-label="الجوال" dir="ltr">${s.phone}</td>
                <td data-label="الاهتمامات">${s.interests || 'الكل'}</td>
                <td data-label="التاريخ">${formatDate(s.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch {
    content.querySelector('#table-wrap').innerHTML =
      '<div class="empty-state"><p>تعذر تحميل الاشتراكات</p></div>';
  }
});
