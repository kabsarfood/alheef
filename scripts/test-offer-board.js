/**
 * فحص لوحة العروض دون موافقة واتساب ودون حذف صفوف.
 * node --use-system-ca scripts/test-offer-board.js
 */
require('dotenv').config();
const { getAdmin } = require('../server/lib/supabase');
const board = require('../server/services/offerBoard');
const { sealPhone, openPhone } = require('../server/utils/phoneSeal');
const { rowToMapProperty, toPublicProperty } = require('../server/services/mappers');
const mapDirect = require('../server/services/mapDirectSubmit');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log('✓', message);
}

function rawPhone(value) {
  return /05\d{8}|9665\d{8}/.test(JSON.stringify(value));
}

async function main() {
  const admin = getAdmin();
  const before = await admin.from('map_publish_requests').select('status,published_property_id').eq('request_number', 'MAP-000003').maybeSingle();
  const leftovers = await admin.from('properties').select('id').like('slug', 'offer-board-test-%').eq('status', 'published');
  for (const row of leftovers.data || []) await board.applyAction(row.id, 'withdrawn');
  const mahdia = await admin.from('properties').select('id').eq('internal_ref', 'H-MHD-000009');
  assert((mahdia.data || []).length === 1, 'H-MHD-000009 موجود مرة واحدة');

  const sealed = sealPhone('0530792754');
  assert(sealed && !sealed.includes('0530792754') && openPhone(sealed) === '0530792754', 'رقم المعلن يُشفّر ويُفك في الخادم');

  const stamp = String(Date.now()).slice(-6);
  const slug = `offer-board-test-${Date.now()}`;
  const inserted = await admin.from('properties').insert({
    title: 'اختبار لوحة العروض',
    slug,
    property_type: 'فيلا',
    listing_type: 'sale',
    city: 'الرياض',
    district: 'المهدية',
    price: 900000,
    area: 300,
    latitude: 24.6512,
    longitude: 46.5222,
    status: 'published',
    plan_number: stamp,
    plot_number: stamp,
    show_on_private_offers: true,
    show_on_map: true,
    homepage_published: false,
    advertiser_phone_encrypted: sealed,
    agent_phone: null,
  }).select('id, homepage_published').single();
  if (inserted.error) throw new Error(inserted.error.message);
  const id = inserted.data.id;

  try {
    const visible = await board.listBoard({ type: 'villa' });
    assert(visible.items.some((item) => item.id === id), 'الإعلان المعتمد يظهر في العروض');
    assert(!visible.items.some((item) => item.id === id && item.advertiserPhone), 'القائمة لا تحمل رقم المعلن');
    const one = visible.items.find((item) => item.id === id);
    assert(one.pricePerMeter == null, 'لا يُعرض سعر متر للفيلا');

    const dup = await board.findConfirmedDuplicate({ planNumber: stamp, plotNumber: stamp, district: 'المهدية' });
    assert(dup && dup.id === id, 'المخطط والقطعة يطابقان السجل نفسه');
    await board.refreshExisting(id, { price: 910000, description: 'تحديث السعر' });
    const copies = await admin.from('properties').select('id').eq('plot_number', stamp).eq('plan_number', stamp);
    assert((copies.data || []).length === 1, 'تحديث السعر لا ينشئ إعلانًا ثانيًا');

    const again = await mapDirect.submitDirect({
      details: 'للبيع فيلا في المهدية\nالمساحة 410\nقطعة 91021 مخطط 91021\nاختبار مسار الإدخال المباشر',
      maps_url: 'https://www.google.com/maps?q=24.6511,46.5211',
      contact_phone: '0530792754',
    });
    const sameRequest = await admin.from('map_publish_requests').select('id').eq('request_number', again.body.request_number);
    assert(again.body.request_number === 'MAP-000004' && (sameRequest.data || []).length === 1, 'إعادة الإرسال تعيد رقم الطلب نفسه دون نسخة جديدة');

    const pending = await board.listBoard({});
    const pendingRow = await admin.from('map_publish_requests').select('published_property_id').eq('request_number', 'MAP-000003').maybeSingle();
    assert(!pending.items.some((item) => item.requestNumber === 'MAP-000003'), 'طلب بانتظار الموافقة لا يظهر كعقار');
    assert(pendingRow.data && pendingRow.data.published_property_id === before.data.published_property_id, 'هذه المهمة لم تغيّر MAP-000003');

    await board.applyAction(id, 'sold');
    const afterSold = await board.listBoard({}, { admin: true });
    const archive = await board.listBoard({ archive: '1' }, { admin: true });
    assert(!afterSold.items.some((item) => item.id === id) && archive.items.some((item) => item.id === id), 'المباع يختفي ويبقى في الأرشيف');
    await board.applyAction(id, 'withdrawn');
    const afterWithdrawn = await board.listBoard({ archive: '1' }, { admin: true });
    assert(afterWithdrawn.items.some((item) => item.id === id && item.status === 'withdrawn'), 'المسحوب يبقى في الأرشيف');

    const adminItem = await board.getBoardItem(id, { admin: true });
    const publicItem = await board.getBoardItem(id, { admin: false });
    assert(adminItem.advertiserPhone === '0530792754', 'الأدمن يرى الرقم');
    assert(publicItem == null, 'العميل لا يفتح إعلانًا مسحوبًا');
    assert(!Object.prototype.hasOwnProperty.call(board.card({ property_type: 'فيلا', gallery: [] }), 'advertiserPhone'), 'بطاقة العرض العامة ليس فيها رقم');

    const mapped = rowToMapProperty({ property_type: 'فيلا', price: 1, area: 1, agent_phone: '0530792754', contact_phone: '0530792754', gallery: [] });
    const pub = toPublicProperty({ propertyType: 'فيلا', price: 1, features: { contact_phone: '0530792754' }, gallery: [] });
    assert(!rawPhone(mapped) && !rawPhone(pub), 'واجهة الخريطة العامة لا تُرجع الرقم كاملًا');

    const home = await admin.from('properties').select('homepage_published').eq('id', id).single();
    assert(home.data.homepage_published === false, 'الاختبار لم يُضف إلى الصفحة الرئيسية');
    await board.applyAction(id, 'reactivate');
    await board.applyAction(id, 'homepage_on');
    const flagged = await admin.from('properties').select('homepage_published').eq('id', id).single();
    assert(flagged.data.homepage_published === true, 'اختيار الرئيسية يدوي');
    await board.applyAction(id, 'homepage_off');
    await board.applyAction(id, 'withdrawn');
  } finally {
    const leftovers = await admin.from('properties').select('id,status').like('slug', 'offer-board-test-%').neq('status', 'withdrawn');
    for (const row of leftovers.data || []) await board.applyAction(row.id, 'withdrawn');
    const after = await admin.from('map_publish_requests').select('status,published_property_id').eq('request_number', 'MAP-000003').maybeSingle();
    assert(after.data && after.data.status === before.data.status && after.data.published_property_id == before.data.published_property_id, 'MAP-000003 حافظ على حالته');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
