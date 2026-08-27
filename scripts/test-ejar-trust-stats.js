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

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
