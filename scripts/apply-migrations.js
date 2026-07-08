#!/usr/bin/env node
/**
 * تطبيق هجرات Supabase — يتطلب SUPABASE_DB_PASSWORD أو DATABASE_URL
 */
require('dotenv').config();
const { applyMigrationsIfNeeded, getSchemaStatus } = require('../server/lib/sqlMigrations');

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  الهيف — تطبيق هجرات قاعدة البيانات');
  console.log('═══════════════════════════════════════\n');

  const before = await getSchemaStatus();
  console.log('حالة الهجرات:');
  console.log(`  004 مسوقين:        ${before.marketer ? '✓' : '—'}`);
  console.log(`  005 إشعارات:       ${before.notifications ? '✓' : '—'}`);
  console.log(`  006 push:          ${before.push ? '✓' : '—'}`);
  console.log(`  007 بريد/كلمة مرور: ${before.emailPassword ? '✓' : '—'}`);
  console.log('');

  if (before.allReady) {
    console.log('✓ جميع الهجرات مُطبَّقة مسبقاً');
    return;
  }

  if (!process.env.SUPABASE_DB_PASSWORD && !(process.env.DATABASE_URL || '').startsWith('postgres')) {
    console.error('✗ SUPABASE_DB_PASSWORD غير معرّف في ملف .env المحلي');
    console.log('  Supabase → Project Settings → Database → Database password');
    console.log('  أضف السطر: SUPABASE_DB_PASSWORD=...');
    console.log('  ثم أعد التشغيل: npm run migrate:sql');
    process.exit(1);
  }

  const result = await applyMigrationsIfNeeded({ silent: false });
  if (result.skipped === 'no_password') {
    console.error('✗ أضف SUPABASE_DB_PASSWORD في ملف .env');
    process.exit(1);
  }
  if (result.already) {
    console.log('✓ جميع الهجرات مُطبَّقة مسبقاً');
    return;
  }
  if (result.applied) {
    console.log('\n✓ اكتملت الهجرات:', (result.appliedLabels || []).join(', ') || '—');
    const s = result.status || await getSchemaStatus();
    console.log(`  007 بريد/كلمة مرور: ${s.emailPassword ? '✓' : '⚠ انتظر دقيقة ثم أعد الفحص'}`);
    if (result.warning) console.log('  (قد يستغرق schema cache دقيقة)');
    return;
  }
  console.error('✗ فشل تطبيق الهجرة');
  process.exit(1);
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
