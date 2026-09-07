(function () {
  const PREVIEW_LIMIT = 3;
  const section = document.getElementById('ejar-reviews');
  const drop = document.getElementById('ejar-reviews-drop');
  const jumpBtn = document.getElementById('ejar-reviews-jump');
  if (!section) return;

  function hideReviews() {
    section.hidden = true;
    section.setAttribute('aria-hidden', 'true');
    if (drop) drop.open = false;
    if (jumpBtn) jumpBtn.hidden = true;
  }

  function openReviews() {
    if (section.hidden) return;
    if (drop) drop.open = true;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showReviews(data) {
    const avgEl = document.getElementById('ejar-reviews-average');
    const list = document.getElementById('ejar-reviews-list');
    const reviews = (data.reviews || []).slice(0, PREVIEW_LIMIT);

    if (avgEl) avgEl.textContent = data.average;
    if (list) list.innerHTML = reviews.map(renderReview).join('');

    section.hidden = false;
    section.setAttribute('aria-hidden', 'false');
    if (drop) drop.open = false;

    if (jumpBtn) {
      jumpBtn.hidden = false;
      if (!jumpBtn.dataset.bound) {
        jumpBtn.dataset.bound = '1';
        jumpBtn.addEventListener('click', openReviews);
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
      if (window.location.hash === '#ejar-reviews') {
        window.setTimeout(openReviews, 80);
      }
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

  window.EjarReviewsPublic = { open: openReviews };
})();
