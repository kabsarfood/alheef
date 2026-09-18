/**
 * اختبار نواة OTP المركزية + أغراض متعددة
 * node scripts/test-whatsapp-otp-core.js
 */
const assert = require('assert');
const core = require('../server/services/whatsappOtpCore');
const otpLogin = require('../server/services/otpService');
const ejarOtp = require('../server/services/ejarOtpService');

function codeFrom(text) {
  const m = String(text).match(/(\d{6})/);
  assert(m, 'رسالة بدون رمز');
  return m[1];
}

async function main() {
  core._resetForTests();
  let last = '';
  core._setSender(async (_phone, text) => { last = text; });

  // login purpose
  const login = await otpLogin.sendLoginOtp({ purpose: 'admin', phone: '0530792754' });
  assert(login.ok, login.reason);
  const loginCode = codeFrom(last);
  assert.strictEqual(otpLogin.verify(login.challengeId, '000000').ok, false);
  const loginOk = otpLogin.verify(login.challengeId, loginCode);
  assert(loginOk.ok && loginOk.purpose === 'admin');
  assert.strictEqual(otpLogin.verify(login.challengeId, loginCode).ok, false);

  // private_offer purpose
  last = '';
  const priv = await core.sendOtp({
    purpose: 'private_offer',
    phone: '+966530792754',
    meta: { slug: 'abc12345' },
  });
  assert(priv.ok, priv.reason);
  assert(last.includes('العروض الخاصة'));
  const privOk = core.verifyOtp(priv.challengeId, codeFrom(last));
  assert(privOk.ok && privOk.purpose === 'private_offer' && privOk.meta.slug === 'abc12345');

  // ejar keep-verified
  last = '';
  const ejar = await ejarOtp.sendOtp({ phone: '0500000001', role: 'tenant', ip: '127.0.0.1' });
  assert(ejar.ok, ejar.reason);
  const ejarOk = ejarOtp.verifyOtp(ejar.verificationId, codeFrom(last));
  assert(ejarOk.ok && ejarOk.session.role === 'tenant');
  assert(ejarOtp.requireVerifiedSession(ejar.verificationId).ok);
  ejarOtp.markConsumed(ejar.verificationId, 'r1');
  assert.strictEqual(ejarOtp.requireVerifiedSession(ejar.verificationId).ok, false);

  // نفس الرقم بصيغ مختلفة
  last = '';
  const a = await core.sendOtp({ purpose: 'marketer', phone: '966500000002' });
  assert(a.ok);
  const peek = core._peek(a.challengeId);
  assert.strictEqual(peek.phone, '0500000002');

  core._resetForTests();
  console.log('✓ نواة OTP المركزية تعمل لكل الأغراض');
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
