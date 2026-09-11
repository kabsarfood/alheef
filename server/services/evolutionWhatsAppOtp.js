/**
 * Adapter إرسال OTP عبر Evolution API.
 * المفتاح يُقرأ من العملية فقط — لا يُمرَّر للمتصفح ولا يُسجَّل في اللوج.
 */
const crypto = require('crypto');

function getConfig() {
  const domain = (
    process.env.EVOLUTION_API_DOMAIN
    || process.env.EVOLUTION_API_URL
    || ''
  ).trim().replace(/\/$/, '');
  const key = (process.env.EVOLUTION_API_KEY || '').trim();
  const instance = (process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_API_INSTANCE || 'otp').trim();
  return { domain, key, instance };
}

function isConfigured() {
  const { domain, key, instance } = getConfig();
  return Boolean(domain && key && instance);
}

function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return digits;
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return '';
}

function maskPhone(phone) {
  const n = toWhatsAppNumber(phone);
  if (n.length < 8) return '****';
  return `${n.slice(0, 5)}****${n.slice(-2)}`;
}

function redact(value) {
  const text = String(value || '');
  const { key } = getConfig();
  if (!key || key.length < 8) return text.slice(0, 180);
  return text.split(key).join('[redacted]').slice(0, 180);
}

function buildOtpMessage(code) {
  return [
    'الهيف العقارية',
    '',
    'رمز التحقق لبدء إنشاء عقد الإيجار:',
    String(code),
    '',
    'الرمز صالح لمدة 5 دقائق. لا تشارك الرمز مع أي شخص.',
  ].join('\n');
}

async function evolutionFetch(pathname, { method = 'GET', body } = {}) {
  const { domain, key, instance } = getConfig();
  if (!domain || !key || !instance) {
    const err = new Error('مزود واتساب غير مهيأ');
    err.code = 'not_configured';
    throw err;
  }
  const path = pathname.replace('{instance}', encodeURIComponent(instance));
  const res = await fetch(`${domain}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

async function getConnectionState() {
  if (!isConfigured()) {
    return { ok: false, configured: false, state: null, status: 0 };
  }
  try {
    const result = await evolutionFetch('/instance/connectionState/{instance}');
    const state = result.data?.instance?.state
      || result.data?.state
      || result.data?.instance?.connectionStatus
      || null;
    return {
      ok: result.ok,
      configured: true,
      status: result.status,
      state: state ? String(state) : null,
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[evolution-otp] connectionState failed:', redact(err.message));
    }
    return { ok: false, configured: true, state: null, status: 0 };
  }
}

async function sendOtpText(phone, code) {
  const number = toWhatsAppNumber(phone);
  if (!number) {
    const err = new Error('رقم الجوال غير صالح لإرسال واتساب');
    err.code = 'bad_phone';
    throw err;
  }
  const otp = String(code || '').trim();
  if (!/^\d{6}$/.test(otp)) {
    const err = new Error('رمز التحقق غير صالح');
    err.code = 'bad_code';
    throw err;
  }

  const text = buildOtpMessage(otp);
  return postText(number, text);
}

async function sendTestMessage(phone) {
  const number = toWhatsAppNumber(phone);
  if (!number) {
    const err = new Error('رقم الجوال غير صالح لإرسال واتساب');
    err.code = 'bad_phone';
    throw err;
  }
  return postText(number, 'اختبار اتصال الهيف العقارية عبر واتساب. هذه ليست رسالة تحقق.');
}

async function postText(number, text) {
  const result = await evolutionFetch('/message/sendText/{instance}', {
    method: 'POST',
    body: { number, text },
  });

  if (result.ok) {
    return { ok: true, status: result.status };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn('[evolution-otp] send failed', result.status, maskPhone(number));
  }
  const err = new Error('تعذر إرسال رسالة واتساب');
  err.status = result.status || 502;
  err.code = 'send_failed';
  throw err;
}

function randomId() {
  return crypto.randomBytes(24).toString('base64url');
}

module.exports = {
  isConfigured,
  toWhatsAppNumber,
  maskPhone,
  buildOtpMessage,
  getConnectionState,
  sendOtpText,
  sendTestMessage,
  randomId,
};
