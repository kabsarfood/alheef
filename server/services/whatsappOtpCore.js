/**
 * خدمة OTP واتساب المركزية — إثبات ملكية الرقم فقط (ليست مصدر صلاحيات).
 * الاستخدام: دخول، إيجار، عروض خاصة، مسوقين، أدمن.
 */
const crypto = require('crypto');
const {
  isConfigured,
  sendText,
  randomId,
} = require('./evolutionWhatsApp');
const {
  normalizeAccountPhone,
  isValidSaudiMobile,
  toWhatsAppNumber,
  maskPhone,
} = require('../utils/phone');
const { buildPrivateShareUrl } = require('../utils/privateOffersPath');

const TTL_MS = 5 * 60 * 1000;
const VERIFIED_TTL_MS = 2 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 45 * 1000;
const EJAR_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 3;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_WINDOW_MAX = 5;

/** أغراض تُبقي جلسة موثّقة بعد التحقق (مثل عقد الإيجار) */
const KEEP_VERIFIED_PURPOSES = new Set(['ejar']);

const challenges = new Map();
const sendWindow = new Map();

let sender = sendText;
let senderOverridden = false;

function isEnabled() {
  return senderOverridden || isConfigured();
}

function hashCode(challengeId, code) {
  return crypto.createHmac('sha256', challengeId).update(String(code)).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function prune(now = Date.now()) {
  for (const [id, row] of challenges) {
    const liveUntil = row.status === 'verified' ? row.verifiedUntil : row.expiresAt;
    if (!liveUntil || now > liveUntil) challenges.delete(id);
  }
  for (const [key, row] of sendWindow) {
    if (now > row.reset) sendWindow.delete(key);
  }
}

function allowSend(phone, purpose, ip) {
  const keys = [`${purpose}:${phone}`, ip ? `ip:${ip}` : null].filter(Boolean);
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

/** سطر WebOTP — يساعد المتصفح على الجوال بتعبئة الرمز تلقائيًا عند الدعم */
function otpAutofillLine(code) {
  try {
    const site = (process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://www.alheef.website').trim();
    const host = new URL(site).hostname;
    if (!host) return '';
    return `\n@${host} #${code}`;
  } catch {
    return `\n@www.alheef.website #${code}`;
  }
}

function hashFillToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function privateFillUrl(slug, token) {
  const page = buildPrivateShareUrl(slug);
  return `${page}?fill=${encodeURIComponent(token)}`;
}

function siteOrigin() {
  try {
    return new URL((process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://www.alheef.website').trim()).origin;
  } catch {
    return 'https://www.alheef.website';
  }
}

function keepsFillCode(purpose, meta) {
  if (purpose === 'private_offer') return Boolean(meta && meta.slug);
  return purpose === 'user_portal' || purpose === 'marketer' || purpose === 'admin';
}

function loginFillUrl(purpose, token, meta) {
  if (!token) return '';
  if (purpose === 'private_offer') return privateFillUrl(meta && meta.slug, token);
  const query = `fill=${encodeURIComponent(token)}`;
  const origin = siteOrigin();
  if (purpose === 'user_portal') return `${origin}/user/login.html?${query}`;
  if (purpose === 'marketer') return `${origin}/marketer/login.html?${query}`;
  if (purpose === 'admin') return `${origin}/dashboard/login.html?${query}`;
  return '';
}

function buildMessage(purpose, code, fillUrl) {
  const autofill = otpAutofillLine(code);
  if (purpose === 'ejar') {
    return [
      'الهيف العقارية',
      '',
      'رمز التحقق لبدء إنشاء عقد الإيجار:',
      String(code),
      '',
      'صالح لمدة 5 دقائق.',
      'لا تشارك هذا الرمز مع أي شخص.',
      autofill,
    ].filter(Boolean).join('\n');
  }
  return loginCodeMessage(code);
}

function loginCodeMessage(code) {
  return `الهيف العقارية - رمز الدخول\n\n\n*${String(code)}*`;
}

function resendCooldownMs(purpose) {
  return purpose === 'ejar' ? EJAR_RESEND_COOLDOWN_MS : RESEND_COOLDOWN_MS;
}

function invalidatePendingFor({ phone, purpose, metaKey, metaValue }) {
  for (const [id, row] of challenges) {
    if (row.status !== 'pending') continue;
    if (row.phone !== phone || row.purpose !== purpose) continue;
    if (metaKey && String(row.meta?.[metaKey] || '') !== String(metaValue || '')) continue;
    challenges.delete(id);
  }
}

function publicPending(row) {
  const cooldown = resendCooldownMs(row.purpose);
  return {
    challengeId: row.id,
    verificationId: row.id,
    cooldownSec: Math.max(0, Math.ceil((row.lastSentAt + cooldown - Date.now()) / 1000)),
    expiresInSec: Math.max(0, Math.ceil((row.expiresAt - Date.now()) / 1000)),
  };
}

function publicVerified(row) {
  return {
    id: row.id,
    challengeId: row.id,
    phone: row.phone,
    purpose: row.purpose,
    meta: { ...(row.meta || {}) },
    role: row.meta?.role || null,
    verifiedAt: row.verifiedAt,
    ip: row.ip,
    userAgent: row.userAgent,
    channel: 'whatsapp',
  };
}

/**
 * @param {object} opts
 * @param {string} opts.purpose - admin | marketer | ejar | private_offer | …
 * @param {string} opts.phone
 * @param {object} [opts.meta] - بيانات مرتبطة بالجلسة (ليست صلاحيات نظام)
 * @param {string} [opts.ip]
 * @param {string} [opts.userAgent]
 */
async function sendOtp({ purpose, phone, meta = {}, ip = '', userAgent = '' }) {
  prune();
  if (!isEnabled()) return { ok: false, reason: 'not_configured' };

  const normalized = normalizeAccountPhone(phone);
  if (!isValidSaudiMobile(normalized) || !toWhatsAppNumber(normalized)) {
    return { ok: false, reason: 'bad_phone' };
  }

  const purposeKey = String(purpose || '').trim();
  if (!purposeKey) return { ok: false, reason: 'bad_purpose' };

  if (!allowSend(normalized, purposeKey, ip)) return { ok: false, reason: 'rate_limited' };

  if (purposeKey === 'ejar') {
    invalidatePendingFor({
      phone: normalized,
      purpose: purposeKey,
      metaKey: 'role',
      metaValue: meta.role,
    });
  }

  const id = randomId();
  const code = generateCode();
  const now = Date.now();
  const fillToken = keepsFillCode(purposeKey, meta) ? randomId() : '';
  const row = {
    id,
    purpose: purposeKey,
    phone: normalized,
    meta: { ...meta },
    codeHash: hashCode(id, code),
    code: keepsFillCode(purposeKey, meta) ? code : '',
    fillHash: fillToken ? hashFillToken(fillToken) : '',
    createdAt: now,
    expiresAt: now + TTL_MS,
    lastSentAt: now,
    attempts: 0,
    resends: 0,
    status: 'pending',
    consumed: false,
    verifiedAt: null,
    verifiedUntil: null,
    ip: String(ip || '').slice(0, 80),
    userAgent: String(userAgent || '').slice(0, 300),
  };
  challenges.set(id, row);

  try {
    await sender(normalized, buildMessage(
      purposeKey,
      code,
      loginFillUrl(purposeKey, fillToken, meta),
    ));
  } catch (err) {
    challenges.delete(id);
    if (err && err.code === 'not_configured') return { ok: false, reason: 'not_configured' };
    return { ok: false, reason: 'send_failed' };
  }

  console.info('[otp] sent', { purpose: purposeKey, phone: maskPhone(normalized) });
  return { ok: true, code, ...publicPending(row) };
}

async function resendOtp(challengeId) {
  prune();
  const row = challenges.get(String(challengeId || ''));
  if (!row || row.status !== 'pending') return { ok: false, reason: 'invalid' };

  const now = Date.now();
  if (now > row.expiresAt) {
    challenges.delete(row.id);
    return { ok: false, reason: 'expired' };
  }
  if (now - row.lastSentAt < resendCooldownMs(row.purpose)) {
    return { ok: false, reason: 'cooldown', ...publicPending(row) };
  }
  if (row.resends >= MAX_RESENDS) return { ok: false, reason: 'rate_limited' };
  if (!allowSend(row.phone, row.purpose, row.ip)) return { ok: false, reason: 'rate_limited' };

  const code = generateCode();
  const fillToken = keepsFillCode(row.purpose, row.meta) ? randomId() : '';
  row.codeHash = hashCode(row.id, code);
  row.code = keepsFillCode(row.purpose, row.meta) ? code : '';
  row.fillHash = fillToken ? hashFillToken(fillToken) : '';
  row.attempts = 0;
  row.resends += 1;
  row.lastSentAt = now;
  row.expiresAt = now + TTL_MS;

  try {
    await sender(row.phone, buildMessage(
      row.purpose,
      code,
      loginFillUrl(row.purpose, fillToken, row.meta),
    ));
  } catch {
    return { ok: false, reason: 'send_failed' };
  }
  console.info('[otp] resent', { purpose: row.purpose, phone: maskPhone(row.phone) });
  return { ok: true, code, ...publicPending(row) };
}

function verifyOtp(challengeId, code) {
  const id = String(challengeId || '');
  const row = challenges.get(id);
  if (!row || row.status !== 'pending') {
    prune();
    return { ok: false, reason: 'invalid' };
  }
  if (Date.now() > row.expiresAt) {
    challenges.delete(row.id);
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
      challenges.delete(row.id);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'bad_code', attemptsLeft: MAX_ATTEMPTS - row.attempts };
  }

  const keep = KEEP_VERIFIED_PURPOSES.has(row.purpose);
  row.codeHash = '';
  row.code = '';
  row.fillHash = '';
  row.verifiedAt = new Date().toISOString();

  if (keep) {
    row.status = 'verified';
    row.verifiedUntil = Date.now() + VERIFIED_TTL_MS;
    console.info('[otp] verified', { purpose: row.purpose, phone: maskPhone(row.phone) });
    return {
      ok: true,
      purpose: row.purpose,
      phone: row.phone,
      meta: { ...(row.meta || {}) },
      challengeId: row.id,
      verificationId: row.id,
      session: publicVerified(row),
      marketerId: row.meta?.marketerId || null,
      userId: row.meta?.userId || null,
    };
  }

  challenges.delete(row.id);
  console.info('[otp] verified', { purpose: row.purpose, phone: maskPhone(row.phone) });
  return {
    ok: true,
    purpose: row.purpose,
    phone: row.phone,
    meta: { ...(row.meta || {}) },
    challengeId: row.id,
    verificationId: row.id,
    marketerId: row.meta?.marketerId || null,
    userId: row.meta?.userId || null,
  };
}

function claimAutofill(token) {
  const raw = String(token || '').trim();
  if (raw.length < 16) return { ok: false, reason: 'invalid' };
  prune();
  const actual = hashFillToken(raw);
  for (const row of challenges.values()) {
    if (!row.fillHash || row.status !== 'pending') continue;
    if (row.fillHash.length !== actual.length) continue;
    const match = crypto.timingSafeEqual(Buffer.from(row.fillHash), Buffer.from(actual));
    if (!match) continue;
    if (Date.now() > row.expiresAt || !/^\d{6}$/.test(row.code || '')) {
      challenges.delete(row.id);
      return { ok: false, reason: 'expired' };
    }
    return {
      ok: true,
      challengeId: row.id,
      code: row.code,
      phone: row.phone,
      purpose: row.purpose,
      meta: { ...(row.meta || {}) },
    };
  }
  return { ok: false, reason: 'invalid' };
}

function requireVerifiedSession(challengeId) {
  prune();
  const row = challenges.get(String(challengeId || ''));
  if (!row) return { ok: false, reason: 'missing' };
  if (row.status !== 'verified' || row.consumed) return { ok: false, reason: 'not_verified' };
  if (!row.verifiedUntil || Date.now() > row.verifiedUntil) {
    challenges.delete(row.id);
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, session: publicVerified(row) };
}

function markConsumed(challengeId, requestId) {
  const row = challenges.get(String(challengeId || ''));
  if (!row) return false;
  row.consumed = true;
  row.requestId = requestId || null;
  row.codeHash = '';
  return true;
}

function errorMessage(reason, { ejarStyle = false } = {}) {
  if (reason === 'rate_limited' || reason === 'cooldown') {
    return ejarStyle
      ? 'يرجى الانتظار قليلاً ثم إعادة إرسال رمز التحقق'
      : 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة';
  }
  if (reason === 'send_failed') {
    return 'تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى';
  }
  if (reason === 'expired') {
    return ejarStyle
      ? 'انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً'
      : 'انتهت صلاحية رمز التحقق — أعد المحاولة';
  }
  if (reason === 'locked' || reason === 'invalid') {
    return ejarStyle
      ? 'يلزم التحقق من رقم الجوال عبر واتساب قبل إنشاء العقد'
      : 'انتهت صلاحية رمز التحقق — أعد المحاولة';
  }
  if (reason === 'missing' || reason === 'not_verified') {
    return 'يلزم التحقق من رقم الجوال عبر واتساب قبل إنشاء العقد';
  }
  if (reason === 'bad_code') return 'رمز التحقق غير صحيح';
  if (reason === 'bad_phone') {
    return ejarStyle ? 'يرجى إدخال رقم جوال سعودي صحيح' : 'رقم الجوال غير صالح لإرسال واتساب';
  }
  if (reason === 'bad_purpose' || reason === 'bad_role') {
    return ejarStyle ? 'يرجى اختيار الصفة' : 'طلب غير صالح';
  }
  if (reason === 'not_configured') {
    return 'خدمة التحقق عبر واتساب غير مهيأة حالياً';
  }
  return ejarStyle ? 'تعذر إكمال التحقق' : 'تعذر إرسال رمز التحقق';
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

function _clearChallenges() {
  challenges.clear();
  sendWindow.clear();
}

function _resetForTests() {
  _clearChallenges();
  sender = sendText;
  senderOverridden = false;
}

function _expire(challengeId) {
  const row = challenges.get(String(challengeId || ''));
  if (!row) return false;
  row.expiresAt = Date.now() - 1;
  if (row.verifiedUntil) row.verifiedUntil = Date.now() - 1;
  return true;
}

function _peek(challengeId) {
  const row = challenges.get(String(challengeId || ''));
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    purpose: row.purpose,
    role: row.meta?.role || null,
    status: row.status,
    attempts: row.attempts,
    consumed: row.consumed,
    hasHash: Boolean(row.codeHash),
    meta: { ...(row.meta || {}) },
  };
}

module.exports = {
  TTL_MS,
  VERIFIED_TTL_MS,
  RESEND_COOLDOWN_MS,
  EJAR_RESEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  MAX_RESENDS,
  isEnabled,
  sendOtp,
  resendOtp,
  verifyOtp,
  claimAutofill,
  requireVerifiedSession,
  markConsumed,
  errorMessage,
  buildMessage,
  _setSender,
  _clearChallenges,
  _resetForTests,
  _expire,
  _peek,
};
