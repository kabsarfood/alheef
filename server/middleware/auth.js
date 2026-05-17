const crypto = require('crypto');

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || 'alheef-admin-secret';
}

function createToken() {
  const payload = {
    role: 'admin',
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [data, sig] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (sig !== expected) return false;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return payload.role === 'admin' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function checkPassword(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn('تحذير: ADMIN_PASSWORD غير معرّف في .env');
    return false;
  }
  return password === adminPassword;
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-admin-token'];

  if (!verifyToken(token)) {
    return res.status(401).json({ success: false, message: 'غير مصرح — يرجى تسجيل الدخول' });
  }
  next();
}

module.exports = {
  createToken,
  verifyToken,
  checkPassword,
  requireAdmin,
};
