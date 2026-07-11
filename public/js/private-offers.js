(function () {
  const PDF_DISCLAIMER = 'هذا العرض مخصص للاطلاع فقط، ولا يحتوي على بيانات تواصل أو بيانات مالك.';
  const slugMatch = window.location.pathname.match(/^\/(?:v|p)\/([A-Za-z0-9_-]{8,64})\/?$/);
  const slug = slugMatch ? slugMatch[1] : '';
  const TOKEN_KEY = `alheef_private_token_${slug}`;

  const TYPE_TABS = [
    { value: '', label: 'الكل' },
    { value: 'land', label: 'أرض' },
    { value: 'villa', label: 'فلل' },
    { value: 'apartment', label: 'شقق' },
    { value: 'building', label: 'عمائر' },
    { value: 'farm', label: 'مزارع' },
  ];

  const TYPE_FILTERS = {
    land: {
      area: [
        { value: '', label: 'كل المساحات' },
        { value: '0-500', label: 'أقل من 500 م²' },
        { value: '500-1000', label: '500 — 1000 م²' },
        { value: '1000-2000', label: '1000 — 2000 م²' },
        { value: '2000+', label: 'أكثر من 2000 م²' },
      ],
      price: [
        { value: '', label: 'كل الأسعار' },
        { value: '0-500000', label: 'أقل من 500 ألف' },
        { value: '500000-1000000', label: '500 — 1 مليون' },
        { value: '1000000-2000000', label: '1 — 2 مليون' },
        { value: '2000000+', label: 'أكثر من 2 مليون' },
      ],
    },
    villa: {
      area: [
        { value: '', label: 'كل المساحات' },
        { value: '0-300', label: 'أقل من 300 م²' },
        { value: '300-450', label: '300 — 450 م²' },
        { value: '450-600', label: '450 — 600 م²' },
        { value: '600+', label: 'أكثر من 600 م²' },
      ],
      price: [
        { value: '', label: 'كل الأسعار' },
        { value: '0-1500000', label: 'أقل من 1.5 مليون' },
        { value: '1500000-2500000', label: '1.5 — 2.5 مليون' },
        { value: '2500000-4000000', label: '2.5 — 4 مليون' },
        { value: '4000000+', label: 'أكثر من 4 مليون' },
      ],
    },
    apartment: {
      area: [
        { value: '', label: 'كل المساحات' },
        { value: '0-120', label: 'أقل من 120 م²' },
        { value: '120-180', label: '120 — 180 م²' },
        { value: '180-250', label: '180 — 250 م²' },
        { value: '250+', label: 'أكثر من 250 م²' },
      ],
      price: [
        { value: '', label: 'كل الأسعار' },
        { value: '0-600000', label: 'أقل من 600 ألف' },
        { value: '600000-1000000', label: '600 — 1 مليون' },
        { value: '1000000-1500000', label: '1 — 1.5 مليون' },
        { value: '1500000+', label: 'أكثر من 1.5 مليون' },
      ],
    },
    building: {
      area: [
        { value: '', label: 'كل المساحات' },
        { value: '0-500', label: 'أقل من 500 م²' },
        { value: '500-900', label: '500 — 900 م²' },
        { value: '900-1500', label: '900 — 1500 م²' },
        { value: '1500+', label: 'أكثر من 1500 م²' },
      ],
      price: [
        { value: '', label: 'كل الأسعار' },
        { value: '0-3000000', label: 'أقل من 3 مليون' },
        { value: '3000000-6000000', label: '3 — 6 مليون' },
        { value: '6000000-10000000', label: '6 — 10 مليون' },
        { value: '10000000+', label: 'أكثر من 10 مليون' },
      ],
    },
    farm: {
      area: [
        { value: '', label: 'كل المساحات' },
        { value: '0-5000', label: 'أقل من 5000 م²' },
        { value: '5000-20000', label: '5000 — 20000 م²' },
        { value: '20000-50000', label: '20000 — 50000 م²' },
        { value: '50000+', label: 'أكثر من 50000 م²' },
      ],
      price: [
        { value: '', label: 'كل الأسعار' },
        { value: '0-1000000', label: 'أقل من 1 مليون' },
        { value: '1000000-3000000', label: '1 — 3 مليون' },
        { value: '3000000-7000000', label: '3 — 7 مليون' },
        { value: '7000000+', label: 'أكثر من 7 مليون' },
      ],
    },
  };

  const gateView = document.getElementById('gate-view');
  const offersView = document.getElementById('offers-view');
  const gateForm = document.getElementById('gate-form');
  const gateError = document.getElementById('gate-error');
  const offersContainer = document.getElementById('offers-container');
  const accessCodeInput = document.getElementById('access-code');
  const typeTabsEl = document.getElementById('type-tabs');
  const typeFiltersEl = document.getElementById('type-filters');
  const searchInput = document.getElementById('offers-search');
  const resultsCountEl = document.getElementById('results-count');
  const lightboxEl = document.getElementById('photo-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxThumbs = document.getElementById('lightbox-thumbs');

  let allOffers = [];
  let filterState = { type: '', q: '', area: '', price: '' };
  let lightboxState = { images: [], index: 0 };
  let pdfBusy = false;

  if (!slug) {
    document.body.innerHTML = '<p style="text-align:center;padding:3rem;font-family:Cairo,sans-serif">الرابط غير صالح</p>';
    return;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
  }

  function showGate() {
    gateView.hidden = false;
    gateView.classList.remove('is-hidden');
    offersView.hidden = true;
    offersView.classList.add('is-hidden');
    offersView.setAttribute('aria-hidden', 'true');
    document.title = 'عروض خاصة — مكتب الهيف';
  }

  function showOffers() {
    gateView.hidden = true;
    gateView.classList.add('is-hidden');
    offersView.hidden = false;
    offersView.classList.remove('is-hidden');
    offersView.setAttribute('aria-hidden', 'false');
    document.title = 'عروض خاصة لك — مكتب الهيف';
  }

  function readCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('code') || params.get('c') || '').trim();
  }

  function prefillCodeFromUrl() {
    const code = readCodeFromUrl();
    if (code && accessCodeInput) {
      accessCodeInput.value = code;
      accessCodeInput.focus();
    }
    return code;
  }

  showGate();
  prefillCodeFromUrl();

  async function checkSession() {
    const token = getToken();
    if (!token) return false;
    const res = await fetch('/api/private-offers/session', { headers: authHeaders() });
    const data = await res.json();
    return data.authenticated;
  }

  async function verifyCode(code) {
    const res = await fetch('/api/private-offers/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'رمز غير صحيح');
    setToken(data.token);
  }

  function offerImages(o) {
    return (o.gallery && o.gallery.length) ? o.gallery : (o.coverImage ? [o.coverImage] : []);
  }

  function offerDistrict(o) {
    const desc = String(o.shortDescription || '').trim();
    if (desc) {
      const first = desc.split('\n').map((s) => s.trim()).find(Boolean);
      if (first) return first;
    }
    return String(o.street || '').trim();
  }

  function offerExtraDesc(o) {
    const desc = String(o.shortDescription || '').trim();
    if (!desc) return '';
    const lines = desc.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length <= 1) return desc;
    return lines.slice(1).join('\n');
  }

  function parseRange(value) {
    if (!value) return null;
    if (value.endsWith('+')) {
      const min = Number(value.replace('+', ''));
      return { min, max: Infinity };
    }
    const [a, b] = value.split('-').map(Number);
    return { min: a, max: b };
  }

  function inRange(num, rangeValue) {
    if (num == null || num === '') return !rangeValue;
    const range = parseRange(rangeValue);
    if (!range) return true;
    const n = Number(num);
    if (Number.isNaN(n)) return false;
    return n >= range.min && n <= range.max;
  }

  function offerSearchText(o) {
    return [
      o.offerNumber,
      o.propertyTypeLabel,
      o.street,
      o.plotNumber,
      o.planNumber,
      o.location,
      o.shortDescription,
      offerDistrict(o),
      o.priceDisplay,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function filterOffers(offers) {
    let list = offers.slice();
    if (filterState.type) {
      list = list.filter((o) => o.propertyType === filterState.type);
    }
    if (filterState.q) {
      const q = filterState.q.trim().toLowerCase();
      list = list.filter((o) => offerSearchText(o).includes(q));
    }
    if (filterState.area) {
      list = list.filter((o) => inRange(o.area, filterState.area));
    }
    if (filterState.price) {
      list = list.filter((o) => inRange(o.price, filterState.price));
    }
    return list;
  }

  function renderTypeTabs() {
    typeTabsEl.innerHTML = TYPE_TABS.map((t) => `
      <button type="button" class="private-type-tab${filterState.type === t.value ? ' is-active' : ''}"
        data-type="${escapeAttr(t.value)}" role="tab" aria-selected="${filterState.type === t.value}">
        ${escapeHtml(t.label)}
      </button>
    `).join('');
  }

  function renderTypeFilters() {
    const cfg = TYPE_FILTERS[filterState.type];
    if (!cfg) {
      typeFiltersEl.hidden = true;
      typeFiltersEl.innerHTML = '';
      return;
    }
    typeFiltersEl.hidden = false;
    typeFiltersEl.innerHTML = `
      <div class="private-type-filters__row">
        <label>
          <span>المساحة</span>
          <select id="filter-area">
            ${cfg.area.map((o) => `<option value="${escapeAttr(o.value)}"${filterState.area === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>السعر</span>
          <select id="filter-price">
            ${cfg.price.map((o) => `<option value="${escapeAttr(o.value)}"${filterState.price === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
          </select>
        </label>
      </div>
    `;
    typeFiltersEl.querySelector('#filter-area')?.addEventListener('change', (e) => {
      filterState.area = e.target.value;
      renderOffersGrid();
    });
    typeFiltersEl.querySelector('#filter-price')?.addEventListener('change', (e) => {
      filterState.price = e.target.value;
      renderOffersGrid();
    });
  }

  function renderOffersGrid() {
    const filtered = filterOffers(allOffers);
    if (!allOffers.length) {
      offersContainer.innerHTML = '<p class="empty-state">لا توجد عروض متاحة حالياً</p>';
      resultsCountEl.hidden = true;
      return;
    }
    if (!filtered.length) {
      offersContainer.innerHTML = '<p class="empty-state">لا توجد نتائج مطابقة — جرّب تغيير البحث أو الفلاتر</p>';
      resultsCountEl.hidden = false;
      resultsCountEl.textContent = '0 عرض';
      return;
    }
    offersContainer.innerHTML = `<div class="offers-grid">${filtered.map(renderOfferCard).join('')}</div>`;
    resultsCountEl.hidden = false;
    resultsCountEl.textContent = `${filtered.length} عرض`;
    bindCardEvents(filtered);
    preloadOfferImages(filtered);
  }

  function buildPoCardHtml(o, options = {}) {
    const forPdf = options.forPdf === true;
    const imgs = offerImages(o);
    const cover = options.coverSrc || imgs[0] || '';
    const district = offerDistrict(o);
    const extraDesc = offerExtraDesc(o);
    const locationHtml = o.showLocation && o.location ? locationContent(o.location, forPdf) : '';

    const chips = [
      chip(o.propertyTypeLabel, 'type'),
      o.area != null ? chip(`${o.area} م²`) : '',
      o.planNumber ? chip(`مخطط ${escapeHtml(o.planNumber)}`) : '',
      o.plotNumber ? chip(`قطعة ${escapeHtml(o.plotNumber)}`) : '',
      district ? chip(escapeHtml(district), 'district') : '',
    ].filter(Boolean).join('');

    const mediaInner = cover
      ? `<img src="${escapeAttr(cover)}" alt=""${forPdf ? '' : ' loading="lazy"'}>`
      : '<div class="po-card__media-placeholder">بدون صورة</div>';
    const badge = (!forPdf && imgs.length > 1)
      ? `<span class="po-card__photos-badge">${imgs.length} صور</span>`
      : '';

    const mediaHtml = forPdf
      ? `<div class="po-card__media po-card__media--static">${mediaInner}${badge}</div>`
      : `<button type="button" class="po-card__media" data-gallery="${escapeAttr(o.id)}" aria-label="عرض صور العقار">${mediaInner}${badge}</button>`;

    const footerHtml = forPdf
      ? `<div class="po-card__footer po-card__footer--pdf"><span class="po-card__number">${escapeHtml(o.offerNumber)}</span></div>`
      : `<div class="po-card__footer">
          <span class="po-card__number">${escapeHtml(o.offerNumber)}</span>
          <button type="button" class="btn btn-outline btn-sm" data-pdf="${o.id}">PDF</button>
        </div>`;

    const idAttr = forPdf ? '' : ` id="offer-${o.id}"`;

    return `
      <article class="po-card${forPdf ? ' po-card--pdf' : ''}"${idAttr}>
        ${mediaHtml}
        <div class="po-card__body">
          <div class="po-card__chips">${chips}</div>
          <div class="po-card__price">${escapeHtml(o.priceDisplay || '—')}</div>
          ${locationHtml ? `<div class="po-card__location">${locationHtml}</div>` : ''}
          ${extraDesc ? `<p class="po-card__desc">${formatMultiline(extraDesc)}</p>` : ''}
          ${footerHtml}
        </div>
      </article>
    `;
  }

  function renderOfferCard(o) {
    return buildPoCardHtml(o);
  }

  function chip(text, mod = '') {
    const cls = mod ? ` po-chip--${mod}` : '';
    return `<span class="po-chip${cls}">${text}</span>`;
  }

  function bindCardEvents(offers) {
    offersContainer.querySelectorAll('[data-gallery]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const offer = offers.find((o) => o.id === btn.dataset.gallery);
        if (!offer) return;
        const imgs = offerImages(offer);
        if (!imgs.length) return;
        openLightbox(imgs, 0);
      });
    });
    offersContainer.querySelectorAll('[data-pdf]').forEach((btn) => {
      btn.addEventListener('click', () => downloadPdf(btn, offers.find((o) => o.id === btn.dataset.pdf)));
    });
  }

  function bindToolbarEvents() {
    typeTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      filterState.type = btn.dataset.type;
      filterState.area = '';
      filterState.price = '';
      renderTypeTabs();
      renderTypeFilters();
      renderOffersGrid();
    });

    let searchTimer;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        filterState.q = searchInput.value;
        renderOffersGrid();
      }, 180);
    });
  }

  function openLightbox(images, index) {
    lightboxState = { images, index: Math.max(0, Math.min(index, images.length - 1)) };
    updateLightbox();
    lightboxEl.hidden = false;
    document.body.classList.add('lightbox-open');
  }

  function closeLightbox() {
    lightboxEl.hidden = true;
    document.body.classList.remove('lightbox-open');
    lightboxImg.src = '';
  }

  function updateLightbox() {
    const { images, index } = lightboxState;
    if (!images.length) return closeLightbox();
    lightboxImg.src = images[index];
    lightboxCounter.textContent = `${index + 1} / ${images.length}`;
    lightboxThumbs.innerHTML = images.map((url, i) => `
      <button type="button" class="photo-lightbox__thumb${i === index ? ' is-active' : ''}" data-index="${i}">
        <img src="${escapeAttr(url)}" alt="">
      </button>
    `).join('');
  }

  function lightboxStep(delta) {
    const { images, index } = lightboxState;
    if (!images.length) return;
    lightboxState.index = (index + delta + images.length) % images.length;
    updateLightbox();
  }

  document.getElementById('lightbox-close')?.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev')?.addEventListener('click', () => lightboxStep(-1));
  document.getElementById('lightbox-next')?.addEventListener('click', () => lightboxStep(1));
  lightboxThumbs?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-index]');
    if (!btn) return;
    lightboxState.index = Number(btn.dataset.index);
    updateLightbox();
  });
  lightboxEl?.addEventListener('click', (e) => {
    if (e.target === lightboxEl) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (lightboxEl.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxStep(1);
    if (e.key === 'ArrowRight') lightboxStep(-1);
  });

  async function loadOffers() {
    offersContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const res = await fetch('/api/private-offers', { headers: authHeaders() });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      showGate();
      return;
    }
    const data = await res.json();
    allOffers = data.offers || [];
    renderTypeTabs();
    renderTypeFilters();
    renderOffersGrid();
  }

  function locationContent(location, forPdf = false) {
    const loc = String(location || '').trim();
    if (!loc) return '';
    if (isUrl(loc)) {
      const link = `<a href="${escapeAttr(loc)}"${forPdf ? '' : ' target="_blank" rel="noopener"'}">📍 عرض على الخريطة</a>`;
      if (forPdf) {
        return `${link}<br><span class="po-card__location-url">${escapeHtml(loc)}</span>`;
      }
      return link;
    }
    const lines = loc.split('\n').map((s) => s.trim()).filter(Boolean);
    if (forPdf && lines.some((line) => isUrl(line) || /https?:\/\//i.test(line))) {
      return lines.map((line) => {
        const urlMatch = line.match(/https?:\/\/\S+/i);
        if (isUrl(line)) {
          return `<a href="${escapeAttr(line)}">${escapeHtml(line)}</a>`;
        }
        if (urlMatch) {
          const url = urlMatch[0];
          const text = line.replace(url, '').trim();
          return `${text ? `${escapeHtml(text)}<br>` : ''}<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`;
        }
        return escapeHtml(line);
      }).join('<br>');
    }
    return formatMultiline(loc);
  }

  function formatMultiline(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function isUrl(s) {
    return /^https?:\/\//i.test(String(s).trim());
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const PDF_A4_WIDTH = 794;

  function showPdfToast(msg, isError = false) {
    const el = document.getElementById('pdf-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `pdf-toast${isError ? ' pdf-toast--error' : ''}`;
    el.hidden = false;
    clearTimeout(showPdfToast._t);
    showPdfToast._t = setTimeout(() => { el.hidden = true; }, isError ? 4500 : 2800);
  }

  function preloadOfferImages(offers) {
    (offers || []).forEach((o) => {
      offerImages(o).forEach((url) => {
        const img = new Image();
        img.src = url;
      });
    });
  }

  async function imageToDataUrl(url) {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    const bust = `${url}${url.includes('?') ? '&' : '?'}pdf=${Date.now()}`;
    try {
      const res = await fetch(bust, { mode: 'cors', cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch');
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const maxW = 1400;
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > maxW) {
        h = Math.round(h * maxW / w);
        w = maxW;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const maxW = 1400;
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            if (w > maxW) {
              h = Math.round(h * maxW / w);
              w = maxW;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.92));
          } catch {
            resolve(url);
          }
        };
        img.onerror = () => resolve(url);
        img.src = bust;
      });
    }
  }


  async function buildPdfElement(offer) {
    const cover = offerImages(offer)[0] || '';
    const coverData = cover ? await imageToDataUrl(cover) : null;
    const coverSrc = coverData || cover;

    const wrap = document.createElement('div');
    wrap.className = 'private-pdf';
    wrap.setAttribute('dir', 'rtl');
    wrap.setAttribute('lang', 'ar');
    wrap.innerHTML = `
      ${buildPoCardHtml(offer, { forPdf: true, coverSrc })}
      <p class="private-pdf__disclaimer">${PDF_DISCLAIMER}</p>
    `;
    return wrap;
  }

  function waitForHtml2Pdf(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (typeof html2pdf !== 'undefined') return resolve();
      const start = Date.now();
      const timer = setInterval(() => {
        if (typeof html2pdf !== 'undefined') {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error('تعذر تحميل أداة PDF — تحقق من الاتصال وحاول مرة أخرى'));
        }
      }, 80);
    });
  }

  async function waitForFonts() {
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.all([
          document.fonts.load('400 16px Cairo'),
          document.fonts.load('600 16px Cairo'),
          document.fonts.load('700 16px Cairo'),
          document.fonts.load('800 28px Cairo'),
        ]);
        await document.fonts.ready;
      } catch { /* continue */ }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  function waitForImagesIn(el) {
    const imgs = [...el.querySelectorAll('img')];
    return Promise.all(imgs.map((img) => new Promise((resolve) => {
      const done = () => resolve();
      if (img.complete && img.naturalWidth > 0) return done();
      img.onload = done;
      img.onerror = done;
      setTimeout(done, 12000);
    })));
  }

  function pdfRenderScale() {
    const w = window.innerWidth || 1024;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (w < 480) return Math.max(2, Math.min(dpr * 1.2, 2.5));
    if (w < 768) return Math.max(2, Math.min(dpr * 1.1, 2.2));
    return Math.min(Math.max(dpr, 2), 3);
  }

  function pdfOptions(offerNumber) {
    return {
      margin: [8, 8, 10, 8],
      filename: `${offerNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.93 },
      html2canvas: {
        scale: pdfRenderScale(),
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: PDF_A4_WIDTH,
        width: PDF_A4_WIDTH,
        letterRendering: true,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true,
        precision: 16,
      },
      pagebreak: {
        mode: ['css', 'legacy'],
        avoid: [
          '.po-card',
          '.po-card__media',
          '.po-card__body',
          '.po-card__location',
          '.private-pdf__disclaimer',
        ],
      },
    };
  }

  async function downloadPdf(btn, offer) {
    if (!offer || pdfBusy || btn.disabled) return;

    pdfBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = '...';
    showPdfToast('جاري تحضير الصور...');

    const host = document.getElementById('pdf-render-root');
    const slot = document.createElement('div');
    slot.className = 'pdf-render-slot';
    if (host) host.appendChild(slot);

    try {
      if (!host) throw new Error('تعذر إعداد PDF');
      await waitForHtml2Pdf();
      await waitForFonts();
      const pdfEl = await buildPdfElement(offer);
      slot.appendChild(pdfEl);
      showPdfToast('جاري إنشاء PDF...');
      await waitForImagesIn(pdfEl);
      await new Promise((r) => setTimeout(r, 200));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await html2pdf().set(pdfOptions(offer.offerNumber)).from(pdfEl).save();
      showPdfToast('تم تحميل PDF بنجاح');
    } catch (err) {
      showPdfToast(err.message || 'تعذر إنشاء ملف PDF', true);
    } finally {
      slot.remove();
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.textContent = originalText;
      pdfBusy = false;
    }
  }

  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.hidden = true;
    const code = document.getElementById('access-code').value.trim();
    try {
      await verifyCode(code);
      showOffers();
      await loadOffers();
    } catch (err) {
      gateError.textContent = err.message;
      gateError.hidden = false;
    }
  });

  bindToolbarEvents();

  (async function init() {
    const ok = await checkSession();
    if (ok) {
      showOffers();
      await loadOffers();
    } else {
      showGate();
      prefillCodeFromUrl();
    }
  })();
})();
