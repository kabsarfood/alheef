/**
 * مرحلة B.5 — أعمدة العقار ورقم الهيف الداخلي.
 * node --use-system-ca scripts/test-internal-ref-phase-b5.js
 */
require('dotenv').config();
const {
  isMahdiaDistrict,
  isMahdiaListing,
  formatMahdiaRef,
  nextMahdiaNumber,
} = require('../server/utils/internalRef');
const { pickPropertyColumns } = require('../server/utils/propertyColumns');
const { propertyToRowWithColumns, propertyToMapProperty, toPublicProperty, rowToProperty } = require('../server/services/mappers');
const { isEnabled, getAdmin } = require('../server/lib/supabase');
const propertiesRepo = require('../server/repositories/propertiesRepo');

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}

function assert(cond, msg) {
  if (!cond) fail(msg);
  else console.log('✓', msg);
}

assert(isMahdiaDistrict('المهدية') && isMahdiaDistrict('حي المهديه'), 'المهدية والمهديه تُعرفان');
assert(isMahdiaListing({ city: 'الرياض - المهدية' }), 'المدينة القديمة التي تضم المهدية تُحتسب');
assert(isMahdiaListing({ title: 'ارض للمطورين - المهدية', city: 'التقاطع الخامس' }), 'عنوان المهدية يُحتسب إذا كان الحي فارغًا');
assert(!isMahdiaListing({ district: 'النرجس', title: 'بالقرب من المهدية' }), 'حي آخر لا يأخذ الرقم ولو ذكر العنوان المهدية');
assert(!isMahdiaDistrict('النرجس'), 'حي آخر لا يأخذ رقم المهدية');
assert(formatMahdiaRef(1) === 'H-MHD-000001', 'أول رقم بست خانات');
assert(nextMahdiaNumber(['H-MHD-000001', 'H-MHD-000003']) === 4, 'الرقم التالي لا يسد الفراغ');
assert(nextMahdiaNumber([]) === 1, 'البداية من 1');

const stored = pickPropertyColumns(propertyToRowWithColumns({
  title: 'فيلا',
  propertyType: 'فيلا',
  listingType: 'sale',
  city: 'الرياض',
  district: 'المهدية',
  plotNumber: '10',
  planNumber: '20',
  direction: 'شمالية',
  streetWidth: '15',
  priceType: 'auction',
  internalRef: 'H-MHD-000004',
  contractNumber: 'LIC-1',
}));
assert(stored.plot_number === '10' && stored.plan_number === '20', 'المخطط والقطعة أعمدة');
assert(stored.direction === 'شمالية' && stored.street_width === '15', 'الاتجاه وعرض الشارع أعمدة');
assert(stored.price_type === 'auction', 'نوع السعر عمود');
assert(stored.internal_ref === 'H-MHD-000004', 'الرقم الداخلي عمود مستقل');
assert(stored.reference_no === 'LIC-1' && stored.reference_no !== stored.internal_ref, 'الترخيص لا يُنسخ إلى الرقم الداخلي');

const pub = propertyToMapProperty(rowToProperty({
  id: '1',
  title: 'عقار',
  slug: 's',
  property_type: 'فيلا',
  listing_type: 'sale',
  city: 'الرياض',
  district: 'المهدية',
  status: 'published',
  internal_ref: 'H-MHD-000004',
  reference_no: 'LIC-1',
  latitude: 24.7,
  longitude: 46.6,
}, []));
assert(!JSON.stringify(pub).includes('H-MHD-000004'), 'الخريطة العامة لا تعرض الرقم الداخلي');
assert(!JSON.stringify(toPublicProperty(rowToProperty({
  id: '1', title: 'عقار', slug: 's', property_type: 'فيلا', listing_type: 'sale',
  city: 'الرياض', status: 'published', internal_ref: 'H-MHD-000009', reference_no: 'LIC-9',
}, []))).includes('H-MHD-000009'), 'صفحة العقار العامة لا تعرض الرقم الداخلي');

