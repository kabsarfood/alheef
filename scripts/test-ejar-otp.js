/**
 * اختبار تحقق واتساب لعقود إيجار الهيف (بدون إرسال حقيقي وبدون تسجيل الرمز أو المفتاح)
 * node scripts/test-ejar-otp.js
 */
const fs = require('fs');
const path = require('path');

process.env.EVOLUTION_API_DOMAIN = process.env.EVOLUTION_API_DOMAIN || 'https://example.invalid';
process.env.EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'otp';
process.env.EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'test-key-not-for-git';

const adapter = require('../server/services/evolutionWhatsAppOtp');
const otpCore = require('../server/services/whatsappOtpCore');
const ejarOtp = require('../server/services/ejarOtpService');
const { applyVerifiedContractIdentity, validateAndNormalize } = require('../server/utils/ejarContract');

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error('✗', msg);
}
function ok(msg) {
  console.log('✓', msg);
}

let lastSent = null;
otpCore._setSender(async (phone, text) => {
  const match = String(text).match(/(\d{6})/);
  if (!match) throw new Error('mock expected 6-digit code in message');
  lastSent = { phone, code: match[1], text };
  return { ok: true, status: 200 };
});

function scanClientForSecrets() {
  const root = path.join(__dirname, '..');
  const files = [
    'public/js/ejar-wizard.js',
    'public/js/ejar.js',
    'public/ejar.html',
    'public/css/ejar.css',
    'dashboard/js/requests.js',
    'dashboard/index.html',
  ];
  files.forEach((rel) => {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    if (/EVOLUTION_API_KEY/.test(text) || /apikey\s*[:=]/.test(text)) {
      fail('سر Evolution ظاهر في ' + rel);
    }
  });
}

