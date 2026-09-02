document.addEventListener('DOMContentLoaded', async () => {
  const highlightId = new URLSearchParams(location.search).get('request');
  await initLayout('requests', 'طلبات العملاء');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="table-wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  try {
    const rows = await DashboardAPI.getRequests();
    const list = Array.isArray(rows) ? rows : rows.data || [];
    renderRequestsPage(content, list, highlightId);

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

const REQUEST_TYPE_LABELS = {
  property_search: 'طلب عقار',
  owner_listing: 'عرض عقار للبيع',
  ejar_contract: 'عقد إيجار',
};

const EJAR_STATUS_OPTIONS = [
  ['new', 'جديد'],
  ['under_review', 'تحت المراجعة'],
  ['missing_data', 'ناقص بيانات'],
  ['ready_to_create', 'جاهز للإنشاء'],
  ['contract_created', 'تم إنشاء العقد'],
  ['sent_for_auth', 'أرسل للتوثيق'],
  ['authenticated', 'موثق'],
  ['cancelled', 'ملغي'],
  ['in_progress', 'قيد المعالجة'],
  ['done', 'مكتمل'],
];

function requestTypeLabel(type) {
  return REQUEST_TYPE_LABELS[type] || type || '—';
}

function escapeCell(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeHttpUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  try {
    const parsed = new URL(s, window.location.origin);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function deedImageHtml(url) {
  const safe = safeHttpUrl(url);
  if (!safe) return '<span>لم تُرفق</span>';
  return `<a class="req-deed" href="${escapeCell(safe)}" target="_blank" rel="noopener noreferrer">
    <img class="req-deed__img" src="${escapeCell(safe)}" alt="صورة الصك">
    <span>فتح الصورة في تبويب جديد</span>
  </a>`;
}

function parseMessage(message) {
  if (!message) return {};
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function isEjarWizard(payload) {
  return payload.schema === 'ejar_contract_v2' || Boolean(payload.deedNumber && payload.ownerId);
}

function ejarKindLabel(payload) {
  const raw = String(payload.contractKind || payload.contractType || '').trim();
  if (raw === 'commercial' || raw === 'تجاري') return 'تجاري';
  if (raw === 'residential' || raw === 'سكني') return 'سكني';
  return '—';
}

function statusLabel(status) {
  return (EJAR_STATUS_OPTIONS.find(([k]) => k === status) || [status, status || '—'])[1];
}

function displayUnit(payload) {
  if (payload.unitType === 'وحدة تجارية أخرى' && payload.unitTypeOther) return payload.unitTypeOther;
  return payload.unitType || '—';
}

function displayFloor(payload) {
  if (payload.floor === 'أخرى' && payload.floorOther) return payload.floorOther;
  return payload.floor || '—';
}

function displayDuration(payload) {
  if (payload.contractDuration === 'مدة أخرى' && payload.contractDurationOther) return payload.contractDurationOther;
  return payload.contractDuration || '—';
}

function displayDeposit(payload) {
  if (payload.hasDeposit === 'نعم') {
    return payload.depositAmount != null ? `${payload.depositAmount} ريال` : 'نعم';
  }
  return payload.hasDeposit || '—';
}

function copyBtn(value) {
  const v = String(value || '').trim();
  if (!v || v === '—') return '';
  return `<button type="button" class="btn btn-outline btn-sm req-copy" data-copy="${escapeCell(v)}">نسخ</button>`;
}

function valueWithCopy(value) {
  return `<span class="req-copy-wrap"><span dir="ltr">${escapeCell(value || '—')}</span>${copyBtn(value)}</span>`;
}

function dateFieldHtml(iso) {
  if (window.EjarDates && typeof window.EjarDates.html === 'function') {
    const html = window.EjarDates.html(iso, '—');
    const plain = window.EjarDates.plain(iso);
    if (!plain) return html;
    return `<div class="req-date-wrap">${html}${copyBtn(plain)}</div>`;
  }
  return escapeCell(iso || '—');
}

function renderRequestsPage(content, list, highlightId) {
  const ejar = list.filter((r) => r.requestType === 'ejar_contract');
  const others = list.filter((r) => r.requestType !== 'ejar_contract');
  content.querySelector('#table-wrap').innerHTML = `
    <div class="req-page-head">
      <h3>الطلبات (${list.length})</h3>
    </div>
    <section class="req-section">
      <h4>عقود إيجار</h4>
      ${renderEjarTable(ejar)}
    </section>
    <section class="req-section">
      <h4>طلبات أخرى</h4>
      ${renderOtherTable(others)}
    </section>
    <div class="modal" id="req-modal" hidden></div>
  `;

  content.querySelectorAll('[data-ejar-review-link]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openReviewLink(btn.dataset.id, btn);
    });
  });
  content.querySelectorAll('[data-open-request]').forEach((el) => {
    el.addEventListener('click', () => {
      const row = list.find((r) => r.id === el.dataset.openRequest);
      if (row) openRequestModal(row);
    });
  });
  content.querySelectorAll('.req-copy').forEach(bindCopy);
  bindModal(content.querySelector('#req-modal'));

  if (highlightId) {
    const highlighted = list.find((r) => r.id === highlightId);
    if (highlighted) openRequestModal(highlighted);
  }
}

function renderEjarTable(rows) {
  if (!rows.length) return '<p class="empty-state">لا توجد طلبات عقود إيجار</p>';
  return `<div class="table-wrap"><table class="table table--cards">
    <thead><tr>
      <th>رقم الطلب</th><th>سكني / تجاري</th><th>جوال المالك</th><th>جوال المستأجر</th>
      <th>قيمة الإيجار</th><th>طريقة الدفع</th><th>تاريخ الطلب</th><th>الحالة</th><th>إجراء</th>
    </tr></thead>
    <tbody>${rows.map((r) => {
      const p = parseMessage(r.message);
      const ownerPhone = p.ownerPhone || r.customerPhone || '—';
      const tenantPhone = p.tenantPhone || '—';
      const rent = p.rentAmount != null ? `${p.rentAmount} ريال` : '—';
      return `<tr data-request-id="${escapeCell(r.id)}" data-open-request="${escapeCell(r.id)}">
        <td data-label="رقم الطلب" dir="ltr">${escapeCell(r.referenceNo || p.referenceNo || '—')}</td>
        <td data-label="النوع">${escapeCell(ejarKindLabel(p))}</td>
        <td data-label="جوال المالك">${valueWithCopy(ownerPhone)}</td>
        <td data-label="جوال المستأجر">${valueWithCopy(tenantPhone)}</td>
        <td data-label="قيمة الإيجار">${valueWithCopy(p.rentAmount != null ? String(p.rentAmount) : '')}</td>
        <td data-label="طريقة الدفع">${escapeCell(p.paymentMethod || '—')}</td>
        <td data-label="تاريخ الطلب" dir="ltr">${escapeCell(formatDateTime(r.createdAt))}</td>
        <td data-label="الحالة">${escapeCell(statusLabel(r.status))}</td>
        <td data-label="إجراء">
          <button type="button" class="btn btn-primary btn-sm" data-open-request="${escapeCell(r.id)}">عرض</button>
          <button type="button" class="btn btn-outline btn-sm" data-ejar-review-link data-id="${escapeCell(r.id)}">رابط تقييم</button>
        </td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderOtherTable(rows) {
  if (!rows.length) return '<p class="empty-state">لا توجد طلبات أخرى</p>';
  return `<div class="table-wrap"><table class="table table--cards">
    <thead><tr><th>النوع</th><th>الاسم</th><th>الجوال</th><th>البريد</th><th>الحالة</th><th>التاريخ والوقت</th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-request-id="${escapeCell(r.id)}" data-open-request="${escapeCell(r.id)}">
      <td data-label="النوع">${escapeCell(requestTypeLabel(r.requestType))}</td>
      <td data-label="الاسم">${escapeCell(r.customerName || '—')}</td>
      <td data-label="الجوال" dir="ltr">${escapeCell(r.customerPhone || '—')}</td>
      <td data-label="البريد">${escapeCell(r.customerEmail || '—')}</td>
      <td data-label="الحالة">${escapeCell(statusLabel(r.status))}</td>
      <td data-label="التاريخ والوقت" dir="ltr">${escapeCell(formatDateTime(r.createdAt))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function rowItem(label, value, { copy = false, html = false } = {}) {
  const inner = html
    ? value
    : (copy ? valueWithCopy(value) : `<span>${escapeCell(value || '—')}</span>`);
  return `<div class="req-detail__row${html ? ' req-detail__row--stack' : ''}">
    <span class="req-detail__label">${escapeCell(label)}</span>
    <span class="req-detail__value">${inner}</span>
  </div>`;
}

function sectionBlock(title, rows) {
  return `<section class="req-detail__section"><h4>${escapeCell(title)}</h4>${rows.join('')}</section>`;
}

function statusSelect(current) {
  return `<select class="req-status-select" id="req-status">
    ${EJAR_STATUS_OPTIONS.map(([k, label]) => `<option value="${k}"${k === current ? ' selected' : ''}>${label}</option>`).join('')}
  </select>`;
}

function openRequestModal(row) {
  const modal = document.getElementById('req-modal');
  if (!modal) return;
  const p = parseMessage(row.message);
  const wizard = row.requestType === 'ejar_contract' && isEjarWizard(p);
  let body = '';
  if (wizard) {
    body = [
      sectionBlock('بيانات الملكية', [
        rowItem('رقم الصك', p.deedNumber, { copy: true }),
        rowItem('تاريخ الصك', dateFieldHtml(p.deedDate), { html: true }),
        rowItem('صورة الصك', deedImageHtml(p.deedImageUrl), { html: true }),
      ]),
      sectionBlock('بيانات المالك', [
        rowItem('رقم الهوية', p.ownerId, { copy: true }),
        rowItem('تاريخ الميلاد', dateFieldHtml(p.ownerDob), { html: true }),
        rowItem('الجوال', p.ownerPhone, { copy: true }),
      ]),
      sectionBlock('بيانات المستأجر', [
        rowItem('رقم الهوية', p.tenantId, { copy: true }),
        rowItem('تاريخ الميلاد', dateFieldHtml(p.tenantDob), { html: true }),
        rowItem('الجوال', p.tenantPhone, { copy: true }),
      ]),
      sectionBlock('بيانات الوحدة', [
        rowItem('النوع', displayUnit(p)),
        rowItem('الدور', displayFloor(p)),
        rowItem('رقم الوحدة', p.unitNumber, { copy: true }),
        rowItem('المساحة', p.area != null ? `${p.area} م²` : '—'),
      ]),
      sectionBlock('تفاصيل العقد', [
        rowItem('قيمة الإيجار', p.rentAmount != null ? String(p.rentAmount) : '', { copy: true }),
        rowItem('طريقة الدفع', p.paymentMethod),
        rowItem('مدة العقد', displayDuration(p)),
        rowItem('تاريخ البداية', dateFieldHtml(p.startDate), { html: true }),
        rowItem('مبلغ الضمان', displayDeposit(p)),
        rowItem('سعر الخدمة', p.servicePrice != null ? `${p.servicePrice} ريال` : '—'),
      ]),
    ].join('');
  } else {
    body = sectionBlock('تفاصيل الطلب', [
      rowItem('الاسم', row.customerName),
      rowItem('الجوال', row.customerPhone, { copy: true }),
      rowItem('البريد', row.customerEmail),
      rowItem('النوع', requestTypeLabel(row.requestType)),
      rowItem('نوع العقد', p.contractType || p.contractKind),
      rowItem('المدينة', p.city),
      rowItem('الصفة', p.role),
      rowItem('الرسالة', typeof row.message === 'string' && !p.contractType ? row.message : JSON.stringify(p, null, 2)),
    ]);
  }

  modal.hidden = false;
  modal.classList.add('active');
  modal.innerHTML = `
    <div class="modal__backdrop" data-close-req></div>
    <div class="modal__box req-detail" role="dialog" aria-modal="true">
      <div class="modal__header">
        <h3 class="modal__title">${escapeCell(row.referenceNo || p.referenceNo || requestTypeLabel(row.requestType))}</h3>
        <button type="button" class="modal__close" data-close-req aria-label="إغلاق">×</button>
      </div>
      <p class="req-detail__meta">${escapeCell(ejarKindLabel(p) !== '—' ? ejarKindLabel(p) : requestTypeLabel(row.requestType))} — ${escapeCell(formatDateTime(row.createdAt))}</p>
      <div class="req-detail__status">
        <label for="req-status">حالة الطلب</label>
        ${statusSelect(row.status)}
        <button type="button" class="btn btn-primary btn-sm" id="req-save-status">حفظ الحالة</button>
      </div>
      ${body}
    </div>
  `;
  modal.querySelectorAll('.req-copy').forEach(bindCopy);
  modal.querySelector('#req-save-status')?.addEventListener('click', async () => {
    const status = modal.querySelector('#req-status')?.value;
    try {
      await DashboardAPI.updateRequestStatus(row.id, status);
      showToast('تم تحديث حالة الطلب');
      row.status = status;
      const cell = document.querySelector(`[data-request-id="${row.id}"] td[data-label="الحالة"]`);
      if (cell) cell.textContent = statusLabel(status);
    } catch (err) {
      showToast(err.message || 'تعذر تحديث الحالة', 'error');
    }
  });
}

function bindModal(modal) {
  if (!modal) return;
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-req]')) closeRequestModal();
  });
}

function closeRequestModal() {
  const modal = document.getElementById('req-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.hidden = true;
  modal.innerHTML = '';
}

function bindCopy(btn) {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = btn.getAttribute('data-copy') || '';
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'تم';
      setTimeout(() => { btn.textContent = original; }, 1200);
    } catch {
      showToast('تعذر النسخ', 'error');
    }
  });
}

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
