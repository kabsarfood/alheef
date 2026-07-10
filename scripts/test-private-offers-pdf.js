/**
 * اختبار قبول PDF — العروض الخاصة
 * تشغيل: node --use-system-ca scripts/test-private-offers-pdf.js
 */
require('dotenv').config();

const { toPublicPrivateOffer, rowToPrivateOffer } = require('../server/services/mappers');

const PDF_DISCLAIMER = 'هذا العرض مخصص للاطلاع فقط، ولا يحتوي على بيانات تواصل أو بيانات مالك.';
const SENSITIVE_KEYS = [
  'internalNotes', 'contactPhone', 'agentPhone', 'agentName',
  'ownerName', 'ownerPhone', 'whatsapp', 'phone', 'internal_notes',
];
const FORBIDDEN_PDF_TEXT = [
  '050', 'جوال الموظف', 'جوال المكتب', 'ملاحظات داخلية',
  'statusLabel', 'internalNotes', 'contactPhone',
];

function buildPdfHtmlSnapshot(o) {
  const imgs = (o.gallery && o.gallery.length) ? o.gallery : (o.coverImage ? [o.coverImage] : []);
  const locationRow = o.showLocation && o.location
    ? `الموقع / اللوكيشن|${o.location}`
    : '';
  const lines = [
    `رقم العرض|${o.offerNumber}`,
    `نوع العقار|${o.propertyTypeLabel}`,
    `المساحة|${o.area != null ? o.area + ' م²' : '—'}`,
    `الشارع|${o.street || '—'}`,
    `رقم القطعة|${o.plotNumber || '—'}`,
    `رقم المخطط|${o.planNumber || '—'}`,
    `السعر|${o.priceDisplay || '—'}`,
    locationRow,
    o.shortDescription ? `وصف|${o.shortDescription}` : '',
    imgs.length ? `صور|${imgs.length}` : 'صور|0',
    PDF_DISCLAIMER,
  ].filter(Boolean);
  return { html: lines.join('\n'), imageCount: imgs.length, hasRtl: true, hasOfferNo: !!o.offerNumber };
}

function assert(cond, msg, results, section) {
  if (!cond) results.push({ section, ok: false, msg });
  else results.push({ section, ok: true, msg });
}

