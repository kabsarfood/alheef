(function () {
  'use strict';

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];
  var ATTRIBUTION_KEY = 'ejar_attribution';
  var LEADS_KEY = 'ejar_leads_pending';
  var selectedContract = null;

  var WA_MSG_DEFAULT = 'السلام عليكم، أرغب في إنشاء عقد إيجار عن طريق مكتب الهيف للخدمات العقارية.';

  function getPrices() {
    return {
      residential: window.EJAR_PRICE_RESIDENTIAL || 229,
      commercial: window.EJAR_PRICE_COMMERCIAL || 329,
    };
  }

  function getWhatsAppMessages() {
    var prices = getPrices();
    return {
      residential: 'السلام عليكم، أرغب في إنشاء عقد إيجار سكني بسعر ' + prices.residential + ' ريال شامل الرسوم.',
      commercial: 'السلام عليكم، أرغب في إنشاء عقد إيجار تجاري بسعر ' + prices.commercial + ' ريال شامل الرسوم للسنة الأولى.',
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

  function buildContractWhatsAppMessage(data) {
    var lines = [
      'السلام عليكم، أرغب في إنشاء عقد إيجار عن طريق مكتب الهيف للخدمات العقارية.',
      '',
      'الاسم: ' + (data.name || ''),
      'رقم الجوال: ' + (data.phone || ''),
      'نوع العقد: ' + (data.contractType || ''),
      'المدينة: ' + (data.city || ''),
    ];
    if (data.role) {
      lines.push('الصفة: ' + data.role);
    }
    lines.push('', 'أرغب في استكمال إجراءات إنشاء العقد.');
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

  function scrollToForm(preselect) {
    var form = document.getElementById('ejar-form');
    var select = document.getElementById('ejar-contract-type');
    if (preselect && select) {
      select.value = preselect === 'residential' ? 'سكني' : 'تجاري';
      selectedContract = preselect;
      applyPhoneDisplays();
    }
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var first = form.querySelector('input, select');
      if (first) first.focus({ preventScroll: true });
    }
    trackEvent('ejar_start_contract', { contractType: preselect || null });
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
        scrollToForm(type);
      });
    });
  }

  function setupStartButtons() {
    document.querySelectorAll('[data-ejar-start]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (btn.tagName === 'A' && btn.getAttribute('href') === '#ejar-form') {
          e.preventDefault();
        }
        scrollToForm();
      });
    });
  }

  function setupContractTypeSelect() {
    var select = document.getElementById('ejar-contract-type');
    if (!select) return;
    select.addEventListener('change', function () {
      if (select.value === 'سكني') {
        selectedContract = 'residential';
        trackEvent('ejar_residential_select');
      } else if (select.value === 'تجاري') {
        selectedContract = 'commercial';
        trackEvent('ejar_commercial_select');
      } else {
        selectedContract = null;
      }
      applyPhoneDisplays();
    });
  }

  function setupForm() {
    var form = document.getElementById('ejar-request-form');
    var msgEl = document.getElementById('ejar-form-message');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      var name = (form.elements.name && form.elements.name.value || '').trim();
      var phoneRaw = (form.elements.phone && form.elements.phone.value || '').trim();
      var city = (form.elements.city && form.elements.city.value || '').trim();
      var contractType = (form.elements.contractType && form.elements.contractType.value || '').trim();
      var role = (form.elements.role && form.elements.role.value || '').trim();

      if (!contractType || !name || !city || !role) {
        showMessage(msgEl, 'يرجى تعبئة جميع الحقول المطلوبة', 'error');
        return;
      }
      if (!isValidSaudiMobile(phoneRaw)) {
        showMessage(msgEl, 'يرجى إدخال رقم جوال سعودي صحيح (مثال: 05xxxxxxxx)', 'error');
        return;
      }

      var phone = normalizeSaudiMobile(phoneRaw);
      var payload = {
        customerName: name,
        customerPhone: phone,
        requestType: 'ejar_contract',
        message: JSON.stringify({
          contractType: contractType,
          city: city,
          role: role,
          attribution: getAttribution(),
        }),
      };

      var waMessage = buildContractWhatsAppMessage({
        name: name,
        phone: phone,
        contractType: contractType,
        city: city,
        role: role,
      });
      var waUrl = whatsappUrl(waMessage);
      var pendingWa = null;
      if (!isMobileDevice()) {
        try { pendingWa = window.open('about:blank', '_blank'); } catch (_) { pendingWa = null; }
      }

      btn.disabled = true;
      var originalText = btn.textContent;
      btn.textContent = 'جاري الإرسال...';
      hideMessage(msgEl);

      fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.data && result.data.success) {
            trackEvent('ejar_form_submit', { contractType: contractType, role: role });
            showMessage(msgEl, 'تم حفظ طلبك، جاري فتح واتساب لاستكمال الإجراءات', 'success');
            form.reset();
            selectedContract = null;
            applyPhoneDisplays();
            openWhatsApp(waUrl, pendingWa);
            return;
          }
          throw new Error((result.data && result.data.message) || 'تعذر إرسال الطلب');
        })
        .catch(function () {
          saveLocalLead(payload);
          trackEvent('ejar_form_submit', { contractType: contractType, role: role, offline: true });
          showMessage(msgEl, 'تم حفظ طلبك، جاري فتح واتساب لاستكمال الإجراءات', 'success');
          form.reset();
          openWhatsApp(waUrl, pendingWa);
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = originalText;
        });
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

  function init() {
    captureAttribution();
    applyPriceDisplays();
    applyPhoneDisplays();
    setupContractButtons();
    setupStartButtons();
    setupContractTypeSelect();
    setupForm();
    setupHeaderWhatsApp();

    bindClickTracking('[data-ejar-tel]', 'ejar_call_click');
    bindClickTracking('[data-ejar-wa]', 'ejar_whatsapp_click');

    var yearEls = document.querySelectorAll('.ejar-year, #year, .footer__year');
    var year = String(new Date().getFullYear());
    yearEls.forEach(function (el) { el.textContent = year; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
