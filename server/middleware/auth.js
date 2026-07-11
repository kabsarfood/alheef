const crypto = require('crypto');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRIVATE_VIEWER_TTL_MS = 24 * 60 * 60 * 1000;

function getSecret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || 'alheef-admin-secret';
}

function createToken(payload = {}) {
  const ttl = payload.ttlMs || TOKEN_TTL_MS;
  const data = {
    role: payload.role || 'admin',
    userId: payload.userId || null,
    marketerId: payload.marketerId || null,
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
  const expected = crypto.createHmac('sha256', getSecret()).update(encoded).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function verifyToken(token) {
  return !!parseToken(token);
}

function checkPassword(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn('تحذير: ADMIN_PASSWORD غير معرّف في .env');
    return false;
  }
  return password === adminPassword;
}

function requireRole(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'] || req.headers['x-marketer-token'];
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
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'] || req.headers['x-marketer-token'];
  const payload = parseToken(token);
  if (!payload || !['admin', 'marketer'].includes(payload.role)) {
    return res.status(401).json({ success: false, message: 'غير مصرح' });
  }
  req.auth = payload;
  next();
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
};
