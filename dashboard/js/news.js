const CATEGORIES = ['أخبار السوق', 'تحديثات', 'مشاريع جديدة', 'نصائح عقارية', 'عام'];

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout('news', 'الأخبار العقارية');
  setTopbarActions('<button class="btn btn-gold btn-sm" id="btn-add-news">＋ إضافة خبر</button>');
  renderPage();
  await loadNews();
});

function renderPage() {
  getPageContent().innerHTML = `
    <div id="news-container">
      <div class="loading"><div class="spinner"></div></div><p>جاري التحميل...</p></div>
    </div>
    <div id="news-modal" class="modal">
      <div class="modal__backdrop" data-close></div>
      <div class="modal__box">
        <div class="modal__header">
          <h3 class="modal__title" id="modal-news-title">إضافة خبر</h3>
          <button class="modal__close" data-close>×</button>
        </div>
        <form id="news-form">
          <input type="hidden" id="news-id">
          <div class="form-group" style="margin-bottom:1rem">
            <label>العنوان <span class="required">*</span></label>
            <input type="text" id="news-title" required>
          </div>
          <div class="form-group" style="margin-bottom:1rem">
            <label>التصنيف</label>
            <select id="news-category">
              ${CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:1rem">
            <label>المحتوى <span class="required">*</span></label>
            <textarea id="news-content" required style="min-height:160px"></textarea>
          </div>
          <div class="form-group" style="margin-bottom:1.25rem">
            <label>الحالة</label>
            <select id="news-status">
              <option value="published">منشور</option>
              <option value="draft">مسودة</option>
            </select>
          </div>
          <button type="submit" class="btn btn-gold" style="width:100%">حفظ</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-add-news').addEventListener('click', () => openModal());
  document.getElementById('news-form').addEventListener('submit', handleSave);
  document.querySelectorAll('#news-modal [data-close]').forEach((el) => {
    el.addEventListener('click', () => document.getElementById('news-modal').classList.remove('active'));
  });
}

async function loadNews() {
  const container = document.getElementById('news-container');
  try {
    const items = await DashboardAPI.getNews();
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">◉</div>
          <p>لا توجد أخبار بعد</p>
          <button class="btn btn-gold" style="margin-top:1rem" onclick="openModal()">إضافة أول خبر</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `<div class="news-list">${items.map(renderNewsItem).join('')}</div>`;
    bindNewsActions();
  } catch {
    container.innerHTML = '<div class="empty-state"><p>تعذر تحميل الأخبار</p></div>';
  }
}

function renderNewsItem(item) {
  const excerpt = (item.content || '').slice(0, 120) + ((item.content || '').length > 120 ? '...' : '');
  return `
    <article class="news-item" data-id="${item.id}">
      <div class="news-item__header">
        <h3 class="news-item__title">${item.title}</h3>
        ${statusBadge(item.status)}
      </div>
      <p class="news-item__meta">${item.category} · ${formatDate(item.createdAt)}</p>
      <p class="news-item__excerpt">${excerpt}</p>
      <div class="news-item__actions">
        <button class="btn btn-outline btn-sm btn-edit-news" data-id="${item.id}">تعديل</button>
        <button class="btn btn-danger btn-sm btn-delete-news" data-id="${item.id}">حذف</button>
      </div>
    </article>
  `;
}

function bindNewsActions() {
  document.querySelectorAll('.btn-edit-news').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const items = await DashboardAPI.getNews();
      const item = items.find((n) => String(n.id) === btn.dataset.id);
      if (item) openModal(item);
    });
  });

  document.querySelectorAll('.btn-delete-news').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('حذف هذا الخبر؟')) return;
      try {
        await DashboardAPI.deleteNews(btn.dataset.id);
        showToast('تم الحذف');
        await loadNews();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function openModal(item = null) {
  document.getElementById('modal-news-title').textContent = item ? 'تعديل الخبر' : 'إضافة خبر';
  document.getElementById('news-id').value = item?.id || '';
  document.getElementById('news-title').value = item?.title || '';
  document.getElementById('news-category').value = item?.category || 'عام';
  document.getElementById('news-content').value = item?.content || '';
  document.getElementById('news-status').value = item?.status || 'published';
  document.getElementById('news-modal').classList.add('active');
}

async function handleSave(e) {
  e.preventDefault();
  const id = document.getElementById('news-id').value;
  const body = {
    title: document.getElementById('news-title').value,
    category: document.getElementById('news-category').value,
    content: document.getElementById('news-content').value,
    status: document.getElementById('news-status').value,
  };

  try {
    await DashboardAPI.saveNews(body, id || null);
    showToast(id ? 'تم التحديث' : 'تم النشر');
    document.getElementById('news-modal').classList.remove('active');
    await loadNews();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.openModal = openModal;
