/**
 * تنظيف الردود العامة — لا رقم كامل ولا features داخلية.
 * node scripts/test-public-property-sanitize.js
 */
const { rowToMapProperty, toPublicProperty, rowToProperty } = require('../server/services/mappers');
const { maskPublicListingPhone } = require('../server/utils/publicPropertySanitize');

const OWNER = '0530792754';
const BUYER = '0551112233';
const FULL_PHONE = /(?:\+|00)?9665\d{8}|05\d{8}/;

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}

function assert(cond, msg) {
  if (!cond) fail(msg);
  else console.log('✓', msg);
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      visit(key, child);
      walk(child, visit);
    });
  }
}

function assertNoSecrets(payload, label) {
  const json = JSON.stringify(payload);
  assert(!FULL_PHONE.test(json), `${label}: لا يوجد رقم جوال كامل في JSON`);
  assert(!json.includes(OWNER) && !json.includes(BUYER), `${label}: الرقم الخام غير موجود`);
  assert(!json.includes('966530792754') && !json.includes('966551112233'), `${label}: صيغة 966 غير موجودة`);

  const banned = /^(contact_phone|contactPhone|request_phone|requestPhone|agent_phone|agentPhone|internal_notes|internalNotes|admin_feedback|adminFeedback|marketer_meta)$/i;
  walk(payload, (key) => {
    if (banned.test(key)) fail(`${label}: المفتاح الحساس ظاهر: ${key}`);
  });
}

const saleRow = {
  id: 'sale-1',
  title: 'فيلا النرجس',
  slug: 'villa-narjis',
  description: 'فيلا للتواصل 053 079 2754 على الشارع',
  property_type: 'فيلا',
  listing_type: 'sale',
  city: 'الرياض',
  district: 'النرجس',
  price: 3200000,
  area: 450,
  latitude: 24.82,
  longitude: 46.62,
  cover_image: 'https://example.com/cover.webp',
  gallery: ['https://example.com/cover.webp'],
  reference_no: '7200',
  plot_number: '1420',
  plan_number: '3185',
  direction: 'شمالية',
  street_width: '20',
  price_type: 'fixed',
  contact_phone: OWNER,
  agent_phone: OWNER,
  features: {
    contact_phone: OWNER,
    plot_number: '1420',
    plan_number: '3185',
    property_description: 'وصف فيه رقم 0530792754',
    marketer_meta: {
      internalNotes: 'ملاحظة سرية',
      adminFeedback: 'مرفوض داخلياً',
      marketerId: 'm-1',
    },
    internal_notes: 'لا تُعرض',
    admin_feedback: 'لا تُعرض',
  },
};

const buyRow = {
  id: 'buy-1',
  title: 'طلب أرض',
  slug: 'buy-land',
  description: 'أريد أرضاً',
  property_type: 'أرض',
  listing_type: 'buy_request',
  city: 'الرياض',
  district: 'الملقا',
  price: 900000,
  area: 600,
  latitude: 24.8,
  longitude: 46.6,
  features: {
    is_buy_request: true,
    request_phone: BUYER,
    request_usage: 'residential',
    request_property_kind: 'أرض',
    property_description: 'الميزانية مفتوحة والرقم 0551112233',
    marketer_meta: { adminFeedback: 'سري' },
  },
  agent_phone: BUYER,
};

const masked = maskPublicListingPhone(OWNER);
assert(masked === '05••• ••754', `القناع المتوقع 05••• ••754 والفعلي ${masked}`);
assert(!FULL_PHONE.test(masked), 'القناع نفسه ليس رقماً كاملاً');

const saleMap = rowToMapProperty(saleRow);
assertNoSecrets(saleMap, 'map/sale');
assert(saleMap.contactPhoneMasked === '05••• ••754', 'الخريطة ترسل القناع فقط');
assert(saleMap.plotNumber === '1420' && saleMap.planNumber === '3185', 'القطعة والمخطط باقيان');
assert(saleMap.area === 450 && saleMap.price === 3200000, 'السعر والمساحة باقيان');
assert(saleMap.coverImage.includes('cover.webp'), 'الصورة باقية');
assert(!saleMap.features, 'رد الخريطة لا يرسل features');
assert(String(saleMap.description).includes('05••• ••754'), 'الرقم داخل الوصف يُستبدل بالقناع');
assert(!String(saleMap.description).includes('ملاحظة سرية'), 'الملاحظة الداخلية ليست في وصف الخريطة');

