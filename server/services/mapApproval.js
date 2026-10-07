const crypto = require('crypto');
const { parseListingPaste, fold } = require('../utils/listingPaste');
const { normalizePropertyType } = require('../utils/propertyTypes');
const { prepareQuickListing } = require('./quickPaste');
const { normalizeAccountPhone, phonesEqual, isValidSaudiMobile, toWhatsAppNumber } = require('../utils/phone');
const { cleanMapsShareUrl } = require('../utils/coords');
const { getAdmin, isEnabled } = require('../lib/supabase');
const { uploadBuffer } = require('./storage');
const propertiesRepo = require('../repositories/propertiesRepo');
const offerBoard = require('./offerBoard');
const evolution = require('./evolutionWhatsApp');
const { createRateLimiter } = require('../utils/rateLimit');

const SOURCES = new Set([
  'chatgpt', 'heef_map', 'haraj', 'whatsapp', 'external',
  'marketer', 'property_form', 'manual', 'api', 'other',
]);
const STATUSES = new Set([
  'pending_approval', 'approved', 'publishing', 'published',
  'rejected', 'expired', 'duplicate', 'failed', 'cancelled',
]);
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const STAGING_BUCKET = 'map-request-staging';
const SECRET_RE = /service_role|supabase|api[_-]?key|secret|password|bearer\s+[a-z0-9]/i;

const hooks = {
  beforePublish: async () => {},
};

let whatsAppSender = null;
let stagingReady = false;

const rateLimiter = createRateLimiter({
  max: Number(process.env.ALHEEF_MAP_APPROVAL_RATE_MAX) || 30,
  windowMs: 10 * 60 * 1000,
});

function setWhatsAppSender(fn) {
  whatsAppSender = fn;
}

function integrationKey() {
  return String(process.env.ALHEEF_MAP_INTEGRATION_KEY || '');
}

function signingSecret() {
  return String(process.env.ALHEEF_WHATSAPP_WEBHOOK_SECRET || '');
}

