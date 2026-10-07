const TYPES = [
  { key: 'all', label: 'الكل' },
  { key: 'land', label: 'أرض' },
  { key: 'villa', label: 'فيلا' },
  { key: 'apartment', label: 'شقة' },
  { key: 'building', label: 'عمارة' },
];
const PROPERTY_TYPE_STYLES = {
  land: { label: 'أرض', color: '#C79A52', ink: '#1C1915' },
  villa: { label: 'فيلا', color: '#1F5A48', ink: '#FFFFFF' },
  apartment: { label: 'شقة', color: '#4678A8', ink: '#FFFFFF' },
  building: { label: 'عمارة', color: '#76506F', ink: '#FFFFFF' },
};
const OTHER_TYPE_STYLE = { label: 'عقار', color: '#5C675F', ink: '#FFFFFF' };
const MAHDIA = [24.6475, 46.5115];
const VIEW_KEY = 'alheef-offer-view';
const ADMIN = window.ALHEEF_BOARD_MODE === 'admin';
const PRIVATE = window.ALHEEF_BOARD_MODE === 'private';
const DASHBOARD = window.ALHEEF_BOARD_SHELL === 'dashboard';

let view = 'map';
let type = 'all';
let archive = false;
let page = 1;
let items = [];
let priceBand = 'all';
let areaBand = 'all';
let sortKey = 'latest';
let map;
let cluster;
let markers = new Map();
let activeId = null;
let scrollLocked = false;
let scrollLockY = 0;
let viewHold = 0;
let viewObserver = null;
let heefWhatsapp = '966530792754';
let photoState = { images: [], index: 0 };
let booted = false;

function applyTypeColors() {
  const root = document.documentElement;
  Object.entries(PROPERTY_TYPE_STYLES).forEach(([key, style]) => {
    root.style.setProperty(`--${key}-color`, style.color);
    root.style.setProperty(`--${key}-ink`, style.ink);
  });
  root.style.setProperty('--other-color', OTHER_TYPE_STYLE.color);
  root.style.setProperty('--other-ink', OTHER_TYPE_STYLE.ink);
}

function typeStyle(key) {
  return PROPERTY_TYPE_STYLES[key] || OTHER_TYPE_STYLE;
}

function markerKind(item) {
  return PROPERTY_TYPE_STYLES[item.typeKey] ? item.typeKey : 'other';
}

async function boot() {
  if (booted) {
    page = 1;
    await loadItems();
    return;
  }
  booted = true;
  applyTypeColors();
  const params = new URLSearchParams(location.search);
  const saved = sessionStorage.getItem(VIEW_KEY);
  view = params.get('view') === 'list' || params.get('view') === 'map' ? params.get('view') : (saved || 'list');
  if (ADMIN || DASHBOARD) {
    await initLayout('private-offers', 'العروض الخاصة');
    if (ADMIN) setTopbarActions('<a class="btn btn-outline btn-sm" href="/dashboard/private-offers-legacy.html">عملاء العروض</a>');
  }
  renderShell();
  bindShell();
  loadWhatsapp();
  await loadItems();
  if (PRIVATE) window.setInterval(() => { loadItems().catch(() => {}); }, 45000);
  if (params.get('id')) openDetail(params.get('id'));
}

