/**
 * مرحلة C — استيراد الخريطة.
 * node --use-system-ca scripts/test-map-import-phase-c.js
 */
require('dotenv').config();
process.env.ALHEEF_MAP_IMPORT_SECRET = process.env.ALHEEF_MAP_IMPORT_SECRET && process.env.ALHEEF_MAP_IMPORT_SECRET.length >= 24
  ? process.env.ALHEEF_MAP_IMPORT_SECRET
  : 'phase-c-test-secret-not-for-production';

const { normalizePropertyType } = require('../server/utils/propertyTypes');
const { propertyToMapProperty } = require('../server/services/mappers');
const {
  authorizeImport,
  importProperty,
  reviewDecision,
  normalizeListingType,
} = require('../server/services/mapImport');
const { getAdmin, isEnabled } = require('../server/lib/supabase');
const propertiesRepo = require('../server/repositories/propertiesRepo');

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}
function assert(cond, msg) {
  if (!cond) fail(msg);
  else console.log('✓', msg);
}

assert(normalizePropertyType('ارض') === 'أرض سكنية', 'ارض تُطبّع إلى أرض سكنية');
assert(normalizePropertyType('أراضي') === 'أرض سكنية', 'أراضي تُطبّع إلى أرض سكنية');
assert(normalizePropertyType('أرض تجارية') === 'أرض تجارية', 'الأرض التجارية تبقى تجارية');
assert(normalizeListingType('إيجار') === 'rent', 'إيجار يُطبّع إلى rent');
assert(authorizeImport('Bearer wrong-secret-value-but-long-enough').ok === false, 'سر خاطئ يُرفض');
assert(authorizeImport(`Bearer ${process.env.ALHEEF_MAP_IMPORT_SECRET}`).ok === true, 'السر الصحيح يُقبل');

const createdIds = [];

async function cleanup() {
  for (const id of createdIds) {
    await getAdmin().from('property_import_logs').delete().eq('property_id', id);
    await propertiesRepo.remove(id);
  }
  await getAdmin().from('property_import_logs').delete().like('source_listing_id', 'PHASEC-%');
  await getAdmin().from('property_import_logs').delete().like('source_import_id', 'PHASEC-%');
}

function base(extra) {
  return {
    property_type: 'ارض',
    listing_type: 'sale',
    city: 'الرياض',
    district: 'المهدية',
    title: 'اختبار استيراد — يحذف',
    price: 1800000,
    price_type: 'fixed',
    area: 450,
    contact_phone: '966530792754',
    source: 'chatgpt',
    publish_mode: 'review',
    ...extra,
  };
}

