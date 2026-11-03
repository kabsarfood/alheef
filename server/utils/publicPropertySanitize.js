const { digitsOnly, normalizeAccountPhone } = require('./phone');

/**
 * مفاتيح features المسموح بظهورها للزائر.
 * أي مفتاح آخر (جوال، ملاحظات، بيانات مسوق) يُسقط.
 */
const PUBLIC_FEATURE_KEYS = new Set([
  'plot_number',
  'plotNumber',
  'plan_number',
  'planNumber',
  'direction',
  'street_width',
  'streetWidth',
  'price_type',
  'priceType',
  'property_description',
  'description',
  'details',
  'amenities',
  'is_buy_request',
  'isBuyRequest',
  'request_property_kind',
  'requestPropertyKind',
  'request_usage',
  'requestUsage',
]);

const SENSITIVE_KEY = /(phone|mobile|whatsapp|جوال|internal[_ ]?notes|admin[_ ]?feedback|marketer[_ ]?meta|agent[_ ]?name|source_url|source_listing_id|source_import_id|internal_ref|^source$)/i;

/** القناع القادم من السيرفر مسموح. أي مفتاح جوال آخر يُحذف. */
const PUBLIC_DISPLAY_KEYS = new Set(['contactPhoneMasked']);

/** جوال سعودي متصل أو مفصول بمسافات/شرطات. لا يمس الأسعار ولا أرقام المخطط. */
const FULL_PHONE_RE = /(?:\+|00)?966[\s-]?5(?:[\s-]?\d){8}|05(?:[\s-]?\d){8}/g;

/**
 * قناع عرض فقط. لا يُرجع الرقم الأصلي أبداً.
 * 0530792754 → 05••• ••754
 */
function maskPublicListingPhone(input) {
  const local = normalizeAccountPhone(input);
  if (local) return `${local.slice(0, 2)}••• ••${local.slice(-3)}`;
  const d = digitsOnly(input);
  if (d.length >= 8) return `${d.slice(0, 2)}••• ••${d.slice(-3)}`;
  return '';
}

const ARABIC_DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function foldPhoneDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_DIGITS[ch] || ch);
}

function isSaudiMobileDigits(raw) {
  let digits = foldPhoneDigits(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('966')) digits = `0${digits.slice(3)}`;
  return /^05\d{8}$/.test(digits);
}

const PHONE_SPAN_RE = /[+\d٠-٩۰-۹][\d٠-٩۰-۹\s-]{8,22}/g;

function replaceSaudiMobileSpans(text, replacer) {
  PHONE_SPAN_RE.lastIndex = 0;
  return String(text ?? '').replace(PHONE_SPAN_RE, (span) => (
    isSaudiMobileDigits(span) ? replacer(span) : span
  ));
}

function redactPhonesInText(value) {
  const text = String(value ?? '');
  if (!text) return text;
  return replaceSaudiMobileSpans(text, (span) => maskPublicListingPhone(foldPhoneDigits(span)) || '');
}

function removePhonesFromText(value) {
  return replaceSaudiMobileSpans(value, () => '');
}

function isStandalonePhone(value) {
  const compact = String(value ?? '').trim().replace(/[\s-]/g, '');
  if (!compact || compact.length > 16) return false;
  return /^(?:\+|00)?9665\d{8}$|^05\d{8}$/.test(compact);
}

function sanitizeFeatureValue(value) {
  if (typeof value === 'string') {
    if (isStandalonePhone(value)) return '';
    return redactPhonesInText(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeFeatureValue(item))
      .filter((item) => item !== '' && item != null);
  }
  if (value && typeof value === 'object') {
    return sanitizePublicFeatures(value);
  }
  return value;
}

function sanitizePublicFeatures(features) {
  if (Array.isArray(features)) {
    return features
      .filter((item) => typeof item === 'string' && !isStandalonePhone(item))
      .map((item) => redactPhonesInText(item));
  }
  if (!features || typeof features !== 'object') return {};

  const out = {};
  Object.entries(features).forEach(([key, value]) => {
    if (!PUBLIC_FEATURE_KEYS.has(key)) return;
    if (SENSITIVE_KEY.test(key)) return;
    const clean = sanitizeFeatureValue(value);
    if (clean === '' || clean == null) return;
    if (typeof clean === 'object' && !Array.isArray(clean) && !Object.keys(clean).length) return;
    out[key] = clean;
  });
  return out;
}

const URL_KEYS = new Set([
  'mapsUrl',
  'maps_url',
  'coverImage',
  'cover_image',
  'image',
  'videoUrl',
  'video_url',
  'gallery',
  'slug',
  'id',
]);

function redactPublicStrings(value, key = '') {
  if (typeof value === 'string') {
    if (URL_KEYS.has(key)) return value;
    return redactPhonesInText(value);
  }
  if (Array.isArray(value)) {
    if (URL_KEYS.has(key)) return value;
    return value.map((item) => redactPublicStrings(item, key));
  }
  if (!value || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  Object.entries(value).forEach(([childKey, childVal]) => {
    if (SENSITIVE_KEY.test(childKey) && !PUBLIC_DISPLAY_KEYS.has(childKey)) return;
    out[childKey] = redactPublicStrings(childVal, childKey);
  });
  return out;
}

module.exports = {
  PUBLIC_FEATURE_KEYS,
  maskPublicListingPhone,
  redactPhonesInText,
  removePhonesFromText,
  sanitizePublicFeatures,
  redactPublicStrings,
  FULL_PHONE_RE,
};
