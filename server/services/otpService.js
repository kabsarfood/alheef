/**
 * واجهة OTP لتسجيل الدخول — تغلّف الخدمة المركزية.
 */
const core = require('./whatsappOtpCore');

function isEnabled() {
  return core.isEnabled();
}

async function sendLoginOtp({ purpose, phone, marketerId = null, userId = null }) {
  const result = await core.sendOtp({
    purpose: purpose || 'login',
    phone,
    meta: {
      marketerId: marketerId || null,
      userId: userId || null,
    },
  });
  if (!result.ok) return result;
  return { ok: true, challengeId: result.challengeId };
}

async function resend(challengeId) {
  const result = await core.resendOtp(challengeId);
  if (!result.ok) return result;
  return { ok: true, challengeId: result.challengeId };
}

function verify(challengeId, code) {
  const result = core.verifyOtp(challengeId, code);
  if (!result.ok) return result;
  return {
    ok: true,
    purpose: result.purpose,
    phone: result.phone,
    marketerId: result.marketerId || result.meta?.marketerId || null,
    userId: result.userId || result.meta?.userId || null,
  };
}

function otpErrorMessage(reason) {
  return core.errorMessage(reason, { ejarStyle: false });
}

function _setSender(fn) {
  return core._setSender(fn);
}

function _resetForTests() {
  return core._resetForTests();
}

module.exports = {
  isEnabled,
  sendLoginOtp,
  resend,
  verify,
  otpErrorMessage,
  _setSender,
  _resetForTests,
};
