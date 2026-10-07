const TABS = [
  ['pending_approval', 'بانتظار الموافقة'],
  ['approved', 'تمت الموافقة'],
  ['publishing', 'جارٍ النشر'],
  ['published', 'منشورة'],
  ['rejected', 'مرفوضة'],
  ['cancelled', 'ملغاة'],
  ['duplicate', 'مكررة'],
  ['failed', 'فاشلة'],
];

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('map-approvals', 'طلبات إضافة خريطة الهيف');
  const content = getPageContent();
  content.innerHTML = `
    <div class="card" style="padding:1rem;margin-bottom:1rem">
      <p>مسار شات جي بي تي هو الرابط المفتوح الدائم فقط. لا يُنشأ رابط جديد، وكل إعلان يبقى بانتظار الموافقة في واتساب.</p>
      <div id="submit-link-list" style="margin-top:1rem">جاري تحميل الروابط...</div>
    </div>
    <div class="card" style="padding:1rem">
      <div id="approval-tabs" style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:1rem"></div>
      <div id="approval-list">جاري التحميل...</div>
    </div>`;
  const tabs = document.getElementById('approval-tabs');
  TABS.forEach(([id, label], index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${index === 0 ? 'btn-gold' : 'btn-outline'}`;
    button.textContent = label;
    button.dataset.status = id;
    button.addEventListener('click', () => {
      tabs.querySelectorAll('button').forEach((item) => {
        item.className = 'btn btn-sm btn-outline';
      });
      button.className = 'btn btn-sm btn-gold';
      load(id);
    });
    tabs.appendChild(button);
  });
  load('pending_approval');
  loadSubmitLinks();
});

async function load(status) {
  const list = document.getElementById('approval-list');
  try {
    const data = await DashboardAPI.request(`/map-approvals?status=${encodeURIComponent(status)}`);
    const items = data.items || [];
    if (!items.length) {
      list.innerHTML = '<p>لا توجد طلبات في هذا التبويب.</p>';
      return;
    }
    list.innerHTML = items.map((item) => `
      <article style="border:1px solid #e6e1d8;border-radius:12px;padding:0.8rem;margin-bottom:0.7rem">
        <strong>${escapeHtml(item.requestNumber)}</strong>
        <span> — ${escapeHtml(item.sourceName || item.sourceType)}</span>
        <p>${escapeHtml(item.propertyType)} — ${escapeHtml(item.summary)}</p>
        <p>التواصل: ${escapeHtml(item.contactPhone || '—')} — الصور: ${Number(item.imageCount) || 0}</p>
        <p>الاستلام: ${escapeHtml(item.createdAt || '')}</p>
        <p>الحالة: ${escapeHtml(item.status)}${item.propertyStatus ? ` — حالة العقار: ${escapeHtml(item.propertyStatus)}` : ''}</p>
        ${item.internalRef ? `<p>الرقم الداخلي: ${escapeHtml(item.internalRef)}</p>` : ''}
        ${item.failureReason ? `<p>السبب: ${escapeHtml(item.failureReason)}</p>` : ''}
        <p>
          ${item.locationUrl ? `<a href="${escapeHtml(item.locationUrl)}" target="_blank" rel="noopener">الموقع</a>` : ''}
          ${item.propertyUrl ? ` <a href="${escapeHtml(item.propertyUrl)}" target="_blank" rel="noopener">الإعلان</a>` : ''}
        </p>
        <p>
          ${item.status === 'pending_approval' ? `<button type="button" class="btn btn-sm btn-outline" data-cancel="${escapeHtml(item.id)}">إلغاء الطلب</button>` : ''}
          <button type="button" class="btn btn-sm btn-outline" data-delete="${escapeHtml(item.id)}">حذف الطلب</button>
        </p>
      </article>
    `).join('');
    list.querySelectorAll('[data-cancel]').forEach((button) => {
      button.addEventListener('click', () => act(button.dataset.cancel, 'cancel', status));
    });
    list.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', () => act(button.dataset.delete, 'delete', status));
    });
  } catch (error) {
    list.textContent = error.message || 'تعذر التحميل';
  }
}

async function act(id, kind, status) {
  const cancel = kind === 'cancel';
  const question = cancel
    ? 'إلغاء هذا الطلب؟ لن يُنشر الإعلان.'
    : 'حذف هذا الطلب من لوحة الإدارة؟ الإعلان المنشور إن وُجد يبقى.';
  if (!window.confirm(question)) return;
  try {
    await DashboardAPI.request(cancel ? `/map-approvals/${id}/cancel` : `/map-approvals/${id}`, {
      method: cancel ? 'POST' : 'DELETE',
    });
    load(status);
  } catch (error) {
    window.alert(error.message || 'تعذر تنفيذ الإجراء');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LINK_STATUS = { new: 'جديد', used: 'مستخدم', expired: 'منتهي', cancelled: 'ملغي' };

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-SA');
}

async function loadSubmitLinks() {
  const list = document.getElementById('submit-link-list');
  try {
    const data = await DashboardAPI.request('/map-approvals/submit-links');
    const items = data.items || [];
    if (!items.length) {
      list.textContent = 'لا توجد روابط بعد.';
      return;
    }
    list.innerHTML = `<table class="table"><thead><tr><th>الإنشاء</th><th>الانتهاء</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${items.map((item) => `<tr>
        <td>${escapeHtml(formatWhen(item.createdAt))}</td>
        <td>${escapeHtml(formatWhen(item.expiresAt))}</td>
        <td>${escapeHtml(item.reusable ? 'مفتوح دائم' : (LINK_STATUS[item.status] || item.status))}</td>
        <td>${item.status === 'new' && !item.reusable ? `<button type="button" class="btn btn-sm btn-outline" data-cancel-link="${escapeHtml(item.id)}">إلغاء</button>` : ''}</td>
      </tr>`).join('')}
    </tbody></table>`;
    list.querySelectorAll('[data-cancel-link]').forEach((button) => {
      button.addEventListener('click', () => cancelSubmitLink(button.dataset.cancelLink));
    });
  } catch (error) {
    list.textContent = error.message || 'تعذر تحميل الروابط';
  }
}

async function cancelSubmitLink(id) {
  try {
    await DashboardAPI.request(`/map-approvals/submit-links/${id}/cancel`, { method: 'POST' });
    await loadSubmitLinks();
  } catch (error) {
    window.alert(error.message || 'تعذر إلغاء الرابط');
  }
}
