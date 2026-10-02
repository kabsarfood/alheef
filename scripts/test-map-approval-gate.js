/**
 * بوابة موافقة واتساب لطلبات خريطة الهيف.
 * node --use-system-ca scripts/test-map-approval-gate.js
 */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const express = require('express');

process.env.ALHEEF_MAP_INTEGRATION_KEY = process.env.ALHEEF_MAP_INTEGRATION_KEY && process.env.ALHEEF_MAP_INTEGRATION_KEY.length >= 24
  ? process.env.ALHEEF_MAP_INTEGRATION_KEY
  : crypto.randomBytes(24).toString('hex');
process.env.ALHEEF_WHATSAPP_WEBHOOK_SECRET = process.env.ALHEEF_WHATSAPP_WEBHOOK_SECRET && process.env.ALHEEF_WHATSAPP_WEBHOOK_SECRET.length >= 24
  ? process.env.ALHEEF_WHATSAPP_WEBHOOK_SECRET
  : crypto.randomBytes(24).toString('hex');
process.env.ALHEEF_MAP_ADMIN_PHONE = '0530792754';
process.env.ALHEEF_PUBLIC_BASE_URL = 'http://127.0.0.1:8080';
process.env.ALHEEF_MAP_APPROVAL_RATE_MAX = '40';

const gate = require('../server/services/mapApproval');
const { publicRouter, shortApprove, shortReject, shortOpen } = require('../server/routes/mapApproval');
const { getAdmin } = require('../server/lib/supabase');
const propertiesRepo = require('../server/repositories/propertiesRepo');
const { propertyToMapProperty } = require('../server/services/mappers');
const { prepareQuickListing } = require('../server/services/quickPaste');

const KEY = process.env.ALHEEF_MAP_INTEGRATION_KEY;
const SECRET = process.env.ALHEEF_WHATSAPP_WEBHOOK_SECRET;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sent = [];
const createdIds = [];

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}
function assert(cond, msg) {
  if (!cond) fail(msg);
  else console.log('✓', msg);
}

gate.setWhatsAppSender(async (phone, message) => {
  const text = typeof message === 'string' ? message : (message?.fallbackText || message?.description || '');
  sent.push({ phone, text, message });
  return { ok: true, mode: 'buttons' };
});

function dataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function bodyFor(extra = {}) {
  const token = extra.token || crypto.randomBytes(4).toString('hex');
  return {
    property_type: extra.property_type || 'فيلا',
    details: extra.details || `النرجس\nللبيع فيلا\nالمساحة 400 م\nاختبار بوابة ${token}`,
    location_url: extra.location_url === undefined ? 'https://www.google.com/maps?q=24.81,46.71' : extra.location_url,
    contact_phone: extra.contact_phone === undefined ? '0530792754' : extra.contact_phone,
    source_type: extra.source_type || 'chatgpt',
    source_name: extra.source_name || 'ChatGPT',
    source_url: extra.source_url || null,
    external_reference: extra.external_reference || `TEST-GATE-${token}`,
    images: extra.images || [],
    idempotency_key: extra.idempotency_key,
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function call(port, { method = 'GET', path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, json, text, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function cleanup() {
  const admin = getAdmin();
  const { data } = await admin.from('map_publish_requests').select('*').like('external_reference', 'TEST-GATE-%');
  for (const row of data || []) {
    await gate.cleanupTempImages(row);
    if (row.published_property_id) {
      await propertiesRepo.retainImages(row.published_property_id, []);
      await propertiesRepo.remove(row.published_property_id);
    }
    await admin.from('map_publish_webhook_events').delete().eq('request_id', row.id);
    await admin.from('map_publish_requests').delete().eq('id', row.id);
  }
  createdIds.length = 0;
}

function approvalOf(entry) {
  const message = entry?.message || {};
  const text = String(message.fallbackText || entry?.text || '');
  const approve = (text.match(/\/m\/a\/([A-Za-z0-9_-]+)/) || [])[1];
  const reject = (text.match(/\/m\/r\/([A-Za-z0-9_-]+)/) || [])[1];
  return { message, text, approve, reject };
}

async function main() {
  const app = express();
  app.use(express.json({
    limit: '20mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));
  app.use('/api/integrations/alheef-map', publicRouter);
  app.get('/m/a/:code', shortApprove);
  app.post('/m/a/:code', shortApprove);
  app.get('/m/r/:code', shortReject);
  app.post('/m/r/:code', shortReject);
  app.get('/m/o/:code', shortOpen);
  const server = await listen(app);
  const port = server.address().port;
  const before = sent.length;

  try {
    const missing = await call(port, { method: 'POST', path: '/api/integrations/alheef-map/requests', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert(missing.status === 401, 'طلب دون مفتاح يُرفض');
    const wrong = await call(port, {
      method: 'POST',
      path: '/api/integrations/alheef-map/requests',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-the-real-key-value-000' },
      body: '{}',
    });
    assert(wrong.status === 401, 'مفتاح غير صحيح يُرفض');

    const savedKey = process.env.ALHEEF_MAP_INTEGRATION_KEY;
    process.env.ALHEEF_MAP_INTEGRATION_KEY = '';
    const disabled = await call(port, {
      method: 'POST',
      path: '/api/integrations/alheef-map/requests',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${savedKey}` },
      body: '{}',
    });
    process.env.ALHEEF_MAP_INTEGRATION_KEY = savedKey;
    assert(disabled.status === 503, 'غياب مفتاح الخادم يعيد 503');

    const payload = bodyFor({ token: 'create' });
    const created = await call(port, {
      method: 'POST',
      path: '/api/integrations/alheef-map/requests',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(payload),
    });
    assert(created.status === 201 && created.json.status === 'pending_approval', 'الطلب يُحفظ بانتظار الموافقة');
    assert(created.json.expires_at == null, 'لا توجد مدة انتهاء للموافقة');
    assert(!created.json.property_id, 'لا يُنشأ عقار قبل الموافقة');
    assert(!created.text.includes(KEY) && !created.text.includes(SECRET), 'الرد لا يكشف الأسرار');
    const notice = approvalOf(sent.at(-1));
    assert(notice.message.buttons?.length === 2, 'رسالة واتساب فيها زرّان');
    assert(notice.message.buttons[0].displayText === 'نعم، انشر' && notice.message.buttons[1].displayText === 'رفض', 'الزران: نعم انشر ورفض');
    assert(notice.message.buttons[0].url.endsWith(`/m/a/${notice.approve}`) && notice.message.buttons[1].url.endsWith(`/m/r/${notice.reject}`), 'الزر يفتح قرار الطلب نفسه');
    assert(!JSON.stringify(notice.message.buttons).includes('sig='), 'أزرار القرار بلا توقيع طويل');
    assert(notice.text.includes('النرجس') && notice.text.includes('/m/a/') && notice.text.includes('/m/r/'), 'النص البديل فيه التفاصيل ورابطان قصيران');
    assert(!notice.text.includes('معاينة') && !notice.text.includes('sig=') && !notice.text.includes('/decision?'), 'الرسالة لا تعرض معاينة ولا توقيعًا ولا رابطًا طويلًا');
    assert(sent.at(-1).phone === '966530792754', 'الإشعار يذهب لرقم الأدمن');
    const propertyCount = await propertiesRepo.getById(created.json.property_id || '00000000-0000-0000-0000-000000000000');
    assert(!propertyCount, 'لا يوجد سجل عقار للطلب الجديد');

    const openedLink = await call(port, { path: `/m/a/${notice.approve}` });
    assert(openedLink.status === 200 && openedLink.text.includes('نعم، انشر') && !openedLink.text.includes('تم نشر الإعلان'), 'فتح الرابط لا ينشر قبل التأكيد');
    const stillWaiting = (await getAdmin().from('map_publish_requests').select('status,published_property_id').eq('id', created.json.request_id).single()).data;
    assert(stillWaiting.status === 'pending_approval' && !stillWaiting.published_property_id, 'معاينة الرابط تترك الطلب بانتظار الموافقة');
    const approved = await call(port, { method: 'POST', path: `/m/a/${notice.approve}` });
    assert(approved.status === 200 && approved.text.includes('تم نشر الإعلان'), 'الرابط القصير ينشر الإعلان');
    const approvedRow = (await getAdmin().from('map_publish_requests').select('*').eq('id', created.json.request_id).single()).data;
    assert(approvedRow.status === 'published' && approvedRow.property_status === 'published', 'الحالة تصبح منشورة');
    const success = approvalOf(sent.at(-1));
    assert(success.text.includes('✅ تم نشر الإعلان على خريطة الهيف') && success.text.includes('الرقم الداخلي') && success.message.urlButton?.displayText === 'فتح الإعلان', 'رسالة النجاح فيها الرقم وزر فتح الإعلان');
    assert(success.text.includes('/m/o/') && !success.text.includes('sig=') && !success.text.includes('/property.html'), 'رابط النجاح قصير ومن دون توقيع');
    const full = await propertiesRepo.getById(approvedRow.published_property_id);
    const pub = propertyToMapProperty(full);
    assert(!pub.contactPhoneMasked && !JSON.stringify(pub).includes('0530792754'), 'الواجهة العامة لا تقرأ رقم المعلن');
    const opened = await call(port, { path: `/m/o/${(success.text.match(/\/m\/o\/([A-Za-z0-9_-]+)/) || [])[1]}` });
    assert(opened.status === 302 && String(opened.headers.location || '').includes('/property.html?slug='), 'زر فتح الإعلان يوصل لصفحة الإعلان');
    const again = await call(port, { method: 'POST', path: `/m/a/${notice.approve}` });
    assert(again.text.includes('تم استخدام هذا القرار') && (await getAdmin().from('properties').select('id').eq('id', approvedRow.published_property_id)).data.length === 1, 'الضغط مرتين لا ينشئ إعلانًا ثانيًا');
    const publishAudits = (await getAdmin().from('map_publish_audit').select('event').eq('request_id', created.json.request_id).eq('event', 'publish_started')).data || [];
    assert(publishAudits.length === 1, 'quickPaste يبدأ مرة واحدة');

    const rejectPayload = bodyFor({ token: 'reject', location_url: '' });
    const rejectCreated = await gate.createRequest(rejectPayload);
    const rejectCodes = approvalOf(sent.at(-1));
    const rejected = await call(port, { method: 'POST', path: `/m/r/${rejectCodes.reject}` });
    assert(rejected.text.includes('تم رفض الطلب'), 'الرفض يغيّر الحالة');
    const rejectRow = (await getAdmin().from('map_publish_requests').select('*').eq('id', rejectCreated.body.request_id).single()).data;
    assert(rejectRow.status === 'rejected' && !rejectRow.published_property_id, 'الرفض لا ينشئ عقارًا');
    const rejectAgain = await call(port, { method: 'POST', path: `/m/r/${rejectCodes.reject}` });
    assert(rejectAgain.text.includes('من قبل'), 'الرفض لا يُستخدم مرة ثانية');

    const expirePayload = bodyFor({ token: 'expire' });
    const expireCreated = await gate.createRequest(expirePayload);
    await getAdmin().from('map_publish_requests').update({ approval_expires_at: new Date(Date.now() - 60 * 1000).toISOString() }).eq('id', expireCreated.body.request_id);
    const stillPending = (await getAdmin().from('map_publish_requests').select('status').eq('id', expireCreated.body.request_id).single()).data;
    assert(stillPending.status === 'pending_approval', 'تاريخ الانتهاء القديم لا يُنهي الطلب');
    const expireCodes = approvalOf(sent.at(-1));
    const expiredApprove = await call(port, { method: 'POST', path: `/m/a/${expireCodes.approve}` });
    assert(expiredApprove.status === 200 && expiredApprove.text.includes('تم نشر الإعلان'), 'الموافقة تبقى متاحة بعد الوقت القديم');

    const hookPayload = bodyFor({ token: 'hook', source_type: 'haraj', source_name: 'حراج', source_url: 'https://haraj.com.sa/example' });
    const hookCreated = await gate.createRequest(hookPayload);
    const hookCodes = approvalOf(sent.at(-1));
    const hookId = `TEST-GATE-HOOK-${hookCreated.body.request_id}`;
    const hookBody = {
      event: 'messages.upsert',
      instance: 'otp',
      webhook_id: hookId,
      data: {
        key: { remoteJid: '966530792754@s.whatsapp.net', fromMe: false, id: hookId },
        messageType: 'buttonsResponseMessage',
        message: {
          buttonsResponseMessage: {
            selectedButtonId: `alheef_map:approve:${hookCodes.approve}`,
            selectedDisplayText: 'نعم، انشر',
          },
        },
      },
    };
    const raw = Buffer.from(JSON.stringify(hookBody));
    const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    const firstHook = await gate.acceptWebhook({ rawBody: raw, signature, body: hookBody });
    const secondHook = await gate.acceptWebhook({ rawBody: raw, signature, body: hookBody });
    assert(firstHook.body.property_id && secondHook.body.idempotent, 'تكرار الويب هوك لا ينشئ إعلانين');
    const badHook = await gate.acceptWebhook({ rawBody: raw, signature: '00', body: hookBody });
    assert(badHook.status === 401, 'ويب هوك غير موقع يُرفض');
    const strangerBody = {
      event: 'messages.upsert',
      webhook_id: `TEST-GATE-STRANGER-${hookCreated.body.request_id}`,
      data: {
        key: { remoteJid: '966551112233@s.whatsapp.net', fromMe: false, id: `TEST-GATE-STRANGER-${hookCreated.body.request_id}` },
        message: { buttonsResponseMessage: { selectedButtonId: `alheef_map:approve:${hookCodes.approve}` } },
      },
    };
    const strangerRaw = Buffer.from(JSON.stringify(strangerBody));
    const strangerSig = crypto.createHmac('sha256', SECRET).update(strangerRaw).digest('hex');
    const stranger = await gate.acceptWebhook({ rawBody: strangerRaw, signature: strangerSig, body: strangerBody });
    assert(stranger.status === 403, 'رقم غير الأدمن لا يوافق');

    const labelCreated = await gate.createRequest(bodyFor({ token: 'label' }));
    const labelCodes = approvalOf(sent.at(-1));
    const labelBody = {
      event: 'messages.upsert',
      webhook_id: `TEST-GATE-LABEL-${labelCreated.body.request_id}`,
      data: {
        key: { remoteJid: '966530792754@s.whatsapp.net', fromMe: false, id: `TEST-GATE-LABEL-${labelCreated.body.request_id}` },
        message: { buttonsResponseMessage: { selectedDisplayText: 'نعم، انشر' } },
      },
    };
    const labelRaw = Buffer.from(JSON.stringify(labelBody));
    const labelSig = crypto.createHmac('sha256', SECRET).update(labelRaw).digest('hex');
    const labelOnly = await gate.acceptWebhook({ rawBody: labelRaw, signature: labelSig, body: labelBody });
    const labelRow = (await getAdmin().from('map_publish_requests').select('status,published_property_id').eq('id', labelCreated.body.request_id).single()).data;
    assert(labelOnly.body.ignored && labelRow.status === 'pending_approval' && !labelRow.published_property_id, 'نص الزر وحده لا ينشر');

    const legacyCreated = await gate.createRequest(bodyFor({ token: 'legacy' }));
    const legacyCodes = approvalOf(sent.at(-1));
    const legacyBody = {
      event: 'messages.upsert',
      webhook_id: `TEST-GATE-LEGACY-${legacyCreated.body.request_id}`,
      from: '0530792754',
      data: {
        key: { id: `TEST-GATE-LEGACY-${legacyCreated.body.request_id}`, fromMe: false, remoteJid: '966530792754@s.whatsapp.net' },
        message: { buttonsResponseMessage: { selectedButtonId: `a.${legacyCodes.approve}` } },
      },
    };
    const legacyRaw = Buffer.from(JSON.stringify(legacyBody));
    const legacy = await gate.acceptWebhook({
      rawBody: legacyRaw,
      webhookToken: SECRET,
      body: legacyBody,
    });
    assert(legacy.body.property_id, 'معرّف الزر القديم يصل إلى المعالج عبر رمز الويب هوك');

    const interactiveCreated = await gate.createRequest(bodyFor({ token: 'interactive', location_url: '' }));
    const interactiveCodes = approvalOf(sent.at(-1));
    const interactiveBody = {
      event: 'messages.upsert',
      webhook_id: `TEST-GATE-INTERACTIVE-${interactiveCreated.body.request_id}`,
      data: {
        key: { remoteJid: '966530792754@s.whatsapp.net', fromMe: false, id: `TEST-GATE-INTERACTIVE-${interactiveCreated.body.request_id}` },
        message: {
          interactiveResponseMessage: {
            nativeFlowResponseMessage: {
              paramsJson: JSON.stringify({ id: `alheef_map:reject:${interactiveCodes.reject}`, display_text: 'رفض' }),
            },
          },
        },
      },
    };
    const interactiveRaw = Buffer.from(JSON.stringify(interactiveBody));
    const interactiveSig = crypto.createHmac('sha256', SECRET).update(interactiveRaw).digest('hex');
    const interactive = await gate.acceptWebhook({ rawBody: interactiveRaw, signature: interactiveSig, body: interactiveBody });
    const interactiveRow = (await getAdmin().from('map_publish_requests').select('status,published_property_id').eq('id', interactiveCreated.body.request_id).single()).data;
    assert(interactive.status === 200 && interactiveRow.status === 'rejected' && !interactiveRow.published_property_id, 'رد الزر التفاعلي يرفض دون إنشاء عقار');

    const replyCreated = await gate.createRequest(bodyFor({ token: 'replybtn', location_url: '' }));
    const replyCodes = approvalOf(sent.at(-1));
    const replyBody = {
      event: 'messages.upsert',
      webhook_id: `TEST-GATE-REPLY-${replyCreated.body.request_id}`,
      data: {
        key: { remoteJid: '966530792754@s.whatsapp.net', fromMe: false, id: `TEST-GATE-REPLY-${replyCreated.body.request_id}` },
        message: { interactive: { type: 'button_reply', button_reply: { id: `alheef_map:reject:${replyCodes.reject}`, title: 'رفض' } } },
      },
    };
    const replyRaw = Buffer.from(JSON.stringify(replyBody));
    const replySig = crypto.createHmac('sha256', SECRET).update(replyRaw).digest('hex');
    const reply = await gate.acceptWebhook({ rawBody: replyRaw, signature: replySig, body: replyBody });
    const replyRow = (await getAdmin().from('map_publish_requests').select('status,published_property_id').eq('id', replyCreated.body.request_id).single()).data;
    assert(reply.status === 200 && replyRow.status === 'rejected' && !replyRow.published_property_id, 'button_reply يرفض دون إنشاء عقار');

    const otpBody = {
      event: 'messages.upsert',
      data: {
        key: { remoteJid: '966530792754@s.whatsapp.net', fromMe: false, id: 'TEST-GATE-OTP-IGNORE' },
        message: { conversation: '123456' },
        messageType: 'conversation',
      },
    };
    const otpRaw = Buffer.from(JSON.stringify(otpBody));
    const otpIgnored = await gate.acceptWebhook({ rawBody: otpRaw, webhookToken: SECRET, body: otpBody });
    assert(otpIgnored.status === 200 && otpIgnored.body.ignored, 'رسالة ليست زر قرار تُتجاهل');
    const otpBad = await gate.acceptWebhook({ rawBody: otpRaw, webhookToken: 'wrong-token-value-not-the-secret', body: otpBody });
    assert(otpBad.status === 401, 'رمز الويب هوك الخاطئ يُرفض');

    const plain = await gate.createRequest(bodyFor({ token: 'noimg', images: [] }));
    assert(plain.status === 201, 'إعلان دون صور يُقبل');
    const one = await gate.createRequest(bodyFor({ token: 'oneimg', images: [dataUrl(PNG)] }));
    const oneCodes = approvalOf(sent.at(-1));
    assert(one.status === 201 && one.body.status === 'pending_approval', 'صورة واحدة تُحفظ مؤقتًا');
    const two = await gate.createRequest(bodyFor({ token: 'twoimg', images: [dataUrl(PNG), dataUrl(PNG)] }));
    assert(two.status === 201, 'صورتان تُقبلان');
    const onePublished = await gate.shortDecision('approve', oneCodes.approve);
    const withImage = await propertiesRepo.getById(onePublished.body.property_id);
    assert((withImage.gallery || []).length === 1 && withImage.coverImage, 'الصورة تنتقل للغلاف عبر النظام الحالي');

    const gif = await gate.createRequest(bodyFor({ token: 'gif', images: [`data:image/jpeg;base64,${Buffer.from('GIF89a').toString('base64')}`] })).catch((error) => error);
    assert(gif.status === 400, 'صورة بنوع غير مسموح تُرفض');
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, 0);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    const huge = await gate.createRequest(bodyFor({ token: 'big', images: [dataUrl(big, 'image/jpeg')] })).catch((error) => error);
    assert(huge.status === 400, 'صورة تتجاوز الحجم تُرفض');

    gate.hooks.uploadFinal = async () => { throw new Error('فشل رفع الملف'); };
    const failImg = await gate.createRequest(bodyFor({ token: 'failimg', images: [dataUrl(PNG)] }));
    const failCodes = approvalOf(sent.at(-1));
    const beforeFail = sent.length;
    const failed = await gate.shortDecision('approve', failCodes.approve);
    gate.hooks.uploadFinal = null;
    const failText = sent.slice(beforeFail).map((item) => item.text).join('\n');
    assert(failed.body.status === 'failed', 'فشل رفع الصورة يعلّم الطلب فاشلًا');
    assert(failText.includes('تعذر إضافة') && !failText.includes(KEY) && !failText.includes(SECRET) && !/service_role/i.test(failText), 'إشعار الفشل لا يكشف أسرارًا');

    const draft = await gate.createRequest(bodyFor({ token: 'draft', location_url: '' }));
    const draftCodes = approvalOf(sent.at(-1));
    const beforeDraft = sent.length;
    const drafted = await gate.shortDecision('approve', draftCodes.approve);
    const draftText = sent.slice(beforeDraft).map((item) => item.text).join('\n');
    assert(drafted.body.property_status === 'draft', 'موقع غير صالح يحفظ العقار مسودة');
    assert(draftText.includes('يحتاج موقعًا صحيحًا') && !draftText.includes('✅ تم نشر الإعلان'), 'إشعار المسودة لا يدّعي النشر');

    const mahdia = await gate.createRequest(bodyFor({
      token: 'mahdia',
      details: 'المهديه\nللبيع فيلا اختبار بوابة الرقم الداخلي',
      location_url: 'https://www.google.com/maps?q=24.65,46.52',
    }));
    const mahdiaCodes = approvalOf(sent.at(-1));
    const mahdiaResult = await gate.shortDecision('approve', mahdiaCodes.approve);
    assert(/^H-MHD-\d{6}$/.test(mahdiaResult.body.internal_ref || ''), 'إعلان المهدية يأخذ رقمًا داخليًا');
    assert((mahdiaResult.body.property_url || '').includes('/property.html?slug='), 'رابط الإعلان المباشر موجود');
    assert(approvalOf(sent.at(-1)).text.includes(mahdiaResult.body.internal_ref) && approvalOf(sent.at(-1)).text.includes('/m/o/'), 'رسالة النجاح تذكر الرقم ورابطًا قصيرًا');

    const dupSource = bodyFor({ token: 'dup', source_type: 'external', source_name: 'موقع خارجي' });
    const dupA = await gate.createRequest(dupSource);
    const messagesBeforeDup = sent.length;
    const dupB = await gate.createRequest(dupSource);
    assert(dupB.body.duplicate && dupB.body.request_id === dupA.body.request_id, 'الطلب المكرر يعيد الطلب السابق');
    assert(sent.length === messagesBeforeDup, 'التكرار لا يرسل واتساب جديدًا');

    gate.hooks.beforePublish = async (row) => {
      const payload = { ...row.payload_json, details: `${row.payload_json.details}\nتغيير بعد الموافقة` };
      await getAdmin().from('map_publish_requests').update({ payload_json: payload }).eq('id', row.id);
    };
    const changed = await gate.createRequest(bodyFor({ token: 'changed' }));
    const changedCodes = approvalOf(sent.at(-1));
    const changedResult = await gate.shortDecision('approve', changedCodes.approve);
    gate.hooks.beforePublish = async () => {};
    assert(changedResult.body.reset === true, 'تغيير البيانات بعد الموافقة يلغيها');
    assert(!changedResult.body.property_id, 'التغيير لا ينشئ عقارًا');

    const quick = await prepareQuickListing({ text: 'النرجس\nللبيع فيلا\nاختبار الإضافة السريعة بقي يعمل', mapsUrl: '', contactPhone: '' });
    assert(quick.body.propertyType === 'فيلا' && quick.published === false, 'الإضافة السريعة الحالية لم تتأثر');
    const mapHtml = fs.readFileSync('public/map.html', 'utf8');
    assert(mapHtml.includes('خيارات البحث') && mapHtml.includes('leaflet.markercluster'), 'فلاتر الخريطة وMarkerCluster كما هما');
    const quickHtml = fs.readFileSync('dashboard/quick-add.html', 'utf8');
    assert(quickHtml.includes('quick-add.js'), 'صفحة الإضافة السريعة لم تُستبدل');
    assert(fs.readFileSync('dashboard/add-property.html', 'utf8').includes('add-property.js'), 'النموذج الكامل ما زال في مكانه');

    const cancelItem = await gate.createRequest(bodyFor({ token: 'cancel' }));
    const cancelCodes = approvalOf(sent.at(-1));
    const cancelled = await gate.cancelRequest(cancelItem.body.request_id);
    assert(cancelled.body.status === 'cancelled', 'الأدمن يلغي الطلب من اللوحة');
    const afterCancel = await gate.shortDecision('approve', cancelCodes.approve);
    assert(afterCancel.status === 409 && !afterCancel.body.property_id, 'الطلب الملغى لا يُنشر');
    const removed = await gate.deleteRequest(cancelItem.body.request_id);
    assert(removed.body.deleted, 'الأدمن يحذف الطلب');
    const gone = await getAdmin().from('map_publish_requests').select('id').eq('id', cancelItem.body.request_id).maybeSingle();
    assert(!gone.data, 'الطلب المحذوف لم يعد موجودًا');

    let allowed = 0;
    for (let i = 0; i < 45; i += 1) if (gate.rateLimiter.allow('approval-rate-test')) allowed += 1;
    assert(allowed === 40, 'حد معدل الطلبات يعمل');
  } finally {
    gate.hooks.beforePublish = async () => {};
    gate.hooks.uploadFinal = null;
    server.close();
    await cleanup();
    const left = await getAdmin().from('map_publish_requests').select('id').like('external_reference', 'TEST-GATE-%');
    assert(!(left.data || []).length, 'حُذفت طلبات الاختبار');
  }
  if (!process.exitCode) console.log('map approval gate: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  cleanup().catch(() => {});
});
