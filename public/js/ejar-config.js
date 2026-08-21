/**
 * Ejar service contact — single source of truth for /ejar page.
 * Change the number here only; all tel/WhatsApp links read from this file.
 */
(function (global) {
  var EJAR_SERVICE_PHONE = '0530792754';

  /** Digits-only for tel: / wa.me */
  var EJAR_SERVICE_PHONE_TEL = '0530792754';

  /** International WhatsApp format without + (966XXXXXXXXX) */
  var EJAR_SERVICE_WHATSAPP = '966530792754';

  global.EJAR_SERVICE_PHONE = EJAR_SERVICE_PHONE;
  global.EJAR_SERVICE_PHONE_TEL = EJAR_SERVICE_PHONE_TEL;
  global.EJAR_SERVICE_WHATSAPP = EJAR_SERVICE_WHATSAPP;
})(typeof window !== 'undefined' ? window : global);
