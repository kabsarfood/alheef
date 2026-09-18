/**
 * واجهة OTP لعقود الإيجار — تغلّف الخدمة المركزية مع جلسة verified.
 */
const core = require('./whatsappOtpCore');
const adapter = require('./evolutionWhatsAppOtp');

const ROLES = ['landlord', 'tenant', 'broker'];

function isEnabled() {
  return core.isEnabled() || adapter.isConfigured();
}

async function sendOtp({ phone, role, ip = '', userAgent = '' }) {
  if (!ROLES.includes(role)) return { ok: false, reason: 'bad_role' };
  return core.sendOtp({
    purpose: 'ejar',
    phone,
    meta: { role },
    ip,
    userAgent,
  });
}

async function resendOtp(verificationId) {
  return core.resendOtp(verificationId);
}

function verifyOtp(verificationId, code) {
  const result = core.verifyOtp(verificationId, code);
  if (!result.ok) return result;
  return { ok: true, session: result.session };
}

function requireVerifiedSession(verificationId) {
  return core.requireVerifiedSession(verificationId);
}

function markConsumed(verificationId, requestId) {
  return core.markConsumed(verificationId, requestId);
}

function errorMessage(reason) {
  return core.errorMessage(reason, { ejarStyle: true });
}

function __reset() {
  core._clearChallenges();
}

function __expire(verificationId) {
  return core._expire(verificationId);
}

function __peek(verificationId) {
  return core._peek(verificationId);
}

module.exports = {
  ROLES,
  TTL_MS: core.TTL_MS,
  RESEND_COOLDOWN_MS: core.EJAR_RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS: core.MAX_ATTEMPTS,
  VERIFIED_TTL_MS: core.VERIFIED_TTL_MS,
  isEnabled,
  sendOtp,
  resendOtp,
  verifyOtp,
  requireVerifiedSession,
  markConsumed,
  errorMessage,
  __reset,
  __expire,
  __peek,
};
