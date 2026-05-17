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
    document.getElementById('year').textContent = new Date().getFullYear();
    await loadSiteSettings();
    await loadConfig();
    setupHeader();
    setupNavigation();
    setupReveal();
    await loadOffers();
    setupForms();
    setupFileUpload();
    setupModal();
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

  function applySiteSettings() {
    if (!siteSettings) return;
    const s = siteSettings;
    const c = s.colors || {};

    if (s.siteName) {
      document.title = s.siteName;
      const pt = document.getElementById('page-title');
      if (pt) pt.textContent = s.siteName;
    }

    const logo = document.getElementById('site-logo');
    if (logo && s.logo) {
      logo.src = s.logo;
      logo.alt = s.siteName || logo.alt;
    }

    setText('hero-label', s.hero?.label);
    setText('hero-title', s.hero?.title);
    setText('hero-desc', s.hero?.description);
    setText('hero-btn-offers', s.hero?.btnOffers);
    setText('hero-btn-request', s.hero?.btnRequest);

    const heroImg = document.getElementById('hero-image');
    if (heroImg && s.heroImage) {
      heroImg.src = s.heroImage;
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
      toggle.classList.toggle('active', open);
      nav.classList.toggle('open', open);
      overlay?.classList.toggle('active', open);
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
      overlay?.setAttribute('aria-hidden', open ? 'false' : 'true');
    }

    toggle.addEventListener('click', () => {
      setMenuOpen(!nav.classList.contains('open'));
    });

    overlay?.addEventListener('click', () => setMenuOpen(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) setMenuOpen(false);
    });
  }

  // ─── Navigation ───
  function setupNavigation() {
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
        const nav = document.getElementById('nav');
        const toggle = document.getElementById('menu-toggle');
        const overlay = document.getElementById('nav-overlay');
        nav.classList.remove('open');
        toggle.classList.remove('active');
        overlay?.classList.remove('active');
        document.body.classList.remove('nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ─── Scroll Reveal ───
  function setupReveal() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
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
      btn.addEventListener('click', () => openModal(Number(btn.dataset.offerId)));
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
    const offer = offers.find((o) => o.id === id);
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
