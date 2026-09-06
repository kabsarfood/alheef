let requestsCache = [];

function sameId(a, b) {
  return String(a || '') === String(b || '');
}

function findRequest(id) {
  return requestsCache.find((r) => sameId(r.id, id));
}

function openRequestById(id) {
  const row = findRequest(id);
  if (!row) {
    showToast('تعذر العثور على الطلب', 'error');
    return;
  }
  try {
    openRequestModal(row);
  } catch (err) {
    console.error(err);
    showToast('تعذر فتح تفاصيل الطلب', 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const highlightId = new URLSearchParams(location.search).get('request');
  await initLayout('requests', 'طلبات العملاء');
  const content = getPageContent();
  content.innerHTML = '<div class="card"><div class="card__body" id="table-wrap"><div class="loading"><div class="spinner"></div></div></div></div>';

  window.addEventListener('alheef:open-request', (e) => {
    const id = e.detail?.id;
    if (!id) return;
    openRequestById(id);
    highlightRequestRow(id);
  });

  try {
    const rows = await DashboardAPI.getRequests();
    const list = Array.isArray(rows) ? rows : rows.data || [];
    renderRequestsPage(content, list, highlightId);

    if (highlightId) {
      await DashboardAPI.markCustomerRequestNotificationRead(highlightId).catch(() => {});
      highlightRequestRow(highlightId);
    }
  } catch {
    content.querySelector('#table-wrap').innerHTML = '<p class="empty-state">تعذر تحميل البيانات</p>';
  }
});

function highlightRequestRow(id) {
  setTimeout(() => {
    const el = document.querySelector(`[data-request-id="${CSS.escape ? CSS.escape(String(id)) : String(id)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelectorAll('.table-row--highlight').forEach((row) => row.classList.remove('table-row--highlight'));
    el?.classList.add('table-row--highlight');
  }, 400);
}

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

function deedFileKind(url) {
  const path = String(url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.pdf')) return 'pdf';
  if (/\.(jpe?g|png|webp|gif|bmp|avif)$/.test(path)) return 'image';
  return 'file';
}

function deedImageHtml(url) {
  const safe = safeHttpUrl(url);
  if (!safe) return '<span>لم تُرفق</span>';
  const kind = deedFileKind(safe);
  if (kind === 'image') {
    return `<a class="req-deed" href="${escapeCell(safe)}" target="_blank" rel="noopener noreferrer">
      <img class="req-deed__img" src="${escapeCell(safe)}" alt="صورة الصك">
      <span>فتح الصورة في تبويب جديد</span>
    </a>`;
  }
  const label = kind === 'pdf' ? 'فتح ملف الصك (PDF)' : 'فتح مرفق الصك';
  return `<a class="req-deed req-deed--file" href="${escapeCell(safe)}" target="_blank" rel="noopener noreferrer">${escapeCell(label)}</a>`;
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
  if (raw === 'sublease' || raw === 'عقد بالباطن' || payload.contractingStatus === 'عقد بالباطن') return 'عقد بالباطن';
  if (raw === 'commercial' || raw === 'تجاري') return 'تجاري';
  if (raw === 'residential' || raw === 'سكني') return 'سكني';
  return '—';
}

function statusLabel(status) {
  return (EJAR_STATUS_OPTIONS.find(([k]) => k === status) || [status, status || '—'])[1];
}

function displayUnit(payload) {
  return payload.unitType || '—';
}

function displayFloor(payload) {
  if (payload.floor === '' || payload.floor == null) return '—';
  return String(payload.floor);
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
  if (window.EjarDates && typeof window.EjarDates.plain === 'function') {
    const plain = window.EjarDates.plain(iso);
    if (!plain) return '—';
    return `<span class="req-copy-wrap"><span>${escapeCell(plain)}</span>${copyBtn(plain)}</span>`;
  }
  return escapeCell(iso || '—');
}

function renderRequestsPage(content, list, highlightId) {
  requestsCache = Array.isArray(list) ? list : [];
  const ejar = requestsCache.filter((r) => r.requestType === 'ejar_contract');
  const others = requestsCache.filter((r) => r.requestType !== 'ejar_contract');
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
  `;

  content.querySelectorAll('[data-ejar-review-link]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openReviewLink(btn.dataset.id, btn);
    });
  });
  content.querySelectorAll('[data-delete-request]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteEjarRequest(btn.dataset.deleteRequest, btn);
    });
  });
  content.querySelectorAll('[data-open-request]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.req-copy') || e.target.closest('[data-ejar-review-link]') || e.target.closest('[data-delete-request]')) return;
      if (el.tagName === 'TR' && e.target.closest('button[data-open-request]')) return;
      e.stopPropagation();
      openRequestById(el.dataset.openRequest);
    });
  });
  content.querySelectorAll('.req-copy').forEach(bindCopy);
  ensureRequestModal();

  if (highlightId) openRequestById(highlightId);
}

