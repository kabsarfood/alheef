/**
 * إبطال جلسات التوكن عند تسجيل الخروج (blacklist).
 * التوكن يبقى صالحاً حتى يُلغى أو ينتهي — لا يتطلب سجلاً مسبقاً في الذاكرة.
 */
const crypto = require('crypto');

const revoked = new Map();

function prune(now = Date.now()) {
  for (const [jti, exp] of revoked) {
    if (!exp || exp <= now) revoked.delete(jti);
  }
}

function createSessionId() {
  return crypto.randomBytes(16).toString('base64url');
}

function revokeSession(jti, exp) {
  if (!jti) return false;
  prune();
  revoked.set(jti, exp || Date.now() + 7 * 24 * 60 * 60 * 1000);
  return true;
}

function isSessionRevoked(jti) {
  if (!jti) return false;
  prune();
  const exp = revoked.get(jti);
  if (exp == null) return false;
  if (exp <= Date.now()) {
    revoked.delete(jti);
    return false;
  }
  return true;
}

function revokeTokenPayload(payload) {
  if (!payload?.jti) return false;
  return revokeSession(payload.jti, payload.exp);
}

function _resetForTests() {
  revoked.clear();
}

module.exports = {
  createSessionId,
  revokeSession,
  isSessionRevoked,
  revokeTokenPayload,
  _resetForTests,
};
