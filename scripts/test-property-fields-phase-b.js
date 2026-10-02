/**
 * مرحلة B — حفظ حقول العقار في الأعمدة مع بقاء القراءة من features.
 * node --use-system-ca scripts/test-property-fields-phase-b.js
 */
require('dotenv').config();
const { pickPropertyColumns } = require('../server/utils/propertyColumns');
const { typeFilterValues, PROPERTY_TYPES } = require('../server/utils/propertyTypes');
const {
  propertyToRowWithColumns,
  rowToProperty,
  propertyToMapProperty,
} = require('../server/services/mappers');
const { enrichBodyCoords, isValidCoord } = require('../server/utils/coords');
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

const labels = PROPERTY_TYPES.map((item) => item.label);
assert(new Set(labels).size === labels.length, 'تسميات الأنواع غير مكررة');
assert(typeFilterValues('أرض سكنية').includes('أرض'), 'أرض القديمة تُفلتر مع أرض سكنية');
assert(!typeFilterValues('أرض سكنية').includes('أرض تجارية'), 'أرض تجارية لا تختلط مع السكنية');
assert(typeFilterValues('أرض تجارية').includes('أرض تجارية'), 'فلتر الأرض التجارية يطابق قيمته');
assert(typeFilterValues('دوبلكس').includes('دبلكس'), 'اسم الدوبلكس القديم يُفلتر');
labels.forEach((label) => {
  assert(typeFilterValues(label).includes(label), `الفلتر ينتج القيمة التي يحفظها النموذج: ${label}`);
});

const legacy = rowToProperty({
  id: 'legacy',
  title: 'قديم',
  slug: 'legacy',
  property_type: 'أرض',
  listing_type: 'sale',
  city: 'الرياض',
  district: 'المهدية',
  status: 'published',
  price: 1500000,
  area: 450,
  latitude: 24.65,
  longitude: 46.55,
  agent_phone: '0530792754',
  facade: 'جنوبية',
  features: {
    plot_number: '3043',
    plan_number: '2566/ب',
    street_width: '25',
    contact_phone: '0530792754',
    price_type: 'fixed',
  },
}, []);

assert(legacy.plotNumber === '3043' && legacy.planNumber === '2566/ب', 'القراءة من features عند غياب العمود');
assert(legacy.streetWidth === '25', 'عرض الشارع يُقرأ من features');
assert(legacy.contactPhone === '0530792754', 'الأدمن يرى الرقم الكامل');
assert(legacy.direction === '', 'الاتجاه لا يُنسخ تلقائياً إلى حقل التعديل');
assert(legacy.facade === 'جنوبية', 'الواجهة القديمة تبقى في حقلها');

const priced = propertyToRowWithColumns({ ...legacy, price: 1600000 });
const stored = pickPropertyColumns(priced);
assert(stored.plot_number === '3043', 'الحفظ يكتب plot_number كعمود');
assert(stored.plan_number === '2566/ب', 'الحفظ يكتب plan_number كعمود');
assert(stored.street_width === '25', 'الحفظ يكتب street_width كعمود');
assert(stored.contact_phone === '0530792754', 'الحفظ يكتب contact_phone كعمود');
assert(stored.price === 1600000, 'تعديل السعر يمر');
assert(stored.facade === 'جنوبية', 'تعديل السعر لا يمسح الواجهة');
assert(stored.features.plot_number === '3043', 'نسخة features تبقى للتوافق');

const pub = propertyToMapProperty(legacy);
const pubJson = JSON.stringify(pub);
assert(!pub.contactPhoneMasked, 'الخريطة العامة لا تقرأ رقم المعلن');
assert(!pubJson.includes('0530792754'), 'رد الخريطة بلا رقم كامل');
assert(pub.plotNumber === '3043' && pub.planNumber === '2566/ب', 'البطاقة تستلم المخطط والقطعة');
assert(pub.direction === 'جنوبية', 'واجهة بوصلة قديمة تظهر كاتجاه على الخريطة فقط');
assert(!pub.facade, 'لا تتكرر الواجهة إذا كانت هي الاتجاه المعروض');

assert(isValidCoord(0, 0) === false, 'إحداثيات 0,0 مرفوضة');
assert(isValidCoord(24.7, 46.6) === true, 'إحداثيات الرياض مقبولة');