function ensureRequestModal() {
  let modal = document.getElementById('req-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'req-modal';
  modal.className = 'modal';
  modal.hidden = true;
  document.body.appendChild(modal);
  bindModal(modal);
  return modal;
}

function renderEjarTable(rows) {
  if (!rows.length) return '<p class="empty-state">لا توجد طلبات عقود إيجار</p>';
  return `<div class="table-wrap"><table class="table table--cards req-ejar-table">
    <thead><tr>
      <th>رقم الطلب</th><th>سكني / تجاري</th><th>معبئ النموذج</th><th>جوال المالك</th><th>جوال المستأجر</th>
      <th>قيمة الإيجار</th><th>طريقة الدفع</th><th>تاريخ الطلب</th><th>الحالة</th><th>إجراءات</th>
    </tr></thead>
    <tbody>${rows.map((r) => {
      const p = parseMessage(r.message);
      const ownerPhone = p.ownerPhone || r.customerPhone || '—';
      const tenantPhone = p.tenantPhone || '—';
      const rent = p.rentAmount != null ? `${p.rentAmount} ريال` : '—';
      return `<tr data-request-id="${escapeCell(r.id)}" data-open-request="${escapeCell(r.id)}">
        <td data-label="رقم الطلب" dir="ltr">${escapeCell(r.referenceNo || p.referenceNo || '—')}</td>
        <td data-label="النوع">${escapeCell(ejarKindLabel(p))}</td>
        <td data-label="معبئ النموذج">${escapeCell(p.submitterName || r.customerName || '—')}${p.submitterRelation ? ` — ${escapeCell(p.submitterRelation)}` : ''}</td>
        <td data-label="جوال المالك">${valueWithCopy(ownerPhone)}</td>
        <td data-label="جوال المستأجر">${valueWithCopy(tenantPhone)}</td>
        <td data-label="قيمة الإيجار">${valueWithCopy(p.rentAmount != null ? String(p.rentAmount) : '')}</td>
        <td data-label="طريقة الدفع">${escapeCell(p.paymentMethod || '—')}</td>
        <td data-label="تاريخ الطلب" dir="ltr">${escapeCell(formatDateTime(r.createdAt))}</td>
        <td data-label="الحالة">${escapeCell(statusLabel(r.status))}</td>
        <td data-label="إجراءات">
          <div class="req-ejar-actions">
            <button type="button" class="btn btn-primary btn-sm" data-open-request="${escapeCell(r.id)}">عرض</button>
            <button type="button" class="btn btn-outline btn-sm" data-ejar-review-link data-id="${escapeCell(r.id)}">إرسال التقييم</button>
            <button type="button" class="btn btn-danger btn-sm" data-delete-request="${escapeCell(r.id)}">حذف</button>
          </div>
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

function rowItem(label, value, { copy = false, html = false, stack = false } = {}) {
  const inner = html
    ? value
    : (copy ? valueWithCopy(value) : `<span>${escapeCell(value || '—')}</span>`);
  return `<div class="req-detail__row${stack ? ' req-detail__row--stack' : ''}">
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
  const modal = ensureRequestModal();
  if (!modal) return;
  const p = parseMessage(row.message);
  const wizard = row.requestType === 'ejar_contract' && isEjarWizard(p);
  let body = '';
  if (wizard) {
    body = [
      sectionBlock('بيانات الملكية', [
        rowItem('رقم الصك', p.deedNumber, { copy: true }),
        rowItem('تاريخ الصك', dateFieldHtml(p.deedDate), { html: true }),
        rowItem('صورة الصك', deedImageHtml(p.deedImageUrl), { html: true, stack: true }),
      ]),
      (p.contractKind === 'sublease' || p.contractingStatus === 'عقد بالباطن') ? sectionBlock('عقد بالباطن', [
        rowItem('اسم المستأجر', p.subleaseTenantName),
        rowItem('رقم البطاقة أو المنشأة', p.subleaseIdOrCr, { copy: true }),
        rowItem('تاريخ السجل أو البطاقة', dateFieldHtml(p.subleaseIdOrCrDate), { html: true }),
        rowItem('الرقم الموحد', p.subleaseUnifiedNumber, { copy: true }),
        rowItem('اسم الممثل', p.subleaseRepName),
        rowItem('رقم بطاقة الممثل', p.subleaseRepId, { copy: true }),
        rowItem('تاريخ ميلاد الممثل', dateFieldHtml(p.subleaseRepDob), { html: true }),
        rowItem('الجوال', p.subleaseRepPhone, { copy: true }),
        rowItem('رقم الوكالة', p.subleasePoaNumber, { copy: true }),
      ]) : '',
      (p.contractKind === 'sublease' || p.contractingStatus === 'عقد بالباطن') ? sectionBlock('المستأجر من الباطن', [
        rowItem('الاسم', p.subtenantName),
        rowItem('رقم البطاقة', p.subtenantId, { copy: true }),
        rowItem('تاريخ الميلاد', dateFieldHtml(p.subtenantDob), { html: true }),
        rowItem('الجوال', p.subtenantPhone, { copy: true }),
      ]) : '',
      sectionBlock('بيانات المالك', [
        rowItem('رقم الهوية', p.ownerId, { copy: true }),
        rowItem('تاريخ الميلاد', dateFieldHtml(p.ownerDob), { html: true }),
        rowItem('الجوال', p.ownerPhone, { copy: true }),
      ]),
      (p.contractKind === 'sublease' || p.contractingStatus === 'عقد بالباطن') ? '' : sectionBlock('بيانات المستأجر', [
        rowItem('رقم الهوية', p.tenantId, { copy: true }),
        rowItem('تاريخ الميلاد', dateFieldHtml(p.tenantDob), { html: true }),
        rowItem('الجوال', p.tenantPhone, { copy: true }),
      ]),
      sectionBlock('بيانات العقار', [
        rowItem('الموقع', p.propertyLocation || '—'),
        rowItem('رابط الموقع (اللكيشن)', p.propertyMapUrl, { copy: true }),
        rowItem('الشارع', p.streetName || '—'),
        rowItem('الدور', displayFloor(p)),
        rowItem('رقم الوحدة', p.unitNumber, { copy: true }),
        rowItem('التأثيث', p.furnished || '—'),
        rowItem('الغرف', p.rooms != null ? String(p.rooms) : '—'),
        rowItem('دورات المياه', p.bathrooms != null ? String(p.bathrooms) : '—'),
        rowItem('المكيفات', p.acs != null ? String(p.acs) : '—'),
        rowItem('المجالس', p.majlis != null ? String(p.majlis) : '—'),
        rowItem('المطابخ', p.kitchens != null ? String(p.kitchens) : '—'),
        rowItem('نوع العقار', displayUnit(p)),
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
      sectionBlock('معبئ النموذج التعاقدي', [
        rowItem('الاسم', p.submitterName || row.customerName),
        rowItem('الجوال', p.submitterPhone || row.customerPhone, { copy: true }),
        rowItem('الصفة', p.submitterRelation),
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
      <div class="req-detail__scroll">
        <p class="req-detail__meta">${escapeCell(ejarKindLabel(p) !== '—' ? ejarKindLabel(p) : requestTypeLabel(row.requestType))} — ${escapeCell(formatDateTime(row.createdAt))}</p>
        <div class="req-detail__status">
          <label for="req-status">حالة الطلب</label>
          ${statusSelect(row.status)}
          <button type="button" class="btn btn-primary btn-sm" id="req-save-status">حفظ الحالة</button>
        </div>
        ${body}
      </div>
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

async function deleteEjarRequest(requestId, btn) {
  const row = findRequest(requestId);
  const ref = row?.referenceNo || '';
  if (!confirm(ref ? `حذف الطلب ${ref}؟ لا يمكن التراجع.` : 'حذف هذا الطلب؟ لا يمكن التراجع.')) return;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جاري الحذف…';
  try {
    const data = await DashboardAPI.deleteRequest(requestId);
    if (!data?.success) throw new Error('تعذر حذف الطلب');
    requestsCache = requestsCache.filter((r) => !sameId(r.id, requestId));
    closeRequestModal();
    const content = typeof getPageContent === 'function' ? getPageContent() : document.querySelector('.app');
    if (content?.querySelector('#table-wrap')) {
      renderRequestsPage(content, requestsCache);
    } else {
      btn.closest('tr')?.remove();
    }
    showToast('تم حذف الطلب');
  } catch (err) {
    showToast(err.message || 'تعذر حذف الطلب', 'error');
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function openReviewLink(requestId, btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال…';
  try {
    const data = await DashboardAPI.createEjarReviewLink(requestId);
    if (!data.whatsappUrl) {
      throw new Error('لا يوجد رقم جوال للعميل لإرسال التقييم عبر واتساب');
    }
    showToast('جاري فتح واتساب لإرسال التقييم للعميل');
    const opened = window.open(data.whatsappUrl, '_blank', 'noopener');
    if (!opened) window.location.href = data.whatsappUrl;
  } catch (err) {
    alert(err.message || 'تعذر إرسال التقييم عبر واتساب');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
