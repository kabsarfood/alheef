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
    const actions = `
      <div class="private-offer-card__actions">
        <button type="button" class="btn btn-outline btn-sm" data-pdf="${o.id}">تحميل PDF للعرض</button>
      </div>
    `;
    return `
      <article class="private-offer-card" id="offer-${o.id}">
        ${buildOfferCardInner(o, null, actions)}
      </article>
    `;
  }

  function buildOfferCardInner(o, imageSources, extraBodyHtml = '') {
    const imgs = imageSources || ((o.gallery && o.gallery.length) ? o.gallery : (o.coverImage ? [o.coverImage] : []));
    const galleryHtml = imgs.length
      ? `<div class="private-offer-card__gallery">${imgs.map((u) => `<img src="${u}" alt="" loading="lazy">`).join('')}</div>`
      : '';
    const locationHtml = o.showLocation && o.location
      ? `<div class="private-offer-card__location"><dt>الموقع</dt><dd>${locationContent(o.location)}</dd></div>`
      : '';

    return `
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
        ${o.shortDescription ? `<p class="private-offer-card__desc">${formatMultiline(o.shortDescription)}</p>` : ''}
        ${extraBodyHtml}
      </div>
    `;
  }

  function locationContent(location) {
    const loc = String(location || '').trim();
    if (!loc) return '—';
    if (isUrl(loc)) {
      return `<a href="${escapeAttr(loc)}" target="_blank" rel="noopener">عرض على الخريطة</a>`;
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
    return /^https?:\/\//i.test(s);
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

  async function imageToDataUrl(url) {
    if (!url) return null;
    const bust = `${url}${url.includes('?') ? '&' : '?'}pdf=${Date.now()}`;
    try {
      const res = await fetch(bust, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error('fetch');
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const maxW = 1200;
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
      return canvas.toDataURL('image/jpeg', 0.9);
    } catch {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const maxW = 1200;
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
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = bust;
      });
    }
  }

  async function preparePdfImages(urls) {
    const list = (urls || []).filter(Boolean);
    return Promise.all(list.map((url) => imageToDataUrl(url)));
  }

  async function buildPdfElement(offer) {
    const card = document.getElementById(`offer-${offer.id}`);
    if (!card) {
      throw new Error('تعذر إيجاد العرض على الصفحة');
    }

    const clone = card.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('private-pdf__card');
    clone.querySelector('.private-offer-card__actions')?.remove();

    const imgEls = [...clone.querySelectorAll('.private-offer-card__gallery img')];
    const rawUrls = imgEls.map((img) => img.getAttribute('src')).filter(Boolean);
    const dataUrls = await preparePdfImages(rawUrls);
    imgEls.forEach((img, i) => {
      if (dataUrls[i]) img.src = dataUrls[i];
      img.removeAttribute('loading');
    });

    const wrap = document.createElement('div');
    wrap.className = 'private-pdf';
    wrap.setAttribute('dir', 'rtl');
    wrap.setAttribute('lang', 'ar');
    wrap.appendChild(clone);

    const disclaimer = document.createElement('p');
    disclaimer.className = 'private-pdf__disclaimer';
    disclaimer.textContent = PDF_DISCLAIMER;
    wrap.appendChild(disclaimer);

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
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      setTimeout(resolve, 8000);
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
    const scale = pdfRenderScale();
    return {
      margin: [8, 8, 10, 8],
      filename: `${offerNumber}.pdf`,
      image: { type: 'jpeg', quality: 0.93 },
      html2canvas: {
        scale,
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
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.private-offer-card__gallery', '.private-offer-card__meta', '.private-offer-card__desc', '.private-pdf__disclaimer'] },
    };
  }

  let pdfBusy = false;

  async function downloadPdf(btn, offer) {
    if (!offer || pdfBusy || btn.disabled) return;

    pdfBusy = true;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.textContent = 'جاري التحميل...';
    showPdfToast('جاري إنشاء PDF...');

    const host = document.getElementById('pdf-render-root') || document.body;
    const slot = document.createElement('div');
    host.appendChild(slot);

    try {
      await waitForHtml2Pdf();
      await waitForFonts();

      const pdfEl = await buildPdfElement(offer);
      slot.appendChild(pdfEl);
      await waitForImagesIn(pdfEl);
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
