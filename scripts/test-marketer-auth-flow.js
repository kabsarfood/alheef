#!/usr/bin/env node
/**
 * اختبار تدفق تسجيل المسوق + موافقة + دخول + استعادة كلمة المرور
 * الاستخدام: node scripts/test-marketer-auth-flow.js [baseUrl]
 */
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const BASE = (process.argv[2] || `http://127.0.0.1:${process.env.PORT || 8080}`).replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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

async function cleanup(phone, email) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const db = createClient(url, key);

  const { data: marketers } = await db.from('marketers').select('id').or(`phone.eq.${phone},email.ilike.${email}`);
  for (const m of marketers || []) {
    await db.from('marketer_password_reset_tokens').delete().eq('marketer_id', m.id);
    await db.from('marketers').delete().eq('id', m.id);
  }
  await db.from('marketer_join_requests').delete().eq('phone', phone);
  await db.from('marketer_join_requests').delete().ilike('email', email);
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  اختبار تدفق مسوق الهيف');
  console.log('═══════════════════════════════════════\n');
  console.log('الخادم:', BASE);

  const suffix = Date.now().toString().slice(-7);
  const phone = `05${suffix}`.slice(0, 10);
  const email = `test.${suffix}@alheef-test.local`;
  const password = 'TestPass123';
  const newPassword = 'NewPass456';

  await cleanup(phone, email);

  // 1) انضمام
  const join = await json('POST', '/api/marketer/join', {
    fullName: 'مسوق اختبار',
    phone,
    email,
    nationalId: `1${suffix}`.padEnd(10, '0').slice(0, 10),
    falLicense: `FAL${suffix}`,
    marketingZone: 'north_riyadh',
    password,
    confirmPassword: password,
  });
  assert(join.status === 200 && join.data.success, `انضمام فشل: ${join.data.message || join.status}`);
  const requestId = join.data.request?.id;
  assert(requestId, 'لم يُرجع معرّف الطلب');
  console.log('✓ نموذج الانضمام (بريد + كلمة مرور)');

  // 2) موافقة أدمن
  assert(ADMIN_PASSWORD, 'ADMIN_PASSWORD مطلوب في .env للاختبار');
  const adminLogin = await json('POST', '/api/auth/login', { password: ADMIN_PASSWORD });
  assert(adminLogin.data.token, 'فشل دخول الأدمن');
  const approve = await json('PUT', `/api/admin/marketer-join-requests/${requestId}`, { action: 'approve' }, adminLogin.data.token);
  assert(approve.data.success && approve.data.marketer, `موافقة فشلت: ${approve.data.message || approve.status}`);
  console.log('✓ موافقة الأدمن');

  // 3) دخول بالجوال
  const loginPhone = await json('POST', '/api/auth/marketer/login', { login: phone, password });
  assert(loginPhone.data.success && loginPhone.data.token, `دخول بالجوال فشل: ${loginPhone.data.message}`);
  console.log('✓ دخول بالجوال + كلمة المرور');

  // 4) دخول بالبريد
  const loginEmail = await json('POST', '/api/auth/marketer/login', { email, password });
  assert(loginEmail.data.success && loginEmail.data.token, `دخول بالبريد فشل: ${loginEmail.data.message}`);
  console.log('✓ دخول بالبريد + كلمة المرور');

  // 5) نسيت كلمة المرور — token في DB
  const forgot = await json('POST', '/api/auth/marketer/forgot-password', { email });
  assert(forgot.data.success, `نسيت كلمة المرور فشل: ${forgot.data.message}`);
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const marketerId = approve.data.marketer.id;
  const { data: tokenRows } = await db
    .from('marketer_password_reset_tokens')
    .select('id, token_hash, expires_at, used_at')
    .eq('marketer_id', marketerId)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  assert(tokenRows?.length, 'لم يُنشأ reset token في قاعدة البيانات');
  console.log('✓ نسيت كلمة المرور — token في DB');

  // استخراج الرمز الخام عبر إنشاء token معروف (نحاكي عبر repo)
  const passwordResetRepo = require('../server/repositories/passwordResetRepo');
  const { token: rawToken } = await passwordResetRepo.createToken(marketerId);

  // 6) إعادة تعيين كلمة المرور
  const reset = await json('POST', '/api/auth/marketer/reset-password', {
    token: rawToken,
    password: newPassword,
    confirmPassword: newPassword,
  });
  assert(reset.data.success, `إعادة التعيين فشلت: ${reset.data.message}`);
  console.log('✓ صفحة/API إعادة تعيين كلمة المرور');

  const loginNew = await json('POST', '/api/auth/marketer/login', { login: phone, password: newPassword });
  assert(loginNew.data.success, 'الدخول بكلمة المرور الجديدة فشل');
  console.log('✓ الدخول بكلمة المرور الجديدة');

  await cleanup(phone, email);
  console.log('\n✓ اكتمل الاختبار بنجاح');
}

main().catch(async (err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