const buyMap = rowToMapProperty(buyRow);
assertNoSecrets(buyMap, 'map/buy');
assert(!buyMap.contactPhoneMasked, 'طلب الشراء بلا قناع جوال');
assert(buyMap.isBuyRequest === true, 'طلب الشراء يبقى مميزاً');
assert(buyMap.requestUsage === 'residential', 'تصنيف الطلب يبقى');

const salePublic = toPublicProperty(rowToProperty(saleRow, []));
assertNoSecrets(salePublic, 'property/sale');
assert(salePublic.features && salePublic.features.property_description, 'وصف features العام يبقى');
assert(!salePublic.features.marketer_meta, 'marketer_meta محذوف');
assert(!salePublic.features.contact_phone, 'contact_phone محذوف من features');
assert(salePublic.plotNumber === '1420', 'صفحة العقار تبقي رقم القطعة');
assert(salePublic.title === 'فيلا النرجس', 'عنوان العقار يبقى');

const buyPublic = toPublicProperty(rowToProperty(buyRow, []));
assertNoSecrets(buyPublic, 'property/buy');
assert(!buyPublic.features.request_phone, 'request_phone محذوف من features');
assert(buyPublic.features.request_usage === 'residential', 'استخدام الطلب يبقى');
assert(String(buyPublic.description).includes('05••• ••233') || !String(buyPublic.description).includes(BUYER), 'وصف طلب الشراء لا يحتفظ بالرقم الكامل');

async function checkLive(base) {
  const banned = /contact_phone|request_phone|requestPhone|agent_phone|agentPhone|internal_notes|internalNotes|admin_feedback|adminFeedback|marketer_meta|"contactPhone"(?!Masked)/;
  async function load(path) {
    const res = await fetch(`${base}${path}`);
    const text = await res.text();
    return { status: res.status, text };
  }
  const paths = [
    '/api/map/properties',
    '/api/properties?limit=20',
    '/api/properties?listing_type=buy_request&limit=20',
    '/api/offers',
  ];
  for (const path of paths) {
    const { status, text } = await load(path);
    assert(status === 200, `${path} → ${status}`);
    assert(!FULL_PHONE.test(text), `${path}: لا رقم كامل`);
    FULL_PHONE.lastIndex = 0;
    assert(!banned.test(text), `${path}: لا مفاتيح حساسة`);
  }
  const map = JSON.parse((await load('/api/map/properties')).text);
  const sample = (map.items || []).find((item) => item.slug) || null;
  assert(sample, 'الخريطة أعادت عقاراً واحداً على الأقل');
  if (!sample) return;
  const bySlug = await load(`/api/properties/slug/${encodeURIComponent(sample.slug)}`);
  const byId = await load(`/api/properties/id/${encodeURIComponent(sample.id)}`);
  assert(bySlug.status === 200 && bySlug.text.includes(sample.title), 'صفحة البيانات بالـ slug تعمل');
  assert(byId.status === 200 && byId.text.includes(sample.title), 'صفحة البيانات بالـ id تعمل');
  assert(!FULL_PHONE.test(bySlug.text) && !banned.test(bySlug.text), 'slug بلا رقم أو مفتاح حساس');
  FULL_PHONE.lastIndex = 0;
  assert(!FULL_PHONE.test(byId.text) && !banned.test(byId.text), 'id بلا رقم أو مفتاح حساس');
  const cfg = JSON.parse((await load('/api/config')).text);
  assert(cfg.whatsapp && String(cfg.whatsapp).replace(/\D/g, '').length >= 11, 'رقم واتساب المكتب ما زال في /api/config');
}

if (process.exitCode) {
  console.error('\nفشل اختبار التنظيف');
} else if (process.env.LIVE_BASE) {
  checkLive(process.env.LIVE_BASE).then(() => {
    if (process.exitCode) console.error('\nفشل الفحص الحي');
    else console.log('\nكل فحوصات التنظيف نجحت، بما فيها الخادم المحلي');
  }).catch((err) => {
    console.error('✗', err.message);
    process.exitCode = 1;
  });
} else {
  console.log('\nكل فحوصات التنظيف نجحت');
}
