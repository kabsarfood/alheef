/** ألوان وأنواع الخريطة العقارية */
const TYPE_META = {
  فيلا: { color: '#C5A46D', label: 'فلل', key: 'villa' },
  فلل: { color: '#C5A46D', label: 'فلل', key: 'villa' },
  شقة: { color: '#3B82F6', label: 'شقق', key: 'apartment' },
  شقق: { color: '#3B82F6', label: 'شقق', key: 'apartment' },
  أرض: { color: '#22C55E', label: 'أراضي', key: 'land' },
  أراضي: { color: '#22C55E', label: 'أراضي', key: 'land' },
  'أرض زراعية': { color: '#16A34A', label: 'أراضي', key: 'land' },
  عمارة: { color: '#64748B', label: 'عمائر', key: 'building' },
  عمائر: { color: '#64748B', label: 'عمائر', key: 'building' },
  عمير: { color: '#64748B', label: 'عمائر', key: 'building' },
  محل: { color: '#F97316', label: 'محلات', key: 'commercial' },
  محلات: { color: '#F97316', label: 'محلات', key: 'commercial' },
  مكتب: { color: '#EA580C', label: 'مكاتب', key: 'office' },
  مكاتب: { color: '#EA580C', label: 'مكاتب', key: 'office' },
  تجاري: { color: '#F97316', label: 'تجاري', key: 'commercial' },
  'عقار تجاري': { color: '#F97316', label: 'تجاري', key: 'commercial' },
  استراحة: { color: '#A855F7', label: 'استراحات', key: 'chalet' },
  دوبلكس: { color: '#0EA5E9', label: 'دوبلكس', key: 'duplex' },
};

const LEGEND = [
  { color: '#C5A46D', label: 'فلل' },
  { color: '#3B82F6', label: 'شقق' },
  { color: '#22C55E', label: 'أراضي' },
  { color: '#64748B', label: 'عمائر' },
  { color: '#F97316', label: 'تجاري / محلات' },
];

function normalizeType(type) {
  const t = (type || '').trim();
  return TYPE_META[t] || { color: '#1E2A38', label: t || 'عقار', key: 'other' };
}

module.exports = { TYPE_META, LEGEND, normalizeType };
