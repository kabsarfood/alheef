/**
 * لصق سريع + فئات الخريطة.
 * node --use-system-ca scripts/test-quick-paste-filters.js
 */
require('dotenv').config();
const { parseListingPaste } = require('../server/utils/listingPaste');
const { prepareQuickListing } = require('../server/services/quickPaste');
const propertiesRepo = require('../server/repositories/propertiesRepo');
const { propertyToMapProperty } = require('../server/services/mappers');
const { categoryOf, colorOf } = require('../public/js/map-categories');

const SAMPLE = `المهديه
للبيع ارض سكنيه
المساحه ٥٠٠ م
شارع ٢٠ جنوبي
وشارع ١٠ شمالي
تفتح على مسجد
رقم ١٦٨٩ مخطط ٢٥٦٦
مباشر`;

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}

function assert(cond, msg) {
  if (!cond) fail(msg);
  else console.log('✓', msg);
}

function testParser() {
  const parsed = parseListingPaste(SAMPLE);
  assert(parsed.district === 'المهدية', 'district = المهدية');
  assert(parsed.city === 'الرياض', 'city = الرياض');
  assert(parsed.propertyType === 'أرض سكنية', 'property_type = أرض سكنية');
  assert(parsed.listingType === 'sale', 'listing_type = sale');
  assert(parsed.area === 500, 'area = 500');
  assert(parsed.plotNumber === '1689', 'plot_number = 1689');
  assert(parsed.planNumber === '2566', 'plan_number = 2566');
  assert(parsed.streetWidth === '20', 'street_width = 20');
  assert(parsed.direction === 'جنوب', 'direction = جنوب');
  assert(parsed.facade === 'شارع 20م جنوباً وشارع 10م شمالاً', 'الشارع الثاني داخل الواجهة');
  assert(parsed.description.includes('تفتح على مسجد'), 'تفتح على مسجد تبقى في الوصف');
  assert(parsed.description.includes('٥٠٠'), 'النص الأصلي يحتفظ بالأرقام العربية');
  assert(parsed.price == null && parsed.priceType === 'auction', 'بدون سعر = على السوم');

  const million = parseListingPaste('النرجس\nللبيع فيلا\nالسعر مليون و800');
  assert(million.price === 1800000 && million.priceType === 'fixed', 'مليون و800');
  const grouped = parseListingPaste('النرجس\nللبيع شقة\n1,800,000 ريال');
  assert(grouped.price === 1800000, '1,800,000');
  const villa = parseListingPaste('النرجس\nللايجار فله');
  assert(villa.propertyType === 'فيلا' && villa.listingType === 'rent', 'فله + للإيجار');
  const building = parseListingPaste('الملقا\nللبيع عماره');
  assert(building.propertyType === 'عمارة', 'عماره');
  const apt = parseListingPaste('حطين\nبيع شقه');
  assert(apt.propertyType === 'شقة' && apt.listingType === 'sale', 'شقه + بيع');
}

function testCategories() {
  const expected = {
    'أرض': 'land',
    'ارض': 'land',
    'أراضي': 'land',
    'أرض سكنية': 'land',
    'أرض تجارية': 'land',
    'أرض زراعية': 'land',
    'فيلا': 'villa',
    'دوبلكس': 'villa',
    'قصر': 'villa',
    'شقة': 'apartment',
    'عمارة': 'building',
    'برج': 'building',
  };
  Object.entries(expected).forEach(([label, id]) => {
    assert(categoryOf(label) === id, `${label} → ${id}`);
  });
  ['استراحة', 'محل', 'مكتب', 'عقار تجاري'].forEach((label) => {
    assert(categoryOf(label) === '', `${label} يظهر مع الكل فقط`);
  });
  assert(colorOf('أرض سكنية') === colorOf('أرض تجارية') && colorOf('أرض سكنية') === '#22C55E', 'الأراضي لون واحد');
  assert(colorOf('فيلا') === colorOf('دوبلكس') && colorOf('قصر') === '#C5A46D', 'الفلل لون واحد');
  assert(colorOf('شقة') === '#3B82F6', 'لون الشقة');
  assert(colorOf('عمارة') === colorOf('برج') && colorOf('برج') === '#64748B', 'العمائر والأبراج لون واحد');

  const items = Object.keys(expected).concat(['استراحة', 'محل']).map((propertyType) => ({ propertyType }));
  const land = items.filter((item) => categoryOf(item.propertyType) === 'land');
  const villa = items.filter((item) => categoryOf(item.propertyType) === 'villa');
  const apartment = items.filter((item) => categoryOf(item.propertyType) === 'apartment');
  const building = items.filter((item) => categoryOf(item.propertyType) === 'building');
  assert(items.length === 14, 'الكل يعرض الجميع في العينة');
  assert(land.length === 6 && villa.length === 3 && apartment.length === 1 && building.length === 2, 'فلاتر الفئات');
  assert(!land.some((item) => item.propertyType === 'فيلا'), 'الأرض لا تشمل الفيلا');
}

