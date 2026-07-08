document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('marketers', 'المسوقون');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="table-wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  try {
    const { items } = await DashboardAPI.getMarketers();
    content.querySelector('#table-wrap').innerHTML = renderTable(items || []);
    content.addEventListener('click', onAction);
  } catch (err) {
    content.querySelector('#table-wrap').innerHTML = `<p class="empty-state">${err.message}</p>`;
  }

  function renderTable(rows) {
    if (!rows.length) return '<p class="empty-state">لا يوجد مسوقون مسجلون</p>';
    return `<div class="table-wrap"><table class="table table--cards">
      <thead><tr><th>الاسم</th><th>الجوال</th><th>نطاق التسويق</th><th>الحالة</th><th>تاريخ الانضمام</th><th>إجراءات</th></tr></thead>
      <tbody>${rows.map((m) => `<tr data-id="${m.id}">
        <td data-label="الاسم">${m.fullName}</td>
        <td data-label="الجوال" dir="ltr">${m.phone}</td>
        <td data-label="النطاق">${m.marketingZoneLabel || '—'}</td>
        <td data-label="الحالة"><span class="badge">${m.statusLabel || m.status}</span></td>
        <td data-label="التاريخ">${formatDate(m.createdAt)}</td>
        <td data-label="إجراءات">${m.status === 'active'
    ? `<button type="button" class="btn btn-outline btn-sm" data-suspend="${m.id}">إيقاف الحساب</button>`
    : `<button type="button" class="btn btn-primary btn-sm" data-activate="${m.id}">تفعيل</button>`}
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  async function onAction(e) {
    const suspend = e.target.closest('[data-suspend]');
    const activate = e.target.closest('[data-activate]');
    if (!suspend && !activate) return;
    const id = (suspend || activate).dataset.suspend || (suspend || activate).dataset.activate;
    const status = suspend ? 'suspended' : 'active';
    if (suspend && !confirm('إيقاف حساب هذا المسوق؟')) return;
    try {
      await DashboardAPI.updateMarketerStatus(id, status);
      showToast(status === 'active' ? 'تم تفعيل الحساب' : 'تم إيقاف الحساب');
      const { items } = await DashboardAPI.getMarketers();
      content.querySelector('#table-wrap').innerHTML = renderTable(items || []);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
});
