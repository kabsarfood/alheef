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

const {
  normalizePhone,
} = require('./phone');

function zoneLabel(key) {
  return MARKETING_ZONES[key] || key || '—';
}

module.exports = {
  MARKETING_ZONES,
  JOIN_STATUS_LABELS,
  PROPERTY_STATUS_LABELS,
  PUBLIC_STATUSES,
  zoneLabel,
  normalizePhone,
};
