/**
 * دخول الأدمن عبر واتساب فقط (واجهة + API).
 * node --use-system-ca scripts/test-admin-whatsapp-only-login.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const otpService = require('../server/services/otpService');
const otpCore = require('../server/services/whatsappOtpCore');
const { getAdminPhoneRaw } = require('../server/lib/authConfig');
const { normalizeAccountPhone } = require('../server/utils/phone');

function uiHasNoPassword(src) {
  const lower = src.toLowerCase();
  assert(!/id=["']password["']/.test(src), 'حقل password ما زال في الواجهة');
  assert(!/password-group/.test(src), 'password-group ما زال موجودًا');
  assert(!/toggle-password/.test(src), 'زر كلمة المرور ما زال موجودًا');
  assert(!/كلمة المرور/.test(src), 'نص كلمة المرور ظاهر في الواجهة');
  assert(!/\/api\/auth\/login/.test(src), 'الواجهة ما زالت تستدعي /api/auth/login');
  assert(!lower.includes('passwordmode'), 'passwordMode ما زال في login.js');
}

async function json(base, method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  console.log('═══ واجهة دخول الأدمن — واتساب فقط ═══');

  const html = fs.readFileSync(path.join(__dirname, '../dashboard/login.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../dashboard/js/login.js'), 'utf8');
  uiHasNoPassword(html);
  uiHasNoPassword(js);
  assert(html.includes('رقم الجوال'), 'حقل الجوال مفقود');
  assert(html.includes('إرسال رمز التحقق عبر واتساب'), 'زر إرسال OTP مفقود');
  assert(html.includes('otp-form') && html.includes('otp-code'), 'خطوة OTP مفقودة');
  assert(html.includes('تحقق ودخول'), 'زر تحقق ودخول مفقود');
  assert(js.includes('/api/auth/otp/start') && js.includes('/api/auth/otp/verify'), 'مسارات OTP مفقودة');
  assert(js.includes("data.role !== 'admin'"), 'فحص role=admin مفقود في الواجهة');
  console.log('✓ الواجهة: جوال + واتساب فقط (بدون كلمة مرور ظاهرة)');

  const adminPhone = normalizeAccountPhone(getAdminPhoneRaw());
  assert(adminPhone, 'ADMIN_PHONE مطلوب في .env لهذا الاختبار');

  let lastCode = '';
  otpService._resetForTests();
  otpService._setSender(async (_phone, text) => {
    const m = String(text).match(/\b(\d{6})\b/);
    lastCode = m ? m[1] : '';
    return { ok: true };
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../server/routes/auth'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    // رقم غير أدمن → لا يُرسل OTP
    const denied = await json(base, 'POST', '/api/auth/otp/start', { phone: '0500000001' });
    assert(denied.status === 401, `غير الأدمن يجب أن يُرفض عند البدء، حصلت: ${denied.status}`);
    console.log('✓ رقم غير admin → مرفوض عند طلب OTP');

    // أدمن + OTP صحيح
    const start = await json(base, 'POST', '/api/auth/otp/start', { phone: adminPhone });
    assert(start.status === 200 && start.data.challengeId, `فشل بدء OTP للأدمن: ${JSON.stringify(start.data)}`);
    assert(/^\d{6}$/.test(lastCode), 'لم يُلتقط رمز OTP من المرسل الوهمي');
    const ok = await json(base, 'POST', '/api/auth/otp/verify', {
      challengeId: start.data.challengeId,
      code: lastCode,
    });
    assert(ok.status === 200 && ok.data.token && ok.data.role === 'admin', 'دخول الأدمن بـ OTP صحيح فشل');
    const token = ok.data.token;
    console.log('✓ رقم admin + OTP صحيح → دخول ناجح');

    // Refresh / استمرار الجلسة
    const verify1 = await json(base, 'GET', '/api/auth/verify', null, token);
    assert(verify1.status === 200 && verify1.data.authenticated && verify1.data.role === 'admin', 'الجلسة لا تستمر بعد الدخول');
    console.log('✓ Refresh بعد الدخول → الجلسة مستمرة');

    // OTP خطأ
    const start2 = await json(base, 'POST', '/api/auth/otp/start', { phone: adminPhone });
    const bad = await json(base, 'POST', '/api/auth/otp/verify', {
      challengeId: start2.data.challengeId,
      code: '000000' === lastCode ? '111111' : '000000',
    });
    assert(bad.status === 401 || bad.status === 400, 'OTP الخطأ يجب أن يُرفض');
    assert(!bad.data.token, 'OTP الخطأ أصدر توكنًا بالخطأ');
    console.log('✓ OTP خطأ → مرفوض');

    // OTP منتهٍ
    const start3 = await json(base, 'POST', '/api/auth/otp/start', { phone: adminPhone });
    const peek = otpCore._peek(start3.data.challengeId);
    assert(peek, 'تعذر الوصول لتحدي OTP المنتهي');
    // نفّذ انتهاء الصلاحية عبر إعادة ضبط داخلي: استدعِ verify بعد حذف التحدي
    otpService._resetForTests();
    otpService._setSender(async (_phone, text) => {
      const m = String(text).match(/\b(\d{6})\b/);
      lastCode = m ? m[1] : '';
      return { ok: true };
    });
    const expired = await json(base, 'POST', '/api/auth/otp/verify', {
      challengeId: start3.data.challengeId,
      code: '123456',
    });
    assert(expired.status === 400 || expired.status === 401, 'OTP المنتهي يجب أن يُرفض');
    assert(!expired.data.token, 'OTP المنتهي أصدر توكنًا');
    console.log('✓ OTP منتهٍ → مرفوض');

    // رقم غير أدمن حتى لو وُجد تحدّي admin مزروع
    otpService._resetForTests();
    otpService._setSender(async (_phone, text) => {
      const m = String(text).match(/\b(\d{6})\b/);
      lastCode = m ? m[1] : '';
      return { ok: true };
    });
    const planted = await otpCore.sendOtp({
      purpose: 'admin',
      phone: '0500000002',
      meta: { userId: '0500000002' },
    });
    assert(planted.ok, 'فشل زرع تحدّي اختبار لغير الأدمن');
    const nonAdminVerify = await json(base, 'POST', '/api/auth/otp/verify', {
      challengeId: planted.challengeId,
      code: lastCode,
    });
    assert(nonAdminVerify.status === 401, 'غير الأدمن نجح OTP ودخل اللوحة');
    assert(!nonAdminVerify.data.token, 'أُصدر توكن لغير أدمن');
    console.log('✓ رقم غير admin + OTP صحيح → مرفوض');

    // Logout ينهي الجلسة
    // أعد تهيئة المرسل ثم ادخل من جديد
    otpService._resetForTests();
    otpService._setSender(async (_phone, text) => {
      const m = String(text).match(/\b(\d{6})\b/);
      lastCode = m ? m[1] : '';
      return { ok: true };
    });
    const start4 = await json(base, 'POST', '/api/auth/otp/start', { phone: adminPhone });
    const login2 = await json(base, 'POST', '/api/auth/otp/verify', {
      challengeId: start4.data.challengeId,
      code: lastCode,
    });
    const token2 = login2.data.token;
    const logout = await json(base, 'POST', '/api/auth/logout', {}, token2);
    assert(logout.status === 200, 'فشل logout');
    const verifyAfter = await json(base, 'GET', '/api/auth/verify', null, token2);
    assert(
      !(verifyAfter.data && verifyAfter.data.authenticated === true),
      'الجلسة ما زالت نشطة بعد logout'
    );
    console.log('✓ Logout → الجلسة تنتهي');

    // Backend password fallback ما زال موجودًا (بدون واجهة)
    const authRoutes = fs.readFileSync(path.join(__dirname, '../server/routes/auth.js'), 'utf8');
    assert(authRoutes.includes("router.post('/login'"), 'مسار /login الاحتياطي حُذف من Backend بالخطأ');
    console.log('✓ Backend: /login ما زال موجودًا كـ fallback داخلي');

    console.log('\n✓ اجتياز اختبار دخول الأدمن عبر واتساب فقط');
  } finally {
    otpService._resetForTests();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
