document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('requests', 'طلبات العملاء');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="table-wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  try {
    const rows = await DashboardAPI.getRequests();
    const list = Array.isArray(rows) ? rows : rows.data || [];

    content.querySelector('#table-wrap').innerHTML = `
      <h3 style="margin-bottom:1rem">الطلبات (${list.length})</h3>
      ${renderTable(list)}
    `;
  } catch {
    content.querySelector('#table-wrap').innerHTML = '<p class="empty-state">تعذر تحميل البيانات</p>';
  }
});

function renderTable(rows) {
  if (!rows.length) return '<p class="empty-state">لا توجد طلبات</p>';
  return `<div class="table-wrap"><table class="table table--cards">
    <thead><tr><th>النوع</th><th>الاسم</th><th>الجوال</th><th>البريد</th><th>الحالة</th><th>التاريخ</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td data-label="النوع">${r.requestType}</td>
      <td data-label="الاسم">${r.customerName || '—'}</td>
      <td data-label="الجوال" dir="ltr">${r.customerPhone || '—'}</td>
      <td data-label="البريد">${r.customerEmail || '—'}</td>
      <td data-label="الحالة">${r.status}</td>
      <td data-label="التاريخ">${formatDate(r.createdAt)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
