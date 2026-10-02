const TYPES = [
  { key: 'all', label: 'الكل' },
  { key: 'land', label: 'أرض' },
  { key: 'villa', label: 'فيلا' },
  { key: 'apartment', label: 'شقة' },
  { key: 'building', label: 'عمارة' },
];
const COLORS = { land: '#16A34A', villa: '#C5A46D', apartment: '#2563EB', building: '#7C3AED', all: '#1E2A38' };
const MAHDIA = [24.6475, 46.5115];
const VIEW_KEY = 'alheef-offer-view';

let view = 'map';
let type = 'all';
let archive = false;
let page = 1;
let items = [];
let map;
let cluster;
let heefWhatsapp = '966530792754';

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const saved = sessionStorage.getItem(VIEW_KEY);
  view = params.get('view') === 'list' || params.get('view') === 'map' ? params.get('view') : (saved || 'map');
  await initLayout('private-offers', 'العروض الخاصة');
  setTopbarActions('<a class="btn btn-outline btn-sm" href="/dashboard/private-offers-legacy.html">عملاء العروض</a>');
  renderShell();
  bindShell();
  loadWhatsapp();
  await loadItems();
  if (params.get('id')) openDetail(params.get('id'));
});

function renderShell() {
  getPageContent().innerHTML = `
    <section class="ob-page">
      <div class="ob-bar">
        <button type="button" data-view="map">الخريطة</button>
        <button type="button" data-view="list">القائمة</button>
        <button type="button" data-archive="0">النشطة</button>
        <button type="button" data-archive="1">الأرشيف</button>
      </div>
      <div class="ob-filters" id="ob-filters"></div>
      <div class="ob-layout" id="ob-layout">
        <div id="ob-map" class="ob-map"></div>
        <div>
          <div id="ob-list" class="ob-list"></div>
          <button type="button" id="ob-more" hidden>مزيد</button>
        </div>
      </div>
      <p class="ob-meta" id="ob-count"></p>
    </section>`;
  document.getElementById('ob-filters').innerHTML = TYPES.map((item) =>
    `<button type="button" data-type="${item.key}">${item.label}</button>`).join('');
  syncButtons();
}

function syncButtons() {
  document.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.view === view));
  document.querySelectorAll('[data-archive]').forEach((btn) => btn.classList.toggle('is-on', (btn.dataset.archive === '1') === archive));
  document.querySelectorAll('[data-type]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.type === type));
  const layout = document.getElementById('ob-layout');
  layout.className = `ob-layout ${view === 'map' ? 'ob-layout--map' : 'ob-layout--list'}`;
  document.getElementById('ob-map').hidden = view !== 'map';
  document.getElementById('ob-list').parentElement.hidden = view === 'map';
  if (view === 'map') setTimeout(() => map && map.invalidateSize(), 60);
}

function bindShell() {
  getPageContent().addEventListener('click', (event) => {
    const viewBtn = event.target.closest('[data-view]');
    if (viewBtn) {
      view = viewBtn.dataset.view;
      sessionStorage.setItem(VIEW_KEY, view);
      const url = new URL(location.href);
      url.searchParams.set('view', view);
      history.replaceState(null, '', url);
      page = 1;
      items = [];
      syncButtons();
      loadItems();
      return;
    }
    const archiveBtn = event.target.closest('[data-archive]');
    if (archiveBtn) {
      archive = archiveBtn.dataset.archive === '1';
      page = 1;
      items = [];
      syncButtons();
      loadItems();
      return;
    }
    const typeBtn = event.target.closest('[data-type]');
    if (typeBtn) {
      type = typeBtn.dataset.type;
      page = 1;
      items = [];
      syncButtons();
      loadItems();
    }
  });
  document.getElementById('ob-more').addEventListener('click', () => {
    page += 1;
    loadItems(true);
  });
}

async function loadWhatsapp() {
  try {
    const cfg = await fetch('/api/config').then((res) => res.json());
    const digits = String(cfg.whatsapp || '').replace(/\D/g, '');
    if (digits && digits !== '966500000000') heefWhatsapp = digits;
  } catch { /* الرقم الافتراضي للهيف */ }
}

async function loadItems(append) {
  const data = await DashboardAPI.request(`/offer-board?view=${view}&type=${type}&archive=${archive ? '1' : '0'}&page=${page}&limit=24${view === 'map' ? '&map=1' : ''}`);
  items = append ? items.concat(data.items || []) : (data.items || []);
  document.getElementById('ob-count').textContent = `${data.total || 0} إعلان`;
  document.getElementById('ob-more').hidden = items.length >= (data.total || 0);
  drawList();
  if (view === 'map') drawMap();
}

