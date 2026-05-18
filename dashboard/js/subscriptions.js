document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('subscriptions', 'النشرة البريدية');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  try {
    const data = await DashboardAPI.getSubscriptions();
    const list = Array.isArray(data) ? data : data.data || [];
    content.querySelector('#wrap').innerHTML = `
      <h3 style="margin-bottom:1rem">المشتركون (${list.length})</h3>
      <div class="table-wrap"><table class="table table--cards">
        <thead><tr><th>البريد</th><th>التاريخ</th></tr></thead>
        <tbody>${list.map((s) => `<tr>
          <td data-label="البريد" dir="ltr">${s.email}</td>
          <td data-label="التاريخ">${formatDate(s.createdAt)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    `;
  } catch {
    content.querySelector('#wrap').innerHTML = '<p class="empty-state">تعذر التحميل</p>';
  }
});