function renderPrivateNews() {
  if (!PRIVATE) return;
  const box = document.getElementById('ob-news');
  if (!box) return;
  const seenKey = 'alheef_user_seen_at';
  const seenRaw = localStorage.getItem(seenKey);
  if (!seenRaw) {
    localStorage.setItem(seenKey, new Date().toISOString());
    box.hidden = true;
    return;
  }
  const since = new Date(seenRaw).getTime();
  const fresh = items.filter((item) => item.publishedAt && new Date(item.publishedAt).getTime() > since);
  if (!fresh.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <p><strong>${fresh.length}</strong> ${fresh.length === 1 ? 'عقار جديد سُجّل' : 'عقارات جديدة سُجّلت'}</p>
    <ul>${fresh.slice(0, 8).map((item) => `<li><button type="button" data-news-open="${escapeHtml(item.id)}">${escapeHtml(item.title || item.propertyType || 'عقار')}${item.district ? ` — ${escapeHtml(item.district)}` : ''}</button></li>`).join('')}</ul>
    <button type="button" id="ob-news-seen">تم الاطلاع</button>`;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const notified = sessionStorage.getItem('alheef_user_notified') || '';
    const unseen = fresh.filter((item) => !notified.includes(item.id));
    if (unseen.length) {
      sessionStorage.setItem('alheef_user_notified', `${notified},${unseen.map((item) => item.id).join(',')}`);
      try {
        new Notification('عقار جديد في الهيف', { body: unseen[0].title || unseen[0].propertyType || 'عرض جديد' });
      } catch { /* المتصفح رفض الإشعار */ }
    }
  }
}

if (PRIVATE) window.AlheefOfferBoard = { start: boot };
else document.addEventListener('DOMContentLoaded', boot);

function renderShell() {
  const chips = TYPES.map((item) =>
    `<button type="button" class="ob-chip" data-type="${item.key}">${item.label}</button>`).join('');
  getPageContent().innerHTML = `
    <div class="ob-fit">
    <section class="ob-studio">
      <section class="ob-hero">
        <div class="ob-hero__top">
          <div>
            ${PRIVATE ? '' : '<div class="ob-eyebrow"><span></span> للعميل</div>'}
            <h1>العروض الخاصة</h1>
            ${PRIVATE ? '' : '<p>تصفح العروض المعتمدة للعميل، وقارن التفاصيل، وشاهد موقع العقار على الخريطة.</p>'}
          </div>
          ${PRIVATE ? '' : '<div class="ob-hero__stat"><strong id="ob-count-hero">0</strong><span>عرض متاح حاليًا</span></div>'}
          ${PRIVATE ? '<button type="button" class="ob-logout" id="ob-logout">تسجيل الخروج</button>' : ''}
        </div>
        ${PRIVATE ? '<div id="ob-news" class="ob-news" hidden></div>' : ''}
        <div class="ob-search${PRIVATE ? ' ob-search--solo' : ''}">
          <input id="ob-search" class="ob-field ob-field--wide" type="search" inputmode="text" placeholder="ابحث برقم الإعلان أو جزء منه…" autocomplete="off">
          ${PRIVATE ? '' : `<select id="ob-type" class="ob-field">${TYPES.map((item) => `<option value="${item.key}">${item.key === 'all' ? 'كل العقارات' : item.label}</option>`).join('')}</select>
          <select id="ob-price" class="ob-field">
            <option value="all">كل الأسعار</option>
            <option value="under1500">أقل من 1.5 مليون</option>
            <option value="1500to2000">1.5–2 مليون</option>
            <option value="over2000">أكثر من 2 مليون</option>
          </select>
          <select id="ob-area" class="ob-field">
            <option value="all">كل المساحات</option>
            <option value="under350">أقل من 350 م²</option>
            <option value="350to450">350–450 م²</option>
            <option value="over450">أكثر من 450 م²</option>
          </select>
          <button type="button" class="ob-search__btn" id="ob-apply">عرض النتائج</button>`}
        </div>
      </section>
      <div class="ob-view-switch">
        <p class="ob-view-switch__label">طريقة عرض الصفحة</p>
        <div class="ob-view-switch__row" role="group" aria-label="طريقة عرض الصفحة">
          <button type="button" class="ob-view-btn" data-view="list">قائمة</button>
          <button type="button" class="ob-view-btn" data-view="map">خريطة</button>
        </div>
      </div>
      <div class="ob-toolbar">
        <div class="ob-chips" id="ob-filters">${chips}</div>
        <div class="ob-toolbar__side">
          ${ADMIN ? '<button type="button" data-archive="0">النشطة</button><button type="button" data-archive="1">الأرشيف</button><button type="button" id="ob-share">مشاركة العروض الخاصة</button>' : ''}
          <span class="ob-count"><b id="ob-count">0</b> عروض مطابقة</span>
          <select id="ob-sort" class="ob-sort">
            <option value="latest">الأحدث أولًا</option>
            <option value="priceAsc">السعر: الأقل</option>
            <option value="priceDesc">السعر: الأعلى</option>
            <option value="areaDesc">المساحة: الأكبر</option>
          </select>
        </div>
      </div>
      <p class="ob-note" id="ob-note" hidden></p>
      <section class="ob-content" id="ob-layout">
        <div class="ob-list-col">
          <div id="ob-list" class="ob-listings"></div>
          <button type="button" id="ob-more" hidden>مزيد</button>
        </div>
        <aside class="ob-map-panel" id="mapPanel">
          <div class="ob-map-head">
            <div class="ob-map-title"><strong>الخريطة العقارية</strong></div>
            <button type="button" class="ob-map-expand" id="ob-map-expand">فتح الخريطة</button>
            <button type="button" class="ob-map-close" id="ob-map-close" aria-label="إغلاق الخريطة">✕</button>
          </div>
          <button type="button" class="ob-map-exit" id="ob-map-exit" aria-label="الرجوع للحجم الطبيعي">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>تصغير</span>
          </button>
          <div id="ob-map" class="ob-map"></div>
          <div class="ob-map-legend" id="ob-map-legend">${legendMarkup()}</div>
          <div class="ob-map-foot"><span>النقاط تمثل العروض المتاحة</span><strong>اضغط على أي عرض لعرض التفاصيل</strong></div>
        </aside>
      </section>
      <button type="button" class="ob-map-fab" id="ob-map-fab">فتح الخريطة</button>
      ${ADMIN ? '<div id="ob-invites"></div><section id="ob-leads" class="ob-leads"></section>' : ''}
    </section>
    </div>`;
  syncButtons();
  if (ADMIN) {
    setupInvites();
    setupLeads();
  }
}

function setPageView(next) {
  const mode = next === 'map' ? 'map' : 'list';
  if (mode === 'list' && document.body.classList.contains('ob-map-fs')) exitMapFullscreen();
  view = mode;
  sessionStorage.setItem(VIEW_KEY, view);
  const url = new URL(location.href);
  url.searchParams.set('view', view);
  history.replaceState(null, '', url);
  applyPageView();
}

function applyPageView() {
  const studio = document.querySelector('.ob-studio');
  if (studio) {
    studio.classList.toggle('is-view-list', view === 'list');
    studio.classList.toggle('is-view-map', view === 'map');
  }
  document.querySelectorAll('.ob-view-btn').forEach((btn) => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (view === 'map') setTimeout(() => map && map.invalidateSize(), 80);
}

function syncButtons() {
  document.querySelectorAll('[data-archive]').forEach((btn) => btn.classList.toggle('is-on', (btn.dataset.archive === '1') === archive));
  document.querySelectorAll('[data-type]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.type === type));
  const typeSelect = document.getElementById('ob-type');
  if (typeSelect) typeSelect.value = type;
  applyPageView();
}

function bindShell() {
  document.addEventListener('click', (event) => {
    if (!ADMIN) return;
    const homeBtn = event.target.closest('[data-home]');
    if (homeBtn) {
      toggleHomepage(homeBtn.dataset.home, homeBtn.dataset.homeOn === '1');
      return;
    }
    const shareBtn = event.target.closest('[data-share-client]');
    if (shareBtn) openClientShare(shareBtn.dataset.shareClient);
  });
  getPageContent().addEventListener('click', (event) => {
    if (event.target.closest('#ob-share')) {
      openShareModal();
      return;
    }
    const viewBtn = event.target.closest('[data-view]');
    if (viewBtn) {
      setPageView(viewBtn.dataset.view);
      if (viewBtn.dataset.view === 'map') requestAnimationFrame(() => enterMapFullscreen());
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
      syncButtons();
      drawList();
      drawMap();
      return;
    }
    const focusBtn = event.target.closest('[data-focus]');
    if (focusBtn) focusProperty(focusBtn.dataset.focus);
    const privateShare = event.target.closest('[data-private-share]');
    if (privateShare) sharePrivateListing(privateShare);
    if (event.target.closest('#ob-logout') && typeof window.ALHEEF_PRIVATE_AUTH_FAIL === 'function') {
      window.ALHEEF_PRIVATE_AUTH_FAIL();
      return;
    }
    if (event.target.closest('#ob-news-seen')) {
      localStorage.setItem('alheef_user_seen_at', new Date().toISOString());
      renderPrivateNews();
      return;
    }
    const newsOpen = event.target.closest('[data-news-open]');
    if (newsOpen) openDetail(newsOpen.dataset.newsOpen);
  });
  document.getElementById('ob-more').addEventListener('click', () => {
    page += 1;
    loadItems(true);
  });
  document.getElementById('ob-search')?.addEventListener('input', () => { drawList(); drawMap(); });
  document.getElementById('ob-apply')?.addEventListener('click', () => { drawList(); drawMap(); });
  document.getElementById('ob-type')?.addEventListener('change', (event) => {
    type = event.target.value;
    syncButtons();
    drawList();
    drawMap();
  });
  document.getElementById('ob-price')?.addEventListener('change', (event) => {
    priceBand = event.target.value;
    drawList();
    drawMap();
  });
  document.getElementById('ob-area')?.addEventListener('change', (event) => {
    areaBand = event.target.value;
    drawList();
    drawMap();
  });
  document.getElementById('ob-sort')?.addEventListener('change', (event) => {
    sortKey = event.target.value;
    drawList();
  });
  document.getElementById('ob-map-fab')?.addEventListener('click', () => enterMapFullscreen());
  document.getElementById('ob-map-expand')?.addEventListener('click', () => enterMapFullscreen());
  document.getElementById('ob-map-close')?.addEventListener('click', () => exitMapFullscreen());
  document.getElementById('ob-map-exit')?.addEventListener('click', () => exitMapFullscreen());
  document.addEventListener('click', (event) => {
    const photos = event.target.closest('[data-photos]');
    if (!photos) return;
    event.preventDefault();
    openListingPhotos(photos.dataset.photos);
  });
  document.addEventListener('keydown', (event) => {
    if (!document.getElementById('ob-photos')) return;
    if (event.key === 'Escape') closePhotoViewer();
    if (event.key === 'ArrowLeft') stepPhoto(1);
    if (event.key === 'ArrowRight') stepPhoto(-1);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !document.body.classList.contains('ob-map-fs')) return;
    if (document.getElementById('ob-photos')) return;
    if (document.getElementById('ob-modal') || document.getElementById('ob-share-modal') || document.querySelector('.modal.active')) return;
    if (document.querySelector('#mapPanel .leaflet-popup')) return;
    exitMapFullscreen();
  });
  window.addEventListener('resize', () => {
    if (map && document.body.classList.contains('ob-map-fs')) map.invalidateSize();
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
  let data;
  try {
    data = await boardRequest(`?archive=${ADMIN && archive ? '1' : '0'}&page=${page}&limit=60`);
  } catch (error) {
    if (error && error.code === 'auth') return;
    showNote(error.message || 'تعذر تحميل العروض');
    return;
  }
  items = append ? items.concat(data.items || []) : (data.items || []);
  renderPrivateNews();
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : items.length;
  const more = document.getElementById('ob-more');
  if (more) more.hidden = items.length >= total;
  drawList();
  drawMap();
}

function money(value) {
  return value == null ? '—' : `${Number(value).toLocaleString('ar-SA')} ر.س`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function photo(item) {
  const kind = markerKind(item);
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

function adminChoiceButtons(item) {
  if (!ADMIN || archive) return '';
  const homeLabel = item.showOnHomepage ? 'إزالة من الرئيسية' : 'إرسال إلى الرئيسية';
  return `<button type="button" class="ob-choice ob-choice--home" data-home="${escapeHtml(item.id)}" data-home-on="${item.showOnHomepage ? '1' : '0'}">${homeLabel}</button>
    <button type="button" class="ob-choice ob-choice--share" data-share-client="${escapeHtml(item.id)}">مشاركة مع عميل</button>`;
}

function clientShareButton(item) {
  if (!PRIVATE) return '';
  return `<button type="button" class="ob-choice ob-choice--share" data-private-share="${escapeHtml(item.id)}">مشاركة الإعلان</button>`;
}

function homeBadge(item) {
  return ADMIN && item.showOnHomepage ? '<span class="ob-badge">على الرئيسية</span>' : '';
}

function showNote(text) {
  const note = document.getElementById('ob-note');
  if (!note) return;
  note.hidden = !text;
  note.textContent = text || '';
}

function streetLabel(item) {
  return [item.streetWidth && `${item.streetWidth}`, item.direction].filter(Boolean).join(' ') || item.street || '—';
}

function adNumberKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
    .replace(/[\s-]/g, '');
}

function visibleItems() {
  const q = adNumberKey(document.getElementById('ob-search')?.value);
  const rows = items.filter((item) => {
    if (type !== 'all' && item.typeKey !== type) return false;
    if (q && !adNumberKey(item.internalRef).includes(q)) return false;
    const price = Number(item.price) || 0;
    if (priceBand === 'under1500' && !(price > 0 && price < 1500000)) return false;
    if (priceBand === '1500to2000' && !(price >= 1500000 && price <= 2000000)) return false;
    if (priceBand === 'over2000' && !(price > 2000000)) return false;
    const area = Number(item.area) || 0;
    if (areaBand === 'under350' && !(area > 0 && area < 350)) return false;
    if (areaBand === '350to450' && !(area >= 350 && area <= 450)) return false;
    if (areaBand === 'over450' && !(area > 450)) return false;
    return true;
  });
  const sorted = rows.slice();
  if (sortKey === 'priceAsc') sorted.sort((a, b) => (Number(a.price) || Number.MAX_SAFE_INTEGER) - (Number(b.price) || Number.MAX_SAFE_INTEGER));
  if (sortKey === 'priceDesc') sorted.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  if (sortKey === 'areaDesc') sorted.sort((a, b) => (Number(b.area) || 0) - (Number(a.area) || 0));
  return sorted;
}

function drawList() {
  const rows = visibleItems();
  const count = document.getElementById('ob-count');
  const hero = document.getElementById('ob-count-hero');
  if (count) count.textContent = String(rows.length);
  if (hero) hero.textContent = String(rows.length);
  const list = document.getElementById('ob-list');
  if (!list) return;
  list.innerHTML = rows.map((item) => `
    <article class="ob-card${item.id === activeId ? ' is-active' : ''}">
      <div class="ob-media">
        ${photo(item)}
        <span class="ob-badge-type" data-kind="${markerKind(item)}">${escapeHtml(item.propertyType || typeStyle(item.typeKey).label)}</span>
        ${homeBadge(item)}
        <div class="ob-media__place">⌖ ${escapeHtml(item.district || item.city || 'الرياض')}</div>
      </div>
      <div class="ob-card__body">
        <div class="ob-title-row">
          <div class="ob-title">${escapeHtml(item.title || item.propertyType || 'عقار للبيع')}</div>
          <div class="ob-ref" dir="ltr">${escapeHtml(item.internalRef || '')}</div>
        </div>
        <div class="ob-price">${money(item.price)}${item.price ? '<small>للبيع</small>' : ''}</div>
        <div class="ob-specs">
          <div class="ob-spec"><span>المساحة</span><strong>${item.area ? `${escapeHtml(item.area)} م²` : '—'}</strong></div>
          <div class="ob-spec"><span>الحي</span><strong>${escapeHtml(item.district || item.city || '—')}</strong></div>
          <div class="ob-spec"><span>الاتجاه</span><strong>${escapeHtml(item.direction || '—')}</strong></div>
          <div class="ob-spec"><span>عرض الشارع</span><strong>${escapeHtml(item.streetWidth || item.street || '—')}</strong></div>
          <div class="ob-spec"><span>المخطط</span><strong>${escapeHtml(item.planNumber || '—')}</strong></div>
          <div class="ob-spec"><span>القطعة</span><strong>${escapeHtml(item.plotNumber || '—')}</strong></div>
        </div>
        <div class="ob-card__actions">
          <button type="button" class="ob-details" data-open="${escapeHtml(item.id)}">عرض التفاصيل</button>
          <button type="button" data-focus="${escapeHtml(item.id)}">⌖ على الخريطة</button>
          ${adminChoiceButtons(item)}
          ${clientShareButton(item)}
          ${ADMIN ? '' : `<a class="btn btn-gold btn-sm" href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>`}
        </div>
      </div>
    </article>`).join('') || '<p class="ob-empty">لا توجد عروض مطابقة. جرّب تغيير الفلاتر أو البحث بكلمة أخرى.</p>';
  list.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openDetail(btn.dataset.open)));
}

function legendMarkup() {
  return Object.entries(PROPERTY_TYPE_STYLES).map(([key, style]) =>
    `<span class="ob-legend__item"><i class="ob-legend__swatch property-marker--${key}"></i>${style.label}</span>`).join('');
}

function popupHtml(item) {
  const style = typeStyle(item.typeKey);
  const kind = markerKind(item);
  const image = item.coverImage
    ? `<button type="button" class="ob-popup__shot" data-photos="${escapeHtml(item.id)}"><img src="${escapeHtml(item.coverImage)}" alt=""><span class="ob-popup__shot-note">عرض الصور</span></button>`
    : `<div class="ob-ph ob-ph--${kind}">${escapeHtml(item.propertyType || style.label)}</div>`;
  const rows = [
    ['النوع', item.propertyType || style.label],
    ['الحي', item.district || item.city || '—'],
    item.area ? ['المساحة', `${item.area} م²`] : null,
    item.price != null && item.price !== '' ? ['السعر', money(item.price)] : null,
    item.planNumber ? ['المخطط', item.planNumber] : null,
    item.plotNumber ? ['القطعة', item.plotNumber] : null,
  ].filter(Boolean);
  const lines = rows.map(([label, value]) =>
    `<p class="ob-popup__line"><span>${label}</span><strong>${escapeHtml(value)}</strong></p>`).join('');
  const heef = ADMIN ? '' : `<a class="ob-popup__btn ob-popup__btn--light" href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>`;
  return `<div class="ob-popup ob-popup--card">
    <div class="ob-popup__media">${image}<span class="ob-badge-type" data-kind="${kind}">${escapeHtml(item.propertyType || style.label)}</span></div>
    <div class="ob-popup__body">
      <div class="ob-popup__title">${escapeHtml(item.title || item.district || style.label)}</div>
      ${item.internalRef ? `<div class="ob-popup__ref" dir="ltr">${escapeHtml(item.internalRef)}</div>` : ''}
      ${homeBadge(item)}
      <div class="ob-popup__facts">${lines}</div>
    </div>
    <div class="ob-actions ob-popup__actions">${adminChoiceButtons(item)}${clientShareButton(item)}<button type="button" class="ob-popup__btn ob-popup__btn--dark" data-open="${escapeHtml(item.id)}">عرض التفاصيل</button>${heef}</div>
  </div>`;
}

function markerIcon(item) {
  const active = item.id === activeId ? ' is-active' : '';
  return L.divIcon({
    className: 'ob-pin',
    html: `<span class="property-marker property-marker--${markerKind(item)}${active}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -8],
  });
}

