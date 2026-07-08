const MARKETING_ZONES = {
  west_riyadh: 'تسويق غرب الرياض',
  north_riyadh: 'تسويق شمال الرياض',
  south_riyadh: 'تسويق جنوب الرياض',
  east_riyadh: 'تسويق شرق الرياض',
  center_riyadh: 'تسويق وسط الرياض',
};

const JOIN_STATUS_LABELS = {
  pending: 'بانتظار المراجعة',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
  needs_info: 'يحتاج معلومات إضافية',
};

const PROPERTY_STATUS_LABELS = {
  draft: 'مسودة',
  pending_review: 'بانتظار مراجعة الأدمن',
  needs_changes: 'يحتاج تعديل',
  rejected: 'مرفوض',
  approved_published: 'معتمد ومنشور',
  published: 'منشور',
  hidden: 'مخفي',
  expired: 'منتهي الترخيص',
  archived: 'مؤرشف',
  sold: 'مباع',
};

const PUBLIC_STATUSES = ['published', 'approved_published'];

function zoneLabel(key) {
  return MARKETING_ZONES[key] || key || '—';
}

function normalizePhone(phone) {
  let p = String(phone || '').replace(/\D/g, '');
  if (p.startsWith('966')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  if (p.length === 9 && p.startsWith('5')) return `0${p}`;
  if (p.length === 10 && p.startsWith('05')) return p;
  return String(phone || '').trim();
}

module.exports = {
  MARKETING_ZONES,
  JOIN_STATUS_LABELS,
  PROPERTY_STATUS_LABELS,
  PUBLIC_STATUSES,
  zoneLabel,
  normalizePhone,
};
