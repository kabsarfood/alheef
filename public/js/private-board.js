(function () {
  const TYPES = [
    { key: 'all', label: 'الكل' },
    { key: 'land', label: 'أرض' },
    { key: 'villa', label: 'فيلا' },
    { key: 'apartment', label: 'شقة' },
    { key: 'building', label: 'عمارة' },
  ];
  const COLORS = { land: '#16A34A', villa: '#C5A46D', apartment: '#2563EB', building: '#7C3AED', all: '#1E2A38' };
  const CENTER = [24.6475, 46.5115];

  let items = [];
  let type = 'all';
  let view = 'map';
  let map;
  let cluster;
  let headersFn = () => ({});
  let onAuthFail = async () => {};

  function esc(value) {
    return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('ar-SA')} ر.س` : 'السعر عند الطلب';
  }

  function areaText(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString('ar-SA')} م²` : '';
  }

  function mapsHref(item) {
    if (item.mapsUrl) return item.mapsUrl;
    if (item.latitude != null && item.longitude != null) {
      return `https://www.google.com/maps?q=${item.latitude},${item.longitude}`;
    }
    return '';
  }

  function welcomeName(name) {
    const text = String(name || '').trim();
    if (!text || text === 'عميل') return '';
    return text;
  }

  function shell(clientName) {
    const name = welcomeName(clientName);
    return `
      <header class="pb-header">
        <a class="pb-brand" href="/">
          <img src="/images/logo-alheef.png?v=6" alt="الهيف">
        </a>
        <div class="pb-header__title">
          <p>مؤسسة الهيف</p>
          <h1>عروض الهيف العقارية الخاصة</h1>
        </div>
        <a class="pb-home" href="/">الرئيسية</a>
      </header>
      <section class="pb-welcome">
        <h2>${name ? `مرحبًا ${esc(name)}` : 'مرحبًا بك في عروض الهيف العقارية الخاصة'}</h2>
        <p>اختر العقار المناسب لك، ويمكنك مشاهدة العروض بالخريطة أو بالقائمة.</p>
      </section>
      <section class="pb-slider" id="pb-slider" hidden>
        <div class="pb-slider__track" id="pb-slider-track"></div>
      </section>
      <div class="pb-tools">
        <div class="pb-views" role="tablist" aria-label="طريقة العرض">
          <button type="button" data-view="map" class="is-on">الخريطة</button>
          <button type="button" data-view="list">القائمة</button>
        </div>
        <div class="pb-filters" id="pb-filters" role="tablist" aria-label="نوع العقار"></div>
      </div>
      <p class="pb-count" id="pb-count"></p>
      <div class="pb-stage">
        <div id="pb-map" class="pb-map"></div>
        <div id="pb-list" class="pb-list" hidden></div>
      </div>
      <div id="pb-modal" class="pb-modal" hidden></div>`;
  }

  function filtered() {
    if (type === 'all') return items;
    return items.filter((item) => item.typeKey === type);
  }

  function renderFilters() {
    document.getElementById('pb-filters').innerHTML = TYPES.map((item) =>
      `<button type="button" data-type="${item.key}" class="${item.key === type ? 'is-on' : ''}" style="--type:${COLORS[item.key]}">${item.label}</button>`).join('');
  }

  function renderSlider() {
    const slides = items.filter((item) => item.coverImage).slice(0, 8);
    const root = document.getElementById('pb-slider');
    const track = document.getElementById('pb-slider-track');
    if (!slides.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    track.innerHTML = slides.map((item) => `
      <button type="button" class="pb-slide" data-open="${esc(item.id)}">
        <img src="${esc(item.coverImage)}" alt="">
        <span>${esc(item.district || item.propertyType || 'عرض خاص')}</span>
      </button>`).join('');
    let index = 0;
    let timer = setInterval(step, 4200);
    function step() {
      const cards = track.children;
      if (!cards.length) return;
      index = (index + 1) % cards.length;
      cards[index].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
    root.addEventListener('pointerdown', () => clearInterval(timer), { once: true });
  }

  function cardHtml(item) {
    const href = mapsHref(item);
    const facts = [
      item.propertyType ? `<span>${esc(item.propertyType)}</span>` : '',
      item.district ? `<span>${esc(item.district)}</span>` : '',
      areaText(item.area) ? `<span>${esc(areaText(item.area))}</span>` : '',
      item.direction ? `<span>${esc(item.direction)}</span>` : '',
      item.street ? `<span>${esc(item.street)}</span>` : '',
      item.streetWidth ? `<span>عرض الشارع ${esc(item.streetWidth)}</span>` : '',
    ].filter(Boolean).join('');
    return `
      <article class="pb-card">
        <button type="button" class="pb-card__media" data-open="${esc(item.id)}">
          ${item.coverImage ? `<img src="${esc(item.coverImage)}" alt="">` : `<span class="pb-card__ph" style="background:${COLORS[item.typeKey] || COLORS.all}">${esc(item.propertyType || 'عقار')}</span>`}
        </button>
        <div class="pb-card__body">
          <h3>${esc(item.title || item.district || item.propertyType || 'عرض خاص')}</h3>
          <p class="pb-card__price">${esc(money(item.price))}</p>
          <div class="pb-card__facts">${facts}</div>
          <div class="pb-card__actions">
            ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">مشاهدة الموقع</a>` : ''}
            <button type="button" data-open="${esc(item.id)}">مشاهدة التفاصيل</button>
            <button type="button" class="pb-share" data-share="${esc(item.id)}">مشاركة الإعلان</button>
          </div>
        </div>
      </article>`;
  }

  function renderList() {
    const list = document.getElementById('pb-list');
    const rows = filtered();
    document.getElementById('pb-count').textContent = rows.length ? `${rows.length} عرض` : 'لا توجد عروض ضمن هذا التصنيف';
    list.innerHTML = rows.length ? rows.map(cardHtml).join('') : '<p class="pb-empty">لا توجد عروض مطابقة.</p>';
  }

  function syncView() {
    document.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.view === view));
    document.getElementById('pb-map').hidden = view !== 'map';
    document.getElementById('pb-list').hidden = view !== 'list';
    if (view === 'map' && map) setTimeout(() => map.invalidateSize(), 40);
  }

  function drawMap() {
    if (!window.L) return;
    const host = document.getElementById('pb-map');
    if (!map) {
      map = L.map(host, { zoomControl: true }).setView(CENTER, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });
      map.addLayer(cluster);
    }
    cluster.clearLayers();
    const rows = filtered().filter((item) => item.latitude != null && item.longitude != null);
    rows.forEach((item) => {
      const color = COLORS[item.typeKey] || COLORS.all;
      const marker = L.marker([item.latitude, item.longitude], {
        icon: L.divIcon({
          className: 'pb-pin',
          html: `<span style="background:${color}"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      });
      marker.bindPopup(`<div class="pb-popup"><strong>${esc(item.title || item.propertyType || 'عرض')}</strong><p>${esc(item.district || '')}</p><p>${esc(money(item.price))}</p><button type="button" data-open="${esc(item.id)}">عرض التفاصيل</button><button type="button" class="pb-share" data-share="${esc(item.id)}">مشاركة الإعلان</button></div>`, { maxWidth: 260 });
      marker.on('popupopen', (event) => {
        const box = event.popup.getElement();
        box?.querySelector('[data-open]')?.addEventListener('click', () => openDetail(item.id));
        box?.querySelector('[data-share]')?.addEventListener('click', (click) => shareListing(click.currentTarget));
      });
      cluster.addLayer(marker);
    });
    if (rows.length) map.fitBounds(rows.map((item) => [item.latitude, item.longitude]), { padding: [28, 28], maxZoom: 15 });
    map.invalidateSize();
  }

  async function openDetail(id) {
    const res = await fetch(`/api/private-offers/board/${encodeURIComponent(id)}`, { headers: headersFn() });
    if (res.status === 401 || res.status === 403) return onAuthFail();
    const data = await res.json().catch(() => ({}));
    const item = data.item;
    if (!item) return;
    const href = mapsHref(item);
    const gallery = (item.gallery || []).map((url) => `<img src="${esc(url)}" alt="">`).join('');
    const modal = document.getElementById('pb-modal');
    modal.hidden = false;
    modal.innerHTML = `
      <div class="pb-sheet" role="dialog" aria-modal="true">
        <button type="button" class="pb-sheet__close" data-close>إغلاق</button>
        <div class="pb-sheet__gallery">${gallery || ''}</div>
        <h3>${esc(item.title || item.propertyType || 'عرض خاص')}</h3>
        <p class="pb-card__price">${esc(money(item.price))}</p>
        <div class="pb-card__facts">
          ${item.propertyType ? `<span>${esc(item.propertyType)}</span>` : ''}
          ${item.district ? `<span>${esc(item.district)}</span>` : ''}
          ${areaText(item.area) ? `<span>${esc(areaText(item.area))}</span>` : ''}
          ${item.direction ? `<span>${esc(item.direction)}</span>` : ''}
          ${item.street ? `<span>${esc(item.street)}</span>` : ''}
          ${item.streetWidth ? `<span>عرض الشارع ${esc(item.streetWidth)}</span>` : ''}
        </div>
        ${item.description ? `<p class="pb-sheet__text">${esc(item.description)}</p>` : ''}
        ${href ? `<a class="pb-sheet__link" href="${esc(href)}" target="_blank" rel="noopener">مشاهدة الموقع</a>` : ''}
        <button type="button" class="pb-share" data-share="${esc(item.id)}">مشاركة الإعلان</button>
      </div>`;
    modal.querySelector('[data-close]').addEventListener('click', () => { modal.hidden = true; modal.innerHTML = ''; });
    modal.addEventListener('click', (event) => {
      if (event.target === modal) { modal.hidden = true; modal.innerHTML = ''; }
    }, { once: true });
  }

  async function shareListing(button) {
    if (button.dataset.busy === '1') return;
    button.dataset.busy = '1';
    const original = button.textContent;
    button.textContent = 'جارٍ الإرسال…';
    try {
      const res = await fetch(`/api/private-offers/board/${encodeURIComponent(button.dataset.share)}/share`, {
        method: 'POST',
        headers: headersFn(),
      });
      if (res.status === 401 || res.status === 403) return onAuthFail();
      const data = await res.json().catch(() => ({}));
      button.textContent = data.success ? 'تم الإرسال إلى واتسابك' : (data.message || 'تعذر الإرسال');
    } catch (error) {
      button.textContent = 'تعذر الإرسال';
    }
    setTimeout(() => {
      button.dataset.busy = '';
      button.textContent = original;
    }, 4000);
  }

  function bind() {
    const root = document.getElementById('po-board');
    root.addEventListener('click', (event) => {
      const viewBtn = event.target.closest('[data-view]');
      if (viewBtn) {
        view = viewBtn.dataset.view;
        syncView();
        return;
      }
      const typeBtn = event.target.closest('[data-type]');
      if (typeBtn) {
        type = typeBtn.dataset.type;
        renderFilters();
        renderList();
        drawMap();
        return;
      }
      const shareBtn = event.target.closest('[data-share]');
      if (shareBtn) {
        shareListing(shareBtn);
        return;
      }
      const openBtn = event.target.closest('[data-open]');
      if (openBtn) openDetail(openBtn.dataset.open);
    });
  }

  async function open(options) {
    headersFn = options.headers;
    onAuthFail = options.onAuthFail;
    const root = document.getElementById('po-board');
    if (map) {
      map.remove();
      map = null;
      cluster = null;
    }
    root.innerHTML = shell(options.clientName);
    if (!root.dataset.bound) {
      root.dataset.bound = '1';
      bind();
    }
    renderFilters();
    const res = await fetch('/api/private-offers/board', { headers: headersFn() });
    if (res.status === 401 || res.status === 403) return onAuthFail();
    const data = await res.json().catch(() => ({}));
    items = data.items || [];
    renderSlider();
    renderList();
    syncView();
    drawMap();
  }

  window.AlheefPrivateBoard = { open };
})();
