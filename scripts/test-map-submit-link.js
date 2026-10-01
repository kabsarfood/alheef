/**
 * رابط الإضافة لمرة واحدة.
 * node --use-system-ca scripts/test-map-submit-link.js
 */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');

process.env.ALHEEF_MAP_ADMIN_PHONE = '0530792754';
process.env.ALHEEF_PUBLIC_BASE_URL = 'http://127.0.0.1:8080';

const gate = require('../server/services/mapApproval');
const links = require('../server/services/mapSubmitLink');
const { publicRouter, adminRouter, submitPage, shortApprove, shortReject } = require('../server/routes/mapApproval');
const { createToken } = require('../server/middleware/auth');
const { getAdmin } = require('../server/lib/supabase');
const { getConnectionConfig } = require('../server/lib/sqlMigrations');
const propertiesRepo = require('../server/repositories/propertiesRepo');
const { prepareQuickListing } = require('../server/services/quickPaste');
const { normalizeListingPhone } = require('../server/utils/phone');

const sent = [];
const linkIds = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.name = 'AssertionError';
    throw error;
  }
  console.log('✓', message);
}

function dataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function call(port, { method = 'GET', path: requestPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: requestPath, headers }, (res) => {
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
    if (body) req.write(body);
    req.end();
  });
}

async function applyMigration() {
  const cfg = getConnectionConfig();
  if (!cfg) throw new Error('لا يوجد اتصال بقاعدة البيانات');
  const pg = require('pg');
  const client = new pg.Client(cfg);
  await client.connect();
  try {
    const file = path.join(__dirname, '..', 'supabase', 'migrations', '022_map_submit_links.sql');
    await client.query(fs.readFileSync(file, 'utf8'));
  } finally {
    await client.end();
  }
}

function codeOf(url) {
  return String(url || '').split('/map-submit/')[1];
}

function payload(token, extra = {}) {
  return {
    property_type: extra.property_type || 'فيلا',
    details: extra.details || `المهديه\nللبيع فيلا\nالمساحة ٤١٠\nاختبار رابط الإضافة ${token}`,
    location_url: extra.location_url === undefined ? 'https://www.google.com/maps?q=24.6561,46.5261' : extra.location_url,
    contact_phone: extra.contact_phone || '',
    source_name: extra.source_name || 'ChatGPT',
    source_url: extra.source_url || '',
    images: extra.images || [],
  };
}

async function cleanup() {
  const admin = getAdmin();
  if (linkIds.length) {
    const rows = await admin.from('map_submit_links').select('id,request_id').in('id', linkIds);
    const requestIds = (rows.data || []).map((row) => row.request_id).filter(Boolean);
    if (requestIds.length) {
      const requests = await admin.from('map_publish_requests').select('id,published_property_id').in('id', requestIds);
      for (const row of requests.data || []) {
        if (row.published_property_id) {
          await propertiesRepo.retainImages(row.published_property_id, []);
          await propertiesRepo.remove(row.published_property_id);
        }
        await admin.from('map_publish_webhook_events').delete().eq('request_id', row.id);
        await admin.from('map_publish_requests').delete().eq('id', row.id);
      }
    }
    await admin.from('map_submit_links').delete().in('id', linkIds);
  }
}