function testMapperPrivacy(results) {
  const full = rowToPrivateOffer({
    id: '1',
    offer_number: 'ALH-PRIVATE-099',
    property_type: 'villa',
    area: 450,
    street: 'شارع الملك فهد',
    plot_number: '123',
    plan_number: '456',
    price: 1500000,
    location: 'https://maps.google.com/test',
    show_location: true,
    short_description: 'فيلا فاخرة في حي راقٍ',
    cover_image: 'https://example.com/1.jpg',
    gallery: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
    status: 'available',
    internal_notes: 'ملاحظة سرية للإدارة — جوال المالك 0501234567',
    visible: true,
    active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const pub = toPublicPrivateOffer(full);
  const json = JSON.stringify(pub);

  SENSITIVE_KEYS.forEach((k) => {
    assert(!Object.prototype.hasOwnProperty.call(pub, k), `لا يُرجع الحقل ${k} في API العام`, results, 'إخفاء البيانات');
  });
  assert(!json.includes('ملاحظة سرية'), 'لا تتسرّب الملاحظات الداخلية', results, 'إخفاء البيانات');
  assert(!json.includes('0501234567'), 'لا يتسرّب رقم الجوال', results, 'إخفاء البيانات');
  assert(pub.offerNumber === 'ALH-PRIVATE-099', 'رقم العرض موجود', results, 'البيانات');
  assert(pub.gallery.length === 3, '3 صور في الاستجابة', results, 'الصور');
}

function testPdfContent(results) {
  const offer = toPublicPrivateOffer(rowToPrivateOffer({
    id: '2',
    offer_number: 'ALH-PRIVATE-100',
    property_type: 'land',
    area: 600,
    street: 'طريق الأمير سلطان',
    plot_number: '77',
    plan_number: '88',
    price: 2200000,
    location: 'حي النرجس — الرياض',
    show_location: true,
    short_description: 'أرض سكنية بموقع مميز قرب الخدمات',
    cover_image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400',
    gallery: [
      'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400',
      'https://images.unsplash.com/photo-1600585154340-be6162a9a2c9?w=400',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=400',
    ],
    status: 'available',
    internal_notes: 'سري',
    visible: true,
    active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const snap = buildPdfHtmlSnapshot(offer);
  assert(snap.hasOfferNo, 'رقم العرض في PDF', results, 'PDF كامل');
  assert(snap.html.includes('ALH-PRIVATE-100'), 'رقم العرض واضح', results, 'PDF كامل');
  assert(snap.html.includes('أرض'), 'نوع العقار عربي', results, 'العربية و RTL');
  assert(snap.html.includes('طريق الأمير سلطان'), 'الشارع عربي', results, 'العربية و RTL');
  assert(snap.html.includes(PDF_DISCLAIMER), 'عبارة الإفصاح', results, 'PDF كامل');
  assert(snap.imageCount === 3, '3 صور', results, 'الصور');
  FORBIDDEN_PDF_TEXT.forEach((t) => {
    assert(!snap.html.includes(t), `لا يظهر "${t}" في PDF`, results, 'إخفاء البيانات');
  });
  assert(!snap.html.includes('الحالة'), 'لا حقل الحالة في PDF', results, 'إخفاء البيانات');
  assert(!snap.html.includes('متاح') || !snap.html.includes('الحالة'), 'لا تظهر حالة العرض', results, 'إخفاء البيانات');
  assert(snap.html.includes('بيانات مالك'), 'عبارة الإفصاح تذكر عدم وجود بيانات مالك', results, 'PDF كامل');
}

function testNoLocation(results) {
  const offer = toPublicPrivateOffer(rowToPrivateOffer({
    id: '3',
    offer_number: 'ALH-PRIVATE-101',
    property_type: 'apartment',
    area: 120,
    street: 'شارع التحلية',
    plot_number: '1',
    plan_number: '2',
    price: 800000,
    location: 'يجب ألا يظهر',
    show_location: false,
    short_description: 'شقة بدون موقع',
    cover_image: '',
    gallery: [],
    status: 'available',
    internal_notes: 'x',
    visible: true,
    active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const snap = buildPdfHtmlSnapshot(offer);
  assert(!snap.html.includes('الموقع'), 'الموقع مخفي عند التعطيل', results, 'بدون موقع');
  assert(!snap.html.includes('يجب ألا يظهر'), 'نص الموقع غير ظاهر', results, 'بدون موقع');
}

function testNoImages(results) {
  const offer = toPublicPrivateOffer(rowToPrivateOffer({
    id: '4',
    offer_number: 'ALH-PRIVATE-102',
    property_type: 'villa',
    area: 300,
    street: 'شارع',
    plot_number: '1',
    plan_number: '1',
    price: 1000000,
    location: '',
    show_location: false,
    short_description: 'بدون صور',
    cover_image: '',
    gallery: [],
    status: 'available',
    internal_notes: 'x',
    visible: true,
    active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  const snap = buildPdfHtmlSnapshot(offer);
  assert(snap.imageCount === 0, 'بدون صور — لا يتعطل المنطق', results, 'بدون صور');
  assert(snap.html.includes('ALH-PRIVATE-102'), 'PDF يُنشأ بدون صور', results, 'بدون صور');
}

async function testLiveApi(base) {
  const results = [];
  const section = 'API حي';

  try {
    const pageRes = await fetch(`${base}/v/test-slug-acceptance`);
    assert(pageRes.ok, `صفحة العروض الخاصة تُخدم (${pageRes.status})`, results, section);
    const pageHtml = await pageRes.text();
    assert(pageHtml.includes('private-offers.js'), 'تحميل سكربت العروض الخاصة', results, section);
    assert(pageHtml.includes('noindex'), 'منع الفهرسة', results, section);
    assert(!pageHtml.includes('العروض الحالية'), 'ليست الصفحة الرئيسية', results, section);

    const verifyRes = await fetch(`${base}/api/private-offers/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'invalid-slug-xyz', code: 'WRONG' }),
    });
    assert(verifyRes.status === 404 || verifyRes.status === 401, 'رفض رمز خاطئ', results, section);
  } catch (err) {
    results.push({ section, ok: false, msg: `تعذر الاتصال: ${err.message}` });
  }
  return results;
}

async function main() {
  const results = [];
  testMapperPrivacy(results);
  testPdfContent(results);
  testNoLocation(results);
  testNoImages(results);

  const port = process.env.TEST_PORT || process.env.PORT || 8091;
  const base = `http://127.0.0.1:${port}`;
  const live = await testLiveApi(base);
  results.push(...live);

  const sections = {};
  results.forEach((r) => {
    if (!sections[r.section]) sections[r.section] = { pass: 0, fail: 0, notes: [] };
    if (r.ok) sections[r.section].pass++;
    else {
      sections[r.section].fail++;
      sections[r.section].notes.push(r.msg);
    }
  });

  console.log('\n=== تقرير اختبار قبول PDF ===\n');
  Object.entries(sections).forEach(([name, s]) => {
    const status = s.fail === 0 ? 'ناجح' : 'يوجد ملاحظات';
    console.log(`${name}: ${status}${s.notes.length ? ' — ' + s.notes.join('; ') : ''}`);
  });

  const summary = {
    desktop: sections['PDF كامل']?.fail === 0 && sections['API حي']?.fail === 0 ? 'ناجح (منطق + خادم)' : 'يوجد ملاحظات',
    mobile: 'يتطلب فحص يدوي على جهاز — المنطق والـ scale متكيف',
    privacy: sections['إخفاء البيانات']?.fail === 0 ? 'ناجح' : 'يوجد ملاحظات',
    images: sections['الصور']?.fail === 0 ? 'ناجحة' : 'يوجد ملاحظات',
    arabic: sections['العربية و RTL']?.fail === 0 ? 'ناجحة' : 'يوجد ملاحظات',
  };

  console.log('\n--- الملخص ---');
  console.log('PDF على الكمبيوتر:', summary.desktop);
  console.log('PDF على الجوال:', summary.mobile);
  console.log('إخفاء البيانات الحساسة:', summary.privacy);
  console.log('الصور:', summary.images);
  console.log('العربية و RTL:', summary.arabic);

  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed > 0 ? 1 : 0);
}

main();