async function main() {
  if (!isEnabled()) {
    console.log('— قاعدة البيانات غير متصلة');
    return;
  }

  const wanted = ['plot_number', 'plan_number', 'direction', 'street_width', 'price_type', 'internal_ref'];
  for (const column of wanted) {
    const { error } = await getAdmin().from('properties').select(column).limit(1);
    assert(!error, `عمود ${column} موجود في الإنتاج`);
  }

  const { data: mahdia } = await getAdmin()
    .from('properties')
    .select('id, internal_ref, district, reference_no')
    .like('internal_ref', 'H-MHD-%');
  const refs = (mahdia || []).map((row) => row.internal_ref);
  assert(new Set(refs).size === refs.length, 'أرقام المهدية الحالية فريدة');
  assert(refs.every((ref) => /^H-MHD-\d{6}$/.test(ref)), 'الصيغة الحالية H-MHD-000000');
  assert((mahdia || []).every((row) => row.internal_ref !== row.reference_no), 'لا يساوي رقم الترخيص');

  let createdId = null;
  try {
    const outside = await propertiesRepo.create({
      title: 'اختبار رقم خارج المهدية',
      propertyType: 'شقة',
      listingType: 'sale',
      city: 'الرياض',
      district: 'النرجس',
      price: 1000,
      status: 'draft',
      latitude: 24.8,
      longitude: 46.7,
    });
    assert(!outside.internalRef, 'حي غير المهدية لا يأخذ رقمًا');
    await propertiesRepo.remove(outside.id);

    const created = await propertiesRepo.create({
      title: 'اختبار رقم المهدية — يحذف',
      propertyType: 'أرض سكنية',
      listingType: 'sale',
      city: 'الرياض',
      district: 'المهدية',
      price: 2000,
      priceType: 'fixed',
      planNumber: '11',
      plotNumber: '22',
      direction: 'شرقية',
      streetWidth: '18',
      contractNumber: 'LIC-B5',
      status: 'draft',
      latitude: 24.65,
      longitude: 46.55,
    });
    createdId = created.id;
    assert(/^H-MHD-\d{6}$/.test(created.internalRef), 'إنشاء المهدية يمنح رقمًا');
    assert(created.contractNumber === 'LIC-B5' && created.internalRef !== 'LIC-B5', 'الترخيص مستقل');
    assert(created.plotNumber === '22' && created.direction === 'شرقية', 'الحقول عادت من الأعمدة');

    const { data: raw } = await getAdmin()
      .from('properties')
      .select('plot_number, plan_number, direction, street_width, price_type, internal_ref, reference_no')
      .eq('id', createdId)
      .single();
    assert(raw.plot_number === '22' && raw.plan_number === '11', 'القطعة والمخطط في الأعمدة');
    assert(raw.direction === 'شرقية' && raw.street_width === '18', 'الاتجاه وعرض الشارع في الأعمدة');
    assert(raw.price_type === 'fixed' && raw.internal_ref === created.internalRef, 'نوع السعر والرقم الداخلي في الأعمدة');

    const updated = await propertiesRepo.update(createdId, {
      price: 2500,
      internalRef: 'H-MHD-999999',
      district: 'النرجس',
      contractNumber: 'LIC-B5-NEW',
    });
    assert(updated.internalRef === created.internalRef, 'تعديل السعر والحي لا يغيّر الرقم');
    assert(updated.price === 2500 && updated.contractNumber === 'LIC-B5-NEW', 'السعر والترخيص يتغيران');
    assert(updated.plotNumber === '22', 'تعديل السعر لا يمسح القطعة');
  } finally {
    if (createdId) {
      const removed = await propertiesRepo.remove(createdId);
      assert(removed, 'حذف عقار الاختبار');
      const { data: leftover } = await getAdmin().from('properties').select('id').eq('id', createdId).maybeSingle();
      assert(!leftover, 'العقار المحذوف لا يبقى');
    }
  }
}

main().then(() => {
  if (process.exitCode) console.error('\nفشل اختبار المرحلة B.5');
  else console.log('\nاختبار المرحلة B.5 نجح');
}).catch((err) => {
  console.error('✗', err.message);
  process.exitCode = 1;
});
