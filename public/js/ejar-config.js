/**
 * Ejar service contact — single source of truth for /ejar page.
 * Change the number here only; all tel/WhatsApp links read from this file.
 */
(function (global) {
  // TODO: Replace with dedicated Alheef Ejar service number before production launch
  var EJAR_SERVICE_PHONE = '05X XXX XXXX';

  /** Digits-only for tel: / wa.me (update when real number is assigned) */
  var EJAR_SERVICE_PHONE_TEL = '0500000000';

  /** International WhatsApp format without + (966XXXXXXXXX) */
  var EJAR_SERVICE_WHATSAPP = '966500000000';

  global.EJAR_SERVICE_PHONE = EJAR_SERVICE_PHONE;
  global.EJAR_SERVICE_PHONE_TEL = EJAR_SERVICE_PHONE_TEL;
  global.EJAR_SERVICE_WHATSAPP = EJAR_SERVICE_WHATSAPP;
})(typeof window !== 'undefined' ? window : global);
