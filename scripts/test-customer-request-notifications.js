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

  const notif1 = await notifyAdminsNewCustomerRequest(ejarRequest);
  if (!notif1 || notif1.type !== 'customer_request_received') fail('نوع الإشعار customer_request_received');
  else ok('Notification من نوع customer_request_received');

  if (notif1?.title !== 'طلب جديد لعقد إيجار') fail('عنوان إشعار ejar_contract');
  else ok('عنوان إشعار ejar_contract صحيح');

  if (!String(notif1?.payload?.body || '').includes('سكني')) fail('نص نوع العقد السكني');
  else ok('نص نوع العقد السكني في body');

  if (notif1?.payload?.requestId !== ejarRequest.id) fail('ربط requestId في payload');
  else ok('ربط requestId في payload');

  if (notif1?.payload?.requestType !== 'ejar_contract') fail('ربط requestType في payload');
  else ok('ربط requestType في payload');

  const notifDup = await adminNotificationsRepo.createCustomerRequestReceived({
    requestId: ejarRequest.id,
    requestType: ejarRequest.requestType,
    message: ejarRequest.message,
  });
  if (notifDup?.id !== notif1?.id) fail('تكرار إشعار لنفس الطلب');
  else ok('منع تكرار الإشعار لنفس request_id');

  const afterUnread = await adminNotificationsRepo.countUnread();
  if (afterUnread <= beforeUnread) fail('زيادة unread counter');
  else ok(`unread counter ارتفع (${beforeUnread} → ${afterUnread})`);

  const searchRequest = await requestsRepo.create({
    requestType: 'property_search',
    customerName: 'اختبار بحث',
    customerPhone: '0500000002',
    message: JSON.stringify({ propertyType: 'شقة', city: 'جدة' }),
  });
  const searchNotif = await notifyAdminsNewCustomerRequest(searchRequest);
  if (searchNotif?.title !== 'طلب جديد للبحث عن عقار') fail('عنوان إشعار property_search');
  else ok('عنوان إشعار property_search صحيح');

  await adminNotificationsRepo.markReadByRequestId(ejarRequest.id);
  const found = await adminNotificationsRepo.findRequestNotification(ejarRequest.id);
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
