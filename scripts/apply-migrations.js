#!/usr/bin/env node
/**
 * تطبيق هجرات Supabase — يتطلب SUPABASE_DB_PASSWORD أو DATABASE_URL
 */
require('dotenv').config();
const { applyMigrationsIfNeeded, isMarketerSchemaReady } = require('../server/lib/sqlMigrations');

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  الهيف — تطبيق هجرات قاعدة البيانات');
  console.log('═══════════════════════════════════════\n');

  if (await isMarketerSchemaReady()) {
    console.log('✓ الهجرة مُطبَّقة مسبقاً — جدول marketer_join_requests موجود');
    return;
  }

  const result = await applyMigrationsIfNeeded({ silent: false });
  if (result.already) {
    console.log('✓ الهجرة مُطبَّقة مسبقاً');
    return;
  }
  if (result.skipped === 'no_password') {
    console.error('✗ أضف SUPABASE_DB_PASSWORD في ملف .env');
    console.log('  Supabase → Project Settings → Database → Database password');
    console.log('  ثم أعد التشغيل: npm run migrate:sql');
    process.exit(1);
  }
  if (result.applied) {
    console.log('\n✓ اكتملت الهجرة — طلبات الانضمام والمسوقين جاهزة');
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
