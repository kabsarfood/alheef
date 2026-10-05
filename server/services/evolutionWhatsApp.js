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

function imageKind(url, contentType) {
  const header = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('image/')) {
    const subtype = header.slice(6);
    const ext = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/g, '') || 'jpg';
    return { mime: header, fileName: `property.${ext}` };
  }
  const path = String(url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.png')) return { mime: 'image/png', fileName: 'property.png' };
  if (path.endsWith('.webp')) return { mime: 'image/webp', fileName: 'property.webp' };
  if (path.endsWith('.gif')) return { mime: 'image/gif', fileName: 'property.gif' };
  return { mime: 'image/jpeg', fileName: 'property.jpg' };
}

async function sendImagePayload(number, { media, mime, fileName, caption }) {
  const note = String(caption || 'صورة العقار').slice(0, 200);
  const attempts = [
    { number, mediatype: 'image', mimetype: mime, media, caption: note, fileName },
    { number, mediaType: 'image', mimetype: mime, media, caption: note, fileName },
  ];
  let last = null;
  for (const body of attempts) {
    last = await evolutionFetch('/message/sendMedia/{instance}', { method: 'POST', body });
    if (last.ok) return { ok: true, status: last.status };
    if (last.status !== 400 && last.status !== 404 && last.status !== 415 && last.status !== 422) break;
  }
  return { ok: false, status: last?.status || 502 };
}

async function sendImageBuffer(phone, buffer, mime, caption) {
  const number = toWhatsAppNumber(phone);
  if (!number || !buffer?.length) return { ok: false };
  const kind = imageKind('', mime);
  return sendImagePayload(number, {
    media: buffer.toString('base64'),
    mime: mime || kind.mime,
    fileName: kind.fileName,
    caption,
  });
}

async function imageBytesForWhatsApp(url) {
  const downloaded = await fetch(url);
  if (!downloaded.ok) return { ok: false, status: downloaded.status };
  const original = Buffer.from(await downloaded.arrayBuffer());
  if (!original.length || original.length > 8 * 1024 * 1024) return { ok: false, status: 413 };
  const file = imageKind(url, downloaded.headers.get('content-type'));
  if (file.mime === 'image/jpeg' || file.mime === 'image/png') {
    return { ok: true, bytes: original, ...file };
  }
  const { compressImage } = require('../utils/imageCompress');
  const jpeg = await compressImage(original, { format: 'jpeg', width: 1600, quality: 80 });
  if (jpeg?.length && !jpeg.equals(original)) {
    return { ok: true, bytes: jpeg, mime: 'image/jpeg', fileName: 'property.jpg' };
  }
  return { ok: true, bytes: original, ...file };
}

async function sendImageUrl(phone, url, caption) {
  const number = toWhatsAppNumber(phone);
  const source = String(url || '').trim();
  if (!number || !/^https?:\/\//i.test(source)) return { ok: false };
  const image = await imageBytesForWhatsApp(source);
  if (!image.ok) return { ok: false, status: image.status };
  return sendImagePayload(number, {
    media: image.bytes.toString('base64'),
    mime: image.mime,
    fileName: image.fileName,
    caption,
  });
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
