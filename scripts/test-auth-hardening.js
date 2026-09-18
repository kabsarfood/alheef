/**
 * اختبارات تأمين الدخول والأسرار (بدون خادم وبدون شبكة).
 * node scripts/test-auth-hardening.js
 */
require('dotenv').config();

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const {
  getAuthSecret,
  getAdminPhoneRaw,
  isUnsafeSecret,
  validateAuthConfig,
} = require('../server/lib/authConfig');
const { createToken, parseToken, checkPassword } = require('../server/middleware/auth');
const { createRateLimiter } = require('../server/utils/rateLimit');
const { hashPassword, verifyPassword } = require('../server/utils/password');

function main() {
  console.log('═══ auth hardening ═══');

  assert(isUnsafeSecret('alheef-admin-secret'), 'يجب رفض السر الافتراضي القديم');
  assert(isUnsafeSecret('123456'), 'يجب رفض كلمة مرور ضعيفة');
  assert(isUnsafeSecret('short'), 'يجب رفض السر القصير');
  assert(!isUnsafeSecret('a-sufficiently-long-secret-value'), 'سر طويل صالح رُفض بالخطأ');
  console.log('✓ رفض القيم الافتراضية غير الآمنة');

  const authSrc = require('fs').readFileSync(require('path').join(__dirname, '../server/middleware/auth.js'), 'utf8');
  assert(!authSrc.includes('alheef-admin-secret'), 'ما زال السر الافتراضي موجوداً في auth.js');
  const routesSrc = require('fs').readFileSync(require('path').join(__dirname, '../server/routes/auth.js'), 'utf8');
  assert(!routesSrc.includes('0530792754'), 'ما زال رقم الجوال الافتراضي في auth routes');
  assert(!routesSrc.includes('req.query.token'), 'قبول token في query ما زال موجوداً');
  console.log('✓ لا Hardcoded secrets في مسارات الدخول');

  const secret = getAuthSecret();
  assert(secret, 'ADMIN_SECRET أو ADMIN_PASSWORD مطلوب في .env لتشغيل هذا الاختبار');
  const token = createToken({ role: 'admin', userId: 'test-user' });
  const payload = parseToken(token);
  assert(payload && payload.role === 'admin' && payload.userId === 'test-user', 'فشل إنشاء/تحقق التوكن');
  assert(!parseToken(token.slice(0, -2) + 'xx'), 'توقيع مزوّر قُبل بالخطأ');
  console.log('✓ HMAC + timing-safe تحقق التوكن');

  if ((process.env.ADMIN_PASSWORD || '').trim()) {
    assert(checkPassword(process.env.ADMIN_PASSWORD), 'checkPassword يرفض كلمة المرور الحالية');
    assert(!checkPassword(process.env.ADMIN_PASSWORD + '-wrong'), 'checkPassword يقبل كلمة مرور خاطئة');
    console.log('✓ مقارنة كلمة مرور الأدمن');
  } else if ((process.env.ADMIN_PASSWORD_HASH || '').trim()) {
    console.log('~ تخطي فحص ADMIN_PASSWORD (يستخدم HASH فقط)');
  }

  const hash = hashPassword('MarketerTestPass1');
  assert(verifyPassword('MarketerTestPass1', hash), 'فشل تحقق scrypt');
  assert(!verifyPassword('wrong', hash), 'scrypt قبل كلمة خاطئة');
  console.log('✓ تشفير كلمات مرور المسوقين (scrypt)');

  const limiter = createRateLimiter({ max: 3, windowMs: 60_000 });
  assert(limiter.allow('ip-1'), 'rate 1');
  assert(limiter.allow('ip-1'), 'rate 2');
  assert(limiter.allow('ip-1'), 'rate 3');
  assert(!limiter.allow('ip-1'), 'rate 4 يجب أن يُرفض');
  assert(limiter.allow('ip-2'), 'IP آخر يجب أن يُسمح');
  console.log('✓ rate limiter');

  const supabaseSrc = require('fs').readFileSync(require('path').join(__dirname, '../server/lib/supabase.js'), 'utf8');
  assert(!/return getAdmin\(\)/.test(supabaseSrc), 'getPublic ما زال يسقط إلى getAdmin');
  console.log('✓ getPublic لا يستخدم service_role كبديل');

  const phone = getAdminPhoneRaw();
  if (!phone) {
    console.warn('⚠ ADMIN_PHONE غير مضبوط — دخول لوحة الإدارة سيُرفض حتى تضيفه');
  } else {
    console.log('✓ ADMIN_PHONE مضبوط');
  }

  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const result = validateAuthConfig({ exitProcess: false });
  process.env.NODE_ENV = prev;
  assert(typeof result.ok === 'boolean', 'validateAuthConfig لم يُرجع نتيجة');
  console.log(result.ok ? '✓ validateAuthConfig (تطوير) بدون أخطاء إلزامية' : '⚠ validateAuthConfig أخطاء: ' + result.errors.join(' | '));

  console.log('\n✓ اجتياز اختبارات تأمين الدخول');
}

try {
  main();
} catch (err) {
  console.error('✗', err.message);
  process.exit(1);
}
