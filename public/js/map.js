(function () {
  'use strict';

  const TYPE_COLORS = {
    فيلا: '#C5A46D', فلل: '#C5A46D',
    شقة: '#3B82F6', شقق: '#3B82F6', دوبلكس: '#0EA5E9',
    أرض: '#22C55E', أراضي: '#22C55E', 'أرض زراعية': '#16A34A',
    عمارة: '#64748B', عمائر: '#64748B', عمير: '#64748B',
    محل: '#F97316', محلات: '#F97316',
    مكتب: '#EA580C', مكاتب: '#EA580C',
    تجاري: '#F97316', 'عقار تجاري': '#F97316',
    استراحة: '#A855F7',
  };

  const LISTING_LABEL = { sale: 'بيع', rent: 'إيجار' };
  const MOBILE = () => window.matchMedia('(max-width: 768px)').matches;
  const SITE = 'https://www.alheef.website';

  let map;
  let cluster;
  let config = {};
  let allProperties = [];
  let shareTarget = null;
  let loadGen = 0;

  const els = {
    loading: document.getElementById('map-loading'),
    count: document.getElementById('map-count'),
    legend: document.getElementById('map-legend'),
    form: document.getElementById('map-filters-form'),
    sheet: document.getElementById('map-sheet'),
    sheetContent: document.getElementById('sheet-content'),
    sheetBackdrop: document.getElementById('sheet-backdrop'),
    shareMenu: document.getElementById('share-menu'),
  };

  function markerColor(type) {
    return TYPE_COLORS[(type || '').trim()] || '#1E2A38';
  }

  function propertyUrl(p) {
    return `${SITE}/property.html?slug=${encodeURIComponent(p.slug || p.id)}`;
  }

  function formatPrice(p) {
    if (p.priceDisplay) return p.priceDisplay;
    if (p.price != null) return Number(p.price).toLocaleString('ar-SA');
    return '—';
  }

  function listingLabel(p) {
    return LISTING_LABEL[p.listingType] || '';
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function truncate(s, n) {
    const t = (s || '').trim();
    if (t.length <= n) return t;
    return `${t.slice(0, n)}…`;
  }

  function buildCardHtml(p) {
    const img = p.coverImage || (p.gallery && p.gallery[0]) || '';
    const gallery = (p.gallery && p.gallery.length) ? p.gallery : (img ? [img] : []);
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    const rooms = p.bedrooms ? `${p.bedrooms} غرف` : '';
    const area = p.area ? `${p.area} م²` : '';
    const ref = p.referenceNo ? `رقم الإعلان: ${escapeHtml(p.referenceNo)}` : '';
    const pid = p.id;

    return `
      <article class="map-card" data-id="${escapeHtml(p.id)}">
        <div class="map-card__gallery">
          <img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async"
>
        </div>
        <div class="map-card__body">
          <p class="map-card__type">${escapeHtml(p.propertyType)}${listingLabel(p) ? ` · ${listingLabel(p)}` : ''}</p>
          <h3 class="map-card__title">${escapeHtml(p.title)}</h3>
          <p class="map-card__loc">${escapeHtml(loc)}</p>
          <div class="map-card__meta">
            ${area ? `<span>${escapeHtml(String(area))}</span>` : ''}
            ${rooms ? `<span>${escapeHtml(rooms)}</span>` : ''}
          </div>
          <p class="map-card__price">${formatPrice(p)} <span>ر.س</span></p>
          ${ref ? `<p class="map-card__ref">${ref}</p>` : ''}
          <p class="map-card__desc">${escapeHtml(truncate(p.description, 140))}</p>
          <div class="map-card__actions">
            <a class="map-card__btn map-card__btn--primary" href="${propertyUrl(p)}">عرض التفاصيل</a>
            <a class="map-card__btn map-card__btn--wa" href="#" data-wa="${pid}">واتساب</a>
            <button type="button" class="map-card__btn map-card__btn--share" data-share="${pid}">مشاركة</button>
          </div>
        </div>
      </article>`;
  }

  function shareText(p) {
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    const lines = [
      p.title,
      `النوع: ${p.propertyType || '—'}`,
      `السعر: ${formatPrice(p)} ر.س`,
      loc ? `الموقع: ${loc}` : '',
      p.referenceNo ? `رقم الإعلان: ${p.referenceNo}` : '',
      propertyUrl(p),
    ].filter(Boolean);
    return lines.join('\n');
  }

  function whatsappLink(text) {
    const num = String(config.whatsapp || '').replace(/\D/g, '');
    const q = encodeURIComponent(text);
    if (num) return `https://wa.me/${num}?text=${q}`;
    return `https://wa.me/?text=${q}`;
  }

  function openShare(p) {
    shareTarget = p;
    if (navigator.share) {
      navigator.share({
        title: p.title,
        text: shareText(p),
        url: propertyUrl(p),
      }).catch(() => showShareMenu());
      return;
    }
    showShareMenu();
  }

  function showShareMenu() {
    els.shareMenu?.classList.add('open');
    els.shareMenu?.setAttribute('aria-hidden', 'false');
  }

  function hideShareMenu() {
    els.shareMenu?.classList.remove('open');
    els.shareMenu?.setAttribute('aria-hidden', 'true');
    shareTarget = null;
  }

  function bindCardActions(root) {
    root.querySelectorAll('[data-wa]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-wa');
        const p = allProperties.find((x) => x.id === id);
        if (!p) return;
        window.open(whatsappLink(shareText(p)), '_blank', 'noopener');
      });
    });
    root.querySelectorAll('[data-share]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-share');
        const p = allProperties.find((x) => x.id === id);
        if (p) openShare(p);
      });
    });
  }

  function openSheet(p) {
    if (!els.sheet || !els.sheetContent) return;
    els.sheetContent.innerHTML = buildCardHtml(p);
    bindCardActions(els.sheetContent);
    els.sheet.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    els.sheet?.classList.remove('open');
    els.sheet?.setAttribute('aria-hidden', 'true');
  }

  function createIcon(color) {
    return L.divIcon({
      className: 'map-pin-wrap',
      html: `<span class="map-marker" style="background:${color}"></span>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  function initMap() {
    map = L.map('property-map', {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([24.7136, 46.6753], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);

    cluster = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 120,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 52,
    });
    map.addLayer(cluster);
  }

  function renderLegend() {
    if (!els.legend) return;
    const items = [
      { c: '#C5A46D', l: 'فلل' },
      { c: '#3B82F6', l: 'شقق' },
      { c: '#22C55E', l: 'أراضي' },
      { c: '#64748B', l: 'عمائر' },
      { c: '#F97316', l: 'تجاري / محلات' },
    ];
    els.legend.innerHTML = `
      <p class="map-legend__title">دليل الألوان</p>
      ${items.map((i) => `
        <div class="map-legend__item">
          <span class="map-legend__dot" style="background:${i.c}"></span>
          ${i.l}
        </div>`).join('')}`;
  }

  function filtersFromForm() {
    const fd = new FormData(els.form);
    const o = {};
    ['listing_type', 'property_type', 'city', 'district', 'min_price', 'max_price'].forEach((k) => {
      const v = (fd.get(k) || '').trim();
      if (v) o[k] = v;
    });
    return o;
  }

  function queryString(filters) {
    const p = new URLSearchParams();
    if (filters.listing_type) p.set('listing_type', filters.listing_type);
    if (filters.property_type) p.set('property_type', filters.property_type);
    if (filters.city) p.set('city', filters.city);
    if (filters.district) p.set('district', filters.district);
    if (filters.min_price) p.set('min_price', filters.min_price);
    if (filters.max_price) p.set('max_price', filters.max_price);
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function loadFilterOptions() {
    try {
      const res = await fetch('/api/map/filters');
      const data = await res.json();
      fillSelect('filter-type', data.types);
      fillSelect('filter-city', data.cities);
      fillSelect('filter-district', data.districts);
    } catch { /* ignore */ }
  }

  function fillSelect(id, options) {
    const el = document.getElementById(id);
    if (!el || !options?.length) return;
    const current = el.value;
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      el.appendChild(o);
    });
    if (current) el.value = current;
  }

  async function loadProperties(filters) {
    const gen = ++loadGen;
    els.loading?.classList.remove('hidden');
    try {
      const res = await fetch(`/api/map/properties${queryString(filters)}`);
      const data = await res.json();
      if (gen !== loadGen) return;
      allProperties = data.items || [];
      renderMarkers(allProperties);
      if (els.count) {
        els.count.textContent = `${allProperties.length} عقار`;
      }
    } catch {
      if (els.count) els.count.textContent = 'تعذر التحميل';
    } finally {
      if (gen === loadGen) els.loading?.classList.add('hidden');
    }
  }

  function renderMarkers(items) {
    cluster.clearLayers();
    const bounds = [];
    const batch = 80;
    let i = 0;

    function addBatch() {
      const end = Math.min(i + batch, items.length);
      for (; i < end; i += 1) {
        const p = items[i];
        const lat = Number(p.latitude);
        const lng = Number(p.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const color = markerColor(p.propertyType);
        const marker = L.marker([lat, lng], { icon: createIcon(color) });

        marker.bindPopup(buildCardHtml(p), {
          className: 'map-popup',
          maxWidth: 340,
        });
        marker.on('popupopen', () => {
          const popEl = marker.getPopup()?.getElement();
          if (popEl) bindCardActions(popEl);
        });
        marker.on('click', () => {
          if (MOBILE()) {
            openSheet(p);
            return;
          }
          marker.openPopup();
        });

        cluster.addLayer(marker);
        bounds.push([lat, lng]);
      }
      if (i < items.length) {
        requestAnimationFrame(addBatch);
      } else if (bounds.length) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
      }
    }

    requestAnimationFrame(addBatch);
  }

  function setupEvents() {
    els.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      loadProperties(filtersFromForm());
    });

    document.getElementById('filter-reset')?.addEventListener('click', () => {
      els.form?.reset();
      loadProperties({});
    });

    els.sheetBackdrop?.addEventListener('click', closeSheet);

    document.getElementById('share-wa')?.addEventListener('click', () => {
      if (shareTarget) window.open(whatsappLink(shareText(shareTarget)), '_blank', 'noopener');
      hideShareMenu();
    });

    document.getElementById('share-copy')?.addEventListener('click', async () => {
      if (!shareTarget) return;
      try {
        await navigator.clipboard.writeText(shareText(shareTarget));
      } catch {
        /* fallback */
      }
      hideShareMenu();
    });

    document.getElementById('share-close')?.addEventListener('click', hideShareMenu);

    const params = new URLSearchParams(location.search);
    if (params.get('slug')) {
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/properties/slug/${encodeURIComponent(params.get('slug'))}`);
          const p = await res.json();
          if (p?.latitude && p?.longitude) {
            map.setView([p.latitude, p.longitude], 15);
            if (MOBILE()) openSheet(p);
          }
        } catch { /* ignore */ }
      }, 800);
    }
  }

  async function init() {
    renderLegend();
    initMap();
    setupEvents();
    await loadFilterOptions();

    try {
      const cfg = await fetch('/api/config').then((r) => r.json());
      config = cfg || {};
    } catch { config = {}; }

    await loadProperties({});
    setTimeout(() => map.invalidateSize(), 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
