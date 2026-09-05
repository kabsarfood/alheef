/**
 * اختبار نظام تقييمات عقود الإيجار + الإشعارات الداخلية
 * node scripts/test-ejar-reviews.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { initSupabase } = require('../server/lib/supabase');
const requestsRepo = require('../server/repositories/requestsRepo');
const ejarReviewsRoutes = require('../server/routes/ejarReviews');
const ejarReviewsRepo = require('../server/repositories/ejarReviewsRepo');
const adminNotificationsRepo = require('../server/repositories/adminNotificationsRepo');
const { generateToken } = require('../server/services/ejarReviewService');

async function run() {
  if (!initSupabase()) {
    console.error('✗ Supabase غير متصل');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const ok = (msg) => { console.log('✓', msg); passed += 1; };
  const fail = (msg) => { console.error('✗', msg); failed += 1; };

  const reviewJs = fs.readFileSync(path.join(__dirname, '../public/js/ejar-review.js'), 'utf8');
  if (!/readToken/.test(reviewJs) || !/focusReview/.test(reviewJs) || !/scrollIntoView/.test(reviewJs)) {
    fail('نموذج التقييم يُركَّز عند الفتح');
  } else ok('نموذج التقييم يُستخرج من الرابط ويُركَّز في الشاشة');

  const swJs = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
  if (!/isReviewPath/.test(swJs) || !/ejar-review.html/.test(swJs)) fail('مسار التقييم لا يسقط للصفحة الرئيسية');
  else ok('Service Worker لا يستبدل صفحة التقييم بالرئيسية');

  const request = await requestsRepo.create({
    requestType: 'ejar_contract',
    customerName: 'اختبار تقييم',
    customerPhone: '0500000000',
    customerEmail: '',
    message: JSON.stringify({ city: 'الرياض', role: 'مؤجر' }),
    status: 'new',
  });
  if (!request?.id) return fail('إنشاء طلب ejar_contract');
  ok('إنشاء طلب ejar_contract');

  const link = await ejarReviewsRoutes.createReviewLinkForRequest(request.id);
  if (!link.reviewUrl) return fail('إنشاء رابط تقييم');
  ok('إنشاء رابط تقييم');
  if (!link.whatsappUrl || !link.whatsappUrl.includes('wa.me/966500000000')) fail('واتساب يُرسل لجوال العميل');
  else ok('رابط واتساب يذهب إلى جوال العميل صاحب الطلب');
  if (!String(link.whatsappMessage || '').startsWith('تشرفنا في خدمتكم في الهيف العقارية')) fail('نص رسالة التقييم');
  else ok('رسالة واتساب تبدأ: تشرفنا في خدمتكم في الهيف العقارية');
  if (!decodeURIComponent(link.whatsappUrl).includes('أرجو التقييم')) fail('الرسالة تطلب التقييم');
  else ok('الرسالة تطلب التقييم مع الرابط');

  const token = link.reviewUrl.split('/').pop();
  const beforeUnread = await adminNotificationsRepo.countUnread();

  const review = await ejarReviewsRepo.create({
    requestId: request.id,
    reviewTokenId: (await require('../server/repositories/ejarReviewTokensRepo').findByRawToken(token)).id,
    rating: 5,
    comment: 'خدمة ممتازة',
    displayName: 'عميل',
    city: 'الرياض',
    publishConsent: true,
  });

  await require('../server/repositories/ejarReviewTokensRepo').markUsed(
    (await require('../server/repositories/ejarReviewTokensRepo').findByRawToken(token)).id
  );

  const notif1 = await adminNotificationsRepo.createEjarReviewReceived({
    reviewId: review.id,
    requestId: request.id,
    rating: 5,
  });
  if (!notif1 || notif1.type !== 'ejar_review_received') fail('نوع الإشعار ejar_review_received');
  else ok('Notification من نوع ejar_review_received');

  if (!notif1.payload?.reviewId || notif1.payload.reviewId !== review.id) fail('ربط review_id في payload');
  else ok('ربط review_id في payload');

  if (!String(notif1.payload?.body || '').includes('⭐⭐⭐⭐⭐')) fail('نص النجوم في الإشعار');
  else ok('نص النجوم الصحيح (5)');

  const notifDup = await adminNotificationsRepo.createEjarReviewReceived({
    reviewId: review.id,
    requestId: request.id,
    rating: 5,
  });
  if (notifDup.id !== notif1.id) fail('تكرار إشعار لنفس التقييم');
  else ok('منع تكرار الإشعار لنفس review');

  const afterUnread = await adminNotificationsRepo.countUnread();
  if (afterUnread <= beforeUnread) fail('زيادة unread counter');
  else ok('زيادة unread counter');

  await adminNotificationsRepo.markReadByReviewId(review.id);
  const refreshed = await adminNotificationsRepo.findEjarReviewNotification(review.id);
  if (!refreshed.isRead) fail('تعليم الإشعار read');
  else ok('تعليم الإشعار read');

  const stillPending = await ejarReviewsRepo.getById(review.id);
  if (stillPending.status !== 'pending') fail('قراءة الإشعار لا تعتمد التقييم');
  else ok('التقييم يبقى pending بعد قراءة الإشعار');

  await ejarReviewsRepo.setStatus(review.id, 'approved');
  const pendingAfter = await ejarReviewsRepo.countPending();
  ok(`بعد الاعتماد pendingCount=${pendingAfter}`);

  const publicStats = await ejarReviewsRepo.getPublicStats();
  if (publicStats.minRequired > 1) fail('الحد الأدنى لعرض التقييمات يجب أن يكون 1');
  else ok('التقييمات تظهر في صفحة العقود من أول تقييم معتمد');

  console.log('\n--- ملخص ---');
  console.log(`نجح: ${passed} | فشل: ${failed}`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
