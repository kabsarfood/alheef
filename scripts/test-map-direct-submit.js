/**
 * نموذج الإدخال المباشر. لا يوافق ولا ينشر.
 * node --use-system-ca scripts/test-map-direct-submit.js
 */
require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const express = require('express');

process.env.MAP_SUBMIT_TOKEN = crypto.randomBytes(32).toString('base64url');

const { page, submit } = require('../server/routes/mapDirectSubmit');
const { getAdmin } = require('../server/lib/supabase');

const TOKEN = process.env.MAP_SUBMIT_TOKEN;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const DETAILS = 'للبيع فيلا في المهدية\nالمساحة 410\nقطعة 91021 مخطط 91021\nاختبار مسار الإدخال المباشر';
const MAPS = 'https://www.google.com/maps?q=24.6511,46.5211';

function assert(condition, message) {
  if (!condition) {
    const error = new Error(message);
    error.name = 'AssertionError';
    throw error;
  }
  console.log('✓', message);
}

function multipart() {
  const boundary = 'alheefdirect';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="k"\r\n\r\n${TOKEN}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="details"\r\n\r\n${DETAILS}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="maps_url"\r\n\r\n${MAPS}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="contact_phone"\r\n\r\n0530792754\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="website"\r\n\r\n\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { boundary, body };
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
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.get('/map-submit', page);
  app.post('/api/map-submit', submit);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const port = server.address().port;
  try {
    const hidden = await call(port, { path: '/map-submit' });
    assert(hidden.status === 200 && hidden.text.includes('إرسال الإعلان') && !hidden.text.includes(TOKEN), 'النموذج يفتح بدون رمز دخول');
    const wrong = await call(port, { path: '/map-submit?k=wrong-token' });
    assert(wrong.status === 404, 'رمز خاطئ لا يفتح النموذج');
    const opened = await call(port, { path: `/map-submit?k=${encodeURIComponent(TOKEN)}` });
    assert(opened.status === 200 && opened.text.includes('إرسال الإعلان') && opened.text.includes('0530792754') && !opened.text.includes('لوحة'), 'الرابط الخاص يعرض النموذج');
    assert(opened.text.includes('noindex') && opened.text.includes('name="website"'), 'الصفحة مخفية عن الفهرسة وفيها حقل خداع');

    const firstPack = multipart();
    const first = await call(port, {
      method: 'POST',
      path: '/api/map-submit',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${firstPack.boundary}`,
        Accept: 'application/json',
        'Content-Length': firstPack.body.length,
      },
      body: firstPack.body,
    });
    assert(first.status === 201 && first.json?.ok === true && first.json.status === 'pending_approval' && /^MAP-\d+$/.test(first.json.request_number || ''), 'الإرسال ينشئ طلب موافقة');
    const row = (await getAdmin().from('map_publish_requests').select('id,status,published_property_id,payload_json').eq('request_number', first.json.request_number).single()).data;
    assert(row.status === 'pending_approval' && !row.published_property_id, 'لا يوجد عقار قبل الموافقة');
    assert((row.payload_json.images || []).length === 1 && row.payload_json.contact_phone === '0530792754', 'الصورة مؤقتة والرقم محفوظ');

    const secondPack = multipart();
    const second = await call(port, {
      method: 'POST',
      path: '/api/map-submit',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${secondPack.boundary}`,
        Accept: 'application/json',
        'Content-Length': secondPack.body.length,
      },
      body: secondPack.body,
    });
    const copies = await getAdmin().from('map_publish_requests').select('id').eq('request_number', first.json.request_number);
    assert(second.status === 200 && second.json.request_number === first.json.request_number && (copies.data || []).length === 1, 'إعادة الإرسال تعيد نفس الرقم ولا تنشئ نسخة');
    console.log(JSON.stringify({ request: first.json.request_number, status: row.status }));
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
