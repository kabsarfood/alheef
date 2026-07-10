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

function buildPrivateShareUrl(slug, baseUrl) {
  const base = (baseUrl || process.env.SITE_URL || 'https://www.alheef.website').replace(/\/$/, '');
  const token = String(slug || '').trim();
  return `${base}${PRIVATE_PATH_PREFIX}/${token}`;
}

module.exports = {
  PRIVATE_PATH_PREFIX,
  PRIVATE_PAGE_RE,
  generatePrivateSlug,
  extractSlugFromPath,
  isPrivateOffersPagePath,
  buildPrivateShareUrl,
};
