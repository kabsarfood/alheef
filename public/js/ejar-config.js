/**
 * Ejar service contact — single source of truth for /ejar page.
 * Change the number here only; all tel/WhatsApp links read from this file.
 */
(function (global) {
  var EJAR_SERVICE_PHONE = '055 839 1249';

  /** Digits-only for tel: / wa.me */
  var EJAR_SERVICE_PHONE_TEL = '0558391249';

  /** International WhatsApp format without + (966XXXXXXXXX) */
  var EJAR_SERVICE_WHATSAPP = '966558391249';

  /** Service prices (SAR) — single source for /ejar page */
  var EJAR_PRICE_RESIDENTIAL = 229;
  var EJAR_PRICE_COMMERCIAL = 329;

  global.EJAR_SERVICE_PHONE = EJAR_SERVICE_PHONE;
  global.EJAR_SERVICE_PHONE_TEL = EJAR_SERVICE_PHONE_TEL;
  global.EJAR_SERVICE_WHATSAPP = EJAR_SERVICE_WHATSAPP;
  global.EJAR_PRICE_RESIDENTIAL = EJAR_PRICE_RESIDENTIAL;
  global.EJAR_PRICE_COMMERCIAL = EJAR_PRICE_COMMERCIAL;

  /** Suggested WhatsApp Business greeting — set this in WhatsApp; the site does not auto-reply. */
  global.EJAR_WA_WELCOME = 'وعليكم السلام ورحمة الله وبركاته، أهلاً بكم في مكتب الهيف العقارية. نحن وسيط عقاري مرخص لإنشاء وتوثيق العقود السكنية والتجارية عبر منصة إيجار.';
})(typeof window !== 'undefined' ? window : global);
