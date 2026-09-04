(function () {
  'use strict';

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];
  var ATTRIBUTION_KEY = 'ejar_attribution';
  var LEADS_KEY = 'ejar_leads_pending';
  var selectedContract = null;

  var WA_MSG_DEFAULT = 'السلام عليكم، لدي استفسار قبل إنشاء العقد عبر مؤسسة الهيف للخدمات العقارية.';

  function getPrices() {
    return {
      residential: window.EJAR_PRICE_RESIDENTIAL || 229,
      commercial: window.EJAR_PRICE_COMMERCIAL || 329,
    };
  }

  function getWhatsAppMessages() {
    return {
      residential: WA_MSG_DEFAULT,
      commercial: WA_MSG_DEFAULT,
    };
  }

  function getConfig() {
    return {
      phone: window.EJAR_SERVICE_PHONE || '055 839 1249',
      phoneTel: window.EJAR_SERVICE_PHONE_TEL || '0558391249',
      whatsapp: window.EJAR_SERVICE_WHATSAPP || '966558391249',
    };
  }

  function trackEvent(name, data) {
    data = data || {};
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, data));
    } catch (_) { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent('alheef:ejar', { detail: Object.assign({ event: name }, data) }));
    } catch (_) { /* noop */ }
  }

  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var stored = {};
    try {
      stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || '{}');
    } catch (_) {
      stored = {};
    }
    var updated = false;
    UTM_KEYS.forEach(function (key) {
      var val = params.get(key);
      if (val) {
        stored[key] = val;
        updated = true;
      }
    });
    if (updated) {
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(stored));
    }
    return stored;
  }

  function getAttribution() {
    try {
      return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function normalizeSaudiMobile(input) {
    var digits = String(input || '').replace(/\D/g, '');
    if (/^9665\d{8}$/.test(digits)) return '0' + digits.slice(3);
    if (/^05\d{8}$/.test(digits)) return digits;
    if (/^5\d{8}$/.test(digits)) return '0' + digits;
    return digits;
  }

  function isValidSaudiMobile(input) {
    return /^05\d{8}$/.test(normalizeSaudiMobile(input));
  }

  function whatsappUrl(message) {
    var cfg = getConfig();
    var text = encodeURIComponent(message || WA_MSG_DEFAULT);
    return 'https://wa.me/' + String(cfg.whatsapp).replace(/\D/g, '') + '?text=' + text;
  }

  function isMobileDevice() {
    var ua = navigator.userAgent || '';
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function openWhatsApp(url, pendingWin) {
    if (!url) return;
    if (pendingWin && !pendingWin.closed) {
      try {
        pendingWin.location.replace(url);
        pendingWin.opener = null;
        return;
      } catch (_) { /* fall through */ }
    }
    if (isMobileDevice()) {
      window.location.assign(url);
      return;
    }
    var win = window.open(url, '_blank');
    if (win) {
      try { win.opener = null; } catch (_) { /* noop */ }
      return;
    }
    window.location.assign(url);
  }

  function buildInquiryWhatsAppMessage(data) {
    var lines = [
      'السلام عليكم، لدي استفسار قبل إنشاء العقد عبر مؤسسة الهيف للخدمات العقارية.',
      '',
      'الاسم: ' + (data.name || ''),
      'رقم الجوال: ' + (data.phone || ''),
      'الاستفسار: ' + (data.inquiry || ''),
    ];
    return lines.join('\n');
  }

  function telUrl() {
    return 'tel:' + String(getConfig().phoneTel).replace(/\D/g, '');
  }

  function getWhatsAppMessage() {
    var msgs = getWhatsAppMessages();
    if (selectedContract === 'residential') return msgs.residential;
    if (selectedContract === 'commercial') return msgs.commercial;
    return WA_MSG_DEFAULT;
  }

  function applyPriceDisplays() {
    var prices = getPrices();
    document.querySelectorAll('[data-ejar-price="residential"]').forEach(function (el) {
      var suffix = el.querySelector('small');
      el.textContent = String(prices.residential) + ' ';
      if (suffix) el.appendChild(suffix);
    });
    document.querySelectorAll('[data-ejar-price="commercial"]').forEach(function (el) {
      var suffix = el.querySelector('small');
      el.textContent = String(prices.commercial) + ' ';
      if (suffix) el.appendChild(suffix);
    });
  }

  function applyPhoneDisplays() {
    var cfg = getConfig();
    document.querySelectorAll('[data-ejar-phone]').forEach(function (el) {
      el.textContent = cfg.phone;
    });
    document.querySelectorAll('[data-ejar-tel]').forEach(function (el) {
      el.href = telUrl();
    });
    document.querySelectorAll('[data-ejar-wa]').forEach(function (el) {
      el.href = whatsappUrl(el.getAttribute('data-wa-msg') || getWhatsAppMessage());
    });
  }

  function bindClickTracking(selector, eventName, extra) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('click', function () {
        trackEvent(eventName, extra || {});
      });
    });
  }

  function scrollToForm() {
    var form = document.getElementById('ejar-form');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = form.querySelector('input, textarea, select');
      if (first) first.focus({ preventScroll: true });
    }
  }

  function saveLocalLead(payload) {
    var leads = [];
    try {
      leads = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]');
    } catch (_) {
      leads = [];
    }
    leads.push(Object.assign({}, payload, { savedAt: new Date().toISOString() }));
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
  }

  function setupContractButtons() {
    document.querySelectorAll('[data-ejar-contract]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.getAttribute('data-ejar-contract');
        selectedContract = type;
        applyPhoneDisplays();
        trackEvent(type === 'residential' ? 'ejar_residential_select' : 'ejar_commercial_select');
        if (window.EjarWizard && typeof window.EjarWizard.open === 'function') {
          window.EjarWizard.open(type);
          trackEvent('ejar_start_contract', { contractType: type, wizard: true });
          return;
        }
        scrollToForm();
      });
    });
  }

  function setupStartButtons() {
    document.querySelectorAll('[data-ejar-start]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (btn.tagName === 'A') e.preventDefault();
        if (window.EjarWizard && typeof window.EjarWizard.open === 'function') {
          window.EjarWizard.open();
          trackEvent('ejar_start_contract', { contractType: null, wizard: true });
          return;
        }
        scrollToForm();
      });
    });
  }

  function setupForm() {
    var msgEl = document.getElementById('ejar-form-message');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      var name = (form.elements.name && form.elements.name.value || '').trim();
      var phoneRaw = (form.elements.phone && form.elements.phone.value || '').trim();
      var inquiry = (form.elements.inquiry && form.elements.inquiry.value || '').trim();

      if (!name || !inquiry) {
        showMessage(msgEl, 'يرجى تعبئة الاسم والاستفسار', 'error');
        return;
      }
      if (!isValidSaudiMobile(phoneRaw)) {
        showMessage(msgEl, 'يرجى إدخال رقم جوال سعودي صحيح (مثال: 05xxxxxxxx)', 'error');
        return;
      }

      var phone = normalizeSaudiMobile(phoneRaw);
      var waMessage = buildInquiryWhatsAppMessage({
        name: name,
        phone: phone,
        inquiry: inquiry,
      });
      var waUrl = whatsappUrl(waMessage);
      var pendingWa = null;
      if (!isMobileDevice()) {
        try { pendingWa = window.open('about:blank', '_blank'); } catch (_) { pendingWa = null; }
      }

      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = 'جاري فتح واتساب...';
      hideMessage(msgEl);
      trackEvent('ejar_inquiry_whatsapp', { source: 'form' });
      showMessage(msgEl, 'جاري فتح واتساب لإرسال استفسارك إلى فريق مؤسسة الهيف للخدمات العقارية', 'success');
      form.reset();
      openWhatsApp(waUrl, pendingWa);
      window.setTimeout(function () {
        btn.disabled = false;
        btn.textContent = originalText;
      }, 600);
    });
  }

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = 'form-message show ' + type;
  }

  function hideMessage(el) {
    if (!el) return;
    el.className = 'form-message';
  }

  function setupHeaderWhatsApp() {
    var headerWa = document.getElementById('header-whatsapp');
    if (headerWa) {
      headerWa.href = whatsappUrl(WA_MSG_DEFAULT);
      headerWa.addEventListener('click', function () {
        trackEvent('ejar_whatsapp_click', { location: 'header' });
      });
    }
  }

  function applySiteLogo() {
    fetch('/api/settings')
      .then(function (res) { return res.json(); })
      .then(function (s) {
        if (!s || !s.logo) return;
        var src = s.logo;
        var v = s.updatedAt || Date.now();
        src += (src.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(v);
        ['site-logo', 'footer-logo'].forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          el.src = src;
          if (s.siteName) el.alt = s.siteName;
        });
      })
      .catch(function () { /* keep default logo */ });
  }

  function wizardKindFromHomeLink() {
    try {
      var params = new URLSearchParams(window.location.search);
      var create = String(params.get('create') || '').trim().toLowerCase();
      if (create === 'commercial' || create === 'residential') return create;
      if (create === '1' || create === 'true' || create === 'start') return '';
    } catch (_) { /* noop */ }
    var hash = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    if (hash === 'create' || hash === 'ejar-start' || hash === 'start') return '';
    return null;
  }

  function clearHomeCreateParam() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('create') && !/^#(create|ejar-start|start)$/i.test(url.hash)) return;
      url.searchParams.delete('create');
      url.hash = '';
      var next = url.pathname + url.search;
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', next);
      }
    } catch (_) { /* noop */ }
  }

  function openWizardFromHome() {
    var kind = wizardKindFromHomeLink();
    if (kind == null) return;
    if (!window.EjarWizard || typeof window.EjarWizard.open !== 'function') return;
    window.EjarWizard.open(kind || undefined, { fromHome: true });
    trackEvent('ejar_start_contract', { contractType: kind || null, wizard: true, from: 'home' });
    clearHomeCreateParam();
  }

  function init() {
    captureAttribution();
    applySiteLogo();
    applyPriceDisplays();
    applyPhoneDisplays();
    setupContractButtons();
    setupStartButtons();
    setupForm();
    setupHeaderWhatsApp();

    bindClickTracking('[data-ejar-tel]', 'ejar_call_click');
    bindClickTracking('[data-ejar-wa]', 'ejar_whatsapp_click');

    var yearEls = document.querySelectorAll('.ejar-year, #year, .footer__year');
    var year = String(new Date().getFullYear());
    yearEls.forEach(function (el) { el.textContent = year; });

    openWizardFromHome();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
