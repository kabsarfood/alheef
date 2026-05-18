/**
 * الهيف للخدمات العقارية — Frontend
 */

(function () {
  'use strict';

  let config = {
    whatsapp: '966500000000',
    phone: '050 000 0000',
    instagram: '#',
    x: '#',
  };

  let offers = [];

  // ─── Init ───
  document.addEventListener('DOMContentLoaded', init);

  let siteSettings = null;

  async function init() {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    setupHeader();
    setupNavigation();
    setupReveal();
    showAllRevealsFallback();

    try {
      await loadSiteSettings();
      await loadConfig();
      await loadOffers();
      await loadTestimonials();
      setupForms();
      setupFileUpload();
      setupModal();
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
    setText('hero-btn-offers', s.hero?.btnOffers);
    setText('hero-btn-request', s.hero?.btnRequest);

    const heroImg = document.getElementById('hero-image');
    const heroSrc = window.matchMedia('(max-width: 768px)').matches && s.heroMobileImage
      ? s.heroMobileImage
      : s.heroImage;
    if (heroImg && heroSrc) {
      heroImg.src = withCacheBust(heroSrc, v);
      heroImg.removeAttribute('srcset');
      heroImg.removeAttribute('sizes');
    }

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
    const img = s.heroImage || s.logo || '';

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
    } catch {
      grid.closest('section')?.remove();
    }
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

    ['header-whatsapp', 'footer-whatsapp', 'footer-whatsapp-link'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.href = `${waUrl}?text=${waMsg}`;
    });

    const phoneEl = document.getElementById('footer-phone');
    if (phoneEl) {
      phoneEl.textContent = config.phone;
      phoneEl.href = `tel:+${config.whatsapp}`;
    }

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
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');
    const overlay = document.getElementById('nav-overlay');

    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    function setMenuOpen(open) {
      if (!toggle || !nav) return;
      toggle.classList.toggle('active', open);
      nav.classList.toggle('open', open);
      overlay?.classList.toggle('active', open);
      document.documentElement.classList.toggle('nav-open', open);
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
      overlay?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    if (!toggle) return;

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(!nav.classList.contains('open'));
    });

    overlay?.addEventListener('click', () => setMenuOpen(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) setMenuOpen(false);
    });
  }

  function closeMobileMenu() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('menu-toggle');
    const overlay = document.getElementById('nav-overlay');
    if (!nav || !toggle) return;
    nav.classList.remove('open');
    toggle.classList.remove('active');
    overlay?.classList.remove('active');
    document.documentElement.classList.remove('nav-open');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    overlay?.setAttribute('aria-hidden', 'true');
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
      btn.addEventListener('click', () => openModal(btn.dataset.offerId));
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
    return `
      <article class="offer-card" style="transition-delay:${index * 0.08}s">
        <div class="offer-card__image">
          <img src="${offer.image}" alt="${offer.title}" loading="lazy" decoding="async" width="640" height="400">
          <span class="offer-card__badge">${offer.type}</span>
        </div>
        <div class="offer-card__body">
          <h3 class="offer-card__title">${offer.title}</h3>
          <p class="offer-card__location">📍 ${offer.location}</p>
          <div class="offer-card__meta">
            <span class="offer-card__area">${offer.area}</span>
            <span class="offer-card__price">${offer.price} <span>ر.س</span></span>
          </div>
          <div class="offer-card__actions">
            <button class="btn btn-outline btn-sm" data-offer-id="${offer.id}">التفاصيل</button>
            <a href="${whatsappLink(msg)}" class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener">واتساب</a>
          </div>
        </div>
      </article>
    `;
  }

  // ─── Modal ───
  function setupModal() {
    const modal = document.getElementById('offer-modal');
    const close = () => modal.classList.remove('active');

    document.getElementById('modal-close').addEventListener('click', close);
    document.getElementById('modal-close-btn').addEventListener('click', close);
    document.getElementById('modal-backdrop').addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  function openModal(id) {
    const offer = offers.find((o) => String(o.id) === String(id));
    if (!offer) return;

    document.getElementById('modal-img').src = offer.image;
    document.getElementById('modal-img').alt = offer.title;
    document.getElementById('modal-title').textContent = offer.title;
    document.getElementById('modal-location').textContent = offer.location;
    document.getElementById('modal-type').textContent = offer.type;
    document.getElementById('modal-area').textContent = offer.area;
    document.getElementById('modal-loc-short').textContent = offer.location.split('—')[0]?.trim() || offer.location;
    document.getElementById('modal-price').textContent = `${offer.price} ر.س`;

    const msg = `مرحباً، أستفسر عن: ${offer.title} — ${offer.location} — ${offer.price} ر.س`;
    document.getElementById('modal-whatsapp').href = whatsappLink(msg);

    document.getElementById('offer-modal').classList.add('active');
  }

  // ─── Forms ───
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