function markerSignature(item) {
  return [item.latitude, item.longitude, item.typeKey, item.price, item.area, item.coverImage, item.planNumber, item.plotNumber, item.district, item.city, item.propertyType, item.showOnHomepage].join('|');
}

function lockScroll() {
  if (scrollLocked) return;
  scrollLocked = true;
  scrollLockY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollLockY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}

function unlockScroll() {
  if (!scrollLocked) return;
  const y = scrollLockY;
  scrollLocked = false;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, y);
}

function stopViewObserver() {
  if (!viewObserver) return;
  viewObserver.disconnect();
  viewObserver = null;
}

function holdMapView(view) {
  if (!map || !view) return;
  stopViewObserver();
  const token = ++viewHold;
  const apply = () => {
    if (token !== viewHold || !map) return;
    map.invalidateSize({ pan: false });
    map.setView(view.center, view.zoom, { animate: false });
  };
  const node = document.getElementById('ob-map');
  if (node && window.ResizeObserver) {
    viewObserver = new ResizeObserver(() => apply());
    viewObserver.observe(node);
  }
  apply();
  setTimeout(() => {
    if (token !== viewHold) return;
    apply();
    stopViewObserver();
  }, 320);
}

function openMapShell() {
  ensureMap();
  if (!map || !document.getElementById('mapPanel')) return false;
  if (!document.body.classList.contains('ob-map-fs')) {
    document.documentElement.classList.add('ob-map-fs');
    document.body.classList.add('ob-map-fs');
    lockScroll();
  }
  return true;
}

