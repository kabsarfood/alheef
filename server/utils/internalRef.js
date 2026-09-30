/**
 * رقم الهيف الداخلي.
 * عقارات المهدية: H-MHD-000001
 * الرقم فريد ولا يتغير بعد منحه.
 * الرقم التالي هو أعلى رقم قائم + 1، لذلك لا تُملأ فجوة أقدم من آخر رقم.
 * reference_no يبقى رقم الترخيص ولا يُنسخ إلى هنا.
 */

const MAHDIA_RE = /^H-MHD-(\d{6})$/;

function normalizeArabic(value) {
  return String(value || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

function isMahdiaDistrict(district) {
  return normalizeArabic(district).includes('المهديه');
}

/**
 * المهدية تُعرف من الحي أو المدينة.
 * إذا كان الحي فارغًا يذكر العنوان المهدية، كما في الإعلانات القديمة.
 */
function isMahdiaListing(body = {}) {
  if (isMahdiaDistrict(body.district) || isMahdiaDistrict(body.city)) return true;
  if (!String(body.district || '').trim() && isMahdiaDistrict(body.title)) return true;
  return false;
}

function formatMahdiaRef(n) {
  const num = Number(n);
  if (!Number.isInteger(num) || num < 1) return '';
  return `H-MHD-${String(num).padStart(6, '0')}`;
}

function mahdiaRefNumber(ref) {
  const match = String(ref || '').trim().match(MAHDIA_RE);
  return match ? Number(match[1]) : 0;
}

function nextMahdiaNumber(refs) {
  const max = (refs || []).reduce((highest, ref) => Math.max(highest, mahdiaRefNumber(ref)), 0);
  return max + 1;
}

module.exports = {
  MAHDIA_RE,
  isMahdiaDistrict,
  isMahdiaListing,
  formatMahdiaRef,
  mahdiaRefNumber,
  nextMahdiaNumber,
};
