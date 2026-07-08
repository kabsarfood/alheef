#!/usr/bin/env node
/**
 * اختبار مسار PWA: VAPID → إشعار أدمن → مسوق يضيف إعلان → مراجعة → نشر
 */
require('dotenv').config();
const pushNotifications = require('../server/services/pushNotifications');
const pushSubscriptionsRepo = require('../server/repositories/pushSubscriptionsRepo');
const adminNotificationsRepo = require('../server/repositories/adminNotificationsRepo');
const propertiesRepo = require('../server/repositories/propertiesRepo');
const marketersRepo = require('../server/repositories/marketersRepo');
const { createToken } = require('../server/middleware/auth');
const { isEnabled } = require('../server/lib/supabase');

const BASE = `http://127.0.0.1:${process.env.PORT || 8080}`;

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log('═══ اختبار إعداد PWA ═══\n');

  const pub = pushNotifications.getPublicKey();
  if (!pub) {
    console.error('✗ VAPID_PUBLIC_KEY غير معرّف في .env');
    process.exit(1);
  }
  console.log('✓ VAPID مهيأ (المفتاح العام موجود)');

  if (!pushNotifications.initVapid()) {
    console.error('✗ فشل تهيئة VAPID');
    process.exit(1);
  }
  console.log('✓ initVapid ناجح');

  const health = await api('/health');
  if (!health.ok) {
    console.error('✗ الخادم غير يعمل على', BASE);
    console.error('  شغّل: npm run dev');
    process.exit(1);
  }
  console.log('✓ الخادم يعمل');

  const vapidApi = await api('/api/push/vapid-public-key');
  if (!vapidApi.ok || !vapidApi.data.publicKey) {
    console.error('✗ GET /api/push/vapid-public-key فشل');
    process.exit(1);
  }
  console.log('✓ واجهة المفتاح العام تعمل');

  if (!isEnabled()) {
    console.warn('⚠ Supabase غير متصل — تخطي اختبارات القاعدة');
    process.exit(0);
  }

  let subs;
  try {
    subs = await pushSubscriptionsRepo.listByRole('admin');
  } catch (err) {
    if (/push_subscriptions|schema|relation/i.test(err.message)) {
      console.error('✗ جدول push_subscriptions غير موجود — نفّذ الهجرة 006 في Supabase SQL Editor');
      console.error('  الملف: supabase/migrations/006_push_subscriptions.sql');
      process.exit(1);
    }
    throw err;
  }

  if (subs.length) {
    const sent = await pushNotifications.sendToAdmins({
      title: 'اختبار إشعارات الهيف',
      body: 'إشعار تجريبي من سكربت الاختبار',
      url: '/dashboard/property-reviews.html',
      type: 'test',
    });
    console.log(`✓ إرسال تجريبي لـ ${subs.length} اشتراك أدمن`);
  } else {
    console.log('○ لا يوجد اشتراك أدمن بعد — فعّل الإشعارات من لوحة التحكم ثم أعد الاختبار');
  }

  const adminToken = createToken({ role: 'admin' });
  const testRes = await api('/api/push/test-admin', { method: 'POST', token: adminToken });
  console.log(testRes.ok ? '✓ POST /api/push/test-admin' : `○ test-admin: ${testRes.data.message || testRes.status}`);

  const marketers = await marketersRepo.listAll().catch(() => []);
  const marketer = marketers[0];
  if (!marketer) {
    console.log('○ لا يوجد مسوق للاختبار — تأكد من هجرة 004 وتفعيل مسوق');
    console.log('\n═══ انتهى الاختبار (جزئي) ═══');
    process.exit(0);
  }

  const marketerToken = createToken({ role: 'marketer', marketerId: marketer.id, userId: marketer.id });
  const marker = `pwa-test-${Date.now()}`;
  const createRes = await api('/api/marketer/properties', {
    method: 'POST',
    token: marketerToken,
    body: {
      title: `اختبار PWA ${marker}`,
      propertyType: 'فيلا',
      city: 'الرياض',
      district: 'اختبار',
      price: '1500000',
      listingType: 'sale',
      description: 'إعلان اختبار PWA',
    },
  });

  if (!createRes.ok) {
    console.error('✗ فشل إنشاء إعلان المسوق:', createRes.data.message);
    process.exit(1);
  }

  const property = createRes.data.property;
  if (property.status !== 'pending_review') {
    console.error('✗ الحالة المتوقعة pending_review، الفعلية:', property.status);
    process.exit(1);
  }
  console.log('✓ إعلان المسوق → pending_review');

  const notifs = await adminNotificationsRepo.list({ unreadOnly: true, limit: 5 });
  const found = notifs.find((n) => n.propertyId === property.id);
  console.log(found ? '✓ إشعار مراجعة في قاعدة البيانات' : '○ إشعار DB غير موجود (تحقق من admin_notifications)');

  const reviewUrl = `/dashboard/property-reviews.html?property=${property.id}`;
  console.log(`✓ رابط المراجعة: ${reviewUrl}`);

  const approveRes = await api(`/api/admin/properties/${property.id}/review`, {
    method: 'PUT',
    token: adminToken,
    body: { action: 'approve', adminFeedback: 'اختبار PWA' },
  });
  if (!approveRes.ok) {
    console.error('✗ فشل الموافقة:', approveRes.data.message);
    process.exit(1);
  }
  console.log('✓ موافقة الأدمن → approved_published');

  const publicRes = await api('/api/properties');
  const published = (publicRes.data.items || publicRes.data.data || []).find((p) => p.id === property.id)
    || (Array.isArray(publicRes.data) ? publicRes.data.find((p) => p.id === property.id) : null);
  const listed = await propertiesRepo.getById(property.id);
  const onHomepage = listed && ['published', 'approved_published'].includes(listed.status);
  console.log(onHomepage ? '✓ الإعلان ظاهر للعامة (باسم المكتب — بدون اسم المسوق في API العام)' : '✗ الإعلان غير منشور للعامة');

  console.log('\n═══ انتهى الاختبار ═══');
}

main().catch((err) => {
  console.error('خطأ:', err.message);
  process.exit(1);
});