function enterMapFullscreen() {
  ensureMap();
  if (!map) return;
  const view = { center: map.getCenter(), zoom: map.getZoom() };
  if (!openMapShell()) return;
  holdMapView(view);
}

function exitMapFullscreen() {
  if (!document.body.classList.contains('ob-map-fs')) return;
  const view = map ? { center: map.getCenter(), zoom: map.getZoom() } : null;
  document.documentElement.classList.remove('ob-map-fs');
  document.body.classList.remove('ob-map-fs');
  unlockScroll();
  holdMapView(view);
}

function paintActiveCard(id) {
  document.querySelectorAll('.ob-card.is-active').forEach((card) => card.classList.remove('is-active'));
  if (!id || !window.CSS || !CSS.escape) return;
  document.querySelector(`[data-focus="${CSS.escape(id)}"]`)?.closest('.ob-card')?.classList.add('is-active');
}

function refreshActiveIcons() {
  markers.forEach((marker, markerId) => {
    const want = markerId === activeId;
    const dot = marker.getElement()?.querySelector('.property-marker');
    if (dot) dot.classList.toggle('is-active', want);
    else if (marker._obActive !== want) {
      const item = items.find((row) => row.id === markerId);
      if (item && !(marker.isPopupOpen && marker.isPopupOpen())) marker.setIcon(markerIcon(item));
    }
    marker._obActive = want;
    if (marker.setZIndexOffset) marker.setZIndexOffset(want ? 1400 : 0);
  });
  paintActiveCard(activeId);
}

function onMapClick(event) {
  const target = event.originalEvent && event.originalEvent.target;
  if (target && target.closest && target.closest('.leaflet-control, .leaflet-popup, a, button')) return;
  if (!document.body.classList.contains('ob-map-fs')) enterMapFullscreen();
}

