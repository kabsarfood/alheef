/**
 * اختبار E2E لدخول الأدمن عبر واتساب + فحص contacts
 * node --use-system-ca scripts/test-admin-whatsapp-e2e.js
 * لإكمال التحقق: node --use-system-ca scripts/test-admin-whatsapp-e2e.js --code=123456
 */
require('dotenv').config();

const BASE = `http://127.0.0.1:${process.env.TEST_PORT || process.env.PORT || 8099}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const codeArg = process.argv.find((a) => a.startsWith('--code='));
  const otpCode = codeArg ? codeArg.split('=')[1].trim() : '';
  const adminPhone = (process.env.ADMIN_PHONE || '').trim();
  const report = {
    adminWhatsApp: [],
    contacts: [],
    blockers: [],
  };

  console.log('═══ 1) فحص البيئة ═══');
  if (!adminPhone) {
    report.blockers.push('ADMIN_PHONE غير مضبوط في .env — مطلوب لإرسال OTP للأدمن');
  } else {
    report.adminWhatsApp.push('ADMIN_PHONE مضبوط');
  }

  const evo = require('../server/services/evolutionWhatsApp');
  if (!evo.isConfigured()) {
    report.blockers.push('Evolution WhatsApp غير مهيأ');
  } else {
    report.adminWhatsApp.push('Evolution API مهيأ');
    try {
      const state = await evo.getConnectionState();
      report.adminWhatsApp.push(`حالة واتساب: ${state.state || state.status || JSON.stringify(state)}`);
    } catch (err) {
      report.blockers.push(`فشل فحص اتصال Evolution: ${err.message}`);
    }
  }

  const health = await json('GET', '/health').catch(() => ({ status: 0, data: {} }));
  if (health.status !== 200) {
    report.blockers.push(`الخادم غير يعمل على ${BASE} — شغّل: set PORT=8099 && npm run dev`);
  } else {
    report.adminWhatsApp.push(`الخادم يعمل (${BASE})`);
  }

  console.log('═══ 2) contacts في قاعدة البيانات ═══');
  const { getAdmin, isEnabled, initSupabase } = require('../server/lib/supabase');
  initSupabase();
  if (!isEnabled()) {
    report.contacts.push('Supabase غير متصل');
  } else {
    const tables = ['contacts', 'contact_business_roles', 'contact_sources', 'app_users', 'app_user_roles'];
    for (const t of tables) {
      const { error } = await getAdmin().from(t).select('*', { count: 'exact', head: true });
      report.contacts.push(error ? `✗ ${t}: ${error.message}` : `✓ ${t} موجود`);
    }
    const { count: contactCount } = await getAdmin()
      .from('contacts')
      .select('*', { count: 'exact', head: true });
    report.contacts.push(`عدد جهات الاتصال الحالية: ${contactCount || 0}`);
  }

  if (report.blockers.length) {
    console.log('\n── نتائج أولية ──');
    report.adminWhatsApp.forEach((l) => console.log('•', l));
    report.contacts.forEach((l) => console.log('•', l));
    console.log('\nحواجز:');
    report.blockers.forEach((l) => console.log('✗', l));
    process.exit(2);
  }

  console.log('═══ 3) رفض رقم غير أدمن ═══');
  const stranger = await json('POST', '/api/auth/otp/start', { phone: '0500000099' });
  assert(stranger.status === 401, `المتوقع 401 لرقم عادي، حصل ${stranger.status}`);
  report.adminWhatsApp.push('✓ رقم عادي لا يحصل على OTP أدمن');

  console.log('═══ 4) إرسال OTP حقيقي للأدمن ═══');
  const start = await json('POST', '/api/auth/otp/start', { phone: adminPhone });
  assert(start.status === 200 && start.data.challengeId, `فشل إرسال OTP: ${start.data.message || start.status}`);
  report.adminWhatsApp.push('✓ تم إرسال OTP عبر واتساب (تحقق من هاتف الأدمن)');
  const challengeId = start.data.challengeId;

  if (!otpCode) {
    console.log('\n══════════════════════════════════════');
    console.log('وصل الرمز إلى واتساب. أكمل التحقق:');
    console.log(`node --use-system-ca scripts/test-admin-whatsapp-e2e.js --code=XXXXXX`);
    console.log(`challengeId=${challengeId}`);
    console.log('══════════════════════════════════════\n');
    // احفظ challenge للخطوة التالية
    const fs = require('fs');
    fs.writeFileSync(
      require('path').join(__dirname, '../tmp-admin-otp-challenge.json'),
      JSON.stringify({ challengeId, phone: adminPhone, at: Date.now() }),
      'utf8'
    );
    report.adminWhatsApp.push('⏳ بانتظار رمز OTP منك (--code=)');
    printReport(report);
    process.exit(0);
  }

  console.log('═══ 5) تحقق OTP + جلسة + صلاحية admin ═══');
  let challenge = challengeId;
  try {
    const saved = JSON.parse(require('fs').readFileSync(
      require('path').join(__dirname, '../tmp-admin-otp-challenge.json'),
      'utf8'
    ));
    if (saved.challengeId) challenge = saved.challengeId;
  } catch { /* use current */ }

  const verify = await json('POST', '/api/auth/otp/verify', { challengeId: challenge, code: otpCode });
  assert(verify.status === 200 && verify.data.token, `فشل التحقق: ${verify.data.message}`);
  assert(verify.data.role === 'admin', 'الدور ليس admin');
  report.adminWhatsApp.push('✓ التحقق نجح والدور admin');

  const token = verify.data.token;
  const me = await json('GET', '/api/auth/verify', null, token);
  assert(me.status === 200 && me.data.role === 'admin', 'verify فشل');
  report.adminWhatsApp.push('✓ /api/auth/verify يعترف بجلسة الأدمن');

  const adminApi = await json('GET', '/api/admin/system-status', null, token);
  assert(adminApi.status === 200, `لوحة الإدارة API رفضت: ${adminApi.status}`);
  report.adminWhatsApp.push('✓ الوصول لـ /api/admin يعمل');

  // إعادة التحقق = بقاء الجلسة
  const me2 = await json('GET', '/api/auth/verify', null, token);
  assert(me2.status === 200 && me2.data.authenticated, 'الجلسة اختفت بعد إعادة الطلب');
  report.adminWhatsApp.push('✓ الجلسة ثابتة بعد طلبات متتالية (محاكاة إعادة تحميل)');

  const logout = await json('POST', '/api/auth/logout', null, token);
  assert(logout.status === 200, 'logout فشل');
  const afterLogout = await json('GET', '/api/auth/verify', null, token);
  assert(afterLogout.status === 401 || afterLogout.data.authenticated === false, 'الجلسة ما زالت فعّالة بعد الخروج');
  const adminAfter = await json('GET', '/api/admin/system-status', null, token);
  assert(adminAfter.status === 401, 'API الإدارة ما زال يقبل توكن بعد الخروج');
  report.adminWhatsApp.push('✓ تسجيل الخروج يبطل الجلسة فعلياً');

  // رقم عادي لا يدخل حتى لو حاول verify عشوائي
  report.adminWhatsApp.push('✓ مسار الأدمن مغلق لغير المصرّح (اختُبر عند otp/start)');

  printReport(report);
  console.log('\n✓ اجتياز اختبار دخول الأدمن عبر واتساب (E2E)');
}

function printReport(report) {
  console.log('\n════════ التقرير ════════');
  console.log('\n1) دخول الأدمن عبر واتساب:');
  report.adminWhatsApp.forEach((l) => console.log('  -', l));
  console.log('\n2) قاعدة contacts:');
  report.contacts.forEach((l) => console.log('  -', l));
  if (report.blockers.length) {
    console.log('\nحواجز:');
    report.blockers.forEach((l) => console.log('  ✗', l));
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
