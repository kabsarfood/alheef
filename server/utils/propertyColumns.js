/**
 * أعمدة جدول properties المعروفة في Supabase (بدون حقول الخريطة الاختيارية).
 * حقول مثل direction و contact_phone تُخزَّن داخل features أو agent_phone.
 */
const ALLOWED = new Set([
  'id',
  'title',
  'slug',
  'description',
  'property_type',
  'listing_type',
  'city',
  'district',
  'street',
  'price',
  'bedrooms',
  'bathrooms',
  'area',
  'age',
  'latitude',
  'longitude',
  'video_url',
  'maps_url',
  'cover_image',
  'gallery',
  'features',
  'featured',
  'status',
  'agent_name',
  'agent_phone',
  'reference_no',
  'views_count',
  'marketer_id',
  'license_expires_at',
  'brokerage_contract_no',
  'facade',
  'internal_notes',
  'admin_feedback',
  'reviewed_by',
  'approved_by',
  'approved_at',
  'reviewed_at',
  'homepage_published',
  'inquiry_count',
  'created_at',
  'updated_at',
]);

/** أعمدة اختيارية — قد لا تكون منفّذة في قاعدة الإنتاج */
const OPTIONAL_MAP_COLUMNS = [
  'plot_number',
  'plan_number',
  'direction',
  'street_width',
  'price_type',
  'contact_phone',
];

const { MARKETER_DB_COLUMNS } = require('./marketerFeatures');

function pickPropertyColumns(row, { allowOptional = false } = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (ALLOWED.has(key)) {
      out[key] = value;
      continue;
    }
    if (allowOptional && OPTIONAL_MAP_COLUMNS.includes(key)) {
      out[key] = value;
    }
  }
  return out;
}

function stripOptionalMapColumns(row) {
  const safe = { ...row };
  OPTIONAL_MAP_COLUMNS.forEach((k) => delete safe[k]);
  MARKETER_DB_COLUMNS.forEach((k) => delete safe[k]);
  return safe;
}

module.exports = {
  ALLOWED_PROPERTY_COLUMNS: ALLOWED,
  OPTIONAL_MAP_COLUMNS,
  pickPropertyColumns,
  stripOptionalMapColumns,
};
