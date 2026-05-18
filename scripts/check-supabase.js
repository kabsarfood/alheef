#!/usr/bin/env node
/**
 * التحقق من اتصال Supabase وجداول المشروع
 * الاستخدام: node scripts/check-supabase.js
 */
require('dotenv').config();

const { initSupabase, isEnabled, getAdmin, SUPABASE_URL } = require('../server/lib/supabase');
const { ensureBucket, BUCKET } = require('../server/services/storage');

const TABLES = ['settings', 'properties', 'property_images', 'news', 'requests', 'subscriptions', 'banners', 'testimonials', 'dashboard_users'];

async function checkTable(name) {
  const { error } = await getAdmin().from(name).select('*', { count: 'exact', head: true });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  الهيف — فحص اتصال Supabase');
  console.log('═══════════════════════════════════════\n');

  if (!SUPABASE_URL) {
    console.error('✗ SUPABASE_URL غير معرّف في .env');
    console.log('\nأضف في ملف .env:');
    console.log('SUPABASE_URL=https://imostnqoxeqefshtzcxd.supabase.co');
    process.exit(1);
  }

  console.log('المشروع:', SUPABASE_URL);

  if (!initSupabase()) {
    console.error('\n✗ SUPABASE_SERVICE_ROLE_KEY غير معرّف أو غير صالح');
    console.log('من Supabase → Project Settings → API → service_role (سرّي)');
    process.exit(1);
  }

  console.log('\n── الجداول ──');
  let allOk = true;
  for (const table of TABLES) {
    const result = await checkTable(table);
    if (result.ok) {
      console.log(`  ✓ ${table}`);
    } else {
      allOk = false;
      console.log(`  ✗ ${table}: ${result.message}`);
      if (/relation|does not exist/i.test(result.message)) {
        console.log('    → نفّذ supabase/schema.sql في SQL Editor');
      }
    }
  }

  console.log('\n── التخزين (صور الشعار والعقارات) ──');
  try {
    await ensureBucket();
    const { data, error } = await getAdmin().storage.from(BUCKET).list('', { limit: 1 });
    if (error) {
      console.log(`  ⚠ bucket "${BUCKET}": ${error.message}`);
    } else {
      console.log(`  ✓ bucket "${BUCKET}" جاهز`);
    }
  } catch (err) {
    console.log(`  ✗ التخزين: ${err.message}`);
    allOk = false;
  }

  const { data: settings } = await getAdmin().from('settings').select('site_name, hero_title').eq('id', 'main').maybeSingle();
  if (settings?.site_name) {
    console.log(`\n── الإعدادات ──`);
    console.log(`  ✓ اسم الموقع: ${settings.site_name}`);
  }

  console.log('\n═══════════════════════════════════════');
  if (allOk) {
    console.log('  ✓ Supabase جاهز — الموقع والداشبورد يتحكمان بالبيانات');
    console.log('  لوحة التحكم: https://www.alheef.website/dashboard/login.html');
  } else {
    console.log('  ⚠ يوجد نقص — راجع الرسائل أعلاه');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