function onPopupOpen(event) {
  const root = event.popup.getElement();
  if (!root) return;
  const id = root.querySelector('[data-open]')?.dataset.open || '';
  if (id) {
    activeId = id;
    refreshActiveIcons();
  }
  if (root.dataset.obBound) return;
  root.dataset.obBound = '1';
  root.addEventListener('click', (clickEvent) => {
    const share = clickEvent.target.closest('[data-private-share]');
    if (share) {
      sharePrivateListing(share);
      return;
    }
    if (clickEvent.target.closest('[data-photos]')) return;
    const button = clickEvent.target.closest('[data-open]');
    if (!button) return;
    openDetail(button.dataset.open);
  });
}

function ensureMap() {
  if (map || !document.getElementById('ob-map') || !window.L) return;
  map = L.map('ob-map', { zoomControl: false }).setView(MAHDIA, 13);
  L.control.zoom({ position: 'topleft' }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  }).addTo(map);
  cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 28,
    disableClusteringAtZoom: 15,
    iconCreateFunction(group) {
      const children = group.getAllChildMarkers();
      const kinds = new Set(children.map((marker) => marker._obKind).filter(Boolean));
      const kind = kinds.size === 1 ? [...kinds][0] : 'mixed';
      return L.divIcon({
        className: 'ob-cluster',
        html: `<span class="ob-cluster__dot ob-cluster__dot--${kind}">${children.length}</span>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
    },
  });
  map.addLayer(cluster);
  map.on('click', onMapClick);
  map.on('popupopen', onPopupOpen);
  setTimeout(() => map && map.invalidateSize(), 0);
}

function createMarker(item) {
  const marker = L.marker([item.latitude, item.longitude], { icon: markerIcon(item) });
  marker._obKind = markerKind(item);
  marker._obActive = item.id === activeId;
  marker._obSig = markerSignature(item);
  marker.bindPopup(popupHtml(item), {
    className: 'ob-leaflet-popup',
    maxWidth: 289,
    minWidth: 228,
    autoPan: true,
    autoPanPaddingTopLeft: [58, 72],
    autoPanPaddingBottomRight: [20, 78],
  });
  markers.set(item.id, marker);
  return marker;
}

function drawMap() {
  ensureMap();
  if (!map || !cluster) return;
  const rows = visibleItems().filter((item) => item.latitude != null && item.longitude != null);
  const visible = new Set(rows.map((item) => item.id));
  if (activeId && !visible.has(activeId)) {
    activeId = null;
    map.closePopup();
  }
  const fresh = [];
  rows.forEach((item) => {
    const existing = markers.get(item.id);
    const signature = markerSignature(item);
    if (!existing) {
      fresh.push(createMarker(item));
      return;
    }
    if (existing._obSig !== signature) {
      existing.setLatLng([item.latitude, item.longitude]);
      existing.setPopupContent(popupHtml(item));
      existing._obKind = markerKind(item);
      existing.setIcon(markerIcon(item));
      existing._obSig = signature;
      existing._obActive = item.id === activeId;
    }
  });
  if (fresh.length) {
    if (cluster.addLayers) cluster.addLayers(fresh);
    else fresh.forEach((marker) => cluster.addLayer(marker));
  }
  const stale = [];
  Array.from(markers.keys()).forEach((id) => {
    if (visible.has(id)) return;
    stale.push(markers.get(id));
    markers.delete(id);
  });
  if (stale.length) {
    if (cluster.removeLayers) cluster.removeLayers(stale);
    else stale.forEach((marker) => cluster.removeLayer(marker));
  }
  refreshActiveIcons();
}

function revealMarker(item) {
  const marker = markers.get(item.id);
  if (!map || !marker) return;
  viewHold += 1;
  stopViewObserver();
  const latlng = L.latLng(item.latitude, item.longitude);
  map.invalidateSize({ pan: false });
  map.setView(latlng, Math.max(map.getZoom(), 16), { animate: false });
  const open = () => {
    refreshActiveIcons();
    if (!marker.isPopupOpen()) marker.openPopup();
  };
  window.setTimeout(() => {
    if (marker.getElement()) {
      open();
      return;
    }
    if (cluster && typeof cluster.zoomToShowLayer === 'function') cluster.zoomToShowLayer(marker, open);
    else open();
  }, 40);
}

function focusProperty(id) {
  const item = items.find((row) => row.id === id);
  if (!item || item.latitude == null || item.longitude == null) {
    showNote('لا توجد إحداثيات لهذا العقار على الخريطة');
    return;
  }
  showNote('');
  activeId = id;
  setPageView('map');
  drawMap();
  if (!openMapShell()) return;
  viewHold += 1;
  stopViewObserver();
  requestAnimationFrame(() => {
    if (!map) return;
    map.invalidateSize({ pan: false });
    window.setTimeout(() => revealMarker(item), 60);
  });
}

function privateAuthHeaders(extra) {
  const token = typeof window.ALHEEF_PRIVATE_TOKEN === 'function' ? window.ALHEEF_PRIVATE_TOKEN() : '';
  return { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(extra || {}) };
}

async function sharePrivateListing(button) {
  if (!PRIVATE || !button || button.dataset.busy === '1') return;
  const id = button.dataset.privateShare;
  button.dataset.busy = '1';
  const original = button.textContent;
  button.textContent = 'جارٍ الإرسال…';
  try {
    const res = await fetch(`/api/private-offers/board/${encodeURIComponent(id)}/share`, {
      method: 'POST',
      headers: privateAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      if (typeof window.ALHEEF_PRIVATE_AUTH_FAIL === 'function') window.ALHEEF_PRIVATE_AUTH_FAIL();
      return;
    }
    button.textContent = data.success ? 'تم الإرسال إلى واتسابك' : (data.message || 'تعذر الإرسال');
  } catch {
    button.textContent = 'تعذر الإرسال';
  }
  window.setTimeout(() => {
    button.dataset.busy = '';
    button.textContent = original;
  }, 4000);
}

async function boardRequest(path, options) {
  if (ADMIN) return DashboardAPI.request(`/offer-board${path}`, options);
  const res = await fetch(`${PRIVATE ? '/api/private-offers/board' : '/api/offer-board'}${path}`, {
    ...options,
    headers: PRIVATE ? privateAuthHeaders(options && options.headers) : { Accept: 'application/json', ...(options && options.headers) },
  });
  const data = await res.json().catch(() => ({}));
  if (PRIVATE && (res.status === 401 || res.status === 403)) {
    if (typeof window.ALHEEF_PRIVATE_AUTH_FAIL === 'function') window.ALHEEF_PRIVATE_AUTH_FAIL();
    const error = new Error(data.message || 'انتهت الجلسة');
    error.code = 'auth';
    throw error;
  }
  if (!res.ok) throw new Error(data.message || 'تعذر التحميل');
  return data;
}

function heefMessage(item) {
  const lines = ['مرحبًا، أود الاستفسار عن هذا الإعلان:', ''];
  const add = (label, value) => {
    const text = String(value ?? '').trim();
    if (text && text !== '—') lines.push(`${label}: ${text}`);
  };
  add('رقم الإعلان', item.internalRef);
  add('النوع', item.propertyType || item.title);
  add('الحي', item.district || item.city);
  if (item.area) add('المساحة', `${item.area} م²`);
  if (item.price != null && item.price !== '') add('السعر', money(item.price));
  add('المخطط', item.planNumber);
  add('القطعة', item.plotNumber);
  add('الاتجاه', item.direction);
  const maps = String(item.mapsUrl || '').trim();
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  if (/^https?:\/\//i.test(maps)) add('الموقع', maps);
  else if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    add('الموقع', `https://www.google.com/maps?q=${lat},${lng}`);
  }
  return lines.join('\n');
}

function heefLink(item) {
  return `https://wa.me/${heefWhatsapp}?text=${encodeURIComponent(heefMessage(item))}`;
}

let homeBusy = false;

async function toggleHomepage(id, on) {
  if (homeBusy) return;
  homeBusy = true;
  try {
    await DashboardAPI.request(`/offer-board/${id}/action`, {
      method: 'POST',
      headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: on ? 'homepage_off' : 'homepage_on' }),
    });
    showNote(on ? 'أُزيل الإعلان من الصفحة الرئيسية' : 'ظهر الإعلان في الصفحة الرئيسية');
    document.querySelectorAll('#ob-modal [data-home]').forEach((btn) => {
      if (btn.dataset.home !== id) return;
      const nextOn = !on;
      btn.dataset.homeOn = nextOn ? '1' : '0';
      btn.textContent = nextOn ? 'إزالة من الرئيسية' : 'إرسال إلى الرئيسية';
    });
    page = 1;
    await loadItems();
  } catch (error) {
    showNote(error.message || 'تعذر تحديث الصفحة الرئيسية');
  } finally {
    homeBusy = false;
  }
}

