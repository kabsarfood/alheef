const crypto = require('crypto');

/** مسار الرابط الخاص الجديد — لا يكشف نوع الصفحة */
const PRIVATE_PATH_PREFIX = '/v';

/** يدعم الروابط القديمة /p/... مؤقتاً */
const PRIVATE_PAGE_RE = /^\/(?:v|p)\/([A-Za-z0-9_-]{8,64})\/?$/;

function generatePrivateSlug() {
  return crypto.randomBytes(18).toString('base64url');
}

function extractSlugFromPath(pathname) {
  const m = String(pathname || '').match(PRIVATE_PAGE_RE);
  return m ? m[1] : '';
}

function isPrivateOffersPagePath(pathname) {
  return PRIVATE_PAGE_RE.test(String(pathname || ''));
}

function siteBase(baseUrl) {
  return (baseUrl || process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://www.alheef.website').replace(/\/$/, '');
}

function buildPrivateShareUrl(slug, baseUrl) {
  const token = String(slug || '').trim();
  return `${siteBase(baseUrl)}${PRIVATE_PATH_PREFIX}/${token}`;
}

function buildClientPortalUrl(phone, baseUrl) {
  const local = String(phone || '').trim();
  const url = new URL(`${siteBase(baseUrl)}/user/login.html`);
  if (local) url.searchParams.set('phone', local);
  return url.toString();
}

function clientWelcomeMessage(portalUrl) {
  return [
    'أهلاً بكم في الهيف العقارية — أبو فهد الشمالي.',
    'بإمكانكم الدخول إلى العروض العقارية من خلال الرابط:',
    String(portalUrl || '').trim(),
  ].filter(Boolean).join('\n');
}

module.exports = {
  PRIVATE_PATH_PREFIX,
  PRIVATE_PAGE_RE,
  generatePrivateSlug,
  extractSlugFromPath,
  isPrivateOffersPagePath,
  buildPrivateShareUrl,
  buildClientPortalUrl,
  clientWelcomeMessage,
};
