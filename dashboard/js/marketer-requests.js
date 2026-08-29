document.addEventListener('DOMContentLoaded', async () => {
  const highlightId = new URLSearchParams(location.search).get('request');
  await initLayout('marketer-requests', 'طلبات الانضمام لفريق المسوقين');
  const content = getPageContent();
  content.innerHTML = `
    <div class="card">
      <div class="card__body">
        <div class="filter-bar" style="margin-bottom:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
          <select id="status-filter" class="form-control" style="max-width:220px">
            <option value="">كل الحالات</option>
            <option value="pending">بانتظار المراجعة</option>
            <option value="approved">تمت الموافقة</option>
            <option value="rejected">مرفوض</option>
            <option value="needs_info">يحتاج معلومات إضافية</option>
          </select>
        </div>
        <div id="table-wrap"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </div>
  `;

  document.getElementById('status-filter').addEventListener('change', load);
  await load();

  async function load() {
    const wrap = document.getElementById('table-wrap');
    wrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const status = document.getElementById('status-filter').value;
      const { items } = await DashboardAPI.getMarketerJoinRequests(status);
      wrap.innerHTML = renderTable(items || []);
      if (highlightId) {
        await DashboardAPI.markCustomerRequestNotificationRead(highlightId).catch(() => {});
        setTimeout(() => {
          const el = document.querySelector(`[data-id="${highlightId}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.classList.add('table-row--highlight');
        }, 400);
      }
    } catch (err) {
      wrap.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  function renderTable(rows) {
    if (!rows.length) return '<p class="empty-state">لا توجد طلبات</p>';
    return `<div class="table-wrap"><table class="table table--cards">
      <thead><tr>
        <th>الاسم</th><th>الجوال</th><th>البريد</th><th>الهوية</th><th>رخصة فال</th><th>نطاق التسويق</th><th>التاريخ والوقت</th><th>الحالة</th><th>إجراءات</th>
      </tr></thead>
      <tbody>${rows.map((r) => `<tr data-id="${r.id}">
        <td data-label="الاسم">${r.fullName}</td>
        <td data-label="الجوال" dir="ltr">${r.phone}</td>
        <td data-label="البريد" dir="ltr">${r.email || '—'}</td>
        <td data-label="الهوية">${r.nationalId}</td>
        <td data-label="رخصة فال">${r.falLicense}</td>
        <td data-label="النطاق">${r.marketingZoneLabel || r.marketingZone}</td>
        <td data-label="التاريخ والوقت" dir="ltr">${formatDateTime(r.createdAt)}</td>
        <td data-label="الحالة"><span class="badge">${r.statusLabel || r.status}</span></td>
        <td data-label="إجراءات">${renderActions(r)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function renderActions(r) {
    if (r.status !== 'pending' && r.status !== 'needs_info') {
      return r.adminNote ? `<small>ملاحظة: ${r.adminNote}</small>` : '—';
    }
    return `
      <div class="action-stack" style="display:flex;flex-direction:column;gap:0.35rem;min-width:140px">
        <textarea class="form-control admin-note" rows="2" placeholder="ملاحظة داخلية">${r.adminNote || ''}</textarea>
        <button type="button" class="btn btn-primary btn-sm" data-action="approve">موافقة</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="needs_info">طلب معلومات</button>
        <button type="button" class="btn btn-outline btn-sm" data-action="reject">رفض</button>
      </div>
    `;
  }

  content.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const note = row.querySelector('.admin-note')?.value || '';
    const action = btn.dataset.action;
    if (action === 'reject' && !confirm('رفض هذا الطلب؟')) return;
    btn.disabled = true;
    try {
      const data = await DashboardAPI.updateMarketerJoinRequest(id, { action, adminNote: note });
      if (data.approvalMessage) showToast(data.approvalMessage);
      else showToast('تم تحديث الطلب');
      await load();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
});