async function openClientShare(propertyId) {
  const item = items.find((row) => row.id === propertyId);
  let clients = [];
  try {
    clients = document.getElementById('ob-invites')?._clients || await DashboardAPI.getPrivateClients();
  } catch {
    clients = [];
  }
  const active = clients.filter((client) => client.active !== false);
  const old = document.getElementById('ob-share-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.id = 'ob-share-modal';
  modal.className = 'ob-modal';
  const options = active.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.clientLabel || 'عميل')} — ${escapeHtml(maskInvitePhone(client.phone))}</option>`).join('');
  modal.innerHTML = `
    <div class="ob-sheet" role="dialog" aria-modal="true">
      <button type="button" id="ob-share-close">إغلاق</button>
      <h2>مشاركة الإعلان مع عميل</h2>
      <p class="ob-meta">${escapeHtml(item?.internalRef || item?.title || item?.district || 'الإعلان')}</p>
      ${active.length ? `<label class="ob-meta" for="ob-client">العميل</label>
        <select id="ob-client">${options}</select>
        <p class="ob-note">تُرسل صور العقار ومعلوماته مع جوال المنصة فقط، دون رابط الإعلان ودون رقم المعلن.</p>
        <button type="button" class="ob-choice ob-choice--share" id="ob-send-client">إرسال إلى واتساب العميل</button>
        <p class="ob-note" id="ob-share-result" hidden></p>` : '<p>لا يوجد عميل نشط. أضف العميل أولًا من «مشاركة العروض الخاصة».</p>'}
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#ob-share-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
  modal.querySelector('#ob-send-client')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const result = modal.querySelector('#ob-share-result');
    try {
      const data = await DashboardAPI.request(`/offer-board/${propertyId}/share`, {
        method: 'POST',
        headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ clientId: modal.querySelector('#ob-client').value }),
      });
      result.hidden = false;
      result.textContent = data.message || 'تم إرسال الإعلان إلى واتساب العميل';
      setupLeads();
    } catch (error) {
      result.hidden = false;
      result.textContent = error.message || 'تعذر الإرسال';
      button.disabled = false;
    }
  });
}

function closePhotoViewer() {
  document.getElementById('ob-photos')?.remove();
  photoState = { images: [], index: 0 };
}

function stepPhoto(delta) {
  if (!photoState.images.length) return;
  const count = photoState.images.length;
  photoState.index = (photoState.index + delta + count) % count;
  renderPhotoViewer();
}

function renderPhotoViewer() {
  const shell = document.getElementById('ob-photos');
  if (!shell) return;
  const { images, index } = photoState;
  const many = images.length > 1;
  shell.innerHTML = `
    <div class="ob-photos__bar">
      <button type="button" class="ob-photos__close" data-photo-close>إغلاق</button>
      <span>${index + 1} من ${images.length}</span>
    </div>
    <img class="ob-photos__img" src="${escapeHtml(images[index])}" alt="">
    ${many ? `<div class="ob-photos__nav">
      <button type="button" data-photo-step="-1">السابق</button>
      <button type="button" data-photo-step="1">التالي</button>
    </div>` : ''}
  `;
}

function openPhotoViewer(images, startIndex) {
  const list = (images || []).map((url) => String(url || '').trim()).filter(Boolean);
  if (!list.length) return;
  photoState = { images: list, index: Math.max(0, Math.min(startIndex || 0, list.length - 1)) };
  let shell = document.getElementById('ob-photos');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'ob-photos';
    shell.className = 'ob-photos';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', 'صور الإعلان');
    document.body.appendChild(shell);
    let startX = 0;
    shell.addEventListener('click', (event) => {
      if (event.target.closest('[data-photo-close]') || event.target === shell) {
        closePhotoViewer();
        return;
      }
      const step = event.target.closest('[data-photo-step]');
      if (step) stepPhoto(Number(step.dataset.photoStep) || 0);
    });
    shell.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      startX = event.clientX;
    });
    shell.addEventListener('pointerup', (event) => {
      if (!startX || event.target.closest('button')) return;
      const delta = event.clientX - startX;
      startX = 0;
      if (Math.abs(delta) < 40) return;
      stepPhoto(delta < 0 ? 1 : -1);
    });
  }
  renderPhotoViewer();
}

