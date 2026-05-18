document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('banners', 'بنرات الموقع');
  setTopbarActions('<button class="btn btn-gold btn-sm" id="btn-add">＋ بنر جديد</button>');
  getPageContent().innerHTML = '<div id="list"><div class="loading"><div class="spinner"></div></div>';
  await load();
  document.getElementById('btn-add')?.addEventListener('click', () => openModal());
});

async function load() {
  const el = document.getElementById('list');
  try {
    const items = await DashboardAPI.getBanners();
    if (!items.length) {
      el.innerHTML = '<p class="empty-state">لا توجد بنرات</p>';
      return;
    }
    el.innerHTML = `<div class="offers-grid">${items.map((b) => `
      <article class="offer-card">
        <img src="${b.imageDesktop}" alt="" style="width:100%;height:140px;object-fit:cover">
        <div class="offer-card__body">
          <h3>${b.title || 'بنر'}</h3>
          <p>${b.active ? 'نشط' : 'معطّل'}</p>
          <button class="btn btn-outline btn-sm" data-edit="${b.id}">تعديل</button>
          <button class="btn btn-outline btn-sm" data-del="${b.id}">حذف</button>
        </div>
      </article>
    `).join('')}</div>`;
    el.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openModal(btn.dataset.edit)));
    el.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', () => remove(btn.dataset.del)));
  } catch {
    el.innerHTML = '<p class="empty-state">تعذر التحميل</p>';
  }
}

function openModal(id) {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop"></div>
    <div class="card" style="max-width:520px;margin:2rem auto;position:relative;z-index:2">
      <form id="banner-form">
        <h3>${id ? 'تعديل بنر' : 'بنر جديد'}</h3>
        <div class="form-group"><label>العنوان</label><input name="title"></div>
        <div class="form-group"><label>صورة سطح المكتب *</label><input type="file" name="imageDesktop" accept="image/*" ${id ? '' : 'required'}></div>
        <div class="form-group"><label>صورة الجوال</label><input type="file" name="imageMobile" accept="image/*"></div>
        <div class="form-group"><label>نص الزر</label><input name="buttonText"></div>
        <div class="form-group"><label>رابط الزر</label><input name="buttonLink" dir="ltr"></div>
        <div class="form-group"><label>الترتيب</label><input name="sortOrder" type="number" value="0"></div>
        <label><input type="checkbox" name="active" value="true" checked> نشط</label>
        <div class="form-actions"><button type="submit" class="btn btn-gold">حفظ</button></div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.querySelector('.modal__backdrop').onclick = () => wrap.remove();
  wrap.querySelector('#banner-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (!fd.get('active')) fd.append('active', 'false');
    try {
      await DashboardAPI.saveBanner(fd, id);
      showToast('تم الحفظ');
      wrap.remove();
      load();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

async function remove(id) {
  if (!confirm('حذف البنر؟')) return;
  await DashboardAPI.deleteBanner(id);
  showToast('تم الحذف');
  load();
}
