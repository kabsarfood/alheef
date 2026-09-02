/**
 * اختبار أرقام الثقة لصفحة إيجار
 * node --use-system-ca scripts/test-ejar-trust-stats.js
 */
require('dotenv').config();

const { initSupabase } = require('../server/lib/supabase');
const { getEjarTrustStats } = require('../server/services/ejarTrustStats');
const {
  getCompletedContractsBase,
  getVisitorsBase,
  getReviewsBase,
} = require('../server/utils/ejarReviewConfig');

async function run() {
  if (!initSupabase()) {
    console.error('✗ Supabase غير متصل');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const ok = (msg) => { console.log('✓', msg); passed += 1; };
  const fail = (msg) => { console.error('✗', msg); failed += 1; };

  const stats = await getEjarTrustStats();
  const base = getCompletedContractsBase();
  const visitorsBase = getVisitorsBase();
  const reviewsBase = getReviewsBase();

  if (typeof stats.visitors !== 'number' || stats.visitors < visitorsBase) fail('زوار المنصة من الأساس التاريخي');
  else ok('زوار المنصة = ' + stats.visitors + ' (أساس ' + visitorsBase + ')');

  if (stats.contracts < base) fail('عداد العقود يبدأ من الأساس التاريخي ' + base);
  else ok('عقود مكتملة = ' + stats.contracts + ' (أساس ' + base + ')');

  if (typeof stats.reviewsCount !== 'number' || stats.reviewsCount < reviewsBase) fail('عدد التقييمات من الأساس التاريخي');
  else ok('تقييمات = ' + stats.reviewsCount + ' (أساس ' + reviewsBase + ')');

  if (typeof stats.reviewsAverage !== 'number' || stats.reviewsAverage < 0 || stats.reviewsAverage > 5) {
    fail('متوسط النجوم بين 0 و 5');
  } else ok('متوسط التقييم = ' + stats.reviewsAverage);

  const cached = await getEjarTrustStats();
  if (cached.visitors !== stats.visitors || cached.contracts !== stats.contracts) fail('الكاش يعيد نفس النتيجة');
  else ok('الكاش يعمل');

  const requestsRepo = require('../server/repositories/requestsRepo');
  const ejarReviewsRoutes = require('../server/routes/ejarReviews');
  const { invalidateEjarTrustStats } = require('../server/services/ejarTrustStats');

  invalidateEjarTrustStats();
  const before = await getEjarTrustStats();

  const createdReq = await requestsRepo.create({
    requestType: 'ejar_contract',
    customerName: 'عداد إنشاء عقد',
    customerPhone: '0500000091',
    message: JSON.stringify({ schema: 'ejar_contract_v2', contractKind: 'residential' }),
    status: 'contract_created',
  });
  if (!createdReq?.id) fail('إنشاء طلب بحالة تم إنشاء العقد');
  invalidateEjarTrustStats();
  const afterCreated = await getEjarTrustStats();
  if (afterCreated.contracts !== before.contracts + 1) {
    fail('عداد العقود بعد إنشاء العقد: ' + before.contracts + ' → ' + afterCreated.contracts);
  } else ok('إنشاء العقد يزيد عدد العقود أسفل الموقع');

  const reviewReq = await requestsRepo.create({
    requestType: 'ejar_contract',
    customerName: 'عداد رابط تقييم',
    customerPhone: '0500000092',
    message: JSON.stringify({ schema: 'ejar_contract_v2', contractKind: 'commercial' }),
    status: 'new',
  });
  const link = await ejarReviewsRoutes.createReviewLinkForRequest(reviewReq.id);
  if (!link?.reviewUrl) fail('زر إنشاء رابط التقييم');
  const afterLink = await getEjarTrustStats();
  if (afterLink.contracts !== afterCreated.contracts + 1) {
    fail('عداد العقود بعد رابط التقييم: ' + afterCreated.contracts + ' → ' + afterLink.contracts);
  } else ok('زر إنشاء رابط التقييم يزيد عدد العقود أسفل الموقع');

  await requestsRepo.updateStatus(reviewReq.id, 'contract_created');
  invalidateEjarTrustStats();
  const afterBoth = await getEjarTrustStats();
  if (afterBoth.contracts !== afterLink.contracts) {
    fail('لا يُحسب الطلب مرتين عند الحالة ورابط التقييم');
  } else ok('الطلب الواحد يُحسب مرة واحدة حتى لو أُنشئ العقد وأُرسل رابط التقييم');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
