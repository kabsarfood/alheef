document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('requests', 'طلبات العملاء');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="table-wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  try {
    const [requests, listings] = await Promise.all([
      DashboardAPI.getRequests(),
      DashboardAPI.getListings(),
    ]);

    content.querySelector('#table-wrap').innerHTML = `
      <h3 style="margin-bottom:1rem;font-size:1rem">طلبات البحث عن عقار (${requests.length})</h3>
      ${renderTable(requests, ['propertyType', 'city', 'district', 'budget', 'phone', 'createdAt'])}
      <h3 style="margin:2rem 0 1rem;font-size:1rem">عروض الملاك للبيع (${listings.length})</h3>
      ${renderTable(listings, ['ownerName', 'propertyType', 'city', 'phone', 'createdAt'])}
    `;
  } catch {
    content.querySelector('#table-wrap').innerHTML =
      '<div class="empty-state"><p>تعذر تحميل البيانات</p></div>';
  }
});

function renderTable(rows, cols) {
  if (!rows.length) return '<p class="empty-state" style="padding:1.5rem">لا توجد بيانات</p>';

  const labels = {
    propertyType: 'النوع', city: 'المدينة', district: 'الحي', budget: 'الميزانية',
    phone: 'الجوال', createdAt: 'التاريخ', ownerName: 'المالك',
  };

  return `
    <div class="table-wrap">
      <table class="table table--cards">
        <thead><tr>${cols.map((c) => `<th>${labels[c] || c}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              ${cols.map((c) => `<td data-label="${labels[c] || c}"${c === 'phone' ? ' dir="ltr"' : ''}>${
                c === 'createdAt' ? formatDate(r[c]) : (r[c] || '—')
              }</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
