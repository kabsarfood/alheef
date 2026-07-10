(function () {
  const PDF_DISCLAIMER = 'هذا العرض مخصص للاطلاع فقط، ولا يحتوي على بيانات تواصل أو بيانات مالك.';
  const slugMatch = window.location.pathname.match(/^\/(?:v|p)\/([A-Za-z0-9_-]{8,64})\/?$/);
  const slug = slugMatch ? slugMatch[1] : '';
  const TOKEN_KEY = `alheef_private_token_${slug}`;

  const gateView = document.getElementById('gate-view');
  const offersView = document.getElementById('offers-view');
  const gateForm = document.getElementById('gate-form');
  const gateError = document.getElementById('gate-error');
  const offersContainer = document.getElementById('offers-container');
  const accessCodeInput = document.getElementById('access-code');

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

  async function loadOffers() {
    offersContainer.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const res = await fetch('/api/private-offers', { headers: authHeaders() });
    if (res.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      showGate();
      return;
    }
    const data = await res.json();
    const offers = data.offers || [];
    if (!offers.length) {
      offersContainer.innerHTML = '<p class="empty-state">لا توجد عروض متاحة حالياً</p>';
      return;
    }
    offersContainer.innerHTML = offers.map(renderOffer).join('');
    offersContainer.querySelectorAll('[data-pdf]').forEach((btn) => {
      btn.addEventListener('click', () => downloadPdf(btn, offers.find((o) => o.id === btn.dataset.pdf)));
    });
  }

  function renderOffer(o) {
    const imgs = (o.gallery && o.gallery.length) ? o.gallery : (o.coverImage ? [o.coverImage] : []);
    const galleryHtml = imgs.length
      ? `<div class="private-offer-card__gallery">${imgs.map((u) => `<img src="${u}" alt="" loading="lazy">`).join('')}</div>`
      : '';
    const locationHtml = o.showLocation && o.location
      ? `<div class="private-offer-card__location"><dt>الموقع</dt><dd>${isUrl(o.location) ? `<a href="${o.location}" target="_blank" rel="noopener">عرض على الخريطة</a>` : escapeHtml(o.location)}</dd></div>`
      : '';

    return `
      <article class="private-offer-card" id="offer-${o.id}">
        ${galleryHtml}
        <div class="private-offer-card__body">
          <span class="private-offer-card__number">${escapeHtml(o.offerNumber)}</span>
          <div class="private-offer-card__price">${escapeHtml(o.priceDisplay || '—')}</div>
          <dl class="private-offer-card__meta">
            <div><dt>نوع العقار</dt><dd>${escapeHtml(o.propertyTypeLabel)}</dd></div>
            <div><dt>المساحة</dt><dd>${o.area != null ? o.area + ' م²' : '—'}</dd></div>
            <div><dt>الشارع</dt><dd>${escapeHtml(o.street || '—')}</dd></div>
            <div><dt>رقم القطعة</dt><dd>${escapeHtml(o.plotNumber || '—')}</dd></div>
            <div><dt>رقم المخطط</dt><dd>${escapeHtml(o.planNumber || '—')}</dd></div>
            <div><dt>الحالة</dt><dd>${escapeHtml(o.statusLabel)}</dd></div>
            ${locationHtml}
          </dl>
          ${o.shortDescription ? `<p class="private-offer-card__desc">${escapeHtml(o.shortDescription)}</p>` : ''}
          <div class="private-offer-card__actions">
            <button type="button" class="btn btn-outline btn-sm" data-pdf="${o.id}">تحميل PDF للعرض</button>
          </div>
        </div>
      </article>
    `;
  }

  function isUrl(s) {
    return /^https?:\/\//i.test(s);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pdfRow(label, value) {
    return `
      <div class="private-pdf__row">
        <span class="private-pdf__row-label">${label}</span>
        <span class="private-pdf__row-value">${value}</span>
      </div>
    `;
  }

  function buildPdfElement(o) {
    const imgs = (o.gallery && o.gallery.length) ? o.gallery : (o.coverImage ? [o.coverImage] : []);
    const imgsHtml = imgs.length
      ? `<div class="private-pdf__images">${imgs.map((u) => `<img src="${u}" alt="" crossorigin="anonymous">`).join('')}</div>`
      : '';

    const locationRow = o.showLocation && o.location
      ? pdfRow('الموقع / اللوكيشن', escapeHtml(isUrl(o.location) ? o.location : o.location))
      : '';

    const el = document.createElement('div');
    el.className = 'private-pdf';
    el.setAttribute('dir', 'rtl');
    el.setAttribute('lang', 'ar');
    el.innerHTML = `
      <div class="private-pdf__offer-no">
        <div class="private-pdf__offer-no-label">رقم العرض</div>
        <div class="private-pdf__offer-no-value">${escapeHtml(o.offerNumber)}</div>
      </div>
      ${pdfRow('نوع العقار', escapeHtml(o.propertyTypeLabel))}
      ${pdfRow('المساحة', o.area != null ? `${o.area} م²` : '—')}
      ${pdfRow('الشارع', escapeHtml(o.street || '—'))}
      ${pdfRow('رقم القطعة', escapeHtml(o.plotNumber || '—'))}
      ${pdfRow('رقم المخطط', escapeHtml(o.planNumber || '—'))}
      ${pdfRow('السعر', escapeHtml(o.priceDisplay || '—'))}
      ${locationRow}
      ${o.shortDescription ? `<div class="private-pdf__desc"><strong>وصف مختصر:</strong><br>${escapeHtml(o.shortDescription)}</div>` : ''}
      ${imgsHtml}
      <p class="private-pdf__disclaimer">${PDF_DISCLAIMER}</p>
    `;
    return el;
  }

  function waitForHtml2Pdf(timeoutMs = 12000) {
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
          document.fonts.load('700 16px Cairo'),
          document.fonts.load('800 24px Cairo'),
        ]);
        await document.fonts.ready;
      } catch { /* continue */ }
    }
  }

  function preloadImages(urls) {
    return Promise.all((urls || []).map((url) => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    })));
  }

  function pdfScale() {
    const w = window.innerWidth || 1024;
    if (w < 480) return 1.4;
    if (w < 768) return 1.6;
    return 2;
  }

  let pdfBusy = false;

  async function downloadPdf(btn, offer) {
    if (!offer || pdfBusy || btn.disabled) return;

    pdfBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = 'جاري التحميل...';

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:794px;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(host);

    try {
      await waitForHtml2Pdf();
      await waitForFonts();

      const imgs = (offer.gallery && offer.gallery.length) ? offer.gallery : (offer.coverImage ? [offer.coverImage] : []);
      await preloadImages(imgs);

      const pdfEl = buildPdfElement(offer);
      host.appendChild(pdfEl);

      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      await html2pdf().set({
        margin: [10, 10, 12, 10],
        filename: `${offer.offerNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.9 },
        html2canvas: {
          scale: pdfScale(),
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(pdfEl).save();
    } catch (err) {
      alert(err.message || 'تعذر إنشاء ملف PDF');
    } finally {
      host.remove();
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
