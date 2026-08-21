(function () {
  const section = document.getElementById('ejar-reviews');
  const jumpBtn = document.getElementById('ejar-reviews-jump');
  if (!section) return;

  fetch('/api/ejar/reviews/public')
    .then((r) => r.json())
    .then((data) => {
      if (!data.success || !data.visible || !data.reviews?.length) return;
      section.hidden = false;
      document.getElementById('ejar-reviews-count').textContent = data.count;
      document.getElementById('ejar-reviews-average').textContent = data.average;
      const list = document.getElementById('ejar-reviews-list');
      list.innerHTML = data.reviews.map(renderReview).join('');

      if (jumpBtn && (data.count || 0) >= 10) {
        jumpBtn.hidden = false;
        jumpBtn.addEventListener('click', () => {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    })
    .catch(() => {});

  function renderReview(r) {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const comment = r.comment ? `<p class="ejar-review-item__text">${escapeHtml(r.comment)}</p>` : '';
    return `
      <article class="ejar-review-item">
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
