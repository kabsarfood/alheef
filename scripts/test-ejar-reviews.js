/**
 * اختبار نظام تقييمات عقود الإيجار + الإشعارات الداخلية
 * node scripts/test-ejar-reviews.js
 */
require('dotenv').config();

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

  console.log('\n--- ملخص ---');
  console.log(`نجح: ${passed} | فشل: ${failed}`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