function money(value) {
  return value == null ? '—' : `${Number(value).toLocaleString('ar-SA')} ر.س`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function photo(item) {
  const kind = COLORS[item.typeKey] ? item.typeKey : 'all';
  if (item.coverImage) return `<img src="${escapeHtml(item.coverImage)}" alt="" loading="lazy">`;
  return `<div class="ob-ph ob-ph--${kind}">${escapeHtml(item.propertyType || 'عقار')}</div>`;
}

function facts(item) {
  const meter = item.pricePerMeter ? `<p class="ob-meta">سعر المتر ${money(item.pricePerMeter)}</p>` : '';
  const plan = item.planNumber || item.plotNumber ? `<p class="ob-meta">مخطط ${escapeHtml(item.planNumber || '—')} · قطعة ${escapeHtml(item.plotNumber || '—')}</p>` : '';
  const face = item.direction || item.streetWidth ? `<p class="ob-meta">${escapeHtml([item.direction && `الواجهة ${item.direction}`, item.streetWidth && `الشارع ${item.streetWidth}`].filter(Boolean).join(' · '))}</p>` : '';
  return `<p class="ob-meta">${escapeHtml(item.propertyType || '')} · ${escapeHtml(item.district || item.city || '')}</p>
    <p class="ob-meta">${money(item.price)} · ${item.area ? `${escapeHtml(item.area)} م²` : '—'}</p>
    ${meter}${plan}${face}<p class="ob-note">${escapeHtml(item.priceNote || '')}</p>`;
}

function drawList() {
  document.getElementById('ob-list').innerHTML = items.map((item) => `
    <article class="ob-card">
      ${photo(item)}
      <div class="ob-card__body">
        ${facts(item)}
        <div class="ob-card__actions">
          <button type="button" data-open="${escapeHtml(item.id)}">عرض التفاصيل</button>
          <a class="btn btn-gold btn-sm" href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>
        </div>
      </div>
    </article>`).join('') || '<p>لا توجد إعلانات في هذا العرض.</p>';
  document.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.open)));
}

function ensureMap() {
  if (map) return;
  map = L.map('ob-map', { zoomControl: true }).setView(MAHDIA, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
  cluster = L.markerClusterGroup();
  map.addLayer(cluster);
}

function drawMap() {
  ensureMap();
  cluster.clearLayers();
  items.forEach((item) => {
    if (item.latitude == null || item.longitude == null) return;
    const color = COLORS[item.typeKey] || COLORS.all;
    const marker = L.marker([item.latitude, item.longitude], {
      icon: L.divIcon({
        className: 'ob-pin',
        html: `<span style="background:${color}"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    });
    marker.bindPopup(`<div class="ob-popup">${photo(item)}${facts(item)}<div class="ob-actions"><button type="button" data-open="${escapeHtml(item.id)}">عرض التفاصيل</button><a href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a></div></div>`, { maxWidth: 280 });
    marker.on('popupopen', (event) => {
      event.popup.getElement().querySelector('[data-open]')?.addEventListener('click', () => openDetail(item.id));
    });
    cluster.addLayer(marker);
  });
  map.invalidateSize();
}

function heefLink(item) {
  const text = `مرحبًا، أود الاستفسار عن ${item.internalRef || item.title || 'إعلان'} في ${item.district || ''}`.trim();
  return `https://wa.me/${heefWhatsapp}?text=${encodeURIComponent(text)}`;
}

async function openDetail(id) {
  const data = await DashboardAPI.request(`/offer-board/${id}`);
  const item = data.item;
  const old = document.getElementById('ob-modal');
  if (old) old.remove();
  const gallery = (item.gallery || []).map((url) => `<img src="${escapeHtml(url)}" alt="" loading="lazy">`).join('');
  const modal = document.createElement('div');
  modal.id = 'ob-modal';
  modal.className = 'ob-modal';
  modal.innerHTML = `
    <div class="ob-sheet" role="dialog" aria-modal="true">
      <button type="button" id="ob-close">إغلاق</button>
      <div class="ob-gallery">${gallery || photo(item)}</div>
      <h2>${escapeHtml(item.title || item.propertyType || '')}</h2>
      ${facts(item)}
      <p class="ob-meta">${escapeHtml(item.description || '')}</p>
      <p class="ob-meta">الأطوال: ${escapeHtml(item.lengths || '—')}</p>
      <p class="ob-meta">الرقم الداخلي: ${escapeHtml(item.internalRef || '—')}</p>
      <p class="ob-meta">آخر تحديث: ${escapeHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleString('ar-SA') : '—')}</p>
      <a class="btn btn-gold" href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>
      <div class="ob-admin">
        <p>رقم المعلن: ${escapeHtml(item.advertiserPhone || '—')}</p>
        ${item.advertiserPhone ? `<a href="tel:${escapeHtml(item.advertiserPhone)}">اتصال</a> <a href="https://wa.me/${escapeHtml(item.advertiserPhone.replace(/^0/, '966'))}" target="_blank" rel="noopener">واتساب المعلن</a>` : ''}
        <p class="ob-meta">المصدر: ${escapeHtml(item.sourceName || '—')} ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">فتح المصدر</a>` : ''}</p>
        <div class="ob-actions" id="ob-admin-actions"></div>
        <pre class="ob-meta">${escapeHtml((item.statusLog || []).map((entry) => `${entry.at || ''} ${entry.action || ''}`).join('\n'))}</pre>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const actions = [
    ['publish', 'اعتماد ونشر'], ['reject', 'رفض'], ['hide', 'إخفاء'], ['sold', 'مباع'],
    ['withdrawn', 'مسحوب'], ['reactivate', 'إعادة تفعيل'], ['map_on', 'إظهار في الخريطة'],
    ['map_off', 'إخفاء من الخريطة'], ['offers_on', 'إظهار في العروض'], ['offers_off', 'إخفاء من العروض'],
    ['homepage_on', 'إضافة للرئيسية'], ['homepage_off', 'إزالة من الرئيسية'],
  ];
  document.getElementById('ob-admin-actions').innerHTML = actions.map(([action, label]) =>
    `<button type="button" data-action="${action}">${label}</button>`).join('')
    + `<a class="btn btn-outline btn-sm" href="/dashboard/add-property.html?id=${encodeURIComponent(item.id)}">تعديل</a>`;
  modal.querySelector('#ob-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await DashboardAPI.request(`/offer-board/${id}/action`, {
        method: 'POST',
        headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: btn.dataset.action }),
      });
      modal.remove();
      page = 1;
      await loadItems();
    });
  });
}
