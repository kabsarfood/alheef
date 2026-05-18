(function () {
  'use strict';

  const SITE = 'https://www.alheef.website';
  const LISTING = { sale: 'بيع', rent: 'إيجار' };

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function setMeta(p) {
    const title = `${p.title} | الهيف للخدمات العقارية`;
    document.title = title;
    const img = p.coverImage || p.image || (p.gallery && p.gallery[0]) || '';
    const desc = (p.description || '').slice(0, 160);
    const set = (id, attr, val) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute(attr, val);
    };
    set('page-title', 'textContent', title);
    set('meta-description', 'content', desc);
    set('og-title', 'content', p.title);
    set('og-description', 'content', desc);
    if (img) set('og-image', 'content', img.startsWith('http') ? img : `${SITE}${img}`);
    const link = document.querySelector('link[rel="canonical"]') || document.createElement('link');
    link.rel = 'canonical';
    link.href = `${SITE}/property.html?slug=${encodeURIComponent(p.slug)}`;
    if (!link.parentNode) document.head.appendChild(link);
  }

  function render(p, config) {
    const root = document.getElementById('property-root');
    if (!root) return;
    setMeta(p);

    const img = p.coverImage || p.image || (p.gallery && p.gallery[0]) || '';
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    const price = p.price || (p.priceRaw != null ? Number(p.priceRaw).toLocaleString('ar-SA') : '—');
    const listing = LISTING[p.listingType] || '';
    const mapLink = p.latitude && p.longitude
      ? `/map.html?slug=${encodeURIComponent(p.slug)}`
      : '/map.html';

    const shareLines = [
      p.title,
      `السعر: ${price} ر.س`,
      loc ? `الموقع: ${loc}` : '',
      p.referenceNo ? `رقم الإعلان: ${p.referenceNo}` : '',
      `${SITE}/property.html?slug=${encodeURIComponent(p.slug)}`,
    ].filter(Boolean).join('\n');

    const waNum = String(config.whatsapp || '').replace(/\D/g, '');
    const waHref = waNum
      ? `https://wa.me/${waNum}?text=${encodeURIComponent(shareLines)}`
      : `https://wa.me/?text=${encodeURIComponent(shareLines)}`;

    root.innerHTML = `
      <div class="property-detail__hero">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">
      </div>
      <p class="map-card__type">${escapeHtml(p.propertyType || p.type)}${listing ? ` · ${listing}` : ''}</p>
      <h1 class="property-detail__title">${escapeHtml(p.title)}</h1>
      <p class="property-detail__meta">${escapeHtml(loc)}</p>
      <p class="property-detail__price">${price} <span style="font-size:0.85rem">ر.س</span></p>
      <div class="property-detail__grid">
        ${p.area ? `<div class="property-detail__chip"><strong>المساحة</strong>${escapeHtml(String(p.area))} م²</div>` : ''}
        ${p.bedrooms ? `<div class="property-detail__chip"><strong>الغرف</strong>${p.bedrooms}</div>` : ''}
        ${p.bathrooms ? `<div class="property-detail__chip"><strong>الحمامات</strong>${p.bathrooms}</div>` : ''}
        ${p.referenceNo ? `<div class="property-detail__chip"><strong>رقم الإعلان</strong>${escapeHtml(p.referenceNo)}</div>` : ''}
      </div>
      <div class="property-detail__desc">${escapeHtml(p.description || '')}</div>
      <div class="property-detail__actions">
        <a class="map-card__btn map-card__btn--primary" href="${mapLink}">عرض على الخريطة</a>
        <a class="map-card__btn map-card__btn--wa" href="${waHref}" target="_blank" rel="noopener">واتساب</a>
        <button type="button" class="map-card__btn map-card__btn--share" id="btn-share">مشاركة</button>
      </div>`;

    document.getElementById('btn-share')?.addEventListener('click', async () => {
      const url = `${SITE}/property.html?slug=${encodeURIComponent(p.slug)}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: p.title, text: shareLines, url });
          return;
        } catch { /* fall through */ }
      }
      try {
        await navigator.clipboard.writeText(shareLines);
        alert('تم نسخ تفاصيل العقار');
      } catch {
        window.open(waHref, '_blank');
      }
    });
  }

  async function init() {
    const slug = new URLSearchParams(location.search).get('slug');
    const root = document.getElementById('property-root');
    if (!slug) {
      if (root) root.innerHTML = '<p class="property-loading">لم يُحدد العقار.</p>';
      return;
    }
    try {
      const [propRes, cfgRes] = await Promise.all([
        fetch(`/api/properties/slug/${encodeURIComponent(slug)}`),
        fetch('/api/config'),
      ]);
      if (!propRes.ok) throw new Error('not found');
      const p = await propRes.json();
      const config = cfgRes.ok ? await cfgRes.json() : {};
      render(p, config);
    } catch {
      if (root) root.innerHTML = '<p class="property-loading">العقار غير موجود أو غير منشور.</p>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
