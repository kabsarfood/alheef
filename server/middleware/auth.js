const crypto = require('crypto');
const { getAuthSecret } = require('../lib/authConfig');
const { verifyPassword } = require('../utils/password');
const {
  createSessionId,
  isSessionRevoked,
  revokeTokenPayload,
} = require('../lib/sessionStore');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRIVATE_VIEWER_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret() {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING');
  }
  return secret;
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    if (bufA.length > 0) crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  if (bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createToken(payload = {}) {
  const ttl = payload.ttlMs || TOKEN_TTL_MS;
  const jti = payload.jti || createSessionId();
  const data = {
    role: payload.role || 'admin',
    userId: payload.userId || null,
    marketerId: payload.marketerId || null,
    jti,
    exp: Date.now() + ttl,
  };
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function createPrivateViewerToken(clientAccessId) {
  return createToken({
    role: 'private_viewer',
    userId: clientAccessId || null,
    ttlMs: PRIVATE_VIEWER_TTL_MS,
  });
}

function parseToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  let expected;
  try {
    expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  } catch {
    return null;
  }
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Date.now()) return null;
    if (payload.jti && isSessionRevoked(payload.jti)) return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyToken(token) {
  return !!parseToken(token);
}

function checkPassword(password) {
  const hash = (process.env.ADMIN_PASSWORD_HASH || '').trim();
  if (hash) {
    return verifyPassword(password, hash);
  }
  const adminPassword = (process.env.ADMIN_PASSWORD || '').trim();
  if (!adminPassword) {
    console.warn('تحذير: ADMIN_PASSWORD / ADMIN_PASSWORD_HASH غير معرّف في المتغيرات');
    return false;
  }
  return timingSafeEqualStr(password, adminPassword);
}

function extractBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.headers['x-admin-token'] || req.headers['x-marketer-token'] || null;
}

function requireRole(...roles) {
  return (req, res, next) => {
    const token = extractBearerToken(req);
    const payload = parseToken(token);
    if (!payload || !roles.includes(payload.role)) {
      return res.status(401).json({ success: false, message: 'غير مصرح — يرجى تسجيل الدخول' });
    }
    req.auth = payload;
    next();
  };
}

const requireAdmin = requireRole('admin');
const requireMarketer = requireRole('marketer');
const requirePrivateViewer = requireRole('private_viewer');

function requireAdminOrMarketer(req, res, next) {
  const token = extractBearerToken(req);
  const payload = parseToken(token);
  if (!payload || !['admin', 'marketer'].includes(payload.role)) {
    return res.status(401).json({ success: false, message: 'غير مصرح' });
  }
  req.auth = payload;
  next();
}

function revokeToken(token) {
  const payload = parseToken(token);
  if (!payload) {
    // قد يكون ملغى مسبقاً — حاول فك التوقيع دون فحص الجلسة
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 2) return false;
      const raw = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      return revokeTokenPayload(raw);
    } catch {
      return false;
    }
  }
  return revokeTokenPayload(payload);
}

module.exports = {
  createToken,
  createPrivateViewerToken,
  parseToken,
  verifyToken,
  checkPassword,
  requireAdmin,
  requireMarketer,
  requireAdminOrMarketer,
  requirePrivateViewer,
  revokeToken,
  extractBearerToken,
};
