(function () {
  const PDF_DISCLAIMER = 'هذا العرض مخصص للاطلاع فقط، ولا يحتوي على بيانات تواصل أو بيانات مالك.';
  const slugMatch = window.location.pathname.match(/^\/(?:v|p)\/([A-Za-z0-9_-]{8,64})\/?$/);
  const slug = slugMatch ? slugMatch[1] : '';
  const TOKEN_KEY = `alheef_private_token_${slug}`;

  const TYPE_TABS = [
    { value: '', label: 'الكل' },
    { value: 'sale', label: 'بيع', kind: 'listing' },
    { value: 'rent', label: 'إيجار', kind: 'listing' },
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
  const gatePhoneInput = document.getElementById('gate-phone');
  const gateOtpInput = document.getElementById('gate-otp');
  const gateStepPhone = document.getElementById('gate-step-phone');
  const gateStepOtp = document.getElementById('gate-step-otp');
  const gateResendBtn = document.getElementById('gate-resend-btn');
  const gatePasteBtn = document.getElementById('gate-paste-btn');
  const gateConfirmBtn = document.getElementById('gate-confirm-btn');
  const gateSendBtn = document.getElementById('gate-send-btn');
  const gateWarning = document.getElementById('gate-warning');
  const gateExternal = document.getElementById('gate-external');
  const gateBlocked = document.getElementById('gate-blocked');
  const gateBlockedText = document.getElementById('gate-blocked-text');
  const typeTabsEl = document.getElementById('type-tabs');
  const typeFiltersEl = document.getElementById('type-filters');
  const searchInput = document.getElementById('offers-search');
  const resultsCountEl = document.getElementById('results-count');
  const lightboxEl = document.getElementById('photo-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCounter = document.getElementById('lightbox-counter');
  const lightboxThumbs = document.getElementById('lightbox-thumbs');

  let allOffers = [];
  let filterState = { type: '', listing: '', q: '', area: '', price: '' };
  let lightboxState = { images: [], index: 0 };
  let pdfBusy = false;
  let otpChallengeId = '';
  let gateReadyToSend = false;
  let clientName = '';

  if (!slug) {
    document.body.innerHTML = '<p style="text-align:center;padding:3rem;font-family:Cairo,sans-serif">الرابط غير صالح</p>';
    return;
  }

  function getToken() {
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) return saved;
    } catch { /* متصفح الآيفون داخل واتساب قد يمنع التخزين */ }
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function setToken(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem('alheef_user_token', token);
      localStorage.setItem('alheef_user_slug', slug);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* يبقى الدخول عبر الكوكي */ }
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('alheef_user_token');
      localStorage.removeItem('alheef_user_slug');
    } catch { /* ignore */ }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
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
    document.title = 'عروض خاصة';
  }

  function showOffers() {
    gateView.hidden = true;
    gateView.classList.add('is-hidden');
    offersView.hidden = false;
    offersView.classList.remove('is-hidden');
    offersView.setAttribute('aria-hidden', 'false');
    document.title = 'عروض الهيف العقارية الخاصة';
    initPrivatePushPrompt();
  }

  function initPrivatePushPrompt() {
    if (!window.AlheefPWA || typeof Notification === 'undefined') return;
    const bannerKey = `private_push_banner_${slug}`;

    if (Notification.permission === 'granted') {
      if (window.AlheefPWA.hasPrivateConsent()) {
        window.AlheefPWA.subscribePush({
          role: 'client',
          offersEnabled: window.AlheefPWA.hasOffersConsent(),
          privateOffersEnabled: true,
          privateSlug: slug,
        }).catch(() => {});
      }
      return;
    }

    if (Notification.permission === 'denied' || sessionStorage.getItem(bannerKey)) return;

    const existing = document.getElementById('private-push-banner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'private-push-banner';
    banner.className = 'private-push-banner';
    banner.innerHTML = `
      <p>فعّل الإشعارات لتصلك <strong>العروض الخاصة الجديدة</strong> على أيقونة التطبيق</p>
      <div class="private-push-banner__actions">
        <button type="button" class="btn btn-gold btn-sm" id="private-push-enable">تفعيل الإشعارات</button>
        <button type="button" class="btn btn-outline btn-sm" id="private-push-dismiss">لاحقاً</button>
      </div>
    `;
    offersView.insertBefore(banner, offersView.querySelector('.private-toolbar'));

    document.getElementById('private-push-enable')?.addEventListener('click', async () => {
      try {
        await window.AlheefPWA.promptPrivateOffersPush(slug);
        banner.remove();
      } catch {
        /* ignore */
      }
    });
    document.getElementById('private-push-dismiss')?.addEventListener('click', () => {
      sessionStorage.setItem(bannerKey, '1');
      banner.remove();
    });
  }

  function showGatePhoneStep() {
    otpChallengeId = '';
    if (gateStepPhone) gateStepPhone.hidden = false;
    if (gateStepOtp) gateStepOtp.hidden = true;
    if (gateOtpInput) {
      gateOtpInput.required = false;
      gateOtpInput.value = '';
    }
  }

  function otpDigits(value) {
    return String(value || '')
      .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit))
      .replace(/\D/g, '')
      .slice(0, 6);
  }

  function showGateOtpStep() {
    if (gateStepPhone) gateStepPhone.hidden = true;
    if (gateStepOtp) gateStepOtp.hidden = false;
    if (gateOtpInput) {
      gateOtpInput.required = true;
      gateOtpInput.focus();
    }
  }

  function isIosInAppBrowser() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/i.test(ua);
    if (!ios) return false;
    if (/WhatsApp|Instagram|FBAN|FBAV|Line\/|TikTok|Snapchat|MicroMessenger/i.test(ua)) return true;
    return !/Safari/i.test(ua);
  }

  function showSafariHandoff() {
    if (gateForm) gateForm.hidden = true;
    if (gateBlocked) gateBlocked.hidden = true;
    const box = document.getElementById('gate-safari');
    const link = document.getElementById('gate-safari-link');
    if (link) link.href = location.href;
    if (box) box.hidden = false;
    showGate();
  }

  function externalBrowserHref() {
    const ua = navigator.userAgent || '';
    if (!/Android/i.test(ua)) return '';
    const target = `${location.host}${location.pathname}${location.search}`;
    return `intent://${target}#Intent;scheme=https;package=com.android.chrome;end`;
  }

  function showBlocked(message) {
    if (gateForm) gateForm.hidden = true;
    if (gateBlocked) gateBlocked.hidden = false;
    if (gateBlockedText) gateBlockedText.textContent = message;
    showGate();
  }

  function showActivation(state, phoneMasked) {
    if (gateBlocked) gateBlocked.hidden = true;
    if (gateForm) gateForm.hidden = false;
    if (gatePhoneInput) gatePhoneInput.value = phoneMasked || '';
    const firstTime = state !== 'same';
    gateReadyToSend = !firstTime;
    if (gateWarning) gateWarning.hidden = !firstTime;
    if (gateConfirmBtn) gateConfirmBtn.hidden = !firstTime;
    if (gateSendBtn) gateSendBtn.hidden = firstTime;
    if (gateExternal) {
      const href = firstTime ? externalBrowserHref() : '';
      gateExternal.hidden = !href;
      if (href) gateExternal.href = href;
    }
    showGate();
    showGatePhoneStep();
  }

  async function loadGate() {
    const res = await fetch(`/api/private-offers/gate?slug=${encodeURIComponent(slug)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showBlocked(data.message || 'تعذر فتح الرابط');
      return;
    }
    if (data.state === 'other') {
      showBlocked(data.message || 'هذا الدخول مرتبط بجهاز آخر.');
      return;
    }
    clientName = data.clientName || '';
    showActivation(data.state, data.phoneMasked);
    try {
      gateReadyToSend = true;
      const sent = await sendOtp();
      showGateOtpStep();
      if (gateError) {
        gateError.textContent = 'اكتب الرمز الذي وصلك على واتساب. لا يظهر الرمز في الموقع.';
        gateError.hidden = false;
      }
    } catch (err) {
      if (err.code === 'other_device') {
        showBlocked(err.message);
        return;
      }
      if (gateError) {
        gateError.textContent = err.message || 'تعذر إرسال رمز التحقق';
        gateError.hidden = false;
      }
      if (gateConfirmBtn) gateConfirmBtn.hidden = true;
      if (gateSendBtn) gateSendBtn.hidden = false;
      gateReadyToSend = true;
    }
  }

  showGate();

  async function checkSession() {
    const token = getToken();
    if (!token) return false;
    const res = await fetch('/api/private-offers/session', { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (data.authenticated && data.token) {
      setToken(data.token);
      clientName = data.clientName || clientName;
    }
    return !!data.authenticated;
  }

  async function sendOtp() {
    const res = await fetch('/api/private-offers/otp/send', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'تعذر إرسال الرمز');
      err.code = data.code || '';
      throw err;
    }
    otpChallengeId = data.challengeId;
    return data;
  }

  async function offerGateCode(code) {
    const accepted = window.AlheefOtpConsent
      ? await window.AlheefOtpConsent.ask(code)
      : otpDigits(code);
    if (accepted.length !== 6) return;
    if (gateOtpInput) gateOtpInput.value = accepted;
    await verifyOtp(accepted);
    await finishVerifiedEntry();
  }

  async function verifyOtp(code) {
    const res = await fetch('/api/private-offers/otp/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, challengeId: otpChallengeId, code }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.message || 'رمز غير صحيح');
      err.code = data.code || '';
      throw err;
    }
    setToken(data.token);
    clientName = data.clientName || clientName;
  }

  async function redeemAutofill(fill) {
    const res = await fetch('/api/private-offers/otp/autofill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ slug, fill }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'تعذر تعبئة الرمز');
      err.code = data.code || '';
      throw err;
    }
    return data;
  }

  async function finishVerifiedEntry() {
    showOffers();
    await loadOffers();
  }

  async function resendOtp() {
    const res = await fetch('/api/private-offers/otp/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: otpChallengeId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'تعذر إعادة الإرسال');
    otpChallengeId = data.challengeId || otpChallengeId;
    return data;
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
      o.listingTypeLabel,
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
    if (filterState.listing) {
      list = list.filter((o) => (o.listingType || 'sale') === filterState.listing);
    }
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

  function activeTabValue() {
    if (filterState.listing) return filterState.listing;
    return filterState.type;
  }

  function renderTypeTabs() {
    const active = activeTabValue();
    typeTabsEl.innerHTML = TYPE_TABS.map((t) => `
      <button type="button" class="private-type-tab${active === t.value ? ' is-active' : ''}"
        data-type="${escapeAttr(t.value)}" data-kind="${escapeAttr(t.kind || 'property')}"
        role="tab" aria-selected="${active === t.value}">
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
    scrollToOfferHash();
  }

  function scrollToOfferHash() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#offer-')) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function buildPoCardHtml(o, options = {}) {
    const forPdf = options.forPdf === true;
    const imgs = offerImages(o);
    const cover = options.coverSrc || imgs[0] || '';
    const district = offerDistrict(o);
    const extraDesc = offerExtraDesc(o);
    const locationHtml = o.showLocation && o.location ? locationContent(o.location, forPdf) : '';

    const chips = [
      chip(o.listingTypeLabel || (o.listingType === 'rent' ? 'إيجار' : 'بيع'), o.listingType === 'rent' ? 'rent' : 'sale'),
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
    if (!typeTabsEl || document.getElementById('po-board')) return;
    typeTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      const value = btn.dataset.type || '';
      const kind = btn.dataset.kind || 'property';
      if (!value) {
        filterState.type = '';
        filterState.listing = '';
      } else if (kind === 'listing') {
        filterState.listing = value;
        filterState.type = '';
      } else {
        filterState.type = value;
        filterState.listing = '';
      }
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
    if (window.AlheefOfferBoard && document.getElementById('po-board')) {
      window.ALHEEF_PRIVATE_TOKEN = getToken;
      window.ALHEEF_PRIVATE_AUTH_FAIL = async () => {
        const token = getToken();
        clearToken();
        if (token) {
          fetch('/api/private-offers/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        showGate();
        await loadGate();
      };
      await window.AlheefOfferBoard.start();
      return;
    }
    offersContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const res = await fetch('/api/private-offers', { headers: authHeaders() });
    if (res.status === 401 || res.status === 403) {
      clearToken();
      await loadGate();
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
  const PDF_RENDER_HEIGHT = 1123;

  function isMobilePdf() {
    return (window.innerWidth || 1024) < 768;
  }

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
      const maxW = isMobilePdf() ? 1800 : 1600;
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
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const maxW = isMobilePdf() ? 1800 : 1600;
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
            resolve(canvas.toDataURL('image/jpeg', 0.95));
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

  function preparePdfRenderHost(host) {
    if (!host) return () => {};
    const prev = {
      transform: host.style.transform,
      top: host.style.top,
      visibility: host.style.visibility,
      opacity: host.style.opacity,
      zIndex: host.style.zIndex,
    };
    host.style.transform = 'none';
    host.style.top = '0';
    host.style.visibility = 'visible';
    host.style.opacity = '1';
    host.style.zIndex = '-1';
    return () => {
      host.style.transform = prev.transform;
      host.style.top = prev.top;
      host.style.visibility = prev.visibility;
      host.style.opacity = prev.opacity;
      host.style.zIndex = prev.zIndex;
    };
  }

  function pdfRenderScale() {
    return 2;
  }

  function pdfOptions(offerNumber, el) {
    const height = Math.max(el?.scrollHeight || 0, PDF_RENDER_HEIGHT);
    return {
      margin: [10, 10, 12, 10],
      filename: `${offerNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: {
        scale: pdfRenderScale(),
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        windowWidth: PDF_A4_WIDTH,
        windowHeight: height,
        width: PDF_A4_WIDTH,
        height,
        letterRendering: true,
        foreignObjectRendering: false,
        onclone: (clonedDoc) => {
          // html2canvas يمرّر المستند المُستنسَخ كوسيط أول فقط
          if (!clonedDoc || typeof clonedDoc.querySelector !== 'function') return;
          const root = clonedDoc.querySelector('.private-pdf');
          const card = clonedDoc.querySelector('.po-card--pdf');
          if (root) {
            root.style.width = `${PDF_A4_WIDTH}px`;
            root.style.maxWidth = `${PDF_A4_WIDTH}px`;
            root.style.transform = 'none';
          }
          if (card) {
            card.style.width = '100%';
            card.style.maxWidth = '100%';
          }
        },
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
        avoid: ['.po-card--pdf', '.private-pdf__disclaimer'],
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
    let restoreHost = () => {};

    try {
      if (!host) throw new Error('تعذر إعداد PDF');
      await waitForHtml2Pdf();
      await waitForFonts();
      const pdfEl = await buildPdfElement(offer);
      slot.appendChild(pdfEl);
      showPdfToast('جاري إنشاء PDF...');
      await waitForImagesIn(pdfEl);
      await new Promise((r) => setTimeout(r, isMobilePdf() ? 450 : 200));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      restoreHost = preparePdfRenderHost(host);
      await html2pdf().set(pdfOptions(offer.offerNumber, pdfEl)).from(pdfEl).save();
      showPdfToast('تم تحميل PDF بنجاح');
    } catch (err) {
      showPdfToast(err.message || 'تعذر إنشاء ملف PDF', true);
    } finally {
      restoreHost();
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
    try {
      if (!otpChallengeId) {
        if (!gateReadyToSend) return;
        const sent = await sendOtp();
        showGateOtpStep();
      } else {
        const code = otpDigits(gateOtpInput && gateOtpInput.value);
        if (gateOtpInput) gateOtpInput.value = code;
        await verifyOtp(code);
        await finishVerifiedEntry();
      }
    } catch (err) {
      if (err.code === 'other_device') {
        showBlocked(err.message);
        return;
      }
      gateError.textContent = err.message;
      gateError.hidden = false;
    }
  });

  if (gateConfirmBtn) {
    gateConfirmBtn.addEventListener('click', () => {
      gateReadyToSend = true;
      gateConfirmBtn.hidden = true;
      if (gateSendBtn) gateSendBtn.hidden = false;
    });
  }

  if (gateOtpInput) {
    gateOtpInput.addEventListener('input', () => {
      const next = otpDigits(gateOtpInput.value);
      if (gateOtpInput.value !== next) gateOtpInput.value = next;
    });
  }

  if (gatePasteBtn) {
    gatePasteBtn.addEventListener('click', async () => {
      gateError.hidden = true;
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          throw new Error('انسخ الرمز من واتساب ثم الصقه داخل المربع');
        }
        const text = await navigator.clipboard.readText();
        const code = otpDigits(text);
        if (code.length !== 6) throw new Error('انسخ رمز الواتساب المكوّن من 6 أرقام ثم اضغط لصق');
        if (gateOtpInput) {
          gateOtpInput.value = code;
          gateOtpInput.focus();
        }
      } catch (err) {
        gateError.textContent = err && err.message ? err.message : 'تعذر لصق الرمز';
        gateError.hidden = false;
        if (gateOtpInput) gateOtpInput.focus();
      }
    });
  }

  if (gateResendBtn) {
    gateResendBtn.addEventListener('click', async () => {
      gateError.hidden = true;
      try {
        const sent = await resendOtp();
        gateError.textContent = 'اكتب الرمز الذي وصلك على واتساب. لا يظهر الرمز في الموقع.';
        gateError.hidden = false;
      } catch (err) {
        gateError.textContent = err.message;
        gateError.hidden = false;
      }
    });
  }

  bindToolbarEvents();

  window.addEventListener('storage', (event) => {
    if (event.key !== TOKEN_KEY || !event.newValue) return;
    checkSession().then(async (ok) => {
      if (!ok) return;
      await finishVerifiedEntry();
    }).catch(() => {});
  });

  (async function init() {
    const ok = await checkSession();
    if (ok) {
      showOffers();
      await loadOffers();
      return;
    }
    const fill = new URLSearchParams(location.search).get('fill') || '';
    if (fill) {
      try {
        const data = await redeemAutofill(fill);
        if (gateBlocked) gateBlocked.hidden = true;
        if (gateForm) gateForm.hidden = false;
        showGate();
        otpChallengeId = data.challengeId;
        gateReadyToSend = true;
        showGateOtpStep();
        history.replaceState(null, '', location.pathname);
        if (gateError) {
          gateError.textContent = 'اكتب الرمز الذي وصلك على واتساب. لا يظهر الرمز في الموقع.';
          gateError.hidden = false;
        }
        return;
      } catch (err) {
        history.replaceState(null, '', location.pathname);
        if (err.code === 'other_device') {
          showBlocked(err.message);
          return;
        }
        await loadGate();
        gateError.textContent = err.message || 'تعذر تعبئة الرمز. انسخه من واتساب والصقه في المربع';
        gateError.hidden = false;
        return;
      }
    }
    await loadGate();
  })();
})();
