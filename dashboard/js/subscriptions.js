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
        <table class="table">
          <thead><tr><th>الاسم</th><th>الجوال</th><th>الاهتمامات</th><th>التاريخ</th></tr></thead>
          <tbody>
            ${subs.map((s) => `
              <tr>
                <td>${s.name}</td>
                <td dir="ltr">${s.phone}</td>
                <td>${s.interests || 'الكل'}</td>
                <td>${formatDate(s.createdAt)}</td>
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
