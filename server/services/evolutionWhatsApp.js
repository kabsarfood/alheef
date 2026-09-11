const crypto = require('crypto');

function getConfig() {
  const url = (
    process.env.EVOLUTION_API_URL
    || process.env.EVOLUTION_API_DOMAIN
    || ''
  ).trim().replace(/\/$/, '');
  const key = (process.env.EVOLUTION_API_KEY || '').trim();
  const instance = (process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_API_INSTANCE || 'otp').trim();
  return { url, key, instance };
}

function isConfigured() {
  const { url, key, instance } = getConfig();
  return Boolean(url && key && instance);
}

function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return digits;
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return '';
}

async function evolutionFetch(pathname, { method = 'GET', body } = {}) {
  const { url, key, instance } = getConfig();
  if (!url || !key || !instance) {
    throw new Error('مزود واتساب غير مهيأ');
  }
  const path = pathname.replace('{instance}', encodeURIComponent(instance));
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, data };
}

async function getConnectionState() {
  const result = await evolutionFetch('/instance/connectionState/{instance}');
  const state = result.data?.instance?.state
    || result.data?.state
    || result.data?.instance?.connectionStatus
    || null;
  return {
    ok: result.ok,
    status: result.status,
    state,
  };
}

async function sendText(phone, text) {
  const number = toWhatsAppNumber(phone);
  if (!number) throw new Error('رقم الجوال غير صالح لإرسال واتساب');
  const message = String(text || '').trim();
  if (!message) throw new Error('نص الرسالة فارغ');

  const attempts = [
    { number, text: message },
    { number, textMessage: { text: message } },
  ];

  let last = null;
  for (const body of attempts) {
    last = await evolutionFetch('/message/sendText/{instance}', { method: 'POST', body });
    if (last.ok) {
      return { ok: true, status: last.status };
    }
    if (last.status !== 400 && last.status !== 404 && last.status !== 422) break;
  }
  const err = new Error('تعذر إرسال رسالة واتساب');
  err.status = last?.status || 502;
  throw err;
}

function maskPhone(phone) {
  const n = toWhatsAppNumber(phone);
  if (n.length < 8) return '****';
  return `${n.slice(0, 5)}****${n.slice(-2)}`;
}

function randomId() {
  return crypto.randomBytes(24).toString('base64url');
}

module.exports = {
  isConfigured,
  toWhatsAppNumber,
  getConnectionState,
  sendText,
  maskPhone,
  randomId,
};
