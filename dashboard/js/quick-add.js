document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('quick-add', 'إضافة سريعة');
  const content = getPageContent();
  content.innerHTML = `
    <form id="quick-form" class="card" style="padding:1.25rem;display:grid;gap:1rem;max-width:760px">
      <p style="margin:0;color:var(--text-muted,#5c6b7a)">الصق الإعلان كما وصل، ثم أضف رابط الموقع والصور إن وجدت. الحفظ لا ينتظر المعاينة.</p>
      <div class="form-group full">
        <label>تفاصيل الإعلان <span class="required">*</span></label>
        <textarea id="quick-text" rows="12" required placeholder="الصق نص الإعلان هنا"></textarea>
      </div>
      <div class="form-group full">
        <label>رابط الموقع</label>
        <input id="quick-maps" type="url" inputmode="url" dir="ltr" placeholder="https://maps.app.goo.gl/...">
      </div>
      <div class="form-group full">
        <label>رقم الجوال</label>
        <input id="quick-phone" type="tel" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx">
      </div>
      <div class="form-group full">
        <label>الصور</label>
        <input id="quick-images" type="file" accept="image/*" multiple>
      </div>
      <div id="quick-preview" hidden style="background:#f6f4ef;border-radius:12px;padding:0.85rem 1rem;line-height:1.8"></div>
      <div id="quick-message" hidden style="font-weight:700"></div>
      <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
        <button type="submit" class="btn btn-gold" id="quick-save">حفظ ونشر</button>
        <a class="btn btn-outline" href="/dashboard/add-property.html">إضافة كاملة</a>
      </div>
    </form>
  `;

  const textEl = document.getElementById('quick-text');
  const previewEl = document.getElementById('quick-preview');
  const messageEl = document.getElementById('quick-message');
  let previewTimer = 0;

  function previewLines(parsed) {
    const lines = [];
    if (parsed.propertyType) lines.push(parsed.propertyType);
    if (parsed.district) lines.push(parsed.district);
    if (parsed.area) lines.push(`${parsed.area} م²`);
    if (parsed.planNumber) lines.push(`مخطط ${parsed.planNumber}`);
    if (parsed.plotNumber) lines.push(`قطعة ${parsed.plotNumber}`);
    if (parsed.streetWidth) lines.push(`شارع ${parsed.streetWidth}${parsed.direction ? ` ${parsed.direction}` : ''}`);
    lines.push(parsed.price ? Number(parsed.price).toLocaleString('ar-SA') : 'على السوم');
    if (parsed.facade) lines.push(parsed.facade);
    return lines;
  }

  textEl.addEventListener('input', () => {
    clearTimeout(previewTimer);
    const text = textEl.value.trim();
    if (!text) {
      previewEl.hidden = true;
      return;
    }
    previewTimer = setTimeout(async () => {
      try {
        const data = await DashboardAPI.request('/properties/quick-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const lines = previewLines(data.parsed || {});
        previewEl.hidden = !lines.length;
        previewEl.innerHTML = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
      } catch {
        previewEl.hidden = true;
      }
    }, 280);
  });

  document.getElementById('quick-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const saveBtn = document.getElementById('quick-save');
    saveBtn.disabled = true;
    messageEl.hidden = true;
    try {
      const body = new FormData();
      body.set('text', textEl.value.trim());
      body.set('mapsUrl', document.getElementById('quick-maps').value.trim());
      body.set('contactPhone', document.getElementById('quick-phone').value.trim());
      [...document.getElementById('quick-images').files].forEach((file) => body.append('images', file));
      const data = await DashboardAPI.request('/properties/quick', { method: 'POST', body });
      messageEl.hidden = false;
      messageEl.textContent = data.message || 'تم الحفظ';
      if (data.property?.id) {
        const link = document.createElement('a');
        link.href = `/dashboard/add-property.html?id=${encodeURIComponent(data.property.id)}`;
        link.textContent = ' فتح الإعلان';
        link.style.marginInlineStart = '0.5rem';
        messageEl.appendChild(link);
      }
      textEl.value = '';
      document.getElementById('quick-maps').value = '';
      document.getElementById('quick-phone').value = '';
      document.getElementById('quick-images').value = '';
      previewEl.hidden = true;
    } catch (err) {
      messageEl.hidden = false;
      messageEl.textContent = err.message || 'تعذر الحفظ';
    } finally {
      saveBtn.disabled = false;
    }
  });
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
