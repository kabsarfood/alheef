/**
 * الهيف للخدمات العقارية — Frontend
 */

(function () {
  'use strict';

  let config = {
    whatsapp: '966500000000',
    phone: '053 079 2754',
    instagram: '#',
    x: '#',
  };

  let offers = [];

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function formatArea(area) {
    if (area == null || area === '') return '';
    const s = String(area).trim();
    if (!s) return '';
    return /م²|م2/i.test(s) ? s : `${s} م²`;
  }

  function pickDescription(source) {
    const candidates = [source.description, source.details];
    const f = source.features;
    if (f && typeof f === 'object' && !Array.isArray(f)) {
      candidates.push(f.property_description, f.details, f.description);
    }
    for (const c of candidates) {
      const s = String(c ?? '').trim();
      if (s) return s;
    }
    return '';
  }

  const LISTING_LABEL = { sale: 'للبيع', rent: 'للإيجار', buy_request: 'طلب شراء' };

  function formatLocationLines(offer) {
    const city = (offer.city || '').trim();
    let district = (offer.district || '').trim().replace(/^حي\s+/u, '');
    if (city && district) {
      return {
        primary: `${city} — ${district}`,
        secondary: `${city} — حي ${district}`,
      };
    }
    const loc = (offer.location || '').trim();
    const parts = loc.split('—').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const c = parts[0];
      const d = parts[1].replace(/^حي\s+/u, '');
      return { primary: `${c} — ${d}`, secondary: `${c} — حي ${d}` };
    }
    return { primary: loc, secondary: '' };
  }

  function formatListingLine(offer) {
    const label = LISTING_LABEL[offer.listingType] || '';
    const type = (offer.type || '').trim();
    if (label && type) return `${label} ${type}`;
    return label || type || '';
  }

  function buildDetailBody(offer) {
    let body = pickDescription(offer);
    if (!body) {
      const lines = [];
      if (offer.area) lines.push(`المساحة ${formatArea(offer.area)}`);
      if (offer.streetWidth) lines.push(`الشارع ${offer.streetWidth}`);
      if (offer.direction) lines.push(`الاتجاه ${offer.direction}`);
      if (offer.plotNumber || offer.planNumber) {
        const plot = offer.plotNumber ? `رقم القطعة ${offer.plotNumber}` : '';
        const plan = offer.planNumber ? `مخطط ${offer.planNumber}` : '';
        lines.push([plot, plan].filter(Boolean).join(' '));
      }
      body = lines.join('\n');
    }
    const ref = offer.referenceNo || '';
    if (ref && !body.includes(ref)) {
      body = body ? `${body}\nإعلان مرخص - ${ref}` : `إعلان مرخص - ${ref}`;
    }
    if (body && !/الهيف/i.test(body)) {
      body += '\nالهيف العقارية';
    }
    return body || 'لا توجد تفاصيل إضافية لهذا العقار.';
  }

  // ─── Init ───
  document.addEventListener('DOMContentLoaded', init);

  let siteSettings = null;

  async function init() {
    const yearEl = document.getElementById('year');
    const year = new Date().getFullYear();
    if (yearEl) yearEl.textContent = year;
    document.querySelectorAll('.footer__year').forEach((el) => {
      el.textContent = year;
    });

    setupHeader();
    ensureMapNavLink();
    setupNavigation();
    setupReveal();
    showAllRevealsFallback();

    try {
      await loadSiteSettings();
      await loadConfig();
      await loadOffers();
      await loadTestimonials();
      setupForms();
      setupPropertyChoices();
      setupSubscribeToggle();
      setupFileUpload();
      setupModal();
      setupServicesReel();
    } catch (err) {
      console.error('[الهيف] init:', err);
      showAllRevealsFallback();
    }
  }

  function showAllRevealsFallback() {
    document.querySelectorAll('.reveal:not(.visible)').forEach((el) => {
      el.classList.add('visible');
    });
  }

  async function loadSiteSettings() {
    try {
      const res = await fetch('/api/settings');
      siteSettings = await res.json();
      applySiteSettings();
    } catch {
      /* defaults from HTML */
    }
  }

  function withCacheBust(url, version) {
    if (!url) return '';
    const v = version || siteSettings?.updatedAt || Date.now();
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(v)}`;
  }

  function applyHeroBanner(s, v) {
    const heroImg = document.getElementById('hero-image');
    if (!heroImg) return;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const desktop = '/assets/hero/cover-1920.jpg';
    const mobile = '/assets/hero/cover-mobile.jpg';
    const heroV = '4-' + (v || 1);
    heroImg.src = withCacheBust(isMobile ? mobile : desktop, heroV);
    heroImg.srcset = [
      `/assets/hero/cover-640.jpg?v=${encodeURIComponent(heroV)} 640w`,
      `/assets/hero/cover-960.jpg?v=${encodeURIComponent(heroV)} 960w`,
      `/assets/hero/cover-1280.jpg?v=${encodeURIComponent(heroV)} 1280w`,
      `/assets/hero/cover-1920.jpg?v=${encodeURIComponent(heroV)} 1920w`,
    ].join(', ');
    heroImg.sizes = '100vw';
    const source = heroImg.parentElement && heroImg.parentElement.querySelector('source');
    if (source) source.srcset = withCacheBust(mobile, v);
  }

  function applySiteSettings() {
    if (!siteSettings) return;
    const s = siteSettings;
    const c = s.colors || {};
    const v = s.updatedAt;

    if (s.siteName) {
      document.title = s.siteName;
      const pt = document.getElementById('page-title');
      if (pt) pt.textContent = s.siteName;
    }

    const logo = document.getElementById('site-logo');
    if (logo && s.logo) {
      logo.src = withCacheBust(s.logo, v);
      logo.alt = s.siteName || logo.alt;
    }

    const footerLogo = document.getElementById('footer-logo');
    if (footerLogo && s.logo) {
      footerLogo.src = withCacheBust(s.logo, v);
      footerLogo.alt = s.siteName || footerLogo.alt;
    }

    const footerName = document.getElementById('footer-site-name');
    const footerTagline = document.getElementById('footer-site-tagline');
    if (footerName && s.siteName) footerName.textContent = s.siteName;
    if (footerTagline && (s.siteDescription || s.hero?.label)) {
      footerTagline.textContent = s.siteDescription || s.hero?.label;
    }

    setText('about-text', s.aboutText);
    setText('vision-text', s.visionText);
    setText('mission-text', s.missionText);

    const fav = document.getElementById('favicon-link');
    if (fav && s.favicon) fav.href = withCacheBust(s.favicon, v);

    applySeo(s);

    setText('hero-label', s.hero?.label);
    setText('hero-title', s.hero?.title);
    setText('hero-desc', s.hero?.description);
    setText('hero-btn-request', s.hero?.btnRequest);

    applyHeroBanner(s, v);

    const root = document.documentElement;
    if (c.primary) root.style.setProperty('--navy', c.primary);
    if (c.gold) root.style.setProperty('--gold', c.gold);
    if (c.textPrimary) root.style.setProperty('--text-primary', c.textPrimary);
    if (c.textSecondary) root.style.setProperty('--text-secondary', c.textSecondary);
    if (c.buttonPrimary) root.style.setProperty('--black-soft', c.buttonPrimary);
    if (c.border) root.style.setProperty('--gold-border', c.border);

    if (s.contact) {
      config.whatsapp = s.contact.whatsapp || config.whatsapp;
      config.phone = s.contact.phone || config.phone;
      config.instagram = s.contact.instagram || config.instagram;
      config.x = s.contact.x || config.x;
    }
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
  }

  function applySeo(s) {
    const desc = s.siteDescription || s.hero?.description || '';
    const title = s.siteName || document.title;
    const img = '/assets/hero/cover-1280.jpg';

    const md = document.getElementById('meta-description');
    if (md) md.setAttribute('content', desc);
    const ogt = document.getElementById('og-title');
    if (ogt) ogt.setAttribute('content', title);
    const ogd = document.getElementById('og-description');
    if (ogd) ogd.setAttribute('content', desc);
    const ogi = document.getElementById('og-image');
    if (ogi && img) ogi.setAttribute('content', img.startsWith('http') ? img : `https://www.alheef.website${img}`);
  }

  async function loadTestimonials() {
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;
    try {
      const res = await fetch('/api/testimonials');
      const items = await res.json();
      if (!items.length) {
        grid.closest('section')?.remove();
        return;
      }
      grid.innerHTML = items.map((t) => `
        <article class="testimonial-card reveal">
          ${t.image ? `<img class="testimonial-card__img" src="${t.image}" alt="" loading="lazy">` : ''}
          <p class="testimonial-card__stars">${'★'.repeat(t.rating || 5)}</p>
          <p class="testimonial-card__text">${t.comment}</p>
          <p class="testimonial-card__name">${t.customerName}</p>
        </article>
      `).join('');
      grid.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
      const toggle = document.getElementById('testimonials-toggle');
      toggle?.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        const hint = toggle.querySelector('.testimonials__toggle-hint');
        if (hint) hint.textContent = open ? 'فتح التعليقات' : 'إغلاق التعليقات';
        grid.hidden = open;
      });
    } catch {
      grid.closest('section')?.remove();
    }
  }

  function formatPhoneDisplay(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (/^9665\d{8}$/.test(digits)) {
      digits = '0' + digits.slice(3);
    } else if (/^5\d{8}$/.test(digits)) {
      digits = '0' + digits;
    }
    if (/^05\d{8}$/.test(digits)) {
      return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
    }
    return String(phone || '').trim();
  }

  function phoneTelHref(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (/^9665\d{8}$/.test(digits)) return 'tel:0' + digits.slice(3);
    if (/^05\d{8}$/.test(digits)) return 'tel:' + digits;
    if (/^5\d{8}$/.test(digits)) return 'tel:0' + digits;
    return digits ? 'tel:' + digits : 'tel:';
  }

  // ─── Config ───
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      config = { ...config, ...data };
    } catch {
      /* use defaults */
    }
    applyConfig();
  }

  function applyConfig() {
    const waUrl = `https://wa.me/${config.whatsapp}`;
    const waMsg = encodeURIComponent('مرحباً، أتواصل معكم من موقع الهيف للخدمات العقارية');

    ['header-whatsapp', 'sticky-whatsapp', 'footer-whatsapp', 'footer-whatsapp-link', 'footer-whatsapp-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = `${waUrl}?text=${waMsg}`;
    });

    const phoneDisplay = formatPhoneDisplay(config.phone || config.whatsapp);
    const phoneHref = phoneTelHref(config.phone || config.whatsapp);
    const phoneEl = document.getElementById('footer-phone');
    if (phoneEl) {
      phoneEl.textContent = phoneDisplay;
      phoneEl.href = phoneHref;
    }

    const phoneBtn = document.getElementById('footer-phone-btn');
    if (phoneBtn) phoneBtn.href = phoneHref;

    const ig = document.getElementById('footer-instagram');
    if (ig) ig.href = config.instagram;

    const xEl = document.getElementById('footer-x');
    if (xEl) xEl.href = config.x;
  }

  function whatsappLink(message) {
    return `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}`;
  }

  // ─── Header ───
  function setupHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  function closeMobileMenu() {
    window.AlheefNav?.close?.();
  }

  function isVisitorMapHref(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return false;
      return url.pathname === '/map' || url.pathname === '/map.html' || url.pathname === '/private-offers' || url.pathname === '/board.html';
    } catch {
      return false;
    }
  }

  /** يخفي روابط الخريطة العامة وطلب الدخول؛ العروض الخاصة بالدعوة فقط */
  function ensureMapNavLink() {
    document.querySelectorAll('#nav-private-entry, #nav-map, #footer-private-entry, .nav__link--private-entry, .footer__link-item--private-entry').forEach((el) => {
      const item = el.closest('li') || el;
      item.remove();
    });
    document.querySelectorAll('a[href]').forEach((item) => {
      if (!isVisitorMapHref(item.getAttribute('href'))) return;
      const parent = item.closest('li');
      if (parent && parent.querySelectorAll('a').length === 1) parent.remove();
      else item.remove();
    });
  }

  // ─── Navigation ───
  function setupNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        closeMobileMenu();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ─── Scroll Reveal ───
  function setupReveal() {
    if (!('IntersectionObserver' in window)) {
      showAllRevealsFallback();
      return;
    }

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: isMobile ? 0.05 : 0.12,
        rootMargin: isMobile ? '0px 0px 0px 0px' : '0px 0px -40px 0px',
      }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

    setTimeout(showAllRevealsFallback, isMobile ? 800 : 2500);
  }

  // ─── Offers ───
  async function loadOffers() {
    const grid = document.getElementById('offers-grid');
    try {
      const res = await fetch('/api/offers');
      offers = await res.json();
    } catch {
      offers = [];
    }

    if (!offers.length) {
      grid.innerHTML = '<p class="loading">لا توجد عروض حالياً — تواصل معنا لمعرفة المتاح</p>';
      return;
    }

    grid.innerHTML = offers.map((offer, i) => renderOfferCard(offer, i)).join('');
    grid.querySelectorAll('.offer-card').forEach((card, i) => {
      card.classList.add('reveal');
      setTimeout(() => observeReveal(card), i * 80);
    });

    grid.querySelectorAll('[data-offer-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void openModal(btn.dataset.offerId);
      });
    });
  }

  function observeReveal(el) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible');
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
  }

  function renderOfferCard(offer, index) {
    const msg = `مرحباً، أستفسر عن: ${offer.title} — ${offer.location}`;
    const img = offer.image || '';
    const imageOpen = img
      ? `<button type="button" class="offer-card__image" data-offer-id="${escapeAttr(offer.id)}" aria-label="تفاصيل ${escapeAttr(offer.title)}">`
      : '<div class="offer-card__image">';
    const imageClose = img ? '</button>' : '</div>';
    return `
      <article class="offer-card" style="transition-delay:${index * 0.08}s">
        ${imageOpen}
          <img src="${escapeAttr(img)}" alt="${escapeAttr(offer.title)}" loading="lazy" decoding="async" width="640" height="400">
          <span class="offer-card__badge">${escapeHtml(offer.type)}</span>
        ${imageClose}
        <div class="offer-card__body">
          <h3 class="offer-card__title">${escapeHtml(offer.title)}</h3>
          <p class="offer-card__location">📍 ${escapeHtml(offer.location)}</p>
          <div class="offer-card__meta">
            <span class="offer-card__area">${offer.area ? `المساحة ${escapeHtml(formatArea(offer.area))}` : '—'}</span>
            <span class="offer-card__price">${escapeHtml(offer.price)} <span>ر.س</span></span>
          </div>
          <div class="offer-card__actions">
            <button type="button" class="btn btn-outline btn-sm" data-offer-id="${escapeAttr(offer.id)}">التفاصيل</button>
            <a href="${whatsappLink(msg)}" class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener">واتساب</a>
          </div>
        </div>
      </article>
    `;
  }

  // ─── Modal ───
  const gallery = {
    images: [],
    index: 0,
    tracking: false,
    dragging: false,
    startX: 0,
    startY: 0,
    dx: 0,
  };

  function offerImageList(offer) {
    const list = [];
    const push = (url) => {
      const value = String(url || '').trim();
      if (value && !list.includes(value)) list.push(value);
    };
    if (Array.isArray(offer.gallery)) offer.gallery.forEach((item) => push(item && item.url ? item.url : item));
    if (Array.isArray(offer.images)) offer.images.forEach((item) => push(item && item.url ? item.url : item));
    push(offer.coverImage);
    push(offer.image);
    return list;
  }

  function galleryWidth() {
    return document.getElementById('modal-gallery')?.clientWidth || 0;
  }

  function placeGallery(offset) {
    const track = document.getElementById('modal-gallery-track');
    if (!track) return;
    const shift = (-gallery.index * galleryWidth()) + (offset || 0);
    track.style.transform = `translateX(${shift}px)`;
  }

  function updateGalleryCount() {
    const count = document.getElementById('modal-gallery-count');
    const stage = document.getElementById('modal-gallery');
    if (!count || !stage) return;
    const many = gallery.images.length > 1;
    stage.classList.toggle('is-swipeable', many);
    count.hidden = !many;
    count.textContent = many ? `${gallery.index + 1} / ${gallery.images.length}` : '';
  }

  function renderGallery(offer) {
    const track = document.getElementById('modal-gallery-track');
    if (!track) return;
    gallery.images = offerImageList(offer);
    gallery.index = 0;
    gallery.tracking = false;
    gallery.dragging = false;
    gallery.dx = 0;
    track.classList.remove('is-dragging');
    track.innerHTML = gallery.images.map((url) => `
      <div class="modal__gallery-slide">
        <img src="${escapeAttr(url)}" alt="${escapeAttr(offer.title || '')}" draggable="false">
      </div>
    `).join('');
    placeGallery(0);
    updateGalleryCount();
  }

  function finishGalleryDrag() {
    const track = document.getElementById('modal-gallery-track');
    gallery.tracking = false;
    gallery.dragging = false;
    track?.classList.remove('is-dragging');
    const width = galleryWidth();
    if (gallery.images.length > 1 && width) {
      if (gallery.dx < -48 && gallery.index < gallery.images.length - 1) gallery.index += 1;
      else if (gallery.dx > 48 && gallery.index > 0) gallery.index -= 1;
    }
    gallery.dx = 0;
    placeGallery(0);
    updateGalleryCount();
  }

  function setupModal() {
    const modal = document.getElementById('offer-modal');
    if (!modal) return;

    const close = () => {
      finishGalleryDrag();
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
    };

    const track = document.getElementById('modal-gallery-track');
    track?.addEventListener('pointerdown', (event) => {
      if (gallery.images.length < 2 || event.button > 0) return;
      gallery.tracking = true;
      gallery.dragging = false;
      gallery.startX = event.clientX;
      gallery.startY = event.clientY;
      gallery.dx = 0;
    });
    track?.addEventListener('pointermove', (event) => {
      if (!gallery.tracking) return;
      const mx = event.clientX - gallery.startX;
      const my = event.clientY - gallery.startY;
      if (!gallery.dragging) {
        if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 8) {
          gallery.tracking = false;
          return;
        }
        if (Math.abs(mx) < 8) return;
        gallery.dragging = true;
        track.classList.add('is-dragging');
        try { track.setPointerCapture(event.pointerId); } catch { /* السحب يبقى على العنصر */ }
      }
      gallery.dx = mx;
      const atStart = gallery.index === 0 && mx > 0;
      const atEnd = gallery.index === gallery.images.length - 1 && mx < 0;
      placeGallery(atStart || atEnd ? mx * 0.35 : mx);
    });
    track?.addEventListener('pointerup', finishGalleryDrag);
    track?.addEventListener('pointercancel', finishGalleryDrag);
    window.addEventListener('resize', () => {
      if (modal.classList.contains('active')) placeGallery(0);
    });

    document.getElementById('modal-close')?.addEventListener('click', close);
    document.getElementById('modal-close-btn')?.addEventListener('click', close);
    document.getElementById('modal-backdrop')?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (!modal.classList.contains('active')) return;
      if (e.key === 'Escape') close();
      if (gallery.images.length < 2) return;
      if (e.key === 'ArrowLeft') {
        gallery.index = Math.min(gallery.images.length - 1, gallery.index + 1);
        placeGallery(0);
        updateGalleryCount();
      }
      if (e.key === 'ArrowRight') {
        gallery.index = Math.max(0, gallery.index - 1);
        placeGallery(0);
        updateGalleryCount();
      }
    });
  }

  function setModalText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '—';
  }

  function mergePublicProperty(offer, p) {
    const loc = p.location || [p.district, p.city].filter(Boolean).join(' — ');
    const area = formatArea(p.areaDisplay || p.area) || formatArea(offer.area) || '';
    const description = pickDescription(p);
    return {
      ...offer,
      id: p.id || offer.id,
      slug: p.slug || offer.slug,
      title: p.title || offer.title,
      type: p.propertyType || p.type || offer.type,
      location: loc || offer.location,
      area,
      price: p.price || offer.price,
      image: p.coverImage || p.image || offer.image,
      gallery: Array.isArray(p.gallery) ? p.gallery : offer.gallery,
      description,
      bedrooms: p.bedrooms ?? offer.bedrooms,
      bathrooms: p.bathrooms ?? offer.bathrooms,
      referenceNo: p.referenceNo || offer.referenceNo || '',
      city: p.city || offer.city || '',
      district: p.district || offer.district || '',
      listingType: p.listingType || offer.listingType || '',
      plotNumber: p.plotNumber || offer.plotNumber || '',
      planNumber: p.planNumber || offer.planNumber || '',
      streetWidth: p.streetWidth || offer.streetWidth || '',
      direction: p.direction || offer.direction || '',
    };
  }

  async function fetchFullOffer(offer) {
    const tryFetch = async (url) => {
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.json();
    };

    try {
      if (offer.slug) {
        const full = await tryFetch(`/api/properties/slug/${encodeURIComponent(offer.slug)}`);
        if (full) return mergePublicProperty(offer, full);
      }
      if (offer.id) {
        const full = await tryFetch(`/api/properties/id/${encodeURIComponent(offer.id)}`);
        if (full) return mergePublicProperty(offer, full);
      }
    } catch {
      /* استخدم البيانات المحلية */
    }
    return {
      ...offer,
      area: formatArea(offer.area) || offer.area || '',
      description: pickDescription(offer),
    };
  }

  async function openModal(id) {
    let offer = offers.find((o) => String(o.id) === String(id));
    if (!offer) return;

    offer = await fetchFullOffer(offer);

    renderGallery(offer);

    setModalText('modal-title', offer.title);

    const locLines = formatLocationLines(offer);
    setModalText('modal-location', locLines.primary);
    const locSub = document.getElementById('modal-location-sub');
    if (locSub) {
      if (locLines.secondary && locLines.secondary !== locLines.primary) {
        locSub.textContent = locLines.secondary;
        locSub.hidden = false;
      } else {
        locSub.textContent = '';
        locSub.hidden = true;
      }
    }

    const listingEl = document.getElementById('modal-listing');
    const listingLine = formatListingLine(offer);
    if (listingEl) {
      listingEl.textContent = listingLine;
      listingEl.hidden = !listingLine;
    }

    const descEl = document.getElementById('modal-desc');
    if (descEl) {
      descEl.textContent = buildDetailBody(offer);
      descEl.hidden = false;
    }

    setModalText('modal-type', offer.type);
    setModalText('modal-area', formatArea(offer.area) || '—');
    setModalText('modal-loc-short', locLines.primary || offer.location || '—');
    setModalText('modal-price', offer.price ? `${offer.price} ر.س` : '—');

    const detailLink = document.getElementById('modal-detail-link');
    if (detailLink) {
      if (offer.slug) {
        detailLink.href = `/property.html?slug=${encodeURIComponent(offer.slug)}`;
        detailLink.style.display = '';
      } else {
        detailLink.style.display = 'none';
      }
    }

    const msg = `مرحباً، أستفسر عن: ${offer.title} — ${offer.location} — ${offer.price} ر.س`;
    const wa = document.getElementById('modal-whatsapp');
    if (wa) wa.href = whatsappLink(msg);

    const modal = document.getElementById('offer-modal');
    modal?.classList.add('active');
    document.body.classList.add('modal-open');
  }

  // ─── Forms ───
  function setupPropertyChoices() {
    const choices = [...document.querySelectorAll('.property-choice')];
    if (!choices.length) return;
    let closeTimer = 0;

    function formOf(name) {
      return document.getElementById(name === 'list' ? 'list-form' : 'request-form');
    }

    function hasValue(form) {
      if (!form) return false;
      return [...form.querySelectorAll('input, select, textarea')].some((field) => {
        if (field.type === 'file') return field.files && field.files.length > 0;
        return String(field.value || '').trim() !== '';
      });
    }

    function closeAll() {
      window.clearTimeout(closeTimer);
      choices.forEach((choice) => {
        choice.classList.remove('is-open');
        choice.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.property-choice__form').forEach((form) => {
        form.hidden = true;
      });
    }

    function armClose(form) {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if (hasValue(form)) return;
        closeAll();
      }, 5000);
    }

    function openChoice(name) {
      const choice = choices.find((item) => item.dataset.choice === name);
      const form = formOf(name);
      if (!choice || !form) return;
      const already = choice.getAttribute('aria-expanded') === 'true';
      closeAll();
      if (already) return;
      choice.classList.add('is-open');
      choice.setAttribute('aria-expanded', 'true');
      form.hidden = false;
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      armClose(form);
    }

    choices.forEach((choice) => {
      choice.addEventListener('click', () => openChoice(choice.dataset.choice));
    });
    document.querySelectorAll('.property-choice__form').forEach((form) => {
      form.addEventListener('input', () => window.clearTimeout(closeTimer));
      form.addEventListener('change', () => window.clearTimeout(closeTimer));
    });
    document.querySelectorAll('a[href="#request"], a[href="#list"]').forEach((link) => {
      link.addEventListener('click', () => {
        const name = link.getAttribute('href') === '#list' ? 'list' : 'request';
        window.setTimeout(() => openChoice(name), 0);
      });
    });
    const hash = location.hash;
    if (hash === '#request' || hash === '#list') openChoice(hash.slice(1));
  }

  function setupSubscribeToggle() {
    const toggle = document.querySelector('.footer-subscribe__toggle');
    const form = document.getElementById('subscribe-form');
    if (!toggle || !form) return;
    form.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      form.hidden = open;
    });
  }

  function setupForms() {
    bindForm('request-form', '/api/request-property', 'request-message', collectJson);
    bindForm('subscribe-form', '/api/subscribe', 'subscribe-message', collectJson);
    bindForm('list-form', '/api/list-property', 'list-message', collectFormData);
  }

  function collectJson(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    return { body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } };
  }

  function collectFormData(form) {
    return { body: new FormData(form), headers: {} };
  }

  function bindForm(formId, endpoint, messageId, prepare) {
    const form = document.getElementById(formId);
    const msgEl = document.getElementById(messageId);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'جاري الإرسال...';
      hideMessage(msgEl);

      try {
        const { body, headers } = prepare(form);
        const res = await fetch(endpoint, { method: 'POST', headers, body });
        const data = await res.json();

        if (data.success) {
          showMessage(msgEl, data.message, 'success');
          form.reset();
          if (formId === 'list-form') clearFilePreview();
        } else {
          showMessage(msgEl, data.message || 'حدث خطأ، حاول مرة أخرى', 'error');
        }
      } catch {
        showMessage(msgEl, 'تعذر الاتصال بالخادم، تحقق من الاتصال', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  }

  function showMessage(el, text, type) {
    el.textContent = text;
    el.className = `form-message show ${type}`;
  }

  function hideMessage(el) {
    el.className = 'form-message';
  }

  function setupServicesReel() {
    const grid = document.querySelector('.home-page .services__grid');
    if (!grid || grid.dataset.reel === '1') return;
    const cards = [...grid.children].filter((card) => card.classList.contains('service-card'));
    if (cards.length < 2) return;
    grid.dataset.reel = '1';
    const track = document.createElement('div');
    track.className = 'services__track';
    cards.forEach((card) => track.appendChild(card));
    const clone = cards[0].cloneNode(true);
    clone.classList.add('service-card--clone');
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    grid.appendChild(track);

    const media = window.matchMedia('(max-width: 768px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0;
    let timer = 0;
    let paused = false;

    function place(animate) {
      const cardWidth = grid.clientWidth;
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      track.querySelectorAll('.service-card').forEach((card) => {
        card.style.width = cardWidth ? `${cardWidth}px` : '';
      });
      track.style.transition = animate ? 'transform .45s ease' : 'none';
      track.style.transform = media.matches && !motion.matches ? `translateX(${index * (cardWidth + gap)}px)` : '';
    }

    function schedule() {
      window.clearTimeout(timer);
      if (!media.matches || motion.matches) {
        index = 0;
        place(false);
        return;
      }
      timer = window.setTimeout(() => {
        if (paused || document.hidden) {
          schedule();
          return;
        }
        const total = grid.querySelectorAll('.service-card').length;
        index += 1;
        place(true);
        window.setTimeout(() => {
          if (index >= total - 1) {
            index = 0;
            place(false);
          }
          schedule();
        }, 460);
      }, 1000);
    }

    grid.addEventListener('pointerdown', () => { paused = true; });
    grid.addEventListener('pointerup', () => { paused = false; });
    grid.addEventListener('pointercancel', () => { paused = false; });
    media.addEventListener('change', () => {
      index = 0;
      place(false);
      schedule();
    });
    window.addEventListener('resize', () => {
      if (media.matches) place(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule();
    });
    place(false);
    schedule();
  }

  // ─── File Upload ───
  function setupFileUpload() {
    const input = document.getElementById('list-images');
    const drop = document.getElementById('file-drop');
    const preview = document.getElementById('file-preview');

    if (!input || !drop) return;

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('dragover');
    });

    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));

    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragover');
      input.files = e.dataTransfer.files;
      renderPreview(input.files, preview);
    });

    input.addEventListener('change', () => renderPreview(input.files, preview));
  }

  function renderPreview(files, container) {
    container.innerHTML = '';
    Array.from(files).slice(0, 6).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const item = document.createElement('div');
        item.className = 'file-preview__item';
        item.innerHTML = `<img src="${e.target.result}" alt="">`;
        container.appendChild(item);
      };
      reader.readAsDataURL(file);
    });
  }

  function clearFilePreview() {
    const preview = document.getElementById('file-preview');
    if (preview) preview.innerHTML = '';
  }
})();
