const crypto = require('crypto');
const adapter = require('./evolutionWhatsAppOtp');
const { normalizeSaudiMobile, isValidSaudiMobile } = require('../utils/ejarContract');

const ROLES = ['landlord', 'tenant', 'broker'];
const TTL_MS = 5 * 60 * 1000;
const VERIFIED_TTL_MS = 2 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_WINDOW_MAX = 5;

const sessions = new Map();
const sendWindow = new Map();

function isEnabled() {
  return adapter.isConfigured();
}

function hashCode(verificationId, code) {
  return crypto.createHmac('sha256', verificationId).update(String(code)).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function prune(now = Date.now()) {
  for (const [id, row] of sessions) {
    const liveUntil = row.status === 'verified' ? row.verifiedUntil : row.expiresAt;
    if (!liveUntil || now > liveUntil) sessions.delete(id);
  }
  for (const [key, row] of sendWindow) {
    if (now > row.reset) sendWindow.delete(key);
  }
}

function allowSend(phone, ip) {
  const keys = [`phone:${phone}`, ip ? `ip:${ip}` : null].filter(Boolean);
  const now = Date.now();
  for (const key of keys) {
    let entry = sendWindow.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + SEND_WINDOW_MS };
    }
    if (entry.count >= SEND_WINDOW_MAX) return false;
    entry.count += 1;
    sendWindow.set(key, entry);
  }
  return true;
}

function publicPending(row) {
  return {
    verificationId: row.id,
    cooldownSec: Math.max(0, Math.ceil((row.lastSentAt + RESEND_COOLDOWN_MS - Date.now()) / 1000)),
    expiresInSec: Math.max(0, Math.ceil((row.expiresAt - Date.now()) / 1000)),
  };
}

function publicVerified(row) {
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    verifiedAt: row.verifiedAt,
    ip: row.ip,
    userAgent: row.userAgent,
    channel: 'whatsapp',
  };
}

function invalidatePendingFor(phone, role) {
  for (const [id, row] of sessions) {
    if (row.status === 'pending' && row.phone === phone && row.role === role) {
      sessions.delete(id);
    }
  }
}

async function sendOtp({ phone, role, ip = '', userAgent = '' }) {
  prune();
  if (!isEnabled()) return { ok: false, reason: 'not_configured' };

  const normalized = normalizeSaudiMobile(phone);
  if (!isValidSaudiMobile(normalized) || !adapter.toWhatsAppNumber(normalized)) {
    return { ok: false, reason: 'bad_phone' };
  }
  if (!ROLES.includes(role)) return { ok: false, reason: 'bad_role' };
  if (!allowSend(normalized, ip)) return { ok: false, reason: 'rate_limited' };

  invalidatePendingFor(normalized, role);

  const verificationId = adapter.randomId();
  const code = generateCode();
  const now = Date.now();
  sessions.set(verificationId, {
    id: verificationId,
    phone: normalized,
    role,
    codeHash: hashCode(verificationId, code),
    createdAt: now,
    expiresAt: now + TTL_MS,
    lastSentAt: now,
    attempts: 0,
    status: 'pending',
    consumed: false,
    verifiedAt: null,
    verifiedUntil: null,
    ip: String(ip || '').slice(0, 80),
    userAgent: String(userAgent || '').slice(0, 300),
  });

  try {
    await adapter.sendOtpText(normalized, code);
  } catch (err) {
    sessions.delete(verificationId);
    if (err && err.code === 'not_configured') return { ok: false, reason: 'not_configured' };
    return { ok: false, reason: 'send_failed' };
  }

  return { ok: true, ...publicPending(sessions.get(verificationId)) };
}