async function cleanup(id) {
  if (!id) return;
  await propertiesRepo.retainImages(id, []);
  await propertiesRepo.remove(id);
}

async function testSave() {
  let draftId = '';
  let liveId = '';
  try {
    const draft = await prepareQuickListing({
      text: 'النرجس\nللبيع فيلا\nاختبار لصق سريع بدون موقع',
      mapsUrl: '',
      contactPhone: '',
    });
    assert(draft.published === false, 'بدون إحداثيات لا يُنشر');
    assert(draft.message.includes('يحتاج موقعًا صحيحًا قبل النشر'), 'رسالة الموقع الناقص');
    const draftRow = await propertiesRepo.create(draft.body);
    draftId = draftRow.id;
    const draftFull = await propertiesRepo.getById(draftId);
    assert(draftFull.status === 'draft', 'الحالة draft');
    assert(!draftFull.internalRef, 'النرجس لا يأخذ رقم مهدية');
    assert(String(draftFull.description || '').includes('بدون موقع'), 'النص الأصلي محفوظ');

    const live = await prepareQuickListing({
      text: 'النرجس\nللبيع فيلا\nالمساحه ٤٠٠ م\nاختبار لصق سريع بموقع',
      mapsUrl: 'https://www.google.com/maps?q=24.81,46.71',
      contactPhone: '0530792754',
    });
    assert(live.published === true, 'إحداثيات الرابط تنشر الإعلان');
    assert(live.body.area === 400, 'المساحة من أرقام عربية');
    const liveRow = await propertiesRepo.create(live.body);
    liveId = liveRow.id;
    await propertiesRepo.addImages(liveId, ['https://example.com/quick-a.jpg', 'https://example.com/quick-b.jpg']);
    const full = await propertiesRepo.getById(liveId);
    assert(full.status === 'published', 'الحالة published');
    assert(full.contactPhone === '0530792754', 'الجوال محفوظ للأدمن');
    assert(!full.internalRef, 'اختبار النرجس لا يستهلك H-MHD');
    assert((full.gallery || []).length === 2, 'صورتان عبر النظام الحالي');
    assert(full.coverImage === 'https://example.com/quick-a.jpg', 'الغلاف من أول صورة');
    const pub = propertyToMapProperty(full);
    const json = JSON.stringify(pub);
    assert(!pub.contactPhoneMasked && !json.includes('0530792754'), 'الزائر لا يرى رقم المعلن');
    assert(pub.priceDisplay === 'على السوم', 'بدون سعر يظهر على السوم');
  } finally {
    await cleanup(draftId);
    await cleanup(liveId);
    if (draftId) assert(!(await propertiesRepo.getById(draftId)), 'حُذف إعلان المسودة');
    if (liveId) assert(!(await propertiesRepo.getById(liveId)), 'حُذف إعلان الاختبار');
  }
}

(async () => {
  testParser();
  testCategories();
  await testSave();
  if (!process.exitCode) console.log('quick paste + filters: ok');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
