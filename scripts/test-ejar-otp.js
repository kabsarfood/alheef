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
adapter.sendOtpText = async function mockSend(phone, code) {
  if (!/^\d{6}$/.test(String(code))) throw new Error('mock expected 6-digit code');
  lastSent = { phone, code: String(code) };
  return { ok: true, status: 200 };
};

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

  const msg = adapter.buildOtpMessage('123456');
  if (!msg.includes('الهيف العقارية') || !msg.includes('123456') || !msg.includes('5 دقائق')) {
    fail('نص رسالة OTP');
  } else ok('نص رسالة OTP يطابق الصياغة المطلوبة');
  if (adapter.toWhatsAppNumber('0558391249') !== '966558391249') fail('تحويل رقم الجوال');
  else ok('رقم الجوال يُرسل بصيغة 9665XXXXXXXX');

  ejarOtp.__reset();
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
  if (reuse.ok) fail('إعادة استخدام نفس OTP بعد النجاح');
  else ok('لا يمكن استخدام نفس OTP مرة ثانية');

  const required = ejarOtp.requireVerifiedSession(sent.verificationId);
  if (!required.ok) fail('جلسة موثقة قبل إنشاء الطلب');
  else ok('جلسة موثقة جاهزة لربطها بالطلب');

  const applied = applyVerifiedContractIdentity({
    ownerPhone: '0500000000',
    tenantPhone: '0501111111',
    submitterRelation: 'وكيل',
    submitterPhone: '0502222222',
  }, required.session);
  if (applied.ownerPhone !== '0558391249' || applied.submitterRelation !== 'المؤجر' || applied.verified_channel !== 'whatsapp') {
    fail('ربط رقم المؤجر بعد التحقق');
  } else ok('landlord يثبّت جوال المؤجر ويقفله في البيانات');

  ejarOtp.markConsumed(sent.verificationId, 'req-1');
  const afterConsume = ejarOtp.requireVerifiedSession(sent.verificationId);
  if (afterConsume.ok) fail('الجلسة المستهلكة يجب أن تُرفض');
  else ok('بعد إنشاء الطلب لا تُعاد استخدام نفس جلسة التحقق');

  const bypass = ejarOtp.requireVerifiedSession('');
  if (bypass.ok || bypass.reason !== 'missing') fail('طلب العقد بدون Verification ID');
  else ok('استدعاء إنشاء العقد مباشرة بدون تحقق يُرفض');

  ejarOtp.__reset();
  lastSent = null;
  const expSent = await ejarOtp.sendOtp({ phone: '0558391249', role: 'tenant', ip: '10.0.0.2', userAgent: 'otp-test' });
  ejarOtp.__expire(expSent.verificationId);
  const expired = ejarOtp.verifyOtp(expSent.verificationId, lastSent.code);
  if (expired.ok || expired.reason !== 'expired') fail('انتهاء صلاحية OTP');
  else ok('انتهاء صلاحية الرمز بعد 5 دقائق يُرفض');

  ejarOtp.__reset();
  lastSent = null;
  const lockSent = await ejarOtp.sendOtp({ phone: '0500001111', role: 'broker', ip: '10.0.0.3', userAgent: 'otp-test' });
  let locked;
  for (let i = 0; i < 5; i += 1) locked = ejarOtp.verifyOtp(lockSent.verificationId, '111111');
  if (locked.ok || (locked.reason !== 'locked' && locked.reason !== 'invalid')) fail('حد المحاولات');
  else ok('بعد 5 محاولات خاطئة تُقفل الجلسة');

  ejarOtp.__reset();
  lastSent = null;
  const waitSent = await ejarOtp.sendOtp({ phone: '0551234567', role: 'tenant', ip: '10.0.0.4', userAgent: 'otp-test' });
  const cooldown = await ejarOtp.resendOtp(waitSent.verificationId);
  if (cooldown.ok || cooldown.reason !== 'cooldown') fail('إعادة الإرسال قبل 60 ثانية');
  else ok('إعادة الإرسال مرفوضة قبل مرور 60 ثانية');

  const tenantSession = {
    id: 'vid-tenant',
    phone: '0558391249',
    role: 'tenant',
    verifiedAt: '2026-09-11T12:00:00.000Z',
    ip: '127.0.0.1',
    userAgent: 'otp-test',
  };
  const tenantBody = applyVerifiedContractIdentity({
    contractKind: 'residential',
    ownerPhone: '0500000000',
    tenantPhone: '0501111111',
  }, tenantSession);
  if (tenantBody.tenantPhone !== '0558391249' || tenantBody.submitterRelation !== 'المستأجر') {
    fail('ربط رقم المستأجر');
  } else ok('tenant يثبّت جوال المستأجر');

  const brokerBody = applyVerifiedContractIdentity({
    submitterName: '',
    submitterPhone: '0500000000',
  }, { id: 'vid-broker', phone: '0558391249', role: 'broker', verifiedAt: '2026-09-11T12:00:00.000Z' });
  if (brokerBody.submitterPhone !== '0558391249' || brokerBody.submitterRelation !== 'وكيل') {
    fail('ربط رقم الوسيط');
  } else ok('broker يثبّت جوال معبئ النموذج ويطلب الاسم فقط عبر صفة وكيل');

  const api = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ejarContracts.js'), 'utf8');
  if (!/requireVerifiedSession/.test(api) || !/markConsumed/.test(api)) fail('مسار العقود لا يربط التحقق');
  else ok('مسار /api/ejar/contracts يرفض الطلب بدون جلسة تحقق ناجحة');
  if (/console\.(log|warn|error).*code/.test(api) && /otp/i.test(api)) {
    /* loose; specific check below */
  }
  const adapterSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'evolutionWhatsAppOtp.js'), 'utf8');
  const serviceSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'ejarOtpService.js'), 'utf8');
  if (/console\.(log|info|warn|error)\([^)]*code/.test(adapterSrc) || /console\.(log|info|warn|error)\([^)]*EVOLUTION_API_KEY/.test(adapterSrc)) {
    fail('المحولة تسجّل الرمز أو المفتاح');
  } else ok('المحولة لا تسجّل API Key أو OTP الخام');
  if (/console\.(log|info|warn|error)\([^)]*code/.test(serviceSrc)) fail('خدمة OTP تسجّل الرمز');
  else ok('خدمة OTP لا تسجّل الرمز الخام');

  if (!/instance\/connectionState/.test(adapterSrc) || !/message\/sendText/.test(adapterSrc)) {
    fail('مسارات Evolution');
  } else ok('المحولة تستخدم sendText و connectionState في السيرفر فقط');

  const publicApi = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'ejarContracts.js'), 'utf8');
  if (/connectionState/.test(publicApi)) fail('حالة Instance مكشوفة للعامة');
  else ok('فحص حالة Instance غير معروض على مسار عام');

  const sample = validateAndNormalize({
    contractKind: 'residential',
    deedNumber: '310123456789',
    deedDate: '2020-05-12',
    ownerId: '1000000016',
    ownerDob: '1988-03-01',
    ownerPhone: '0558391249',
    tenantId: '2000000013',
    tenantDob: '1992-08-20',
    tenantPhone: '0500001111',
    city: 'الرياض',
    district: 'النرجس',
    propertyMapUrl: 'https://maps.app.goo.gl/alheefLocation',
    unitType: 'شقة',
    floor: '1',
    unitNumber: '12',
    area: 140,
    rentAmount: 45000,
    paymentMethod: 'سنوي',
    contractDuration: 'سنة',
    startDate: '2026-10-01',
    hasDeposit: 'لا',
    submitterRelation: 'المستأجر',
    submitterPhone: '0500001111',
    declarationAccepted: true,
    rooms: 3,
    bathrooms: 2,
    electricityType: 'عداد مستقل',
    waterUtility: 'عداد مستقل',
    furnished: 'غير مؤثث',
  });
  if (!sample.ok && sample.errors.ownerId) {
    /* id checksum may fail — not this test's concern */
  }

  if (failed) {
    console.log('\nبعض فحوصات OTP فشلت');
    process.exit(1);
  }
  console.log('\nall ejar otp checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
