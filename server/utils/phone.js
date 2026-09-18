/**
 * تطبيع أرقام الجوال السعودية — هوية الحساب الموحدة.
 *
 * الصيغة الداخلية (Account ID): 05XXXXXXXX
 * واتساب Evolution:           9665XXXXXXXX
 * عرض دولي:                   +9665XXXXXXXX
 *
 * المدخلات المقبولة لنفس الحساب:
 *   05XXXXXXXX | 5XXXXXXXX | 9665XXXXXXXX | +9665XXXXXXXX
 */

function digitsOnly(input) {
  return String(input || '').replace(/\D/g, '');
}

/**
 * يحوّل أي صيغة صالحة إلى 05XXXXXXXX، وإلا ''.
 */
function normalizeAccountPhone(input) {
  let d = digitsOnly(input);
  if (!d) return '';

  if (d.startsWith('966')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);

  if (d.length === 9 && d.startsWith('5')) return `0${d}`;
  return '';
}

function isValidSaudiMobile(input) {
  return /^05\d{8}$/.test(normalizeAccountPhone(input));
}

/** توافق مع marketerZones: صالح → 05…، وإلا النص الأصلي بعد trim */
function normalizePhone(phone) {
  const normalized = normalizeAccountPhone(phone);
  return normalized || String(phone || '').trim();
}

/**
 * توافق مع ejarContract: صالح → 05…، وإلا الأرقام فقط (لسير التحقق/الأخطاء).
 */
function normalizeSaudiMobile(input) {
  const normalized = normalizeAccountPhone(input);
  if (normalized) return normalized;
  return digitsOnly(input);
}

function toWhatsAppNumber(input) {
  const local = normalizeAccountPhone(input);
  if (!local) return '';
  return `966${local.slice(1)}`;
}

function toE164(input) {
  const wa = toWhatsAppNumber(input);
  return wa ? `+${wa}` : '';
}

function phonesEqual(a, b) {
  const left = normalizeAccountPhone(a);
  const right = normalizeAccountPhone(b);
  return Boolean(left && right && left === right);
}

function maskPhone(input) {
  const wa = toWhatsAppNumber(input);
  if (wa.length < 8) return '****';
  return `${wa.slice(0, 5)}****${wa.slice(-2)}`;
}

module.exports = {
  digitsOnly,
  normalizeAccountPhone,
  normalizePhone,
  normalizeSaudiMobile,
  isValidSaudiMobile,
  toWhatsAppNumber,
  toE164,
  phonesEqual,
  maskPhone,
};
