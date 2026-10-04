(function () {
  const MAHDIA = [[24.628, 46.478], [24.672, 46.548]];
  const COLORS = { land: '#16A34A', villa: '#C5A46D', apartment: '#2563EB', building: '#7C3AED', other: '#123f35' };
  let map;
  let layer;
  let items = [];
  let current = 'all';

  function typeKey(type) {
    const text = String(type || '');
    if (text.includes('أرض') || text.includes('ارض')) return 'land';
    if (text.includes('فيلا') || text.includes('فلل')) return 'villa';
    if (text.includes('شقة') || text.includes('شقق')) return 'apartment';
    if (text.includes('عمارة') || text.includes('عمائر') || text.includes('عماره')) return 'building';
    return 'other';
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function money(item) {
    if (item.priceDisplay) return `${item.priceDisplay} ر.س`;
    const amount = Number(item.price);
    return Number.isFinite(amount) && amount > 0 ? `${amount.toLocaleString('ar-SA')} ر.س` : 'عند الطلب';
  }

  function visible() {
    if (current === 'all') return items;
    return items.filter((item) => typeKey(item.propertyType) === current);
  }

  function frame(rows) {
    const bounds = L.latLngBounds(MAHDIA);
    rows.forEach((item) => {
      if (item.latitude != null && item.longitude != null) bounds.extend([item.latitude, item.longitude]);
    });
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false });
  }

  function draw() {
    if (!map) return;
    layer.clearLayers();
    const rows = visible().filter((item) => item.latitude != null && item.longitude != null);
    rows.forEach((item) => {
      const color = COLORS[typeKey(item.propertyType)] || COLORS.other;
      const marker = L.marker([item.latitude, item.longitude], {
        icon: L.divIcon({
          className: 'pf-pin',
          html: `<span style="background:${color}"></span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      });
      const href = item.slug ? `/property.html?slug=${encodeURIComponent(item.slug)}` : '';
      marker.bindPopup(`
        <div class="pf-popup">
          <strong>${esc(item.title || item.propertyType || 'عقار')}</strong>
          <p>${esc(item.propertyType || '')}${item.district ? ` · ${esc(item.district)}` : ''}</p>
          <p>${esc(money(item))}</p>
          ${href ? `<a href="${esc(href)}">التفاصيل</a>` : ''}
        </div>`, { maxWidth: 240, autoPan: false });
      layer.addLayer(marker);
    });
    frame(rows);
  }

  function setup() {
    const host = document.getElementById('home-map');
    const shell = document.getElementById('home-map-shell');
    if (!host || !window.L || map) return;
    map = L.map(host, {
      zoomControl: false,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri',
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    frame([]);
    document.getElementById('home-map-full')?.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else shell.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      setTimeout(() => {
        map.invalidateSize();
        frame(visible());
      }, 60);
    });
    document.getElementById('home-map-filters')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-map-type]');
      if (!button) return;
      current = button.dataset.mapType;
      document.querySelectorAll('[data-map-type]').forEach((item) => item.classList.toggle('active', item === button));
      draw();
    });
    window.addEventListener('resize', () => map.invalidateSize(), { passive: true });
    fetch('/api/map/properties')
      .then((res) => res.json())
      .then((data) => {
        items = data.items || [];
        draw();
      })
      .catch(() => frame([]));
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
