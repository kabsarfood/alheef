document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('testimonials', 'آراء العملاء');
  setTopbarActions('<button class="btn btn-gold btn-sm" id="btn-add">＋ رأي جديد</button>');
  getPageContent().innerHTML = '<div id="list"><div class="loading"><div class="spinner"></div></div>';
  await load();
  document.getElementById('btn-add')?.addEventListener('click', () => openModal());
});

async function load() {
  const el = document.getElementById('list');
  try {
    const items = await DashboardAPI.getTestimonials();
    if (!items.length) {
      el.innerHTML = '<p class="empty-state">لا توجد آراء</p>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table class="table table--cards"><thead><tr><th>العميل</th><th>التقييم</th><th>النص</th><th></th></tr></thead><tbody>
      ${items.map((t) => `<tr>
        <td data-label="العميل">${t.customerName}</td>
        <td data-label="التقييم">${t.rating}/5</td>
        <td data-label="النص">${t.comment.slice(0, 80)}...</td>
        <td data-label="إجراءات">
        <button class="btn btn-outline btn-sm" data-edit="${t.id}">تعديل</button>
        <button class="btn btn-outline btn-sm" data-del="${t.id}">حذف</button>
      </td></tr>`).join('')}
    </tbody></table></div>`;
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => remove(b.dataset.del)));
  } catch {
    el.innerHTML = '<p class="empty-state">تعذر التحميل</p>';
  }
}

function openModal(id) {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `<div class="modal__backdrop"></div><div class="card" style="max-width:480px;margin:2rem auto;position:relative;z-index:2">
    <form id="t-form"><h3>${id ? 'تعديل' : 'جديد'}</h3>
    <div class="form-group"><label>الاسم</label><input name="customerName" required></div>
    <div class="form-group"><label>التعليق</label><textarea name="comment" required rows="4"></textarea></div>
    <div class="form-group"><label>التقييم</label><input name="rating" type="number" min="1" max="5" value="5"></div>
    <div class="form-group"><label>صورة</label><input type="file" name="image" accept="image/*"></div>
    <button type="submit" class="btn btn-gold">حفظ</button></form></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('.modal__backdrop').onclick = () => wrap.remove();
  wrap.querySelector('#t-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await DashboardAPI.saveTestimonial(new FormData(e.target), id);
      showToast('تم الحفظ');
      wrap.remove();
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function remove(id) {
  if (!confirm('حذف؟')) return;
  await DashboardAPI.deleteTestimonial(id);
  showToast('تم الحذف');
  load();
}
