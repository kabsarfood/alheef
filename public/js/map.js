(function () {
  'use strict';

  const TYPE_COLORS = {
    فيلا: '#C5A46D', فلل: '#C5A46D', قصر: '#B8860B', برج: '#6366F1',
    شقة: '#3B82F6', شقق: '#3B82F6', دوبلكس: '#0EA5E9',
    أرض: '#22C55E', أراضي: '#22C55E', 'أرض زراعية': '#16A34A',
    'أرض سكنية': '#22C55E', 'أرض تجارية': '#14B8A6',
    عمارة: '#64748B', عمائر: '#64748B', عمير: '#64748B',
    محل: '#F97316', محلات: '#F97316',
    مكتب: '#EA580C', مكاتب: '#EA580C',
    تجاري: '#F97316', 'عقار تجاري': '#F97316',
    استراحة: '#A855F7',
  };

  const LISTING_LABEL = { sale: 'بيع', rent: 'إيجار', buy_request: 'طلب شراء' };
  const USAGE_LABEL = { residential: 'سكني', commercial: 'تجاري' };
  const MOBILE = () => window.matchMedia('(max-width: 768px)').matches;
  const SITE = 'https://www.alheef.website';

  let map;
  let cluster;
  let layerStreet;
  let layerSatellite;
  let mapLayerMode = 'streets';
  let config = {};
  let allProperties = [];
  let markersById = new Map();
  let shareTarget = null;
  let loadGen = 0;
  /** عند فتح بطاقة العقار: موضع العلامة على الشاشة + مستوى التكبير */
  let mapDetailLock = null;

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

  function markerColor(type, listingType) {
    if (listingType === 'buy_request') return '#8B5CF6';
    const t = (type || '').trim();
    if (TYPE_COLORS[t]) return TYPE_COLORS[t];
    if (t.includes('أرض')) return TYPE_COLORS['أرض'] || '#22C55E';
    return '#1E2A38';
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

  function detailRow(label, value) {
    if (!value) return '';
    return `<p class="map-card__detail"><span>${label}</span> ${escapeHtml(String(value))}</p>`;
  }

  function buildBuyRequestCardHtml(p) {
    const img = p.coverImage || (p.gallery && p.gallery[0]) || '';
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    const area = p.area ? `${p.area} م²` : '';
    const usage = USAGE_LABEL[p.requestUsage] || p.requestUsage || '';
    const budgetLabel = p.price != null && p.price !== ''
      ? `${formatPrice(p)} ر.س`
      : 'غير محددة';
    const pid = p.id;

    return `
      <article class="map-card map-card--buy-request" data-id="${escapeHtml(p.id)}">
        <div class="map-card__badge">طلب شراء</div>
        ${img ? `<div class="map-card__gallery"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async"></div>` : ''}
        <div class="map-card__body">
          <p class="map-card__type">${escapeHtml(p.propertyType || 'عقار')}${usage ? ` · ${escapeHtml(usage)}` : ''}</p>
          <h3 class="map-card__title">${escapeHtml(p.title)}</h3>
          <p class="map-card__loc">${escapeHtml(loc)}</p>
          <p class="map-card__price">الميزانية: ${budgetLabel}</p>
          <div class="map-card__details">
            ${detailRow('المساحة المطلوبة', area)}
            ${detailRow('نوع العقار', p.propertyType)}
            ${detailRow('التصنيف', usage)}
          </div>
          <p class="map-card__desc">${escapeHtml(truncate(p.description, 140))}</p>
          <p class="map-card__note">للتواصل وتقديم العروض استخدم الزر أدناه — رقم الطالب لا يُعرض للعامة.</p>
          <div class="map-card__actions">
            <button type="button" class="map-card__btn map-card__btn--offer" data-offer="${pid}">تقديم عرض</button>
            <a class="map-card__btn map-card__btn--wa" href="#" data-wa="${pid}">واتساب</a>
            <button type="button" class="map-card__btn map-card__btn--share" data-share="${pid}">مشاركة</button>
          </div>
        </div>
      </article>`;
  }

  function buildCardHtml(p) {
    if (p.listingType === 'buy_request' || p.isBuyRequest) {
      return buildBuyRequestCardHtml(p);
    }

    const img = p.coverImage || (p.gallery && p.gallery[0]) || '';
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    const rooms = p.bedrooms ? `${p.bedrooms} غرف` : '';
    const area = p.area ? `${p.area} م²` : '';
    const ref = p.referenceNo ? `رقم الترخيص: ${escapeHtml(p.referenceNo)}` : '';
    const pid = p.id;
    const phone = (p.contactPhone || '').replace(/\D/g, '');
    const priceLabel = p.priceType === 'auction' ? 'على السوم' : `${formatPrice(p)} ر.س`;

    return `
      <article class="map-card" data-id="${escapeHtml(p.id)}">
        <div class="map-card__gallery">
          <img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">
        </div>
        <div class="map-card__body">
          <p class="map-card__type">${escapeHtml(p.propertyType)}${listingLabel(p) ? ` · ${listingLabel(p)}` : ''}</p>
          <h3 class="map-card__title">${escapeHtml(p.title)}</h3>
          <p class="map-card__loc">${escapeHtml(loc)}</p>
          <p class="map-card__price">${priceLabel}</p>
          <div class="map-card__details">
            ${detailRow('المساحة', area)}
            ${detailRow('رقم القطعة', p.plotNumber)}
            ${detailRow('رقم المخطط', p.planNumber)}
            ${detailRow('الاتجاه', p.direction)}
            ${detailRow('عرض الشارع', p.streetWidth)}
            ${ref ? `<p class="map-card__ref">${ref}</p>` : ''}
            ${phone ? `<p class="map-card__ref">جوال: ${escapeHtml(p.contactPhone)}</p>` : ''}
          </div>
          ${rooms ? `<div class="map-card__meta"><span>${escapeHtml(rooms)}</span></div>` : ''}
          <p class="map-card__desc">${escapeHtml(truncate(p.description, 140))}</p>
          <div class="map-card__actions">
            <a class="map-card__btn map-card__btn--primary" href="${propertyUrl(p)}">عرض التفاصيل</a>
            ${phone ? `<a class="map-card__btn map-card__btn--call" href="tel:${phone}">اتصال</a>` : ''}
            <a class="map-card__btn map-card__btn--wa" href="#" data-wa="${pid}">واتساب</a>
            <button type="button" class="map-card__btn map-card__btn--share" data-share="${pid}">مشاركة</button>
          </div>
        </div>
      </article>`;
  }

  function offerMessage(p) {
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    const usage = USAGE_LABEL[p.requestUsage] || p.requestUsage || '';
    return [
      'السلام عليكم، أود تقديم عرض على طلب الشراء التالي:',
      p.title,
      `النوع: ${p.propertyType || '—'}`,
      usage ? `التصنيف: ${usage}` : '',
      p.area ? `المساحة: ${p.area} م²` : '',
      p.price != null ? `الميزانية: ${formatPrice(p)} ر.س` : '',
      loc ? `الموقع: ${loc}` : '',
      propertyUrl(p),
    ].filter(Boolean).join('\n');
  }

  function shareText(p) {
    const loc = [p.district, p.city].filter(Boolean).join(' — ') || p.location || '';
    if (p.listingType === 'buy_request' || p.isBuyRequest) {
      const usage = USAGE_LABEL[p.requestUsage] || p.requestUsage || '';
      const lines = [
        p.title,
        'طلب شراء عقار',
        `النوع: ${p.propertyType || '—'}`,
        usage ? `التصنيف: ${usage}` : '',
        p.area ? `المساحة: ${p.area} م²` : '',
        p.price != null ? `الميزانية: ${formatPrice(p)} ر.س` : '',
        loc ? `الموقع: ${loc}` : '',
        propertyUrl(p),
      ].filter(Boolean);
      return lines.join('\n');
    }
    const priceLine = p.priceType === 'auction' ? 'السعر: على السوم' : `السعر: ${formatPrice(p)} ر.س`;
    const lines = [
      p.title,
      `النوع: ${p.propertyType || '—'}`,
      priceLine,
      loc ? `الموقع: ${loc}` : '',
      p.area ? `المساحة: ${p.area} م²` : '',
      p.plotNumber ? `رقم القطعة: ${p.plotNumber}` : '',
      p.planNumber ? `رقم المخطط: ${p.planNumber}` : '',
      p.direction ? `الاتجاه: ${p.direction}` : '',
      p.streetWidth ? `عرض الشارع: ${p.streetWidth}` : '',
      p.referenceNo ? `رقم الترخيص: ${p.referenceNo}` : '',
      p.contactPhone ? `الجوال: ${p.contactPhone}` : '',
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
    root.querySelectorAll('[data-offer]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-offer');
        const p = allProperties.find((x) => x.id === id);
        if (!p) return;
        const text = offerMessage(p);
        window.open(whatsappLink(text), '_blank', 'noopener');
      });
    });
  }

  function lockMapDetail(latlng) {
    if (!map || latlng == null) return;
    const ll = latlng instanceof L.LatLng ? latlng : L.latLng(latlng);
    mapDetailLock = {
      latlng: ll,
      anchor: map.latLngToContainerPoint(ll),
      zoom: map.getZoom(),
    };
    map.scrollWheelZoom.disable();
    map.doubleClickZoom.disable();
    map.touchZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    map.dragging.disable();
    map.getContainer().classList.add('map-detail-locked');
    const zc = map.zoomControl?.getContainer?.();
    if (zc) zc.classList.add('map-zoom-locked');
  }

  function restoreMapAnchor() {
    if (!map || !mapDetailLock) return;
    const current = map.latLngToContainerPoint(mapDetailLock.latlng);
    const delta = mapDetailLock.anchor.subtract(current);
    if (Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5) {
      map.panBy(delta, { animate: false });
    }
    if (map.getZoom() !== mapDetailLock.zoom) {
      map.setZoom(mapDetailLock.zoom, { animate: false });
    }
  }

  function unlockMapDetail() {
    mapDetailLock = null;
    if (!map) return;
    map.scrollWheelZoom.enable();
    map.doubleClickZoom.enable();
    map.touchZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
    map.dragging.enable();
    map.getContainer().classList.remove('map-detail-locked');
    const zc = map.zoomControl?.getContainer?.();
    if (zc) zc.classList.remove('map-zoom-locked');
  }

  function refreshMapSizeKeepAnchor() {
    if (!map) return;
    map.invalidateSize();
    if (!mapDetailLock) return;
    requestAnimationFrame(() => {
      restoreMapAnchor();
      requestAnimationFrame(restoreMapAnchor);
    });
  }

  function isSheetOpen() {
    return els.sheet?.classList.contains('open');
  }

  function openSheet(p) {
    if (!els.sheet || !els.sheetContent) return;
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      lockMapDetail(L.latLng(lat, lng));
    }
    els.sheetContent.innerHTML = buildCardHtml(p);
    bindCardActions(els.sheetContent);
    els.sheet.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
    if (map) {
      L.DomEvent.disableClickPropagation(els.sheet);
      L.DomEvent.disableScrollPropagation(els.sheet);
      setTimeout(refreshMapSizeKeepAnchor, 100);
    }
  }

  function closeSheet() {
    els.sheet?.classList.remove('open');
    els.sheet?.setAttribute('aria-hidden', 'true');
    markersById.forEach((m) => {
      if (m.isPopupOpen?.()) m.closePopup();
    });
    unlockMapDetail();
  }

  function createIcon(color) {
    return L.divIcon({
      className: 'map-pin-wrap',
      html: `<span class="map-marker-pulse" style="--pin-color:${color}"><span class="map-marker-core"></span></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  function attachMarker(p) {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const color = markerColor(p.propertyType, p.listingType);
    const marker = L.marker([lat, lng], { icon: createIcon(color) });

    marker.bindPopup(buildCardHtml(p), {
      className: 'map-popup',
      maxWidth: 340,
      autoPan: false,
      keepInView: false,
    });
    marker.on('popupopen', () => {
      lockMapDetail(marker.getLatLng());
      const popEl = marker.getPopup()?.getElement();
      if (popEl) bindCardActions(popEl);
      requestAnimationFrame(restoreMapAnchor);
    });
    marker.on('popupclose', () => {
      if (!isSheetOpen()) unlockMapDetail();
    });
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (window.AlheefMapAdd?.handleMarkerClick?.(e, p)) return;
      if (MOBILE()) {
        openSheet(p);
        return;
      }
      marker.openPopup();
    });

    const prev = markersById.get(p.id);
    if (prev) cluster.removeLayer(prev);
    cluster.addLayer(marker);
    markersById.set(p.id, marker);
    return marker;
  }

  function addPropertyToMap(p) {
    if (!p?.id || !isValidPropertyCoords(p)) return;
    const i = allProperties.findIndex((x) => x.id === p.id);
    if (i >= 0) allProperties[i] = p;
    else allProperties.unshift(p);
    attachMarker(p);
    if (els.count) els.count.textContent = `${allProperties.length} عقار`;
  }

  function isValidPropertyCoords(p) {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  function setMapLayer(mode) {
    if (!map || !layerStreet || !layerSatellite) return;
    const next = mode === 'satellite' ? 'satellite' : 'streets';
    if (next === mapLayerMode) return;

    if (next === 'satellite') {
      map.removeLayer(layerStreet);
      layerSatellite.addTo(map);
    } else {
      map.removeLayer(layerSatellite);
      layerStreet.addTo(map);
    }
    mapLayerMode = next;

    document.querySelectorAll('.map-layer-toggle__btn').forEach((btn) => {
      const active = btn.dataset.layer === next;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setupLayerToggle() {
    document.querySelectorAll('.map-layer-toggle__btn').forEach((btn) => {
      btn.addEventListener('click', () => setMapLayer(btn.dataset.layer));
    });
  }

  function initMap() {
    map = L.map('property-map', {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([24.7136, 46.6753], 11);

    if (window.matchMedia('(min-width: 769px)').matches) {
      map.zoomControl.setPosition('topleft');
    }

    layerStreet = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    });

    layerSatellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: '&copy; Esri',
        maxZoom: 19,
      }
    );

    layerStreet.addTo(map);

    cluster = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 120,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 52,
    });
    map.addLayer(cluster);
    map.on('resize', () => {
      if (mapDetailLock) restoreMapAnchor();
    });
    map.on('zoom', () => {
      if (mapDetailLock && map.getZoom() !== mapDetailLock.zoom) {
        map.setZoom(mapDetailLock.zoom, { animate: false });
        restoreMapAnchor();
      }
    });
    map.on('moveend', () => {
      if (mapDetailLock) restoreMapAnchor();
    });
    window.addEventListener('resize', () => {
      if (mapDetailLock) setTimeout(restoreMapAnchor, 60);
    });
    setupLayerToggle();
    setupFullscreen();
  }

  function setupFullscreen() {
    const wrap = document.querySelector('.map-wrap');
    const btn = document.getElementById('map-fullscreen-btn');
    if (!wrap || !btn) return;

    const label = btn.querySelector('.map-fs-btn__label');
    const icon = btn.querySelector('.map-fs-btn__icon');

    function isFullscreen() {
      return document.fullscreenElement === wrap || wrap.classList.contains('map-wrap--fullscreen');
    }

    function refreshMap() {
      if (map) setTimeout(refreshMapSizeKeepAnchor, 80);
    }

    function updateUi(active) {
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.setAttribute('aria-label', active ? 'إغلاق ملء الشاشة' : 'ملء الشاشة');
      if (label) label.textContent = active ? 'إغلاق' : 'ملء الشاشة';
      if (icon) icon.textContent = active ? '✕' : '⛶';
    }

    function enterFallback() {
      wrap.classList.add('map-wrap--fullscreen');
      document.body.classList.add('map-fs-active');
      updateUi(true);
      refreshMap();
    }

    function exitAll() {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      wrap.classList.remove('map-wrap--fullscreen');
      document.body.classList.remove('map-fs-active');
      updateUi(false);
      refreshMap();
    }

    function enter() {
      if (wrap.requestFullscreen) {
        wrap.requestFullscreen().then(() => {
          updateUi(true);
          refreshMap();
        }).catch(enterFallback);
      } else {
        enterFallback();
      }
    }

    btn.addEventListener('click', () => {
      if (isFullscreen()) exitAll();
      else enter();
    });

    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement === wrap) {
        updateUi(true);
        refreshMap();
      } else if (!wrap.classList.contains('map-wrap--fullscreen')) {
        document.body.classList.remove('map-fs-active');
        updateUi(false);
        refreshMap();
      }
    });
  }

  function renderLegend() {
    if (!els.legend) return;
    const items = [
      { c: '#C5A46D', l: 'فلل / قصور' },
      { c: '#6366F1', l: 'أبراج' },
      { c: '#3B82F6', l: 'شقق' },
      { c: '#22C55E', l: 'أراضي سكنية' },
      { c: '#14B8A6', l: 'أراضي تجارية' },
      { c: '#16A34A', l: 'أراضي زراعية' },
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

  function fillSelect(id, options, placeholder) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder || 'الكل';
    el.appendChild(first);
    (options || []).forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      el.appendChild(o);
    });
    if (current && [...el.options].some((o) => o.value === current)) el.value = current;
  }

  function fillDistrictsForCity(city) {
    const districtEl = document.getElementById('filter-district');
    if (!districtEl) return;
    const loc = window.AlheefMapLocations;
    if (!city || !loc?.districts?.[city]) {
      districtEl.disabled = true;
      fillSelect('filter-district', [], 'اختر المدينة أولاً');
      districtEl.options[0].textContent = 'اختر المدينة أولاً';
      return;
    }
    districtEl.disabled = false;
    fillSelect('filter-district', loc.districts[city], 'الكل');
  }

  function setupLocationFilters() {
    const loc = window.AlheefMapLocations;
    if (!loc?.cities) return;
    fillSelect('filter-city', loc.cities, 'الكل');

    const cityEl = document.getElementById('filter-city');
    cityEl?.addEventListener('change', () => {
      fillDistrictsForCity(cityEl.value);
    });
  }

  async function loadFilterOptions() {
    setupLocationFilters();
    const loc = window.AlheefMapLocations;
    try {
      const res = await fetch('/api/map/filters');
      const data = await res.json();
      const cityEl = document.getElementById('filter-city');
      const mergedCities = [...new Set([...(loc?.cities || []), ...(data.cities || [])])].sort();
      if (cityEl && mergedCities.length) {
        fillSelect('filter-city', mergedCities, 'الكل');
        if (cityEl.value) fillDistrictsForCity(cityEl.value);
      }
    } catch { /* locations already loaded */ }
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
        const meta = data.meta || {};
        let label = `${allProperties.length} عقار`;
        if (meta.missingCoords > 0) {
          label += ` (${meta.missingCoords} بدون إحداثيات)`;
        }
        els.count.textContent = label;
      }
      if (data.meta) {
        console.log('[map] properties loaded', data.meta);
      }
    } catch {
      if (els.count) els.count.textContent = 'تعذر التحميل';
    } finally {
      if (gen === loadGen) els.loading?.classList.add('hidden');
    }
  }

  function renderMarkers(items) {
    cluster.clearLayers();
    markersById.clear();
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
        attachMarker(p);
        bounds.push([lat, lng]);
      }
      if (i < items.length) {
        requestAnimationFrame(addBatch);
      } else if (bounds.length && !mapDetailLock) {
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
      fillDistrictsForCity('');
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
    document.dispatchEvent(new CustomEvent('alheef-map-ready'));
  }

  window.AlheefMap = {
    map: () => map,
    cluster: () => cluster,
    getConfig: () => config,
    addPropertyToMap,
    loadProperties,
    buildCardHtml,
    openSheet,
    closeSheet,
    isValidPropertyCoords,
    markerColor,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