function publicBase() {
  return String(process.env.ALHEEF_PUBLIC_BASE_URL || process.env.SITE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
}

function adminPhone() {
  return normalizeAccountPhone(process.env.ALHEEF_MAP_ADMIN_PHONE || process.env.ADMIN_PHONE || '0530792754');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function authorizeIntegration(header) {
  const expected = integrationKey();
  if (expected.length < 24) {
    return { ok: false, status: 503, message: 'تكامل خريطة الهيف غير مفعّل' };
  }
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  if (!match || !safeEqual(match[1].trim(), expected)) {
    return { ok: false, status: 401, message: 'غير مصرح' };
  }
  return { ok: true };
}

function connectorToken() {
  return String(process.env.ALHEEF_CHATGPT_CONNECTOR_TOKEN || '');
}

function authorizeConnector(header) {
  const dedicated = connectorToken();
  const expected = dedicated.length >= 24 ? dedicated : integrationKey();
  if (expected.length < 24) {
    return { ok: false, status: 503, message: 'موصل ChatGPT غير مفعّل' };
  }
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  if (!match || !safeEqual(match[1].trim(), expected)) {
    return { ok: false, status: 401, message: 'غير مصرح' };
  }
  return { ok: true };
}

function sign(parts) {
  const secret = signingSecret();
  if (secret.length < 24) {
    const error = new Error('توقيع الموافقة غير مفعّل');
    error.status = 503;
    throw error;
  }
  return crypto.createHmac('sha256', secret).update(parts.join('.')).digest('base64url');
}

function verifySign(parts, sig) {
  try {
    const expected = sign(parts);
    return safeEqual(expected, sig);
  } catch {
    return false;
  }
}

function verifyWebhook(rawBody, header) {
  const secret = signingSecret();
  if (secret.length < 24) return false;
  const given = String(header || '').replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', secret).update(rawBody || Buffer.alloc(0)).digest('hex');
  return safeEqual(expected, given);
}

function verifyWebhookToken(header) {
  const secret = signingSecret();
  if (secret.length < 24) return false;
  const given = String(header || '').trim();
  if (!given) return false;
  return safeEqual(given, secret);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeDetails(value) {
  return fold(value).replace(/\s+/g, ' ').trim();
}

function isPublicHttps(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function imageKind(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { ext: '.png', mime: 'image/png' };
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' };
  }
  return null;
}

function fingerprint(payload) {
  const images = (payload.images || []).map((img) => img.sha256 || '').sort().join(',');
  const location = cleanMapsShareUrl(payload.location_url || '') || String(payload.location_url || '').trim();
  const material = [
    String(payload.source_url || '').trim(),
    String(payload.external_reference || '').trim(),
    location,
    normalizeAccountPhone(payload.contact_phone || ''),
    normalizePropertyType(payload.property_type || '') || fold(payload.property_type || ''),
    normalizeDetails(payload.details || ''),
    images,
  ].join('\n');
  return hashValue(material);
}

function safeReason(error) {
  const text = String(error?.message || 'تعذر التنفيذ').replace(/\s+/g, ' ').trim();
  if (!text || SECRET_RE.test(text)) return 'تعذر التنفيذ';
  return text.slice(0, 180);
}

function finiteNumber(value) {
  if (value == null || value === '') return undefined;
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function structuredListingFields(body) {
  const out = {};
  if (body?.area != null && body.area !== '') {
    const area = finiteNumber(body.area);
    if (area == null || area <= 0) {
      const error = new Error('المساحة غير صالحة');
      error.status = 400;
      throw error;
    }
    out.area = area;
  }
  ['plan_number', 'plot_number', 'street_width', 'district', 'direction'].forEach((key) => {
    if (body?.[key] == null || body[key] === '') return;
    const text = String(body[key]).trim();
    if (!text) return;
    out[key] = text.slice(0, 80);
  });
  if (body?.price_type != null && body.price_type !== '') {
    const priceType = String(body.price_type).trim().toLowerCase();
    const auction = priceType === 'auction' || priceType === 'سوم' || priceType === 'على السوم';
    const fixed = priceType === 'fixed' || priceType === 'ثابت';
    if (!auction && !fixed) {
      const error = new Error('نوع السعر غير صالح');
      error.status = 400;
      throw error;
    }
    out.price_type = auction ? 'auction' : 'fixed';
  }
  if (body?.price != null && body.price !== '') {
    const price = finiteNumber(body.price);
    if (price == null || price <= 0) {
      const error = new Error('السعر غير صالح');
      error.status = 400;
      throw error;
    }
    out.price = price;
  }
  return out;
}

function applyStructuredListing(body, payload) {
  if (!body || !payload) return body;
  if (payload.area != null && payload.area !== '') body.area = Number(payload.area);
  if (payload.plan_number) body.planNumber = String(payload.plan_number);
  if (payload.plot_number) body.plotNumber = String(payload.plot_number);
  if (payload.street_width) body.streetWidth = String(payload.street_width);
  if (payload.district) body.district = String(payload.district);
  if (payload.direction) body.direction = String(payload.direction);
  if (payload.price != null && payload.price !== '') body.price = Number(payload.price);
  if (payload.price_type) body.priceType = payload.price_type;
  else if (payload.price != null && payload.price !== '') body.priceType = 'fixed';
  return body;
}

function summaryFrom(payload) {
  const parsed = parseListingPaste(payload.details || '');
  const listed = applyStructuredListing({ area: parsed.area, price: parsed.price, priceType: parsed.priceType }, payload);
  return {
    propertyType: normalizePropertyType(payload.property_type || '') || parsed.propertyType || 'عقار',
    district: parsed.district || '',
    area: listed.area,
    price: listed.price,
    priceType: listed.priceType,
    imageCount: (payload.images || []).length,
  };
}

async function audit(request, event, detail = {}) {
  try {
    const clean = {};
    Object.entries(detail).forEach(([key, value]) => {
      if (value == null) return;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (SECRET_RE.test(text)) return;
      clean[key] = value;
    });
    await getAdmin().from('map_publish_audit').insert({
      request_id: request?.id || null,
      request_number: request?.request_number || null,
      event,
      detail: clean,
    });
  } catch (error) {
    console.error('[map-approval] audit', event, safeReason(error));
  }
}

async function nextRequestNumber() {
  const { data, error } = await getAdmin()
    .from('map_publish_requests')
    .select('request_number')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  let max = 0;
  (data || []).forEach((row) => {
    const match = String(row.request_number || '').match(/^MAP-(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `MAP-${String(max + 1).padStart(6, '0')}`;
}

async function ensureStaging() {
  if (stagingReady) return;
  const admin = getAdmin();
  const { data: buckets } = await admin.storage.listBuckets();
  const existing = new Set((buckets || []).map((bucket) => bucket.name || bucket.id));
  if (!existing.has(STAGING_BUCKET)) {
    const { error } = await admin.storage.createBucket(STAGING_BUCKET, {
      public: false,
      fileSizeLimit: MAX_IMAGE_BYTES,
    });
    if (error && !/already exists/i.test(error.message || '')) throw new Error('تعذر تجهيز الصور المؤقتة');
  }
  stagingReady = true;
}

async function stageBuffer(buffer) {
  const kind = imageKind(buffer);
  if (!kind) {
    const error = new Error('نوع الصورة غير مسموح');
    error.status = 400;
    throw error;
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error('حجم الصورة يتجاوز الحد');
    error.status = 400;
    throw error;
  }
  await ensureStaging();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const objectPath = `pending/${sha256}${kind.ext}`;
  const admin = getAdmin();
  const { error } = await admin.storage.from(STAGING_BUCKET).upload(objectPath, buffer, {
    contentType: kind.mime,
    upsert: true,
  });
  if (error) throw new Error('فشل حفظ الصورة المؤقتة');
  return { kind: 'temp', bucket: STAGING_BUCKET, path: objectPath, mime: kind.mime, name: `image${kind.ext}`, sha256 };
}

function decodeDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  return buffer.length ? buffer : null;
}

async function normalizeImages(images) {
  const list = Array.isArray(images) ? images : [];
  if (list.length > MAX_IMAGES) {
    const error = new Error('عدد الصور يتجاوز الحد');
    error.status = 400;
    throw error;
  }
  const stored = [];
  for (const item of list) {
    if (item && typeof item === 'object' && item.sha256 && (item.kind === 'temp' || item.kind === 'remote')) {
      stored.push(item);
      continue;
    }
    const text = String(item || '').trim();
    if (!text) continue;
    if (text.startsWith('data:')) {
      const buffer = decodeDataUrl(text);
      if (!buffer) {
        const error = new Error('نوع الصورة غير مسموح');
        error.status = 400;
        throw error;
      }
      stored.push(await stageBuffer(buffer));
      continue;
    }
    if (!isPublicHttps(text)) {
      const error = new Error('رابط الصورة غير مسموح');
      error.status = 400;
      throw error;
    }
    stored.push({ kind: 'remote', url: text, sha256: hashValue(text) });
  }
  return stored;
}

function shortCode() {
  return crypto.randomBytes(9).toString('base64url');
}

function approvalMessage(row, codes) {
  const payload = row.payload_json || {};
  const info = summaryFrom(payload);
  const price = info.price ? Number(info.price).toLocaleString('ar-SA') : 'على السوم';
  const details = String(payload.details || '').trim();
  const summary = [
    'طلب جديد لإضافة إعلان إلى خريطة الهيف',
    '',
    `المصدر: ${row.source_name || row.source_type}`,
    `النوع: ${info.propertyType}`,
    `الحي: ${info.district || 'غير محدد'}`,
    `المساحة: ${info.area ? `${info.area} م²` : 'غير محددة'}`,
    `السعر: ${price}`,
    `الصور: ${info.imageCount}`,
  ].join('\n');
  const fullText = `${summary}\n\n${details}`.slice(0, 3500);
  const base = publicBase();
  const approveUrl = `${base}/m/a/${codes.approve}`;
  const rejectUrl = `${base}/m/r/${codes.reject}`;
  const description = [
    'اضغط الزر لتنفيذ القرار:',
    approveUrl,
    rejectUrl,
    '',
    fullText,
  ].join('\n').slice(0, 1024);
  return {
    kind: 'approval',
    title: 'طلب نشر جديد',
    description,
    fullText,
    footer: 'خريطة الهيف',
    buttons: [
      { displayText: 'نعم، انشر', url: approveUrl },
      { displayText: 'رفض', url: rejectUrl },
    ],
    fallbackText: [
      fullText,
      '',
      '✅ نعم، انشر',
      approveUrl,
      '',
      '❌ رفض',
      rejectUrl,
    ].join('\n'),
  };
}

function resultMessage(row, property, openCode) {
  if (property && row.property_status === 'published' && openCode) {
    const openUrl = `${publicBase()}/m/o/${openCode}`;
    const description = [
      '✅ تم نشر الإعلان على خريطة الهيف',
      `الرقم الداخلي: ${property.internalRef || '—'}`,
    ].join('\n');
    return {
      kind: 'result',
      title: 'تم النشر',
      description,
      fullText: description,
      footer: 'خريطة الهيف',
      buttons: [{ displayText: 'فتح الإعلان', url: openUrl }],
      urlButton: { displayText: 'فتح الإعلان', url: openUrl },
      fallbackText: `${description}\n\nفتح الإعلان\n${openUrl}`,
    };
  }
  if (property) {
    const description = [
      '⚠️ تم حفظ الإعلان، لكنه يحتاج موقعًا صحيحًا قبل النشر',
      `الرقم الداخلي: ${property.internalRef || '—'}`,
    ].join('\n');
    return { kind: 'result', description, fullText: description, fallbackText: description, buttons: [] };
  }
  const description = [
    '⚠️ تعذر إضافة إعلان خريطة الهيف',
    `رقم الطلب: ${row.request_number}`,
    `السبب: ${safeReason({ message: row.failure_reason || 'تعذر التنفيذ' })}`,
  ].join('\n');
  return { kind: 'result', description, fullText: description, fallbackText: description, buttons: [] };
}

async function sendStagedImages(row) {
  if (whatsAppSender || !evolution.isConfigured()) return;
  const images = (row?.payload_json?.images || []).slice(0, 3);
  for (const image of images) {
    try {
      if (image.kind === 'remote' && image.url) {
        await evolution.sendImageUrl(adminPhone(), image.url);
      } else if (image.kind === 'temp' && image.bucket && image.path) {
        const { data, error } = await getAdmin().storage.from(image.bucket).download(image.path);
        if (error || !data) continue;
        const buffer = Buffer.from(await data.arrayBuffer());
        await evolution.sendImageBuffer(adminPhone(), buffer, image.mime);
      }
    } catch (error) {
      console.error('[map-approval] image', safeReason(error));
    }
  }
}

async function sendAdmin(message) {
  const phone = toWhatsAppNumber(adminPhone());
  if (whatsAppSender) return whatsAppSender(phone, message);
  if (!evolution.isConfigured()) return { ok: false, skipped: true };
  const buttons = message?.buttons || [];
  const text = String(message?.fallbackText || message?.fullText || '').trim();
  const urlButtons = buttons.some((button) => button.url);
  if (buttons.length && !urlButtons) {
    const interactive = await evolution.sendReplyButtons(phone, {
      title: message.title,
      description: message.description || message.fullText,
      footer: message.footer,
      buttons,
    });
    if (interactive.ok) return { ok: true, mode: 'buttons' };
  }
  if (!text) return { ok: false };
  const sent = await evolution.sendText(phone, text);
  return { ...sent, mode: 'short_link' };
}

function withDeadline(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('انتهت مهلة واتساب');
      error.status = 504;
      reject(error);
    }, ms);
    Promise.resolve(promise).then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function notify(row, message, event) {
  try {
    const result = await sendAdmin(message);
    await audit(row, result?.ok ? event : `${event}_failed`, {
      ok: !!result?.ok,
      skipped: !!result?.skipped,
      mode: result?.mode || '',
    });
    if (result?.ok && message?.kind === 'approval') await sendStagedImages(row);
    return result;
  } catch (error) {
    await audit(row, `${event}_failed`, { reason: safeReason(error) });
    return { ok: false };
  }
}

function publicRequest(row, extra = {}) {
  return {
    success: true,
    request_id: row.id,
    request_number: row.request_number,
    status: row.status,
    expires_at: null,
    duplicate: !!extra.duplicate,
    idempotent: !!extra.idempotent,
    property_id: row.published_property_id || null,
    property_status: row.property_status || null,
    internal_ref: extra.internalRef || null,
    property_url: extra.propertyUrl || null,
  };
}

async function findActiveByHash(payloadHash) {
  const { data, error } = await getAdmin()
    .from('map_publish_requests')
    .select('*')
    .eq('payload_hash', payloadHash)
    .in('status', ['pending_approval', 'approved', 'publishing', 'published'])
    .limit(1);
  if (error) throw new Error(error.message);
  return (data || [])[0] || null;
}

async function propertyLink(propertyId) {
  if (!propertyId) return { internalRef: null, propertyUrl: null, property: null };
  const property = await propertiesRepo.getById(propertyId);
  if (!property) return { internalRef: null, propertyUrl: null, property: null };
  return {
    property,
    internalRef: property.internalRef || null,
    propertyUrl: property.slug ? `${publicBase()}/property.html?slug=${encodeURIComponent(property.slug)}` : null,
  };
}

async function approvalAlreadySent(row) {
  if (!row?.id) return false;
  const { data, error } = await getAdmin()
    .from('map_publish_audit')
    .select('event')
    .eq('request_id', row.id)
    .in('event', ['whatsapp_approval', 'whatsapp_approval_resend'])
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

async function withApprovalNotice(status, row, extra = {}) {
  const linked = extra.internalRef || extra.propertyUrl || extra.property
    ? extra
    : { ...extra, ...(await propertyLink(row?.published_property_id)) };
  let notice = 'not_sent';
  if (row?.status === 'pending_approval' && !row.published_property_id) {
    if (await approvalAlreadySent(row)) notice = 'sent';
    else {
      const again = await resendPendingApproval(row.request_number);
      notice = again.ok ? 'sent' : 'failed';
    }
  } else if (await approvalAlreadySent(row)) notice = 'sent';
  return {
    status,
    body: { ...publicRequest(row, linked), approval_notification_status: notice },
  };
}

async function createRequest(body) {
  cleanupExpiredStaging().catch(() => {});
  if (!isEnabled()) {
    const error = new Error('قاعدة البيانات غير متصلة');
    error.status = 503;
    throw error;
  }
  const details = String(body?.details || '').trim();
  const sourceType = String(body?.source_type || '').trim().toLowerCase();
  if (!details) {
    const error = new Error('تفاصيل الإعلان مطلوبة');
    error.status = 400;
    throw error;
  }
  if (!SOURCES.has(sourceType)) {
    const error = new Error('مصدر الإعلان غير مدعوم');
    error.status = 400;
    throw error;
  }
  const phone = String(body?.contact_phone || '').trim();
  if (phone && !isValidSaudiMobile(phone)) {
    const error = new Error('رقم الجوال غير صالح');
    error.status = 400;
    throw error;
  }
  const sourceUrl = String(body?.source_url || '').trim();
  if (sourceUrl && !isPublicHttps(sourceUrl)) {
    const error = new Error('رابط المصدر غير مسموح');
    error.status = 400;
    throw error;
  }
  const locationUrl = String(body?.location_url || '').trim();
  const images = await normalizeImages(body?.images);
  const payload = {
    property_type: String(body?.property_type || '').trim(),
    details,
    location_url: locationUrl,
    contact_phone: phone ? normalizeAccountPhone(phone) : '',
    source_url: sourceUrl,
    external_reference: String(body?.external_reference || '').trim(),
    images,
    ...structuredListingFields(body),
  };
  const payloadHash = fingerprint(payload);
  const idempotencyKey = String(body?.idempotency_key || '').trim();

  if (idempotencyKey) {
    const { data } = await getAdmin().from('map_publish_requests').select('*').eq('idempotency_key', idempotencyKey).limit(1);
    if (data?.[0]) return withApprovalNotice(200, data[0], { idempotent: true });
  }

  const existing = await findActiveByHash(payloadHash);
  if (existing) {
    await audit(existing, 'duplicate', { payload_hash: payloadHash });
    return withApprovalNotice(200, existing, { duplicate: true });
  }

  const approveCode = shortCode();
  const rejectCode = shortCode();
  let created = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const requestNumber = await nextRequestNumber();
    const { data, error } = await getAdmin().from('map_publish_requests').insert({
      request_number: requestNumber,
      payload_json: payload,
      payload_hash: payloadHash,
      source_type: sourceType,
      source_name: String(body?.source_name || sourceType).trim().slice(0, 120),
      source_url: sourceUrl || null,
      external_reference: payload.external_reference || null,
      status: 'pending_approval',
      approval_expires_at: null,
      approve_code_hash: hashValue(approveCode),
      reject_code_hash: hashValue(rejectCode),
      idempotency_key: idempotencyKey || null,
    }).select('*').single();
    if (!error) {
      created = data;
      break;
    }
    if (/payload_hash|idx_map_publish_hash_active/i.test(error.message || '')) {
      const raced = await findActiveByHash(payloadHash);
      if (raced) return withApprovalNotice(200, raced, { duplicate: true });
    }
    if (idempotencyKey && /idempotency|idx_map_publish_idempotency/i.test(error.message || '')) {
      const again = await getAdmin().from('map_publish_requests').select('*').eq('idempotency_key', idempotencyKey).limit(1);
      if (again.data?.[0]) {
        const linked = await propertyLink(again.data[0].published_property_id);
        return withApprovalNotice(200, again.data[0], { idempotent: true, ...linked });
      }
    }
    if (!/duplicate|unique/i.test(error.message || '') || attempt === 3) throw new Error(error.message);
  }

  await audit(created, 'created', {
    source_type: created.source_type,
    source_name: created.source_name,
    source_url: created.source_url,
    external_reference: created.external_reference,
    payload_hash: payloadHash,
  });
  const noticeTask = sendNewApprovalNotice(created, approveCode, rejectCode);
  if (body?.defer_notice === true) {
    noticeTask.catch((error) => audit(created, 'whatsapp_approval_failed', { reason: safeReason(error) }));
    return { status: 201, body: { ...publicRequest(created), approval_notification_status: 'queued' } };
  }
  const notice = await noticeTask;
  return { status: 201, body: { ...publicRequest(created), approval_notification_status: notice } };
}

async function sendNewApprovalNotice(created, approveCode, rejectCode) {
  let notice = 'failed';
  try {
    const sent = await withDeadline(
      notify(created, approvalMessage(created, { approve: approveCode, reject: rejectCode }), 'whatsapp_approval'),
      12000,
    );
    notice = sent?.ok ? 'sent' : 'failed';
    await audit(created, 'whatsapp_approval_result', { ok: !!sent?.ok });
  } catch (error) {
    notice = 'failed';
    await audit(created, 'whatsapp_approval_failed', { reason: safeReason(error) });
  }
  if (notice !== 'sent') {
    const again = await resendPendingApproval(created.request_number);
    if (again.ok) notice = 'sent';
  }
  return notice;
}

async function getRequest(id) {
  const { data, error } = await getAdmin().from('map_publish_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function patchStatus(id, fromStatus, patch) {
  const { data, error } = await getAdmin()
    .from('map_publish_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', fromStatus)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function findByCode(column, code) {
  if (!['approve_code_hash', 'reject_code_hash', 'open_code_hash'].includes(column)) return null;
  const { data, error } = await getAdmin()
    .from('map_publish_requests')
    .select('*')
    .eq(column, hashValue(code))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function cleanupTempImages(row) {
  const images = row?.payload_json?.images || [];
  const paths = images.filter((img) => img.kind === 'temp' && img.bucket === STAGING_BUCKET).map((img) => img.path);
  if (!paths.length) return;
  await getAdmin().storage.from(STAGING_BUCKET).remove(paths);
}

async function resetForChangedPayload(row) {
  const approveCode = shortCode();
  const rejectCode = shortCode();
  const nextHash = fingerprint(row.payload_json || {});
  const { data, error } = await getAdmin().from('map_publish_requests').update({
    status: 'pending_approval',
    payload_hash: nextHash,
    approval_token_hash: null,
    approval_consumed_at: null,
    approved_by: null,
    approved_at: null,
    approval_expires_at: null,
    approve_code_hash: hashValue(approveCode),
    reject_code_hash: hashValue(rejectCode),
    open_code_hash: null,
    failure_reason: 'تغيّرت البيانات بعد الموافقة',
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).select('*').single();
  if (error) throw new Error(error.message);
  await audit(data, 'payload_changed', { payload_hash: nextHash });
  await notify(data, approvalMessage(data, { approve: approveCode, reject: rejectCode }), 'whatsapp_approval');
  return data;
}

async function finishPublish(row) {
  const payload = row.payload_json || {};
  if (fingerprint(payload) !== row.payload_hash) {
    const reset = await resetForChangedPayload(row);
    return { status: 409, body: { success: false, reset: true, status: reset.status, request_id: reset.id } };
  }
  await hooks.beforePublish(row);
  const fresh = await getRequest(row.id);
  if (fingerprint(fresh.payload_json || {}) !== fresh.payload_hash) {
    const reset = await resetForChangedPayload(fresh);
    return { status: 409, body: { success: false, reset: true, status: reset.status, request_id: reset.id } };
  }
  const publishing = await patchStatus(fresh.id, 'approved', {
    status: 'publishing',
    approval_consumed_at: new Date().toISOString(),
  });
  if (!publishing) {
    const current = await getRequest(fresh.id);
    const linked = await propertyLink(current?.published_property_id);
    return { status: 200, body: publicRequest(current, { idempotent: true, ...linked }) };
  }
  await audit(publishing, 'publish_started', {});
  let createdId = null;
  try {
    const prepared = await prepareQuickListing({
      text: payload.details,
      mapsUrl: payload.location_url,
      contactPhone: payload.contact_phone,
    });
    const explicit = normalizePropertyType(payload.property_type || '');
    if (explicit) prepared.body.propertyType = explicit;
    prepared.body.description = payload.details;
    applyStructuredListing(prepared.body, payload);
    prepared.body.contactPhone = adminPhone();
    const duplicate = await offerBoard.findConfirmedDuplicate({
      referenceNo: prepared.body.referenceNo || prepared.body.licenseNumber,
      source: prepared.body.source,
      sourceListingId: prepared.body.sourceListingId,
      planNumber: prepared.body.planNumber,
      plotNumber: prepared.body.plotNumber,
      district: prepared.body.district,
      latitude: prepared.body.latitude,
      longitude: prepared.body.longitude,
      mapsUrl: prepared.body.mapsUrl,
    });
    let created;
    if (duplicate) {
      await offerBoard.refreshExisting(duplicate.id, prepared.body);
      created = await propertiesRepo.getById(duplicate.id);
      createdId = duplicate.id;
    } else {
      created = await propertiesRepo.create(prepared.body);
      createdId = created.id;
    }
    const urls = [];
    for (const image of payload.images || []) {
      if (image.kind === 'remote') urls.push(image.url);
      if (image.kind === 'temp') {
        const { data, error } = await getAdmin().storage.from(image.bucket).download(image.path);
        if (error || !data) throw new Error('فشل رفع الصورة');
        const buffer = Buffer.from(await data.arrayBuffer());
        const uploader = hooks.uploadFinal || uploadBuffer;
        urls.push(await uploader(buffer, image.name || 'image.jpg', 'properties'));
      }
    }
    if (urls.length) await propertiesRepo.addImages(created.id, urls);
    await offerBoard.markVisible(created.id, {
      requestNumber: row.request_number,
      phone: payload.contact_phone,
    });
    const full = await propertiesRepo.getById(created.id);
    const openCode = full.status === 'published' ? shortCode() : null;
    const done = await patchStatus(publishing.id, 'publishing', {
      status: 'published',
      published_at: new Date().toISOString(),
      published_property_id: full.id,
      property_status: full.status,
      failure_reason: null,
      open_code_hash: openCode ? hashValue(openCode) : null,
    });
    await audit(done, 'published', {
      published_property_id: full.id,
      internal_ref: full.internalRef || '',
      property_status: full.status,
      property_url: full.slug ? `${publicBase()}/property.html?slug=${encodeURIComponent(full.slug)}` : '',
    });
    await notify({ ...done, property_status: full.status }, resultMessage({ ...done, property_status: full.status }, full, openCode), 'whatsapp_result');
    if (full.status === 'published') await cleanupTempImages(done);
    return {
      status: 200,
      body: publicRequest(done, {
        internalRef: full.internalRef || null,
        propertyUrl: full.slug ? `${publicBase()}/property.html?slug=${encodeURIComponent(full.slug)}` : null,
      }),
    };
  } catch (error) {
    const failed = await patchStatus(publishing.id, 'publishing', {
      status: 'failed',
      failure_reason: safeReason(error),
      published_property_id: createdId,
    });
    await audit(failed || publishing, 'failed', { reason: safeReason(error) });
    await notify(failed || publishing, resultMessage({ ...(failed || publishing), failure_reason: safeReason(error) }, null, null), 'whatsapp_result');
    return { status: 200, body: { success: false, status: 'failed', request_id: publishing.id, message: safeReason(error) } };
  }
}

function mobileShell(title, inner) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.25rem;background:#f3f6f1;color:#142016;font-family:Tahoma,"Segoe UI",sans-serif}
main{width:min(100%,26rem);text-align:center}
h1{margin:0 0 .8rem;font-size:1.7rem;line-height:1.45;font-weight:800}
p{margin:0 0 1.35rem;font-size:1.15rem;line-height:1.7}
form{margin:0}
button{display:flex;align-items:center;justify-content:center;width:100%;min-height:5.4rem;padding:1rem 1.2rem;border:0;border-radius:1.15rem;background:#178a45;color:#fff;font:inherit;font-size:1.85rem;font-weight:800;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-shadow:0 .5rem 0 #0d5a2b}
button.reject{background:#b42318;box-shadow:0 .5rem 0 #7a160f}
button:active,button.pressed{transform:translateY(.22rem)}
button.go:active,button.go.pressed{box-shadow:0 .15rem 0 #0d5a2b}
button.reject:active,button.reject.pressed{box-shadow:0 .15rem 0 #7a160f}
a{display:inline-block;margin-top:.4rem;color:#0f6b34;font-size:1.25rem;font-weight:800;text-decoration:none}
</style></head><body><main>${inner}</main></body></html>`;
}

function confirmPage(action) {
  const approve = action === 'approve';
  const title = approve ? 'نشر الإعلان على خريطة الهيف' : 'رفض طلب النشر';
  const label = approve ? 'نعم، انشر' : 'رفض';
  const hint = approve ? 'اضغط الزر الأخضر لتأكيد النشر على الخريطة.' : 'اضغط الزر لتأكيد رفض الطلب.';
  const wait = approve ? 'جارٍ النشر…' : 'جارٍ الرفض…';
  const klass = approve ? 'go' : 'reject';
  const inner = `<h1>${title}</h1><p>${hint}</p><form method="post" id="decision"><button type="submit" id="go" class="${klass}">${label}</button></form><script>
(function(){
  var form=document.getElementById('decision');
  var button=document.getElementById('go');
  var sent=false;
  function press(){button.classList.add('pressed');}
  function release(){button.classList.remove('pressed');}
  button.addEventListener('pointerdown',press);
  button.addEventListener('pointerup',release);
  button.addEventListener('pointercancel',release);
  form.addEventListener('submit',function(event){
    if(sent){event.preventDefault();return;}
    sent=true;
    button.textContent=${JSON.stringify(wait)};
  });
})();
</script>`;
  return mobileShell(title, inner);
}

async function shortLinkState(action, code) {
  if (!validShortCode(code) || !['approve', 'reject'].includes(action)) return 'missing';
  const row = await findByCode(action === 'approve' ? 'approve_code_hash' : 'reject_code_hash', code);
  if (!row) return 'missing';
  return row.status === 'pending_approval' ? 'pending' : 'done';
}

function decisionPage(outcome) {
  const body = outcome.body || {};
  const message = String(body.message || (body.success ? 'تم تسجيل القرار.' : 'تعذر تنفيذ القرار.'));
  const link = body.property_url && body.property_status === 'published'
    ? `<p><a href="${escapeHtml(body.property_url)}">فتح الإعلان</a></p>`
    : '';
  const home = `${publicBase()}/`;
  const goHome = `<script>setTimeout(function(){location.replace(${JSON.stringify(home)});},2000);</script>`;
  return { status: outcome.status, html: mobileShell('نتيجة القرار', `<h1>${escapeHtml(message)}</h1>${link}${goHome}`) };
}

async function applyDecision(row, action, actor) {
  if (!row) return { status: 404, body: { success: false, message: 'الطلب غير موجود' } };
  const current = row.status ? row : await getRequest(row.id);
  if (!current) return { status: 404, body: { success: false, message: 'الطلب غير موجود' } };
  if (!phonesEqual(actor, adminPhone())) {
    return { status: 403, body: { success: false, message: 'رقم غير مصرح له بالقرار' } };
  }
  const by = normalizeAccountPhone(actor);

  if (action === 'reject') {
    if (current.status === 'rejected') {
      return { status: 200, body: { ...publicRequest(current, { idempotent: true }), message: 'تم رفض الطلب من قبل.' } };
    }
    if (current.status !== 'pending_approval') {
      return { status: 409, body: { success: false, status: current.status, message: 'لا يمكن رفض الطلب في هذه الحالة' } };
    }
    const rejected = await patchStatus(current.id, 'pending_approval', {
      status: 'rejected',
      rejected_by: by,
      rejected_at: new Date().toISOString(),
      approval_consumed_at: new Date().toISOString(),
    });
    if (!rejected) return applyDecision(await getRequest(current.id), action, actor);
    await audit(rejected, 'rejected', { by });
    await cleanupTempImages(rejected);
    return { status: 200, body: { ...publicRequest(rejected), message: 'تم رفض الطلب، ولم يُنشأ إعلان.' } };
  }

  if (action !== 'approve') return { status: 400, body: { success: false, message: 'إجراء غير معروف' } };
  if (current.status === 'published' || current.status === 'publishing' || current.status === 'failed') {
    const linked = await propertyLink(current.published_property_id);
    return {
      status: 200,
      body: { ...publicRequest(current, { idempotent: true, ...linked }), message: 'تم استخدام هذا القرار من قبل.' },
    };
  }
  if (current.status !== 'pending_approval' && current.status !== 'approved') {
    return { status: 409, body: { success: false, status: current.status, message: 'لا يمكن نشر هذا الطلب' } };
  }
  let approved = current;
  if (current.status === 'pending_approval') {
    approved = await patchStatus(current.id, 'pending_approval', {
      status: 'approved',
      approved_by: by,
      approved_at: new Date().toISOString(),
    });
    if (!approved) {
      const again = await getRequest(current.id);
      const linked = await propertyLink(again?.published_property_id);
      return {
        status: 200,
        body: { ...publicRequest(again, { idempotent: true, ...linked }), message: 'تم استخدام هذا القرار من قبل.' },
      };
    }
    await audit(approved, 'approved', { by, payload_hash: approved.payload_hash });
  }
  const outcome = await finishPublish(approved);
  if (outcome.body?.success && outcome.body.property_status === 'published') {
    outcome.body.message = 'تم نشر الإعلان على خريطة الهيف.';
  } else if (outcome.body?.property_status === 'draft') {
    outcome.body.message = 'تم حفظ الإعلان، لكنه يحتاج موقعًا صحيحًا قبل النشر.';
  } else if (!outcome.body?.message) {
    outcome.body.message = outcome.body?.success ? 'تم تسجيل القرار.' : 'تعذر نشر الإعلان.';
  }
  return outcome;
}

async function decide({ rid, act, exp, sig, from }) {
  const row = await getRequest(rid);
  if (!row) return { status: 404, body: { success: false, message: 'الطلب غير موجود' } };
  if (!verifySign([rid, act, String(exp), row.payload_hash], sig)) {
    return { status: 401, body: { success: false, message: 'التوقيع غير صالح' } };
  }
  return applyDecision(row, act, normalizeAccountPhone(from || adminPhone()));
}

function parseButtonId(value) {
  const text = String(value || '').trim();
  const current = text.match(/^alheef_map:(approve|reject):([A-Za-z0-9_-]{8,64})$/);
  if (current) return { action: current[1], code: current[2] };
  const legacy = text.match(/^([ar])\.([A-Za-z0-9_-]{8,64})$/);
  if (!legacy) return null;
  return { action: legacy[1] === 'a' ? 'approve' : 'reject', code: legacy[2] };
}

function evolutionData(body) {
  if (Array.isArray(body?.data)) return body.data[0] || {};
  if (Array.isArray(body?.data?.messages)) return body.data.messages[0] || {};
  return body?.data || {};
}

function unwrapMessage(message) {
  if (!message || typeof message !== 'object') return {};
  return message.ephemeralMessage?.message
    || message.viewOnceMessage?.message
    || message.viewOnceMessageV2?.message
    || message.documentWithCaptionMessage?.message
    || message;
}

function idFromParamsJson(value) {
  const text = String(value || '').trim();
  if (!text.startsWith('{')) return '';
  try {
    const parsed = JSON.parse(text);
    return String(parsed.id || parsed.selectedButtonId || parsed.button_id || '').trim();
  } catch {
    return '';
  }
}

function buttonIdFromMessage(message) {
  const msg = unwrapMessage(message);
  const nested = unwrapMessage(msg);
  const candidates = [
    msg.buttonsResponseMessage?.selectedButtonId,
    nested.buttonsResponseMessage?.selectedButtonId,
    msg.templateButtonReplyMessage?.selectedId,
    nested.templateButtonReplyMessage?.selectedId,
    msg.listResponseMessage?.singleSelectReply?.selectedRowId,
    nested.listResponseMessage?.singleSelectReply?.selectedRowId,
    msg.interactive?.button_reply?.id,
    nested.interactive?.button_reply?.id,
    msg.button_reply?.id,
    nested.button_reply?.id,
    msg.interactiveResponseMessage?.button_reply?.id,
    idFromParamsJson(msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson),
    idFromParamsJson(nested.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson),
  ];
  return candidates.map((item) => String(item || '').trim()).find(Boolean) || '';
}

function buttonIdFromBody(body) {
  const explicit = String(body?.button_id || body?.selectedButtonId || '').trim();
  if (explicit) return explicit;
  const data = evolutionData(body);
  return buttonIdFromMessage(data.message || body?.message || {});
}

function eventName(body) {
  return String(body?.event || evolutionData(body)?.messageType || 'unknown').slice(0, 80);
}

function messageIdFromBody(body) {
  return String(body?.webhook_id || evolutionData(body)?.key?.id || body?.key?.id || '').slice(0, 80);
}

function maskButtonId(value) {
  const parsed = parseButtonId(value);
  if (!parsed) return value ? 'unrecognized' : '';
  return `alheef_map:${parsed.action}:***`;
}

function logWebhook({ event, messageId, buttonId, route }) {
  console.info(JSON.stringify({
    scope: 'map-approval-webhook',
    at: new Date().toISOString(),
    event: String(event || 'unknown').slice(0, 80),
    messageId: String(messageId || '').slice(0, 80),
    buttonId: maskButtonId(buttonId),
    route: String(route || '').slice(0, 40),
  }));
}

function isFromMe(body) {
  const data = evolutionData(body);
  return data?.key?.fromMe === true || body?.key?.fromMe === true;
}

function senderFromBody(body) {
  if (body?.from) return String(body.from);
  const jid = String(evolutionData(body)?.key?.remoteJid || body?.key?.remoteJid || '');
  if (jid.endsWith('@g.us')) return '';
  return jid.split('@')[0].split(':')[0];
}

function webhookIdFromBody(body, rawBody) {
  const explicit = String(body?.webhook_id || '').trim();
  if (explicit) return explicit;
  const keyId = String(evolutionData(body)?.key?.id || '').trim();
  if (keyId) return keyId;
  return hashValue(rawBody?.toString?.('utf8') || JSON.stringify(body || {})).slice(0, 40);
}

function verifyIncomingWebhook(rawBody, signature, webhookToken) {
  return verifyWebhook(rawBody, signature) || verifyWebhookToken(webhookToken);
}

function explicitDecision(body) {
  const action = String(body?.action || '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(action)) return '';
  return action;
}

async function rememberWebhook(webhookId, requestId) {
  const { error } = await getAdmin().from('map_publish_webhook_events').insert({
    webhook_id: webhookId,
    request_id: requestId,
  });
  if (!error) return { fresh: true };
  if (/duplicate|unique/i.test(error.message || '')) return { fresh: false };
  return { fresh: false, error };
}

async function acceptWebhook({ rawBody, signature, webhookToken, body }) {
  const event = eventName(body);
  const messageId = messageIdFromBody(body);
  const buttonId = buttonIdFromBody(body);
  if (!verifyIncomingWebhook(rawBody, signature, webhookToken)) {
    logWebhook({ event, messageId, buttonId, route: 'unauthorized' });
    return { status: 401, body: { success: false, message: 'توقيع الويب هوك غير صالح' } };
  }
  if (isFromMe(body)) {
    logWebhook({ event, messageId, buttonId, route: 'ignored' });
    return { status: 200, body: { success: true, ignored: true } };
  }
  const button = parseButtonId(buttonId);
  const requested = explicitDecision(body);
  if (!button && !(body?.request_id && requested)) {
    logWebhook({ event, messageId, buttonId, route: 'ignored' });
    return { status: 200, body: { success: true, ignored: true } };
  }
  const from = senderFromBody(body);
  if (!phonesEqual(from, adminPhone())) {
    logWebhook({ event, messageId, buttonId, route: 'rejected-phone' });
    return { status: 403, body: { success: false, message: 'رقم غير مصرح له بالقرار' } };
  }
  let action = requested;
  let row = null;
  if (button) {
    row = await findByCode(button.action === 'approve' ? 'approve_code_hash' : 'reject_code_hash', button.code);
    action = button.action;
  } else {
    row = await getRequest(String(body.request_id));
  }
  if (!row) {
    logWebhook({ event, messageId, buttonId, route: 'unknown-request' });
    return { status: 404, body: { success: false, message: 'الطلب غير موجود' } };
  }
  const webhookId = webhookIdFromBody(body, rawBody);
  const remembered = await rememberWebhook(webhookId, row.id);
  if (remembered.error) {
    logWebhook({ event, messageId, buttonId, route: 'error' });
    return { status: 500, body: { success: false, message: 'تعذر تسجيل الويب هوك' } };
  }
  if (!remembered.fresh) {
    logWebhook({ event, messageId, buttonId, route: 'replay' });
    const current = await getRequest(row.id);
    await audit(current, 'webhook_replay', {});
    const linked = await propertyLink(current?.published_property_id);
    return { status: 200, body: { ...publicRequest(current, { idempotent: true, ...linked }), message: 'تم استخدام هذا القرار من قبل.' } };
  }
  if (row.status !== 'pending_approval' && action === 'approve' && ['published', 'publishing', 'failed'].includes(row.status)) {
    logWebhook({ event, messageId, buttonId, route: 'replay' });
    const linked = await propertyLink(row.published_property_id);
    return { status: 200, body: { ...publicRequest(row, { idempotent: true, ...linked }), message: 'تم استخدام هذا القرار من قبل.' } };
  }
  logWebhook({ event, messageId, buttonId, route: 'decision' });
  return applyDecision(row, action, normalizeAccountPhone(from));
}

function validShortCode(code) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(String(code || ''));
}

async function shortDecision(action, code) {
  if (!validShortCode(code) || !['approve', 'reject'].includes(action)) {
    return { status: 404, body: { success: false, message: 'الرابط غير صالح' } };
  }
  const row = await findByCode(action === 'approve' ? 'approve_code_hash' : 'reject_code_hash', code);
  if (!row) return { status: 404, body: { success: false, message: 'الرابط غير صالح' } };
  return applyDecision(row, action, adminPhone());
}

async function shortOpen(code) {
  if (!validShortCode(code)) return null;
  const row = await findByCode('open_code_hash', code);
  if (!row?.published_property_id || row.property_status !== 'published') return null;
  const linked = await propertyLink(row.published_property_id);
  if (!linked.propertyUrl || linked.property?.status !== 'published') return null;
  return linked.propertyUrl;
}

async function resendPendingApproval(requestNumber) {
  const number = String(requestNumber || '').trim();
  const { data: row, error } = await getAdmin()
    .from('map_publish_requests')
    .select('*')
    .eq('request_number', number)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false, status: 'missing' };
  if (row.status !== 'pending_approval' || row.published_property_id) {
    return { ok: false, status: row.status, propertyId: row.published_property_id || null };
  }
  const approve = shortCode();
  const reject = shortCode();
  const { data: updated, error: updateError } = await getAdmin()
    .from('map_publish_requests')
    .update({
      approve_code_hash: hashValue(approve),
      reject_code_hash: hashValue(reject),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending_approval')
    .select('id,status,published_property_id')
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated || updated.published_property_id) return { ok: false, status: updated?.status || 'changed' };
  const sent = await notify(row, approvalMessage(row, { approve, reject }), 'whatsapp_approval_resend');
  return {
    ok: !!sent?.ok,
    mode: sent?.mode || '',
    status: 'pending_approval',
    propertyId: null,
  };
}

async function cancelRequest(id) {
  const row = await getRequest(id);
  if (!row) return { status: 404, body: { success: false, message: 'الطلب غير موجود' } };
  if (row.status !== 'pending_approval') {
    return { status: 409, body: { success: false, message: 'لا يمكن إلغاء الطلب في هذه الحالة' } };
  }
  const cancelled = await patchStatus(row.id, 'pending_approval', {
    status: 'cancelled',
    approval_consumed_at: new Date().toISOString(),
    failure_reason: 'ألغاه الأدمن',
  });
  if (!cancelled) return { status: 409, body: { success: false, message: 'لا يمكن إلغاء الطلب في هذه الحالة' } };
  await audit(cancelled, 'cancelled', {});
  await cleanupTempImages(cancelled);
  return { status: 200, body: { ...publicRequest(cancelled), message: 'تم إلغاء الطلب.' } };
}

async function deleteRequest(id) {
  const row = await getRequest(id);
  if (!row) return { status: 404, body: { success: false, message: 'الطلب غير موجود' } };
  await cleanupTempImages(row);
  await getAdmin().from('map_publish_webhook_events').delete().eq('request_id', row.id);
  const { error } = await getAdmin().from('map_publish_requests').delete().eq('id', row.id);
  if (error) throw new Error(error.message);
  return { status: 200, body: { success: true, deleted: true, message: 'تم حذف الطلب.' } };
}

function previewContext(query) {
  const rid = String(query.rid || '');
  const exp = String(query.exp || '');
  const sig = String(query.sig || '');
  if (!verifySign([rid, 'preview', exp, ''], sig) && !rid) return null;
  return { rid, exp, sig };
}

async function loadPreview(query) {
  const rid = String(query.rid || '');
  const exp = String(query.exp || '');
  const sig = String(query.sig || '');
  const row = await getRequest(rid);
  if (!row) return null;
  if (!verifySign([rid, 'preview', exp, row.payload_hash], sig)) return null;
  return { expired: false, row };
}

async function listRequests(status) {
  cleanupExpiredStaging().catch(() => {});
  let query = getAdmin().from('map_publish_requests').select('*').order('created_at', { ascending: false }).limit(200);
  if (status && STATUSES.has(status)) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = [];
  for (const row of data || []) {
    const info = summaryFrom(row.payload_json || {});
    const linked = await propertyLink(row.published_property_id);
    items.push({
      id: row.id,
      requestNumber: row.request_number,
      sourceType: row.source_type,
      sourceName: row.source_name,
      sourceUrl: row.source_url,
      status: row.status,
      propertyType: info.propertyType,
      summary: String(row.payload_json?.details || '').slice(0, 180),
      locationUrl: row.payload_json?.location_url || '',
      contactPhone: row.payload_json?.contact_phone || '',
      imageCount: info.imageCount,
      createdAt: row.created_at,
      internalRef: linked.internalRef,
      propertyUrl: linked.propertyUrl,
      propertyStatus: row.property_status,
      failureReason: row.failure_reason,
    });
  }
  return items;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewHtml(loaded, query) {
  if (!loaded) return { status: 401, html: '<p dir="rtl">رابط المعاينة غير صالح.</p>' };
  if (loaded.expired) return { status: 410, html: '<p dir="rtl">انتهت صلاحية المعاينة.</p>' };
  const row = loaded.row;
  const payload = row.payload_json || {};
  const parsed = parseListingPaste(payload.details || '');
  const images = (payload.images || []).map((_, index) => {
    const params = new URLSearchParams({
      rid: row.id,
      exp: String(query.exp || ''),
      sig: String(query.sig || ''),
      n: String(index),
    });
    return `/api/integrations/alheef-map/preview-image?${params.toString()}`;
  });
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة طلب الخريطة</title></head><body style="font-family:sans-serif;line-height:1.7;padding:1rem">
<h1>معاينة الإعلان</h1>
<p>هذه صفحة للقراءة فقط ولا تنشر الإعلان.</p>
<p>المصدر: ${escapeHtml(row.source_name || row.source_type)}</p>
<p>النوع: ${escapeHtml(payload.property_type || parsed.propertyType || '')}</p>
<p>وقت الوصول: ${escapeHtml(row.created_at)}</p>
<p>رابط الموقع: ${escapeHtml(payload.location_url || '')}</p>
<p>رقم التواصل: ${escapeHtml(payload.contact_phone || '—')}</p>
<pre style="white-space:pre-wrap">${escapeHtml(payload.details || '')}</pre>
<p>الحي: ${escapeHtml(parsed.district || '—')} — المساحة: ${escapeHtml(parsed.area || '—')} — السعر: ${escapeHtml(parsed.price || 'على السوم')}</p>
${images.map((src) => `<img alt="" src="${escapeHtml(src)}" style="max-width:240px;margin:0.3rem">`).join('')}
</body></html>`;
  return { status: 200, html };
}

async function previewImage(query) {
  const loaded = await loadPreview(query);
  if (!loaded || loaded.expired) return null;
  const image = (loaded.row.payload_json?.images || [])[Number(query.n)];
  if (!image) return null;
  if (image.kind === 'remote') return { redirect: image.url };
  const { data, error } = await getAdmin().storage.from(image.bucket).download(image.path);
  if (error || !data) return null;
  return { mime: image.mime, buffer: Buffer.from(await data.arrayBuffer()) };
}

async function cleanupExpiredStaging() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await getAdmin()
    .from('map_publish_requests')
    .select('*')
    .in('status', ['rejected', 'expired', 'cancelled'])
    .lt('updated_at', cutoff)
    .limit(50);
  for (const row of data || []) {
    await cleanupTempImages(row);
  }
}

module.exports = {
  SOURCES,
  authorizeIntegration,
  authorizeConnector,
  verifyWebhook,
  sign,
  createRequest,
  decide,
  applyDecision,
  acceptWebhook,
  shortDecision,
  shortOpen,
  shortLinkState,
  confirmPage,
  resendPendingApproval,
  decisionPage,
  cancelRequest,
  deleteRequest,
  listRequests,
  previewHtml,
  loadPreview,
  previewImage,
  cleanupExpiredStaging,
  cleanupTempImages,
  setWhatsAppSender,
  rateLimiter,
  fingerprint,
  structuredListingFields,
  applyStructuredListing,
  safeReason,
  hooks,
  adminPhone,
  resultMessage,
  approvalMessage,
};
