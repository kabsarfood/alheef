const crypto = require('crypto');

const COOKIE = 'alheef_pd';
const MAX_AGE = 400 * 24 * 60 * 60;
const OTHER_MESSAGE = 'هذا الدخول مرتبط بجهاز آخر.\n\nلتغيير الجهاز، تواصل مع مؤسسة الهيف لإلغاء الجهاز السابق وتفعيل جهاز جديد.';

function hashDevice(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

function newDeviceSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function readDeviceCookie(req) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const piece = part.trim();
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    if (piece.slice(0, eq) !== COOKIE) continue;
    try {
      return decodeURIComponent(piece.slice(eq + 1));
    } catch {
      return '';
    }
  }
  return '';
}

function setDeviceCookie(req, res, secret) {
  const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https') || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE}=${encodeURIComponent(secret)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function deviceKind(userAgent) {
  const ua = String(userAgent || '');
  if (/iPhone|iPad/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS/i.test(ua)) return 'Mac';
  return 'متصفح آخر';
}

function deviceLabel(userAgent) {
  const ua = String(userAgent || '');
  const kind = deviceKind(ua);
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) && !/Edg\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari'
        : /Firefox\//.test(ua) ? 'Firefox'
          : 'متصفح';
  return `${kind} · ${browser}`.slice(0, 80);
}

function deviceState(row, cookieSecret) {
  const status = row?.device_status || 'none';
  if (status === 'revoked') return 'other';
  const hash = row?.device_token_hash || '';
  if (status !== 'active' || !hash) return 'open';
  if (cookieSecret && hashDevice(cookieSecret) === hash) return 'same';
  return 'other';
}

module.exports = {
  COOKIE,
  OTHER_MESSAGE,
  hashDevice,
  newDeviceSecret,
  readDeviceCookie,
  setDeviceCookie,
  deviceKind,
  deviceLabel,
  deviceState,
};
