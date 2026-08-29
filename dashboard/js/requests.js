document.addEventListener('DOMContentLoaded', async () => {
  const highlightId = new URLSearchParams(location.search).get('request');
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

    content.querySelectorAll('[data-ejar-review-link]').forEach((btn) => {
      btn.addEventListener('click', () => openReviewLink(btn.dataset.id, btn));
    });

    if (highlightId) {
      await DashboardAPI.markCustomerRequestNotificationRead(highlightId).catch(() => {});
      setTimeout(() => {
        const el = document.querySelector(`[data-request-id="${highlightId}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.classList.add('table-row--highlight');
      }, 400);
    }
  } catch {
    content.querySelector('#table-wrap').innerHTML = '<p class="empty-state">تعذر تحميل البيانات</p>';
  }
});

async function openReviewLink(requestId, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جاري الإنشاء…';
  try {
    const data = await DashboardAPI.createEjarReviewLink(requestId);
    const msg = [
      `رابط التقييم (صالح ${data.expiryDays} يومًا):`,
      data.reviewUrl,
      '',
      data.whatsappMessage,
    ].join('\n');
    await navigator.clipboard.writeText(data.reviewUrl).catch(() => {});
    alert(`${msg}\n\nتم نسخ الرابط.`);
    if (data.whatsappUrl && confirm('فتح واتساب لإرسال الرسالة للعميل؟')) {
      window.open(data.whatsappUrl, '_blank', 'noopener');
    }
  } catch (err) {
    alert(err.message || 'تعذر إنشاء رابط التقييم');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

const REQUEST_TYPE_LABELS = {
  property_search: 'طلب عقار',
  owner_listing: 'عرض عقار للبيع',
  ejar_contract: 'عقد إيجار',
};

function requestTypeLabel(type) {
  return REQUEST_TYPE_LABELS[type] || type || '—';
}

function renderTable(rows) {
  if (!rows.length) return '<p class="empty-state">لا توجد طلبات</p>';
  return `<div class="table-wrap"><table class="table table--cards">
    <thead><tr><th>النوع</th><th>الاسم</th><th>الجوال</th><th>البريد</th><th>الحالة</th><th>التاريخ والوقت</th><th>إجراء</th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-request-id="${r.id}">
      <td data-label="النوع">${escapeCell(requestTypeLabel(r.requestType))}</td>
      <td data-label="الاسم">${escapeCell(r.customerName || '—')}</td>
      <td data-label="الجوال" dir="ltr">${escapeCell(r.customerPhone || '—')}</td>
      <td data-label="البريد">${escapeCell(r.customerEmail || '—')}</td>
      <td data-label="الحالة">${escapeCell(r.status)}</td>
      <td data-label="التاريخ والوقت" dir="ltr">${escapeCell(formatDateTime(r.createdAt))}</td>
      <td data-label="إجراء">${r.requestType === 'ejar_contract'
        ? `<button type="button" class="btn btn-outline btn-sm" data-ejar-review-link data-id="${r.id}">رابط تقييم</button>`
        : '—'}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function escapeCell(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
