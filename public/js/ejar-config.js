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

  /** Ejar network membership & FAL license — /ejar credentials section */
  var EJAR_NETWORK_MEMBERSHIP = '40365788';
  var FAL_BROKERAGE_LICENSE = '1200021454';
  var REGA_LICENSE_VERIFY_URL = 'https://rega.gov.sa/rega-services/real-estate-inquiries/';

  /** Official logo paths only — leave empty until official assets are added to /public/images/credentials/ */
  var EJAR_LOGO_URL = '';
  var REGA_LOGO_URL = '';

  global.EJAR_SERVICE_PHONE = EJAR_SERVICE_PHONE;
  global.EJAR_SERVICE_PHONE_TEL = EJAR_SERVICE_PHONE_TEL;
  global.EJAR_SERVICE_WHATSAPP = EJAR_SERVICE_WHATSAPP;
  global.EJAR_NETWORK_MEMBERSHIP = EJAR_NETWORK_MEMBERSHIP;
  global.FAL_BROKERAGE_LICENSE = FAL_BROKERAGE_LICENSE;
  global.REGA_LICENSE_VERIFY_URL = REGA_LICENSE_VERIFY_URL;
  global.EJAR_LOGO_URL = EJAR_LOGO_URL;
  global.REGA_LOGO_URL = REGA_LOGO_URL;
})(typeof window !== 'undefined' ? window : global);
