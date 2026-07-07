(function () {
  'use strict';

  const SITE = 'https://www.alheef.website';
  const LISTING = { sale: 'بيع', rent: 'إيجار' };

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatArea(area) {
    if (area == null || area === '') return '';
    const s = String(area).trim();
    if (!s) return '';
    return /م²|م2/i.test(s) ? s : `${s} م²`;
  }

  function pickDescription(p) {
    const candidates = [p.description, p.details];
    const f = p.features;
    if (f && typeof f === 'object' && !Array.isArray(f)) {
      candidates.push(f.property_description, f.details, f.description);
    }
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s) return s;
    }
    return '';
  }

  /** رابط موقع العقار على خرائط Google */
  function googleMapsUrl(p, loc) {
    const custom = (p.mapsUrl || '').trim();
    if (/^https?:\/\//i.test(custom)) return custom;
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    if (loc) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
    }
    return '';
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
    const mapLink = googleMapsUrl(p, loc);
    const areaText = formatArea(p.areaDisplay || p.area);
    const description = pickDescription(p);

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
        <div class="property-detail__chip"><strong>المساحة</strong>${areaText ? escapeHtml(areaText) : '—'}</div>
        ${p.bedrooms ? `<div class="property-detail__chip"><strong>الغرف</strong>${p.bedrooms}</div>` : ''}
        ${p.bathrooms ? `<div class="property-detail__chip"><strong>الحمامات</strong>${p.bathrooms}</div>` : ''}
        ${p.referenceNo ? `<div class="property-detail__chip"><strong>رقم الإعلان</strong>${escapeHtml(p.referenceNo)}</div>` : ''}
      </div>
      <h2 class="property-detail__section-title">وصف العقار</h2>
      <div class="property-detail__desc">${description ? escapeHtml(description) : 'لا يوجد وصف إضافي لهذا العقار.'}</div>
      <div class="property-detail__actions">
        ${mapLink ? `<a class="map-card__btn map-card__btn--primary" href="${escapeAttr(mapLink)}" target="_blank" rel="noopener noreferrer">عرض على الخريطة</a>` : ''}
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