async function main() {
  assert(normalizeListingPhone('05307927540530792754') === '0530792754', 'الرقم المكرر يُطبّع مرة واحدة');
  assert(normalizeListingPhone('0530792754') === '0530792754', 'الرقم الصحيح يبقى كما هو');
  assert(normalizeListingPhone('+966 53 079 2754') === '0530792754', 'صيغة واتساب تُطبّع إلى رقم محلي');
  assert(normalizeListingPhone('12345') === '', 'الرقم غير الصالح لا يمر');
  await applyMigration();
  gate.setWhatsAppSender(async (_phone, message) => {
    sent.push(message);
    return { ok: true, mode: 'test' };
  });
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/integrations/alheef-map', publicRouter);
  app.use('/api/admin/map-approvals', adminRouter);
  app.get('/map-submit/:code', submitPage);
  app.get('/m/a/:code', shortApprove);
  app.post('/m/a/:code', shortApprove);
  app.get('/m/r/:code', shortReject);
  app.post('/m/r/:code', shortReject);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const port = server.address().port;
  const adminToken = createToken({ role: 'admin' });
  const marketerToken = createToken({ role: 'marketer', marketerId: 'test' });
  const auth = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  try {
    const denied = await call(port, { method: 'POST', path: '/api/admin/map-approvals/submit-links', headers: { Authorization: `Bearer ${marketerToken}` } });
    assert(denied.status === 401, 'رابط الإضافة لا يُنشأ بغير جلسة أدمن');
    const created = await call(port, { method: 'POST', path: '/api/admin/map-approvals/submit-links', headers: auth });
    if (!(created.status === 201 && created.json && created.json.status === 'new' && String(created.json.url || '').includes('/map-submit/'))) {
      const safeText = created.text.replace(/map-submit\/[A-Za-z0-9_-]+/g, 'map-submit/[redacted]').slice(0, 160);
      throw new Error(`الأدمن ينشئ رابط إضافة (${created.status} ${created.json?.message || safeText})`);
    }
    console.log('✓', 'الأدمن ينشئ رابط إضافة');
    assert(!created.text.includes('ALHEEF_MAP_INTEGRATION_KEY') && !created.json.code_hash, 'إنشاء الرابط لا يكشف مفتاحًا أو البصمة');
    linkIds.push(created.json.id);
    const code = codeOf(created.json.url);
    assert(code.length === 43, 'الرمز طوله 32 بايت');
    const page = await call(port, { path: `/map-submit/${code}` });
    assert(page.status === 200 && page.text.includes('إرسال للموافقة') && page.text.includes('فيلا') && !page.text.includes('لوحة'), 'الرابط الصحيح يعرض نموذج الإرسال');
    assert(page.headers['cache-control'] === 'no-store' && page.headers['referrer-policy'] === 'no-referrer', 'صفحة الرابط لا تُخزن ولا ترسل المرجع');
    assert(!page.text.includes('googletagmanager') && !page.text.includes('analytics'), 'الصفحة بلا أدوات تحليل');
    assert(page.text.includes("addEventListener('paste'") && page.text.includes('انتهت مهلة الإرسال') && page.text.includes('90000') && page.text.includes('new FormData'), 'النموذج يرسل الصور كملفات ويوقف الإرسال بعد المهلة');
    assert(page.text.includes('multipart/form-data') && page.text.includes('method="post"') && page.text.includes(`/one-time-submit/${code}`), 'زر الإرسال يرسل النموذج مباشرة');
    const bad = await call(port, { path: '/map-submit/not-a-real-code' });
    assert(bad.status === 404 && bad.text.includes('الرابط غير صالح'), 'الرمز الخاطئ يعيد 404');

    const body = JSON.stringify(payload('one'));
    const posted = await call(port, {
      method: 'POST',
      path: `/api/integrations/alheef-map/one-time-submit/${code}`,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      body,
    });
    assert(posted.status === 201 && posted.json.status === 'pending_approval' && posted.json.message.includes('تم إرسال الإعلان للموافقة'), 'الإرسال ينشئ طلب موافقة');
    assert(!posted.json.property_id && !posted.text.includes('/m/a/'), 'الرد لا ينشر ولا يكشف رابط القرار');
    const row = (await getAdmin().from('map_publish_requests').select('id,status,published_property_id').eq('request_number', posted.json.request_number).single()).data;
    assert(row.status === 'pending_approval' && !row.published_property_id, 'لا يوجد عقار قبل موافقة واتساب');
    const usedPage = await call(port, { path: `/map-submit/${code}` });
    assert(usedPage.text.includes('تم استخدام هذا الرابط') && !usedPage.text.includes('<form'), 'الرابط المستخدم لا يعيد النموذج');
    const again = await call(port, {
      method: 'POST',
      path: `/api/integrations/alheef-map/one-time-submit/${code}`,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert(again.json.idempotent && again.json.request_number === posted.json.request_number, 'إعادة الإرسال لا تنشئ طلبًا ثانيًا');

    const raceLink = await links.createSubmitLink();
    linkIds.push(raceLink.body.id);
    const raceCode = codeOf(raceLink.body.url);
    const raceBody = JSON.stringify(payload('race'));
    const raced = await Promise.all([
      call(port, { method: 'POST', path: `/api/integrations/alheef-map/one-time-submit/${raceCode}`, headers: { 'Content-Type': 'application/json' }, body: raceBody }),
      call(port, { method: 'POST', path: `/api/integrations/alheef-map/one-time-submit/${raceCode}`, headers: { 'Content-Type': 'application/json' }, body: raceBody }),
    ]);
    const successes = raced.filter((item) => item.json?.status === 'pending_approval' && !item.json.idempotent);
    assert(successes.length === 1, 'الضغط مرتين بسرعة ينشئ طلبًا واحدًا');

    const expired = await links.createSubmitLink();
    linkIds.push(expired.body.id);
    await getAdmin().from('map_submit_links').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expired.body.id);
    const expiredPage = await call(port, { path: `/map-submit/${codeOf(expired.body.url)}` });
    const expiredPost = await call(port, { method: 'POST', path: `/api/integrations/alheef-map/one-time-submit/${codeOf(expired.body.url)}`, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload('expired')) });
    assert(expiredPage.text.includes('انتهت صلاحية الرابط') && expiredPost.status === 409, 'الرابط المنتهي لا يُرسل');

    const cancelled = await links.createSubmitLink();
    linkIds.push(cancelled.body.id);
    const cancel = await call(port, { method: 'POST', path: `/api/admin/map-approvals/submit-links/${cancelled.body.id}/cancel`, headers: auth });
    const cancelPage = await call(port, { path: `/map-submit/${codeOf(cancelled.body.url)}` });
    assert(cancel.status === 200 && cancelPage.text.includes('تم إلغاء الرابط'), 'إلغاء الرابط يمنعه');

    const plain = await links.createSubmitLink();
    linkIds.push(plain.body.id);
    const noImages = await links.submitOnce(codeOf(plain.body.url), payload('noimg', { images: [] }));
    assert(noImages.body.status === 'pending_approval', 'إعلان دون صور يُقبل');

    const two = await links.createSubmitLink();
    linkIds.push(two.body.id);
    const twoImages = await links.submitOnce(codeOf(two.body.url), payload('twoimg', { images: [dataUrl(PNG), dataUrl(PNG)] }));
    assert(twoImages.body.status === 'pending_approval', 'صورتان تُقبلان');
    const twoRow = (await getAdmin().from('map_publish_requests').select('payload_json').eq('request_number', twoImages.body.request_number).single()).data;
    assert((twoRow.payload_json.images || []).length === 2 && twoRow.payload_json.images.every((image) => image.kind === 'temp'), 'الصور تبقى مؤقتة قبل الموافقة');

    const badImage = await links.createSubmitLink();
    linkIds.push(badImage.body.id);
    const gif = await links.submitOnce(codeOf(badImage.body.url), payload('gif', { images: [`data:image/jpeg;base64,${Buffer.from('GIF89a').toString('base64')}`] }));
    const gifLink = (await getAdmin().from('map_submit_links').select('status').eq('id', badImage.body.id).single()).data;
    assert(gif.status === 400 && gifLink.status === 'new', 'ملف غير مسموح يُرفض ولا يستهلك الرابط');

    const hugeLink = await links.createSubmitLink();
    linkIds.push(hugeLink.body.id);
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, 1);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    const huge = await links.submitOnce(codeOf(hugeLink.body.url), payload('huge', { images: [dataUrl(big, 'image/jpeg')] }));
    assert(huge.status === 400, 'صورة تتجاوز الحجم تُرفض');
    const tooMany = await links.submitOnce(codeOf(hugeLink.body.url), payload('many', { images: Array.from({ length: 7 }, () => dataUrl(PNG)) }));
    assert(tooMany.status === 400, 'أكثر من 6 صور تُرفض');

    const firstDup = await links.createSubmitLink();
    const secondDup = await links.createSubmitLink();
    linkIds.push(firstDup.body.id, secondDup.body.id);
    const dupDetails = payload(`dup-${Date.now()}`);
    const first = await links.submitOnce(codeOf(firstDup.body.url), dupDetails);
    const second = await links.submitOnce(codeOf(secondDup.body.url), dupDetails);
    assert(first.body.request_number === second.body.request_number && second.body.message.includes('مسبقًا'), 'الإعلان المكرر لا ينشئ طلبًا ثانيًا');

    const approveNotice = sent.find((item) => String(item.fallbackText || '').includes(posted.json.request_number) || String(item.fullText || '').includes('اختبار رابط الإضافة one'));
    const approveCode = (String(approveNotice?.fallbackText || '').match(/\/m\/a\/([A-Za-z0-9_-]+)/) || [])[1];
    const opened = await call(port, { path: `/m/a/${approveCode}` });
    assert(opened.text.includes('نعم، انشر') && !(await getAdmin().from('map_publish_requests').select('published_property_id').eq('id', row.id).single()).data.published_property_id, 'فتح رابط الموافقة لا ينشر وحده');
    const approved = await call(port, { method: 'POST', path: `/m/a/${approveCode}` });
    const published = (await getAdmin().from('map_publish_requests').select('status,published_property_id,property_status').eq('id', row.id).single()).data;
    assert(approved.text.includes('تم نشر الإعلان') && published.status === 'published' && published.published_property_id, 'موافقة واتساب تنشر الإعلان مرة واحدة');
    const property = await propertiesRepo.getById(published.published_property_id);
    assert(property && (property.internalRef || property.internal_ref), 'النشر ينشئ رقمًا داخليًا');

    const rejectLink = await links.createSubmitLink();
    linkIds.push(rejectLink.body.id);
    const rejectedSubmit = await links.submitOnce(codeOf(rejectLink.body.url), payload('reject', { location_url: '' }));
    const rejectNotice = sent.at(-1);
    const rejectCode = (String(rejectNotice.fallbackText || '').match(/\/m\/r\/([A-Za-z0-9_-]+)/) || [])[1];
    const rejected = await call(port, { method: 'POST', path: `/m/r/${rejectCode}` });
    const rejectRow = (await getAdmin().from('map_publish_requests').select('status,published_property_id').eq('request_number', rejectedSubmit.body.request_number).single()).data;
    assert(rejected.text.includes('تم رفض الطلب') && rejectRow.status === 'rejected' && !rejectRow.published_property_id, 'الرفض لا ينشئ عقارًا');

    const quick = await prepareQuickListing({ text: 'النرجس\nللبيع فيلا\nاختبار الرابط لا يغيّر الإضافة السريعة', mapsUrl: '', contactPhone: '' });
    assert(quick.body.propertyType === 'فيلا' && quick.published === false, 'الإضافة السريعة لم تتأثر');
    const otp = fs.readFileSync('server/services/evolutionWhatsAppOtp.js', 'utf8');
    assert(otp.includes('رمز التحقق') && otp.includes('sendText'), 'إرسال رموز الدخول لم يتغير');
    const mapHtml = fs.readFileSync('public/map.html', 'utf8');
    assert(mapHtml.includes('خيارات البحث') && mapHtml.includes('leaflet.markercluster'), 'الخريطة والفلاتر كما هما');
    const listed = await call(port, { path: '/api/admin/map-approvals/submit-links', headers: auth });
    assert(listed.json.items.some((item) => item.id === created.json.id && item.status === 'used'), 'لوحة الإدارة تعرض حالة الرابط المستخدم');
    assert(!JSON.stringify(listed.json).includes(code), 'قائمة الروابط لا تعيد الرمز');
  } finally {
    gate.setWhatsAppSender(null);
    server.close();
    await cleanup();
  }
  if (!process.exitCode) console.log('map submit link: ok');
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await cleanup().catch(() => {});
});
