const crypto = require('crypto');
const {
  isConfigured,
  toWhatsAppNumber,
  sendText,
  randomId,
} = require('./evolutionWhatsApp');

let sender = sendText;
let senderOverridden = false;

const TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_WINDOW_MAX = 5;

const challenges = new Map();
const sendWindow = new Map();

function isEnabled() {
  return senderOverridden || isConfigured();
}

function hashCode(challengeId, code) {
  return crypto.createHmac('sha256', challengeId).update(String(code)).digest('hex');
}

function prune() {
  const now = Date.now();
  for (const [id, row] of challenges) {
    if (now > row.expiresAt) challenges.delete(id);
  }
  for (const [key, row] of sendWindow) {
    if (now > row.reset) sendWindow.delete(key);
  }
}

function allowSend(phone, purpose) {
  const key = `${purpose}:${phone}`;
  const now = Date.now();
  let entry = sendWindow.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + SEND_WINDOW_MS };
  }
  if (entry.count >= SEND_WINDOW_MAX) return false;
  entry.count += 1;
  sendWindow.set(key, entry);
  return true;
}

function buildMessage(code) {
  return [
    'رمز التحقق للدخول إلى منصة الهيف:',
    code,
    '',
    'صالح لمدة 5 دقائق.',
    'لا تشارك هذا الرمز مع أي شخص.',
  ].join('\n');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function sendLoginOtp({ purpose, phone, marketerId = null, userId = null }) {
  prune();
  if (!isEnabled()) return { ok: false, reason: 'not_configured' };

  const normalized = String(phone || '').trim();
  const wa = toWhatsAppNumber(normalized);
  if (!wa) return { ok: false, reason: 'bad_phone' };
  if (!allowSend(normalized, purpose)) return { ok: false, reason: 'rate_limited' };

  const challengeId = randomId();
  const code = generateCode();
  const now = Date.now();
  challenges.set(challengeId, {
    purpose,
    phone: normalized,
    marketerId,
    userId,
    codeHash: hashCode(challengeId, code),
    expiresAt: now + TTL_MS,
    attempts: 0,
    resends: 0,
    lastSentAt: now,
  });

  try {
    await sender(normalized, buildMessage(code));
  } catch {
    challenges.delete(challengeId);
    return { ok: false, reason: 'send_failed' };
  }

  return { ok: true, challengeId };
}

async function resend(challengeId) {
  prune();
  const row = challenges.get(challengeId);
  if (!row) return { ok: false, reason: 'invalid' };
  const now = Date.now();
  if (now > row.expiresAt) {
    challenges.delete(challengeId);
    return { ok: false, reason: 'expired' };
  }
  if (now - row.lastSentAt < RESEND_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
  if (row.resends >= MAX_RESENDS) return { ok: false, reason: 'rate_limited' };
  if (!allowSend(row.phone, row.purpose)) return { ok: false, reason: 'rate_limited' };

  const code = generateCode();
  row.codeHash = hashCode(challengeId, code);
  row.attempts = 0;
  row.resends += 1;
  row.lastSentAt = now;
  row.expiresAt = now + TTL_MS;

  try {
    await sender(row.phone, buildMessage(code));
  } catch {
    return { ok: false, reason: 'send_failed' };
  }
  return { ok: true, challengeId };
}

function verify(challengeId, code) {
  prune();
  const row = challenges.get(challengeId);
  if (!row) return { ok: false, reason: 'invalid' };
  if (Date.now() > row.expiresAt) {
    challenges.delete(challengeId);
    return { ok: false, reason: 'expired' };
  }
  row.attempts += 1;
  if (row.attempts > MAX_ATTEMPTS) {
    challenges.delete(challengeId);
    return { ok: false, reason: 'locked' };
  }
  const expected = row.codeHash;
  const actual = hashCode(challengeId, String(code || '').trim());
  if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
    return { ok: false, reason: 'bad_code' };
  }
  challenges.delete(challengeId);
  return {
    ok: true,
    purpose: row.purpose,
    phone: row.phone,
    marketerId: row.marketerId,
    userId: row.userId,
  };
}

function otpErrorMessage(reason) {
  if (reason === 'rate_limited' || reason === 'cooldown') {
    return 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة';
  }
  if (reason === 'send_failed') {
    return 'تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى';
  }
  if (reason === 'expired' || reason === 'locked' || reason === 'invalid') {
    return 'انتهت صلاحية رمز التحقق — أعد تسجيل الدخول';
  }
  if (reason === 'bad_code') {
    return 'رمز التحقق غير صحيح';
  }
  if (reason === 'bad_phone') {
    return 'رقم الجوال غير صالح لإرسال واتساب';
  }
  return 'تعذر إرسال رمز التحقق';
}

function _setSender(fn) {
  if (typeof fn === 'function') {
    sender = fn;
    senderOverridden = true;
    return;
  }
  sender = sendText;
  senderOverridden = false;
}

function _resetForTests() {
  challenges.clear();
  sendWindow.clear();
  sender = sendText;
  senderOverridden = false;
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