async function main() {
  const manual = await enrichBodyCoords({
    mapsUrl: 'https://maps.app.goo.gl/phase-b-manual',
    latitude: '24.71',
    longitude: '46.67',
    coordsSource: 'manual',
  });
  assert(manual.latitude === 24.71 && manual.longitude === 46.67, 'الإحداثيات اليدوية لا تُمسح عند وجود رابط');

  if (!isEnabled()) {
    console.log('— قاعدة البيانات غير متصلة، تم تخطي اختبار الحفظ الحي');
    return;
  }

  try {
    await propertiesRepo.create({
      title: 'إحداثيات مرفوضة',
      propertyType: 'فيلا',
      listingType: 'sale',
      city: 'الرياض',
      status: 'published',
      latitude: 24.7,
      longitude: 200,
    });
    fail('إحداثيات خارج النطاق يجب أن تُرفض قبل الحفظ');
  } catch (err) {
    assert(/خط العرض|خط الطول/.test(err.message), 'النشر يرفض إحداثيات غير صحيحة');
  }

  let createdId = null;
  try {
    const created = await propertiesRepo.create({
      title: 'اختبار مرحلة ب — يحذف',
      propertyType: 'فيلا',
      listingType: 'sale',
      city: 'الرياض',
      district: 'النرجس',
      street: 'التخصصي',
      description: 'وصف اختبار المرحلة ب',
      price: 3200000,
      priceType: 'fixed',
      area: 450,
      planNumber: '3185',
      plotNumber: '1420',
      streetWidth: '20',
      direction: 'شمالية',
      facade: 'واجهة واحدة',
      mapsUrl: 'https://www.google.com/maps?q=24.8261,46.6188',
      latitude: 24.8261,
      longitude: 46.6188,
      coordsSource: 'manual',
      contactPhone: '0530792754',
      contractNumber: 'TEST-LICENSE',
      status: 'published',
    });
    createdId = created.id;
    assert(created.plotNumber === '1420' && created.planNumber === '3185', 'الإنشاء أعاد المخطط والقطعة');
    assert(created.direction === 'شمالية' && created.facade === 'واجهة واحدة', 'الاتجاه والواجهة منفصلان بعد الإنشاء');
    assert(created.contactPhone === '0530792754', 'الإنشاء يحفظ رقم المعلن للأدمن');
    const { data: raw, error: rawError } = await getAdmin()
      .from('properties')
      .select('facade, contact_phone, features')
      .eq('id', createdId)
      .single();
    assert(!rawError && raw.facade === 'واجهة واحدة', 'عمود facade محفوظ');
    assert(!rawError && raw.contact_phone === '0530792754', 'عمود contact_phone محفوظ');
    assert(raw?.features?.plot_number === '1420' && raw?.features?.plan_number === '3185', 'المخطط والقطعة محفوظان للتوافق');
    assert(raw?.features?.direction === 'شمالية' && raw?.features?.facade === 'واجهة واحدة', 'الاتجاه والواجهة محفوظان دون نسخ أحدهما على الآخر');

    await propertiesRepo.addImages(createdId, [
      'https://example.com/phase-b-a.webp',
      'https://example.com/phase-b-b.webp',
    ]);
    await propertiesRepo.removeImage((await propertiesRepo.getById(createdId)).images[1].id);
    const afterImage = await propertiesRepo.getById(createdId);
    assert(afterImage.gallery.length === 1, 'حذف صورة يحدّث gallery');
    assert(afterImage.coverImage === afterImage.gallery[0], 'الغلاف يطابق أول صورة متبقية');

    const updated = await propertiesRepo.update(createdId, { price: 3300000 });
    assert(updated.price === 3300000, 'تعديل السعر نجح');
    assert(updated.plotNumber === '1420' && updated.planNumber === '3185', 'تعديل السعر لا يمسح المخطط والقطعة');
    assert(updated.streetWidth === '20' && updated.direction === 'شمالية', 'تعديل السعر لا يمسح الشارع والاتجاه');
    assert(updated.facade === 'واجهة واحدة', 'تعديل السعر لا يمسح الواجهة');
    assert(updated.contactPhone === '0530792754', 'تعديل السعر لا يمسح الجوال');
    assert(updated.gallery.length === 1, 'تعديل السعر لا يمسح الصور');

    const { rows } = await propertiesRepo.listForMap({ propertyType: 'فيلا' });
    assert(rows.some((row) => row.id === createdId), 'العقار المنشور يظهر في استعلام الخريطة');
    const masked = propertyToMapProperty(updated);
    assert(!masked.contactPhoneMasked, 'بعد التعديل الواجهة العامة بلا رقم');
    assert(!JSON.stringify(masked).includes('0530792754'), 'بعد التعديل الرقم الكامل لا يخرج للخريطة');
  } finally {
    if (createdId) {
      const removed = await propertiesRepo.remove(createdId);
      assert(removed, 'حذف عقار الاختبار');
    }
  }
}

main().then(() => {
  if (process.exitCode) console.error('\nفشل اختبار المرحلة B');
  else console.log('\nاختبار المرحلة B نجح');
}).catch((err) => {
  console.error('✗', err.message);
  process.exitCode = 1;
});
