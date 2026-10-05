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
const ADMIN = window.ALHEEF_BOARD_MODE === 'admin';

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
  if (ADMIN) {
    await initLayout('private-offers', 'العروض الخاصة');
    setTopbarActions('<a class="btn btn-outline btn-sm" href="/dashboard/private-offers-legacy.html">عملاء العروض</a>');
  }
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
        ${ADMIN ? '<button type="button" data-archive="0">النشطة</button><button type="button" data-archive="1">الأرشيف</button><button type="button" id="ob-share">مشاركة العروض الخاصة</button>' : ''}
      </div>
      ${ADMIN ? '<div id="ob-invites"></div><section id="ob-leads" class="ob-leads"></section>' : ''}
      <div class="ob-filters" id="ob-filters"></div>
      <div class="ob-layout" id="ob-layout">
        <div id="ob-map" class="ob-map"></div>
        <div>
          <div id="ob-list" class="ob-list"></div>
          <button type="button" id="ob-more" hidden>مزيد</button>
        </div>
      </div>
      <p class="ob-meta" id="ob-count"></p>
      <p class="ob-note" id="ob-note" hidden></p>
    </section>`;
  document.getElementById('ob-filters').innerHTML = TYPES.map((item) =>
    `<button type="button" data-type="${item.key}">${item.label}</button>`).join('');
  syncButtons();
  if (ADMIN) {
    setupInvites();
    setupLeads();
  }
}

function syncButtons() {
  document.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.view === view));
  document.querySelectorAll('[data-archive]').forEach((btn) => btn.classList.toggle('is-on', (btn.dataset.archive === '1') === archive));
  document.querySelectorAll('[data-type]').forEach((btn) => btn.classList.toggle('is-on', btn.dataset.type === type));
  const layout = document.getElementById('ob-layout');
  layout.className = `ob-layout ${view === 'map' ? 'ob-layout--map' : 'ob-layout--list'}`;
  document.getElementById('ob-map').hidden = view !== 'map';
  document.getElementById('ob-list').parentElement.hidden = !ADMIN && view === 'map';
  if (view === 'map') setTimeout(() => map && map.invalidateSize(), 60);
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
  const mapFilter = !ADMIN && view === 'map' ? '&map=1' : '';
  const data = await boardRequest(`?view=${view}&type=${type}&archive=${ADMIN && archive ? '1' : '0'}&page=${page}&limit=24${mapFilter}`);
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

function adminChoiceButtons(item) {
  if (!ADMIN || archive) return '';
  const homeLabel = item.showOnHomepage ? 'إزالة من الرئيسية' : 'إرسال إلى الرئيسية';
  return `<button type="button" class="ob-choice ob-choice--home" data-home="${escapeHtml(item.id)}" data-home-on="${item.showOnHomepage ? '1' : '0'}">${homeLabel}</button>
    <button type="button" class="ob-choice ob-choice--share" data-share-client="${escapeHtml(item.id)}">مشاركة مع عميل</button>`;
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

function drawList() {
  document.getElementById('ob-list').innerHTML = items.map((item) => `
    <article class="ob-card">
      ${photo(item)}
      <div class="ob-card__body">
        ${homeBadge(item)}
        ${facts(item)}
        <div class="ob-card__actions">
          ${adminChoiceButtons(item)}
          <button type="button" data-open="${escapeHtml(item.id)}">عرض التفاصيل</button>
          ${ADMIN ? '' : `<a class="btn btn-gold btn-sm" href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>`}
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
    marker.bindPopup(`<div class="ob-popup">${photo(item)}${homeBadge(item)}${facts(item)}<div class="ob-actions">${adminChoiceButtons(item)}<button type="button" data-open="${escapeHtml(item.id)}">عرض التفاصيل</button>${ADMIN ? '' : `<a href="${heefLink(item)}" target="_blank" rel="noopener">تواصل مع الهيف</a>`}</div></div>`, { maxWidth: 280 });
    marker.on('popupopen', (event) => {
      event.popup.getElement().querySelector('[data-open]')?.addEventListener('click', () => openDetail(item.id));
    });
    cluster.addLayer(marker);
  });
  map.invalidateSize();
}

async function boardRequest(path, options) {
  if (ADMIN) return DashboardAPI.request(`/offer-board${path}`, options);
  const res = await fetch(`/api/offer-board${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options && options.headers) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'تعذر التحميل');
  return data;
}

function heefLink(item) {
  const text = `مرحبًا، أود الاستفسار عن ${item.internalRef || item.title || 'إعلان'} في ${item.district || ''}`.trim();
  return `https://wa.me/${heefWhatsapp}?text=${encodeURIComponent(text)}`;
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

async function openDetail(id) {
  if (map) map.closePopup();
  const data = await boardRequest(`/${id}`);
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
