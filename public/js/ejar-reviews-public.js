(function () {
  const section = document.getElementById('ejar-reviews');
  const jumpBtn = document.getElementById('ejar-reviews-jump');
  if (!section) return;

  function hideReviews() {
    section.hidden = true;
    section.setAttribute('aria-hidden', 'true');
    if (jumpBtn) jumpBtn.hidden = true;
  }

  function showReviews(data) {
    const avgEl = document.getElementById('ejar-reviews-average');
    const list = document.getElementById('ejar-reviews-list');

    if (avgEl) avgEl.textContent = data.average;
    if (list) list.innerHTML = (data.reviews || []).map(renderReview).join('');

    section.hidden = false;
    section.setAttribute('aria-hidden', 'false');

    if (jumpBtn) {
      jumpBtn.hidden = false;
      if (!jumpBtn.dataset.bound) {
        jumpBtn.dataset.bound = '1';
        jumpBtn.addEventListener('click', () => {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  }

  hideReviews();

  fetch('/api/ejar/reviews/public')
    .then((r) => r.json())
    .then((data) => {
      const minRequired = Number(data.minRequired) || 1;
      const count = Number(data.count) || 0;
      const canShow = data.success
        && data.visible === true
        && count >= minRequired
        && Array.isArray(data.reviews)
        && data.reviews.length > 0;

      if (!canShow) {
        hideReviews();
        return;
      }

      showReviews(data);
    })
    .catch(hideReviews);

  function renderReview(r) {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const comment = r.comment ? `<p class="ejar-review-item__text">${escapeHtml(r.comment)}</p>` : '';
    const isNew = r.isNew === true;
    return `
      <article class="ejar-review-item${isNew ? ' ejar-review-item--new' : ''}">
        ${isNew ? '<span class="ejar-review-item__new">تقييم جديد</span>' : ''}
        <div class="ejar-review-item__stars" aria-label="${r.rating} من 5">${stars}</div>
        ${comment}
        <footer class="ejar-review-item__meta">${escapeHtml(r.displayName || 'عميل')}${r.city ? ` — ${escapeHtml(r.city)}` : ''}</footer>
      </article>
    `;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
