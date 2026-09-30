/**
 * أنواع العقار للخريطة ولوحة الأدمن.
 * القيمة المخزّنة تبقى عربية. المفتاح الإنجليزي للتجميع فقط ولا يُكتب في الجدول.
 *
 * أرض / أراضي القديمة تُفلتر مع «أرض سكنية».
 * أرض تجارية وأرض زراعية تبقيان مستقلتين.
 */
const PROPERTY_TYPES = [
  { key: 'land', label: 'أرض سكنية', group: 'أراضي', aliases: ['أرض سكنية', 'أرض', 'أراضي'] },
  { key: 'land', label: 'أرض تجارية', group: 'أراضي', aliases: ['أرض تجارية'] },
  { key: 'land', label: 'أرض زراعية', group: 'أراضي', aliases: ['أرض زراعية'] },
  { key: 'villa', label: 'فيلا', group: 'عقارات', aliases: ['فيلا', 'فلل'] },
  { key: 'duplex', label: 'دوبلكس', group: 'عقارات', aliases: ['دوبلكس', 'دبلكس'] },
  { key: 'apartment', label: 'شقة', group: 'عقارات', aliases: ['شقة', 'شقق'] },
  { key: 'building', label: 'عمارة', group: 'عقارات', aliases: ['عمارة', 'عمائر', 'عمير'] },
  { key: 'palace', label: 'قصر', group: 'عقارات', aliases: ['قصر'] },
  { key: 'tower', label: 'برج', group: 'عقارات', aliases: ['برج'] },
  { key: 'rest_house', label: 'استراحة', group: 'عقارات', aliases: ['استراحة'] },
  { key: 'shop', label: 'محل', group: 'عقارات', aliases: ['محل', 'محلات'] },
  { key: 'office', label: 'مكتب', group: 'عقارات', aliases: ['مكتب', 'مكاتب'] },
  { key: 'commercial', label: 'عقار تجاري', group: 'عقارات', aliases: ['عقار تجاري', 'تجاري'] },
];

function typeByLabel(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  return PROPERTY_TYPES.find((item) => item.label === raw || item.aliases.includes(raw)) || null;
}

/** قيم property_type التي يطابقها اختيار الفلتر، بما فيها الأسماء القديمة. */
function typeFilterValues(input) {
  const match = typeByLabel(input);
  if (match) return [...match.aliases];
  const raw = String(input || '').trim();
  return raw ? [raw] : [];
}

function typeKey(input) {
  return typeByLabel(input)?.key || '';
}

function foldArabic(value) {
  return String(value || '')
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

/**
 * يطبّع نوعًا جديدًا إلى التسمية المعتمدة.
 * أرض / ارض / أراضي → أرض سكنية.
 * لا يُستخدم لتعديل الصفوف المخزّنة سابقًا.
 */
function normalizePropertyType(input) {
  const folded = foldArabic(input);
  if (!folded) return '';
  let best = null;
  PROPERTY_TYPES.forEach((item) => {
    [item.label, ...item.aliases].forEach((name) => {
      if (foldArabic(name) !== folded) return;
      if (!best || name.length > best.length) best = { label: item.label, length: name.length };
    });
  });
  return best ? best.label : '';
}

module.exports = {
  PROPERTY_TYPES,
  typeByLabel,
  typeFilterValues,
  typeKey,
  normalizePropertyType,
};
