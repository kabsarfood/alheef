/**
 * عرض اليوم الوطني: 23–25 سبتمبر 2026 بتوقيت الرياض، ثم يختفي.
 */
(function (global) {
  var UNTIL = Date.parse('2026-09-26T00:00:00+03:00');
  global.EJAR_NATIONAL_OFFER_UNTIL = UNTIL;
  global.EJAR_NATIONAL_OFFER_ACTIVE = Date.now() < UNTIL;
  if (global.EJAR_NATIONAL_OFFER_ACTIVE) {
    global.EJAR_PRICE_RESIDENTIAL = 199;
    global.EJAR_PRICE_COMMERCIAL = 299;
  } else {
    global.EJAR_PRICE_RESIDENTIAL = 229;
    global.EJAR_PRICE_COMMERCIAL = 329;
  }

  function applyOfferChrome() {
    var bar = document.getElementById('ejar-national-offer');
    if (bar && !global.EJAR_NATIONAL_OFFER_ACTIVE) bar.remove();
    if (global.EJAR_NATIONAL_OFFER_ACTIVE) return;
    document.querySelectorAll('[data-regular-price]').forEach(function (el) {
      var regular = el.getAttribute('data-regular-price');
      if (regular) el.textContent = regular;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyOfferChrome);
  } else {
    applyOfferChrome();
  }
})(window);
