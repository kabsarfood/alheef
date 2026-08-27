/**
 * اختبار إشعارات طلبات العملاء في admin_notifications
 * node scripts/test-customer-request-notifications.js
 */
require('dotenv').config();

const { initSupabase } = require('../server/lib/supabase');
const requestsRepo = require('../server/repositories/requestsRepo');
const adminNotificationsRepo = require('../server/repositories/adminNotificationsRepo');
const { notifyAdminsNewCustomerRequest } = require('../server/services/customerRequestNotifications');

async function run() {
  if (!initSupabase()) {
    console.error('✗ Supabase غير متصل');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const ok = (msg) => { console.log('✓', msg); passed += 1; };
  const fail = (msg) => { console.error('✗', msg); failed += 1; };

  const beforeUnread = await adminNotificationsRepo.countUnread();

  const ejarRequest = await requestsRepo.create({
    requestType: 'ejar_contract',
    customerName: 'اختبار إشعار',
    customerPhone: '0500000001',
    message: JSON.stringify({ contractType: 'سكني', city: 'الرياض', role: 'مؤجر' }),
  });
  if (!ejarRequest?.id) fail('إنشاء طلب ejar_contract');
  else ok('إنشاء طلب ejar_contract');

  const skipped = await notifyAdminsNewCustomerRequest(ejarRequest);
  if (skipped != null) fail('إيقاف إشعار إدارة نموذج ejar_contract');
  else ok('لا يُرسل إشعار إدارة عند حفظ طلب ejar_contract');

  const skippedRow = await adminNotificationsRepo.findRequestNotification(ejarRequest.id);
  if (skippedRow) fail('عدم إنشاء صف إشعار لنموذج ejar_contract');
  else ok('لا يُنشأ صف إشعار لنموذج ejar_contract');

  const afterEjarUnread = await adminNotificationsRepo.countUnread();
  if (afterEjarUnread !== beforeUnread) fail('عداد الإشعارات غير المقروءة لم يرتفع بعد ejar_contract');
  else ok('عداد الإشعارات غير المقروءة لم يتغير بعد حفظ نموذج عقد الإيجار');

  const searchRequest = await requestsRepo.create({
    requestType: 'property_search',
    customerName: 'اختبار بحث',
    customerPhone: '0500000002',
    message: JSON.stringify({ propertyType: 'شقة', city: 'جدة' }),
  });
  const searchNotif = await notifyAdminsNewCustomerRequest(searchRequest);
  if (searchNotif?.title !== 'طلب جديد للبحث عن عقار') fail('عنوان إشعار property_search');
  else ok('عنوان إشعار property_search صحيح');

  const afterSearchUnread = await adminNotificationsRepo.countUnread();
  if (afterSearchUnread <= afterEjarUnread) fail('بقاء إشعارات البحث عن عقار');
  else ok('إشعارات طلب البحث عن عقار ما زالت تعمل');

  const listingRequest = await requestsRepo.create({
    requestType: 'owner_listing',
    customerName: 'اختبار عرض',
    customerPhone: '0500000003',
    message: JSON.stringify({ propertyType: 'فيلا', city: 'الدمام' }),
  });
  const listingNotif = await notifyAdminsNewCustomerRequest(listingRequest);
  if (listingNotif?.title !== 'طلب جديد لعرض عقار') fail('عنوان إشعار owner_listing');
  else ok('إشعارات طلب عرض عقار ما زالت تعمل');

  await adminNotificationsRepo.markReadByRequestId(searchRequest.id);
  await adminNotificationsRepo.markReadByRequestId(listingRequest.id);
  const found = await adminNotificationsRepo.findRequestNotification(searchRequest.id);
  if (found?.isRead !== true) fail('markReadByRequestId');
  else ok('markReadByRequestId يعمل');

  const content = adminNotificationsRepo.buildCustomerRequestNotificationContent({
    requestType: 'ejar_contract',
    message: JSON.stringify({ contractType: 'تجاري' }),
  });
  if (!content.body.includes('تجاري')) fail('نص العقد التجاري');
  else ok('نص العقد التجاري صحيح');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
