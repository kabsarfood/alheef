const crypto = require('crypto');
const { toWhatsAppNumber, maskPhone } = require('../utils/phone');

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

function randomId() {
  return crypto.randomBytes(24).toString('base64url');
}

async function sendReplyButtons(phone, { title, description, footer, buttons }) {
  const number = toWhatsAppNumber(phone);
  if (!number) throw new Error('رقم الجوال غير صالح لإرسال واتساب');
  const result = await evolutionFetch('/message/sendButtons/{instance}', {
    method: 'POST',
    body: {
      number,
      title: String(title || '').slice(0, 60),
      description: String(description || '').slice(0, 1024),
      footer: String(footer || 'خريطة الهيف').slice(0, 60),
      buttons: (buttons || []).slice(0, 3).map((button) => ({
        type: button.url ? 'url' : 'reply',
        displayText: String(button.displayText || '').slice(0, 20),
        id: button.url ? undefined : String(button.id || '').slice(0, 256),
        url: button.url ? String(button.url) : undefined,
      })),
    },
  });
  if (result.ok) return { ok: true, status: result.status, mode: 'buttons' };
  const unsupported = result.status === 400 || result.status === 404 || result.status === 405 || result.status === 422 || result.status === 501;
  return { ok: false, status: result.status, unsupported, mode: 'buttons' };
}

async function sendImageBuffer(phone, buffer, mime) {
  const number = toWhatsAppNumber(phone);
  if (!number || !buffer?.length) return { ok: false };
  const result = await evolutionFetch('/message/sendMedia/{instance}', {
    method: 'POST',
    body: {
      number,
      mediatype: 'image',
      mimetype: mime || 'image/jpeg',
      media: buffer.toString('base64'),
      caption: 'صورة الإعلان',
      fileName: 'listing-image',
    },
  });
  return { ok: result.ok, status: result.status };
}

async function sendImageUrl(phone, url, caption) {
  const number = toWhatsAppNumber(phone);
  if (!number || !url) return { ok: false };
  const result = await evolutionFetch('/message/sendMedia/{instance}', {
    method: 'POST',
    body: {
      number,
      mediatype: 'image',
      media: String(url),
      caption: String(caption || 'صورة الإعلان').slice(0, 200),
      fileName: 'listing-image',
    },
  });
  return { ok: result.ok, status: result.status };
}

module.exports = {
  isConfigured,
  toWhatsAppNumber,
  getConnectionState,
  sendText,
  sendReplyButtons,
  sendImageBuffer,
  sendImageUrl,
  maskPhone,
  randomId,
};