async function openListingPhotos(id) {
  let data;
  try {
    data = await boardRequest(`/${encodeURIComponent(id)}`);
  } catch (error) {
    showNote(error.message || 'تعذر فتح الصور');
    return;
  }
  const item = data.item;
  const images = (item && item.gallery && item.gallery.length) ? item.gallery : (item && item.coverImage ? [item.coverImage] : []);
  if (!images.length) {
    showNote('لا توجد صور لهذا الإعلان');
    return;
  }
  openPhotoViewer(images, 0);
}

async function openDetail(id) {
  if (map) map.closePopup();
  let data;
  try {
    data = await boardRequest(`/${id}`);
  } catch (error) {
    showNote(error.message || 'هذا العقار غير ظاهر في العروض الخاصة');
    return;
  }
  const item = data.item;
  if (!item) {
    showNote('هذا العقار غير ظاهر في العروض الخاصة');
    return;
  }
  const old = document.getElementById('ob-modal');
  if (old) old.remove();
  const galleryImages = (item.gallery && item.gallery.length) ? item.gallery : (item.coverImage ? [item.coverImage] : []);
  const gallery = galleryImages.map((url, index) => `<button type="button" class="ob-gallery__shot" data-gallery-index="${index}"><img src="${escapeHtml(url)}" alt=""></button>`).join('');
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
      ${ADMIN ? `<div class="ob-card__actions">${adminChoiceButtons(item)}</div>` : `<a class="btn btn-gold" href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>`}
      ${ADMIN ? `<div class="ob-admin">
        <p>رقم المعلن: ${escapeHtml(item.advertiserPhone || '—')}</p>
        ${item.advertiserPhone ? `<a href="tel:${escapeHtml(item.advertiserPhone)}">اتصال</a> <a href="https://wa.me/${escapeHtml(item.advertiserPhone.replace(/^0/, '966'))}" target="_blank" rel="noopener">واتساب المعلن</a>` : ''}
        <p class="ob-meta">المصدر: ${escapeHtml(item.sourceName || '—')} ${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">فتح المصدر</a>` : ''}</p>
        <div class="ob-actions" id="ob-admin-actions"></div>
        <pre class="ob-meta">${escapeHtml((item.statusLog || []).map((entry) => `${entry.at || ''} ${entry.action || ''}`).join('\n'))}</pre>
      </div>` : ''}
    </div>`;
  document.body.appendChild(modal);
  const actions = [
    ['publish', 'اعتماد ونشر'], ['reject', 'رفض'], ['hide', 'إخفاء'], ['sold', 'مباع'],
    ['withdrawn', 'مسحوب'], ['reactivate', 'إعادة تفعيل'], ['map_on', 'إظهار في الخريطة'],
    ['map_off', 'إخفاء من الخريطة'], ['offers_on', 'إظهار في العروض'], ['offers_off', 'إخفاء من العروض'],
    ['homepage_on', 'إضافة للرئيسية'], ['homepage_off', 'إزالة من الرئيسية'],
  ];
  if (ADMIN) {
  document.getElementById('ob-admin-actions').innerHTML = actions.map(([action, label]) =>
    `<button type="button" data-action="${action}">${label}</button>`).join('')
    + `<a class="btn btn-outline btn-sm" href="/dashboard/add-property.html?id=${encodeURIComponent(item.id)}">تعديل</a>`;
  }
  modal.querySelectorAll('[data-gallery-index]').forEach((button) => {
    button.addEventListener('click', () => openPhotoViewer(galleryImages, Number(button.dataset.galleryIndex) || 0));
  });
  modal.querySelector('#ob-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
  if (ADMIN) modal.querySelectorAll('[data-action]').forEach((btn) => {
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

const INVITE_LABELS = { unused: 'لم يستخدم', active: 'نشط', expired: 'منتهي', cancelled: 'ملغي' };

function inviteLabel(client) {
  return INVITE_LABELS[client.inviteStatus] || (client.active ? 'نشط' : 'ملغي');
}

function maskInvitePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  let local = digits.startsWith('966') ? `0${digits.slice(3)}` : digits;
  if (/^5\d{8}$/.test(local)) local = `0${local}`;
  if (!/^05\d{8}$/.test(local)) return '05••• ••';
  return `${local.slice(0, 2)}••• ••${local.slice(-2)}`;
}

function shareMessage(client) {
  const name = client.clientLabel && client.clientLabel !== 'عميل' ? client.clientLabel : 'عميلنا';
  return `مرحبًا ${name}،\n\nهذا رابط دخولك إلى العروض العقارية الخاصة لدى مؤسسة الهيف:\n\n${client.shareUrl}\n\nعند فتح الرابط يصل رمز التحقق إلى واتسابك. بعد إدخال الرمز يبقى دخولك على هذا الجهاز لمدة 30 يومًا.\n\nمؤسسة الهيف للخدمات العقارية`;
}

function whatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  let number = digits.startsWith('00') ? digits.slice(2) : digits;
  if (number.startsWith('0')) number = `966${number.slice(1)}`;
  else if (/^5\d{8}$/.test(number)) number = `966${number}`;
  return /^9665\d{8}$/.test(number) ? number : '';
}

async function setupInvites() {
  const host = document.getElementById('ob-invites');
  if (!host) return;
  host.innerHTML = '<p class="ob-meta">جاري تحميل الدعوات…</p>';
  try {
    const clients = await DashboardAPI.getPrivateClients();
    if (!clients.length) {
      host.innerHTML = '<p class="ob-meta">لا توجد دعوات بعد.</p>';
      return;
    }
    host.innerHTML = `<div class="ob-invites">${clients.map((client) => `
      <article class="ob-invite">
        <div>
          <strong>${escapeHtml(client.clientLabel || 'عميل')}</strong>
          <span dir="ltr">${escapeHtml(maskInvitePhone(client.phone))}</span>
          <span class="ob-invite__status">${escapeHtml(inviteLabel(client))}</span>
        </div>
        <p>أُنشئت: ${escapeHtml(formatInviteDate(client.createdAt))} — الدخول: ${client.loginCount ? 'نعم' : 'لا'} — آخر دخول: ${escapeHtml(formatInviteDate(client.lastVisitAt))}</p>
        <div class="ob-actions">
          <button type="button" data-invite-copy="${escapeHtml(client.id)}">نسخ الرابط</button>
          <button type="button" data-invite-wa="${escapeHtml(client.id)}">إعادة إرسال الرابط</button>
          <button type="button" data-invite-stop="${escapeHtml(client.id)}">${client.active ? 'إلغاء الصلاحية' : 'تفعيل الدعوة'}</button>
        </div>
      </article>`).join('')}</div>`;
    host._clients = clients;
    host.querySelectorAll('[data-invite-copy]').forEach((btn) => btn.addEventListener('click', () => copyInvite(btn.dataset.inviteCopy)));
    host.querySelectorAll('[data-invite-wa]').forEach((btn) => btn.addEventListener('click', () => sendInvite(btn.dataset.inviteWa)));
    host.querySelectorAll('[data-invite-stop]').forEach((btn) => btn.addEventListener('click', () => stopInvite(btn.dataset.inviteStop)));
  } catch {
    host.innerHTML = '<p class="ob-meta">تعذر تحميل الدعوات.</p>';
  }
}

async function setupLeads() {
  const host = document.getElementById('ob-leads');
  if (!host) return;
  host.innerHTML = '<h2>متابعة العملاء والعروض</h2><p class="ob-meta">جاري التحميل…</p>';
  try {
    const data = await DashboardAPI.request('/private-offer-leads');
    const items = data.items || [];
    if (!items.length) {
      host.innerHTML = '<h2>متابعة العملاء والعروض</h2><p class="ob-meta">لا توجد مشاركات بعد.</p>';
      return;
    }
    host.innerHTML = `<h2>متابعة العملاء والعروض</h2><div class="ob-invites">${items.map((item) => `
      <article class="ob-invite">
        <div>
          <strong>${escapeHtml(item.clientName || 'عميل')}</strong>
          <span dir="ltr">${escapeHtml(item.phone || '')}</span>
          <span class="ob-invite__status">${escapeHtml(item.statusLabel || '')}</span>
        </div>
        <p>العقار: ${escapeHtml(item.internalRef || item.propertyTitle || '—')} — المشاركة: ${escapeHtml(formatInviteDate(item.sharedAt))}</p>
        <p>آخر رد: ${escapeHtml(item.lastReply || '—')} — آخر تواصل: ${escapeHtml(formatInviteDate(item.lastContactAt))} — الإشعارات: ${item.followupPaused ? 'متوقفة' : 'مفعّلة'}</p>
        <div class="ob-actions">
          ${item.status === 'negotiating' ? '' : `<button type="button" data-lead-talk="${escapeHtml(item.id)}">تحت التفاوض</button>`}
          <button type="button" data-lead-pause="${escapeHtml(item.clientId)}" data-paused="${item.followupPaused ? '1' : '0'}">${item.followupPaused ? 'إعادة تفعيل المتابعة' : 'إيقاف الإشعارات'}</button>
        </div>
      </article>`).join('')}</div>`;
    host.querySelectorAll('[data-lead-talk]').forEach((btn) => btn.addEventListener('click', () => markNegotiating(btn.dataset.leadTalk)));
    host.querySelectorAll('[data-lead-pause]').forEach((btn) => btn.addEventListener('click', () => toggleFollowup(btn.dataset.leadPause, btn.dataset.paused !== '1')));
  } catch {
    host.innerHTML = '<h2>متابعة العملاء والعروض</h2><p class="ob-meta">تعذر تحميل المتابعة.</p>';
  }
}

async function markNegotiating(id) {
  await DashboardAPI.request(`/private-offer-leads/${id}/negotiating`, { method: 'PUT' });
  await setupLeads();
}

async function toggleFollowup(clientId, paused) {
  await DashboardAPI.request(`/private-offer-leads/clients/${clientId}/followup`, {
    method: 'PUT',
    headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ paused }),
  });
  await setupLeads();
}

function formatInviteDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' }); } catch { return '—'; }
}

function inviteById(id) {
  return (document.getElementById('ob-invites')?._clients || []).find((client) => client.id === id);
}

async function copyInvite(id) {
  const client = inviteById(id);
  if (!client?.shareUrl) return;
  await navigator.clipboard.writeText(client.shareUrl);
}

function sendInvite(id) {
  const client = inviteById(id);
  const number = whatsAppNumber(client?.phone);
  if (!number || !client?.shareUrl) return;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(shareMessage(client))}`, '_blank', 'noopener');
}

async function stopInvite(id) {
  await DashboardAPI.request(`/private-offers/clients/${id}/active`, {
    method: 'PUT',
    headers: Auth.authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ active: inviteById(id)?.active === false }),
  });
  await setupInvites();
}

function openShareModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box" role="dialog" aria-labelledby="ob-share-title">
      <div class="modal__header">
        <h3 class="modal__title" id="ob-share-title">مشاركة العروض الخاصة</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <p>أدخل رقم جوال العميل. سيُنشأ رابط خاص مرتبط بهذا الرقم.</p>
      <form id="ob-share-form">
        <div class="form-group">
          <label for="ob-share-name">اسم العميل، اختياري</label>
          <input id="ob-share-name" name="clientLabel" autocomplete="name">
        </div>
        <div class="form-group">
          <label for="ob-share-phone">رقم الجوال</label>
          <input id="ob-share-phone" name="phone" dir="ltr" inputmode="tel" placeholder="05xxxxxxxx" required>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-outline" data-close>إلغاء</button>
          <button type="submit" class="btn btn-gold">إنشاء الرابط</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));
  wrap.querySelector('#ob-share-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = String(new FormData(event.target).get('phone') || '').trim();
    const clientLabel = String(new FormData(event.target).get('clientLabel') || '').trim();
    if (!/^05\d{8}$/.test(phone)) return;
    const submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const result = await DashboardAPI.createPrivateClient({ clientLabel, phone });
      close();
      showShareResult(result.client);
      setupInvites();
    } catch (err) {
      submit.disabled = false;
      submit.insertAdjacentHTML('afterend', `<p>${escapeHtml(err.message || 'تعذر إنشاء الرابط')}</p>`);
    }
  });
}

function showShareResult(client) {
  const wrap = document.createElement('div');
  wrap.className = 'modal active';
  wrap.innerHTML = `
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box" role="dialog">
      <div class="modal__header">
        <h3 class="modal__title">رابط العميل جاهز</h3>
        <button type="button" class="modal__close" data-close aria-label="إغلاق">×</button>
      </div>
      <p>الرابط مرتبط بالرقم ${escapeHtml(maskInvitePhone(client.phone))}. رمز التحقق يصل إلى هذا الرقم فقط.</p>
      <input readonly dir="ltr" value="${escapeHtml(client.shareUrl || '')}" id="ob-share-url">
      <div class="form-actions">
        <button type="button" class="btn btn-gold" id="ob-copy-ready">نسخ الرابط</button>
        <button type="button" class="btn btn-outline" id="ob-wa-ready">إرساله عبر واتساب</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => wrap.remove()));
  wrap.querySelector('#ob-copy-ready').addEventListener('click', async () => {
    await navigator.clipboard.writeText(client.shareUrl || '');
  });
  wrap.querySelector('#ob-wa-ready').addEventListener('click', () => {
    const number = whatsAppNumber(client.phone);
    if (!number) return;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(shareMessage(client))}`, '_blank', 'noopener');
  });
}