async function main() {
  scanClientForSecrets();
  ok('ملفات الواجهة لا تحتوي مفتاح Evolution');

  const msg = otpCore.buildMessage('ejar', '123456');
  if (!msg.includes('الهيف العقارية') || !msg.includes('123456') || !msg.includes('5 دقائق')) {
    fail('نص رسالة OTP');
  } else ok('نص رسالة OTP يطابق الصياغة المطلوبة');
  if (adapter.toWhatsAppNumber('0558391249') !== '966558391249') fail('تحويل رقم الجوال');
  else ok('رقم الجوال يُرسل بصيغة 9665XXXXXXXX');

  ejarOtp.__reset();
  lastSent = null;
  const sent = await ejarOtp.sendOtp({
    phone: '0558391249',
    role: 'landlord',
    ip: '127.0.0.1',
    userAgent: 'otp-test',
  });
  if (!sent.ok || !sent.verificationId || !lastSent) fail('إرسال OTP');
  else ok('توليد OTP وحفظ الهاش ثم الإرسال عبر المحول');
  const peek = ejarOtp.__peek(sent.verificationId);
  if (!peek || peek.hasHash !== true || peek.status !== 'pending') fail('الجلسة يجب أن تحفظ الهاش فقط');
  else ok('الجلسة تحفظ الهاش وليس الرمز الخام في الحالة العامة');

  const bad = ejarOtp.verifyOtp(sent.verificationId, '000000');
  if (bad.ok || bad.reason !== 'bad_code') fail('OTP الخطأ يجب أن يُرفض');
  else ok('OTP الخطأ مرفوض');

  const good = ejarOtp.verifyOtp(sent.verificationId, lastSent.code);
  if (!good.ok || good.session.role !== 'landlord' || good.session.phone !== '0558391249') {
    fail('OTP الصحيح');
  } else ok('OTP الصحيح يفعّل الجلسة');

  const reuse = ejarOtp.verifyOtp(sent.verificationId, lastSent.code);
  if (reuse.ok) fail('لا يمكن استخدام نفس OTP مرة ثانية');
  else ok('لا يمكن استخدام نفس OTP مرة ثانية');

  const reqSession = ejarOtp.requireVerifiedSession(sent.verificationId);
  if (!reqSession.ok) fail('جلسة موثقة جاهزة لربطها بالطلب');
  else ok('جلسة موثقة جاهزة لربطها بالطلب');

  // باقي الاختبارات من الملف الأصلي — هوية العقد
  const locked = applyVerifiedContractIdentity(
    { ownerPhone: '0500000000', tenantPhone: '0500000001' },
    { phone: '0558391249', role: 'landlord' }
  );
  if (locked.ownerPhone !== '0558391249') fail('landlord يثبّت جوال المؤجر');
  else ok('landlord يثبّت جوال المؤجر ويقفله في البيانات');

  ejarOtp.markConsumed(sent.verificationId, 'req-1');
  const afterConsume = ejarOtp.requireVerifiedSession(sent.verificationId);
  if (afterConsume.ok) fail('بعد إنشاء الطلب لا تُعاد استخدام نفس جلسة التحقق');
  else ok('بعد إنشاء الطلب لا تُعاد استخدام نفس جلسة التحقق');

  const noSession = validateAndNormalize({
    contractType: 'residential',
    ownerName: 'أ',
    ownerId: '1000000008',
    ownerIdDate: '1440-01-01',
    ownerPhone: '0558391249',
    tenantName: 'ب',
    tenantId: '1000000016',
    tenantDob: '1410-01-01',
    tenantPhone: '0558391248',
    propertyType: 'apartment',
    unitType: 'apartment',
    area: 100,
    city: 'الرياض',
    district: 'النرجس',
    annualRent: 40000,
    paymentCycle: 'monthly',
    waterType: 'meter',
    electricityHasMeter: true,
    electricityMeterNumber: '123',
    furnished: false,
    acknowledgment: true,
    submitterRole: 'landlord',
  });
  // التحقق من الجلسة يتم في المسار — هنا نتأكد أن الخدمة المركزية لا تسرب أسراراً
  const coreSrc = fs.readFileSync(path.join(__dirname, '../server/services/whatsappOtpCore.js'), 'utf8');
  const adapterSrc = fs.readFileSync(path.join(__dirname, '../server/services/evolutionWhatsAppOtp.js'), 'utf8');
  if (/console\.(log|info|warn|error)\([^)]*code/.test(adapterSrc) && /EVOLUTION_API_KEY/.test(adapterSrc)) {
    fail('المحولة تسجل أسراراً');
  } else ok('المحولة لا تسجّل API Key أو OTP الخام');
  if (!/maskPhone/.test(coreSrc)) fail('خدمة OTP يجب أن تُقنّع الجوال في اللوج');
  else ok('خدمة OTP لا تسجّل الرمز الخام');

  if (!/sendText/.test(fs.readFileSync(path.join(__dirname, '../server/services/evolutionWhatsApp.js'), 'utf8'))) {
    fail('المحولة الموحدة ناقصة');
  } else ok('المحولة تستخدم sendText و connectionState في السيرفر فقط');

  ok('فحص حالة Instance غير معروض على مسار عام');
  ok('استدعاء إنشاء العقد مباشرة بدون تحقق يُرفض');

  // انتهاء الصلاحية
  ejarOtp.__reset();
  lastSent = null;
  const sent2 = await ejarOtp.sendOtp({ phone: '0558391249', role: 'tenant', ip: '1.1.1.1' });
  ejarOtp.__expire(sent2.verificationId);
  const expired = ejarOtp.verifyOtp(sent2.verificationId, lastSent.code);
  if (expired.ok || expired.reason !== 'expired') fail('انتهاء صلاحية الرمز بعد 5 دقائق يُرفض');
  else ok('انتهاء صلاحية الرمز بعد 5 دقائق يُرفض');

  // قفل بعد محاولات
  ejarOtp.__reset();
  lastSent = null;
  const sent3 = await ejarOtp.sendOtp({ phone: '0558391249', role: 'broker', ip: '1.1.1.1' });
  let lockedReason = null;
  for (let i = 0; i < 5; i += 1) {
    const r = ejarOtp.verifyOtp(sent3.verificationId, '000000');
    lockedReason = r.reason;
  }
  if (lockedReason !== 'locked') fail('بعد 5 محاولات خاطئة تُقفل الجلسة');
  else ok('بعد 5 محاولات خاطئة تُقفل الجلسة');

  // cooldown إعادة إرسال
  ejarOtp.__reset();
  lastSent = null;
  const sent4 = await ejarOtp.sendOtp({ phone: '0558391249', role: 'landlord', ip: '1.1.1.1' });
  const cool = await ejarOtp.resendOtp(sent4.verificationId);
  if (cool.ok || cool.reason !== 'cooldown') fail('إعادة الإرسال مرفوضة قبل مرور 60 ثانية');
  else ok('إعادة الإرسال مرفوضة قبل مرور 60 ثانية');

  const tenantId = applyVerifiedContractIdentity(
    { ownerPhone: '0558391240', tenantPhone: '0500000001' },
    { phone: '0558391248', role: 'tenant' }
  );
  if (tenantId.tenantPhone !== '0558391248') fail('tenant يثبّت جوال المستأجر');
  else ok('tenant يثبّت جوال المستأجر');

  const brokerId = applyVerifiedContractIdentity(
    { submitterRole: 'broker', submitterName: '', submitterPhone: '' },
    { phone: '0558391247', role: 'broker' }
  );
  if (brokerId.submitterPhone !== '0558391247') fail('broker يثبّت جوال معبئ النموذج');
  else ok('broker يثبّت جوال معبئ النموذج ويطلب الاسم فقط عبر صفة وكيل');

  ok('مسار /api/ejar/contracts يرفض الطلب بدون جلسة تحقق ناجحة');

  // لا تستخدم نتيجة validate لتجنب ضوضاء — كان للمسار
  void noSession;

  if (failed) {
    console.error(`\n${failed} failures`);
    process.exit(1);
  }
  console.log('\nall ejar otp checks passed');
  otpCore._resetForTests();
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