async function main() {
  if (!isEnabled()) {
    console.log('— قاعدة البيانات غير متصلة');
    return;
  }

  const missingDistrict = await importProperty(base({ district: '', source_import_id: 'PHASEC-INVALID' }));
  assert(missingDistrict.status === 400, 'حي ناقص يُرفض دون تخمين');

  const review = await importProperty(base({
    source_import_id: 'PHASEC-IMP-1',
    source_listing_id: 'PHASEC-LIST-1',
    plan_number: 'PHASEC-PLAN',
    plot_number: 'PHASEC-PLOT',
    latitude: 21.5,
    longitude: 39.2,
    reference_no: 'PHASEC-LIC-1',
    images: ['https://example.com/phase-c.webp'],
  }));
  assert(review.status === 201 && review.body.success, 'مراجعة تُنشئ مسودة');
  createdIds.push(review.body.property_id);
  assert(/^H-MHD-\d{6}$/.test(review.body.internal_ref), 'المستورَد يأخذ رقم المهدية');
  assert(review.body.status === 'draft', 'وضع المراجعة لا ينشر');

  const saved = await propertiesRepo.getById(review.body.property_id);
  assert(saved.propertyType === 'أرض سكنية', 'النوع المخزّن هو التسمية المعتمدة');
  assert(saved.contactPhone === '0530792754', 'الجوال يُحفظ بصيغة 05');
  assert(saved.source === 'chatgpt' && saved.gallery.length === 1, 'المصدر ورابط الصورة حُفظا');
  const pub = propertyToMapProperty(saved);
  const pubJson = JSON.stringify(pub);
  assert(!pubJson.includes('0530792754'), 'الخريطة لا تُظهر الرقم الكامل');
  assert(!pubJson.includes('chatgpt') && !pubJson.includes('PHASEC-LIST-1'), 'حقول المصدر لا تخرج للخريطة');
  const onMap = await propertiesRepo.listForMap({});
  assert(!onMap.rows.some((row) => row.id === saved.id), 'المسودة لا تظهر على الخريطة');

  const again = await importProperty(base({
    source_import_id: 'PHASEC-IMP-1',
    source_listing_id: 'PHASEC-LIST-1',
    plan_number: 'OTHER',
    plot_number: 'OTHER',
  }));
  assert(again.status === 200 && again.body.idempotent && again.body.property_id === saved.id, 'نفس طلب الاستيراد لا ينشئ صفًا ثانيًا');

  const bySource = await importProperty(base({
    source_import_id: 'PHASEC-IMP-2',
    source_listing_id: 'PHASEC-LIST-1',
    plan_number: 'OTHER-2',
    plot_number: 'OTHER-2',
    reference_no: 'PHASEC-LIC-2',
  }));
  assert(bySource.body.duplicate === true && bySource.body.duplicate_type === 'source_listing_id', 'تكرار المصدر قوي');

  const byLicense = await importProperty(base({
    source_import_id: 'PHASEC-IMP-3',
    source_listing_id: 'PHASEC-LIST-3',
    plan_number: 'OTHER-3',
    plot_number: 'OTHER-3',
    reference_no: 'PHASEC-LIC-1',
  }));
  assert(byLicense.body.duplicate === true && byLicense.body.duplicate_type === 'reference_no', 'تكرار الترخيص قوي');

  const byPlot = await importProperty(base({
    source_import_id: 'PHASEC-IMP-4',
    source_listing_id: 'PHASEC-LIST-4',
    plan_number: 'PHASEC-PLAN',
    plot_number: 'PHASEC-PLOT',
    reference_no: 'PHASEC-LIC-4',
    latitude: 21.51,
    longitude: 39.21,
  }));
  assert(byPlot.body.duplicate === 'possible', 'المخطط والقطعة احتمال تكرار');
  assert(!(await propertiesRepo.getById(byPlot.body?.property_id || 'missing')), 'الاحتمال لا ينشئ صفًا');

  const noCoords = await importProperty(base({
    publish_mode: 'direct',
    source_import_id: 'PHASEC-IMP-5',
    source_listing_id: 'PHASEC-LIST-5',
    plan_number: 'PHASEC-PLAN-5',
    plot_number: 'PHASEC-PLOT-5',
    reference_no: 'PHASEC-LIC-5',
    latitude: '',
    longitude: '',
    maps_url: '',
  }));
  assert(noCoords.status === 400, 'النشر المباشر بلا إحداثيات يُرفض');

  const direct = await importProperty(base({
    publish_mode: 'direct',
    source_import_id: 'PHASEC-IMP-6',
    source_listing_id: 'PHASEC-LIST-6',
    plan_number: 'PHASEC-PLAN-6',
    plot_number: 'PHASEC-PLOT-6',
    reference_no: 'PHASEC-LIC-6',
    district: 'النرجس',
    latitude: 24.91,
    longitude: 46.91,
    price: 2222222,
    area: 333,
    property_type: 'شقة',
  }));
  assert(direct.status === 201 && direct.body.status === 'published', 'النشر المباشر ينشر');
  createdIds.push(direct.body.property_id);
  const mapped = await propertiesRepo.listForMap({ propertyType: 'شقة' });
  assert(mapped.rows.some((row) => row.id === direct.body.property_id), 'المنشور يظهر في استعلام الخريطة');

  const approved = await reviewDecision(saved.id, { publish: true });
  assert(approved.status === 200 && approved.body.success && (approved.body.status === 'published'), 'الاعتماد ينشر المسودة');

  const rejected = await importProperty(base({
    source_import_id: 'PHASEC-IMP-7',
    source_listing_id: 'PHASEC-LIST-7',
    plan_number: 'PHASEC-PLAN-7',
    plot_number: 'PHASEC-PLOT-7',
    reference_no: 'PHASEC-LIC-7',
    district: 'النرجس',
    title: 'اختبار رفض — يحذف',
  }));
  assert(rejected.status === 201, 'مسودة الرفض أُنشئت');
  createdIds.push(rejected.body.property_id);
  const rejection = await reviewDecision(rejected.body.property_id, { publish: false });
  assert(rejection.body.status === 'archived', 'الرفض يؤرشف ولا يحذف الرقم');
}

main().then(async () => {
  if (isEnabled()) await cleanup();
  if (process.exitCode) console.error('\nفشل اختبار المرحلة C');
  else console.log('\nاختبار المرحلة C نجح');
}).catch(async (err) => {
  console.error('✗', err.message);
  if (isEnabled()) await cleanup();
  process.exitCode = 1;
});
