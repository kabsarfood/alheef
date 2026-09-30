/**
 * أعمدة جدول properties.
 * حقول الخريطة الاختيارية تُكتب كأعمدة عندما تكون موجودة،
 * وتبقى نسخة داخل features للإعلانات القديمة وإذا تعذر العمود.
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
  'internal_ref',
  'plot_number',
  'plan_number',
  'direction',
  'street_width',
  'price_type',
  'source',
  'source_url',
  'source_listing_id',
  'source_import_id',
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

/** عمود قد يبقى غائبًا في بيئة لم تُنفَّذ فيها كل الهجرات */
const OPTIONAL_MAP_COLUMNS = [
  'contact_phone',
];

const { MARKETER_DB_COLUMNS } = require('./marketerFeatures');

function pickPropertyColumns(row, { allowOptional = true } = {}) {
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

/** اسم العمود الناقص من رسالة PostgREST أو Postgres، إن وُجد. */
function missingColumnFromError(message) {
  const text = String(message || '');
  const pg = text.match(/column ["']?(?:[\w]+\.)?([a-z0-9_]+)["']? does not exist/i);
  if (pg) return pg[1];
  const cache = text.match(/could not find the ['"]([a-z0-9_]+)['"] column/i);
  if (cache) return cache[1];
  return null;
}

module.exports = {
  ALLOWED_PROPERTY_COLUMNS: ALLOWED,
  OPTIONAL_MAP_COLUMNS,
  pickPropertyColumns,
  stripOptionalMapColumns,
  missingColumnFromError,
};
