/**
 * يوم الإحصائيات = تقويم الرياض من منتصف الليل
 * node scripts/test-riyadh-analytics-day.js
 */
const { dateInRiyadh, todayDate, riyadhDateDaysAgo } = require('../server/repositories/siteAnalyticsRepo');

function expect(label, ok, extra) {
  console.log(ok ? '✓' : '✗', label, extra || '');
  return ok ? 0 : 1;
}

let failed = 0;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
failed += expect('todayDate YYYY-MM-DD', isoDate.test(todayDate()), todayDate());
failed += expect('dateInRiyadh matches todayDate', dateInRiyadh() === todayDate());

const beforeMidnightUtc = new Date('2026-08-29T21:30:00.000Z'); // 00:30 الرياض في 30 أغسطس
failed += expect(
  'منتصف ليل الرياض يبدأ يوم 30 وليس 29 UTC',
  dateInRiyadh(beforeMidnightUtc) === '2026-08-30',
  dateInRiyadh(beforeMidnightUtc),
);

const afterRiyadhMidnight = new Date('2026-08-29T21:00:00.000Z'); // 00:00 الرياض
failed += expect(
  '00:00 الرياض = يوم جديد',
  dateInRiyadh(afterRiyadhMidnight) === '2026-08-30',
  dateInRiyadh(afterRiyadhMidnight),
);

const beforeRiyadhMidnight = new Date('2026-08-29T20:59:00.000Z'); // 23:59 الرياض 29
failed += expect(
  '23:59 الرياض ما زال يوم 29',
  dateInRiyadh(beforeRiyadhMidnight) === '2026-08-29',
  dateInRiyadh(beforeRiyadhMidnight),
);

const ago = riyadhDateDaysAgo(1);
failed += expect('أمس تقويم صحيح', isoDate.test(ago) && ago < todayDate(), ago);

process.exit(failed ? 1 : 0);