async function resendOtp(verificationId) {
  const row = sessions.get(String(verificationId || ''));
  if (!row || row.status !== 'pending') {
    prune();
    return { ok: false, reason: 'invalid' };
  }
  const now = Date.now();
  if (now > row.expiresAt) {
    sessions.delete(row.id);
    prune();
    return { ok: false, reason: 'expired' };
  }
  if (now - row.lastSentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', ...publicPending(row) };
  }
  if (!allowSend(row.phone, row.ip)) return { ok: false, reason: 'rate_limited' };

  const code = generateCode();
  row.codeHash = hashCode(row.id, code);
  row.attempts = 0;
  row.lastSentAt = now;
  row.expiresAt = now + TTL_MS;

  try {
    await adapter.sendOtpText(row.phone, code);
  } catch {
    return { ok: false, reason: 'send_failed' };
  }
  return { ok: true, ...publicPending(row) };
}

function verifyOtp(verificationId, code) {
  const row = sessions.get(String(verificationId || ''));
  if (!row || row.status !== 'pending') {
    prune();
    return { ok: false, reason: 'invalid' };
  }
  if (Date.now() > row.expiresAt) {
    sessions.delete(row.id);
    prune();
    return { ok: false, reason: 'expired' };
  }
  row.attempts += 1;
  const expected = row.codeHash;
  const actual = hashCode(row.id, String(code || '').trim());
  const match = expected
    && expected.length === actual.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  if (!match) {
    if (row.attempts >= MAX_ATTEMPTS) {
      sessions.delete(row.id);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'bad_code', attemptsLeft: MAX_ATTEMPTS - row.attempts };
  }

  row.status = 'verified';
  row.codeHash = '';
  row.verifiedAt = new Date().toISOString();
  row.verifiedUntil = Date.now() + VERIFIED_TTL_MS;
  return { ok: true, session: publicVerified(row) };
}

function requireVerifiedSession(verificationId) {
  prune();
  const row = sessions.get(String(verificationId || ''));
  if (!row) return { ok: false, reason: 'missing' };
  if (row.status !== 'verified' || row.consumed) return { ok: false, reason: 'not_verified' };
  if (!row.verifiedUntil || Date.now() > row.verifiedUntil) {
    sessions.delete(row.id);
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, session: publicVerified(row) };
}

function markConsumed(verificationId, requestId) {
  const row = sessions.get(String(verificationId || ''));
  if (!row) return false;
  row.consumed = true;
  row.requestId = requestId || null;
  row.codeHash = '';
  return true;
}

function errorMessage(reason) {
  if (reason === 'rate_limited' || reason === 'cooldown') {
    return 'يرجى الانتظار قليلاً ثم إعادة إرسال رمز التحقق';
  }
  if (reason === 'send_failed') {
    return 'تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى';
  }
  if (reason === 'expired') {
    return 'انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً';
  }
  if (reason === 'locked' || reason === 'invalid' || reason === 'missing' || reason === 'not_verified') {
    return 'يلزم التحقق من رقم الجوال عبر واتساب قبل إنشاء العقد';
  }
  if (reason === 'bad_code') {
    return 'رمز التحقق غير صحيح';
  }
  if (reason === 'bad_phone') {
    return 'يرجى إدخال رقم جوال سعودي صحيح';
  }
  if (reason === 'bad_role') {
    return 'يرجى اختيار الصفة';
  }
  if (reason === 'not_configured') {
    return 'خدمة التحقق عبر واتساب غير مهيأة حالياً';
  }
  return 'تعذر إكمال التحقق';
}

function __reset() {
  sessions.clear();
  sendWindow.clear();
}

function __expire(verificationId) {
  const row = sessions.get(String(verificationId || ''));
  if (!row) return false;
  row.expiresAt = Date.now() - 1;
  if (row.verifiedUntil) row.verifiedUntil = Date.now() - 1;
  return true;
}

function __peek(verificationId) {
  const row = sessions.get(String(verificationId || ''));
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    status: row.status,
    attempts: row.attempts,
    consumed: row.consumed,
    hasHash: Boolean(row.codeHash),
  };
}

module.exports = {
  ROLES,
  TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  VERIFIED_TTL_MS,
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
