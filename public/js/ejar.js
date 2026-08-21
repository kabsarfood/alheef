(function () {
  'use strict';

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];
  var ATTRIBUTION_KEY = 'ejar_attribution';
  var LEADS_KEY = 'ejar_leads_pending';
  var selectedContract = null;

  var WA_MSG_DEFAULT = 'السلام عليكم، أرغب في إنشاء عقد إيجار عن طريق مكتب الهيف للخدمات العقارية.';
  var WA_MSG_RESIDENTIAL = 'السلام عليكم، أرغب في إنشاء عقد إيجار سكني بسعر 199 ريال شامل الرسوم.';
  var WA_MSG_COMMERCIAL = 'السلام عليكم، أرغب في إنشاء عقد إيجار تجاري بسعر 299 ريال شامل الرسوم للسنة الأولى.';

  function getConfig() {
    return {
      phone: window.EJAR_SERVICE_PHONE || '05X XXX XXXX',
      phoneTel: window.EJAR_SERVICE_PHONE_TEL || '0500000000',
      whatsapp: window.EJAR_SERVICE_WHATSAPP || '966500000000',
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

  function telUrl() {
    return 'tel:' + String(getConfig().phoneTel).replace(/\D/g, '');
  }

  function getWhatsAppMessage() {
    if (selectedContract === 'residential') return WA_MSG_RESIDENTIAL;
    if (selectedContract === 'commercial') return WA_MSG_COMMERCIAL;
    return WA_MSG_DEFAULT;
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

  function applyCredentials() {
    var membership = window.EJAR_NETWORK_MEMBERSHIP;
    var falLicense = window.FAL_BROKERAGE_LICENSE;
    var verifyUrl = window.REGA_LICENSE_VERIFY_URL;
    var ejarLogo = window.EJAR_LOGO_URL;
    var regaLogo = window.REGA_LOGO_URL;

    document.querySelectorAll('[data-ejar-membership]').forEach(function (el) {
      if (membership) el.textContent = membership;
    });
    document.querySelectorAll('[data-fal-license]').forEach(function (el) {
      if (falLicense) el.textContent = falLicense;
    });
    document.querySelectorAll('[data-rega-verify]').forEach(function (el) {
      if (verifyUrl) el.href = verifyUrl;
    });

    var ejarImg = document.querySelector('[data-ejar-logo="ejar"]');
    if (ejarImg && ejarLogo) {
      ejarImg.src = ejarLogo;
      ejarImg.hidden = false;
      ejarImg.onerror = function () { ejarImg.hidden = true; };
    }

    var regaImg = document.querySelector('[data-ejar-logo="rega"]');
    if (regaImg && regaLogo) {
      regaImg.src = regaLogo;
      regaImg.hidden = false;
      regaImg.onerror = function () { regaImg.hidden = true; };
    }
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
            showMessage(msgEl, result.data.message || 'تم استلام طلبك بنجاح، سنتواصل معك قريباً', 'success');
            form.reset();
            selectedContract = null;
            applyPhoneDisplays();
            return;
          }
          throw new Error((result.data && result.data.message) || 'تعذر إرسال الطلب');
        })
        .catch(function () {
          saveLocalLead(payload);
          trackEvent('ejar_form_submit', { contractType: contractType, role: role, offline: true });
          showMessage(msgEl, 'تم حفظ طلبك وسنتواصل معك في أقرب وقت', 'success');
          form.reset();
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
    applyPhoneDisplays();
    applyCredentials();
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
