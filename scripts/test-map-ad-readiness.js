/**
 * فحص جاهزية إضافة الإعلان والمشاركة.
 * لا ينشر إعلانًا ولا يكتب في قاعدة البيانات.
 */
require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { getAdmin } = require('../server/lib/supabase');
const service = require('../server/services/adminMapAd');
const otp = require('../server/services/whatsappOtpCore');
const { toPublicProperty } = require('../server/services/mappers');
const { createToken } = require('../server/middleware/auth');

const SAMPLE = `للبيع فيلا بحي المهدية
المساحة ٦٠٠م
شارع ٢٠ شمالي و١٥ غربي
6 غرف ومسبح ومصعد
السعر ٢.٤٥٠ مليون
قطعة ٨٥٠٩ مخطط ٢٥٦٦/أ
للتواصل ٠٥٣٠٧٩٢٧٥٤`;
const MAPS = 'https://www.google.com/maps/@24.7136,46.6753,17z';
const SOURCE = '0551234567';

function fingerprint(rows) {
  const text = rows
    .map((row) => [row.id, row.status, row.updated_at, row.slug].join(':'))
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function snapshot() {
  const { data, error, count } = await getAdmin()
    .from('properties')
    .select('id,status,updated_at,slug', { count: 'exact' });
  if (error) throw new Error(error.message);
  return { count: count == null ? data.length : count, hash: fingerprint(data || []), rows: (data || []).length };
}

function installMemory() {
  const rows = new Map();
  const created = [];
  const writes = [];
  const images = [];
  function admin() {
    return {
      from() {
        const state = { filters: [], patch: null };
        const api = {
          select() { return api; },
          update(patch) { state.patch = patch; return api; },
          eq(col, val) { state.filters.push([col, val]); return api; },
          order() { return api; },
          limit() {
            const key = state.filters.find((item) => item[0] === 'source_listing_id')?.[1];
            const found = [...rows.values()].filter((row) => row.sourceListingId === key);
            return Promise.resolve({
              data: found.slice(0, 1).map((row) => ({
                id: row.id,
                status: row.status,
                slug: row.slug,
                latitude: row.latitude,
                longitude: row.longitude,
                title: row.title,
              })),
              error: null,
            });
          },
          then(resolve, reject) {
            const id = state.filters.find((item) => item[0] === 'id')?.[1];
            const status = state.filters.find((item) => item[0] === 'status')?.[1];
            const row = rows.get(id);
            if (state.patch && row && (!status || row.status === status)) {
              if (state.patch.status) row.status = state.patch.status;
              writes.push(state.patch.status || 'seal');
            }
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        };
        return api;
      },
    };
  }
  service.useDeps({
    isEnabled: () => true,
    getAdmin: admin,
    propertiesRepo: {
      async create(body) {
        created.push(body);
        const row = {
          id: `mem-${created.length}`,
          slug: `mem-${created.length}`,
          title: body.title,
          status: body.status,
          source: body.source,
          sourceListingId: body.sourceListingId,
          latitude: body.latitude,
          longitude: body.longitude,
          description: body.description,
        };
        rows.set(row.id, row);
        return { id: row.id, slug: row.slug, title: row.title, status: row.status };
      },
      async getById(id) {
        const row = rows.get(id);
        return row ? { ...row, dbStatus: row.status } : null;
      },
      async addImages(id, urls) {
        images.push({ id, urls });
      },
    },
    uploadFiles: async (files) => files.map((file, index) => ({ url: `https://cdn.example/${index}-${file.originalname}` })),
    otp,
  });
  return { rows, created, writes, images };
}

async function expectThrow(fn, status) {
  try {
    await fn();
    assert.fail('كان يجب أن يُرفض الطلب');
  } catch (err) {
    if (status) assert.strictEqual(err.status, status);
  }
}

async function main() {
  const before = await snapshot();
  const memory = installMemory();
  const sentTo = [];
  otp._resetForTests();
  otp._setSender(async (phone, message) => {
    sentTo.push({ phone, message });
    return { ok: true };
  });
  process.env.ADMIN_PHONE = '0550000000';
  await expectThrow(() => service.startPublishOtp({ propertyId: 'none' }), 503);
  assert.strictEqual(sentTo.length, 0, 'لا تُرسل رسالة إذا لم يكن رقم المدير هو الرقم المعتمد');

  process.env.ADMIN_PHONE = '0530792754';
  const preview = await service.preview(SAMPLE, MAPS);
  assert.strictEqual(preview.listingType, 'sale');
  assert.strictEqual(preview.propertyType, 'فيلا');
  assert.strictEqual(preview.area, 600);
  assert.strictEqual(preview.price, 2450000);
  assert.strictEqual(preview.needsLocation, false);
  assert.ok(preview.originalText.includes('المساحة ٦٠٠م'));

  await expectThrow(() => service.createDraft({
    text: 'عقار مميز قرب الخدمات العامة',
    sourcePhone: SOURCE,
    latitude: 24.7,
    longitude: 46.6,
  }), 400);
  await expectThrow(() => service.createDraft({
    text: SAMPLE,
    sourcePhone: SOURCE,
    mapsUrl: '',
  }), 400);
  assert.strictEqual(memory.created.length, 0, 'لا يُنشأ إعلان بلا نوع أو بلا موقع');

  const draft = await service.createDraft({
    text: SAMPLE,
    sourcePhone: SOURCE,
    mapsUrl: MAPS,
    files: [{ buffer: Buffer.from('img'), originalname: 'villa.jpg' }],
  });
  assert.strictEqual(draft.created, true);
  assert.strictEqual(draft.property.status, 'draft');
  assert.strictEqual(memory.created[0].status, 'draft');
  assert.strictEqual(memory.created[0].showOnMap, false);
  assert.ok(!memory.created[0].contactPhone && !memory.created[0].agentPhone);
  assert.strictEqual(memory.created[0].description, SAMPLE);
  assert.strictEqual(memory.images.length, 1);
  assert.ok(memory.images[0].urls[0].includes('villa.jpg'));
  assert.ok(!memory.writes.includes('published'));

  const again = await service.createDraft({
    text: SAMPLE,
    sourcePhone: SOURCE,
    mapsUrl: MAPS,
  });
  assert.strictEqual(again.idempotent, true);
  assert.strictEqual(again.property.id, draft.property.id);
  assert.strictEqual(memory.created.length, 1, 'التكرار لا ينشئ إعلانًا ثانيًا');

  const started = await service.startPublishOtp({ propertyId: draft.property.id, ip: '127.0.0.1' });
  assert.ok(started.challengeId);
  assert.ok(!started.code, 'استجابة التوثيق لا تعيد الرمز');
  assert.strictEqual(sentTo.length, 1);
  assert.strictEqual(sentTo[0].phone, '0530792754');
  assert.ok(sentTo[0].message.startsWith('رمز توثيق رفع إعلان عقاري – الهيف العقارية'));
  assert.ok(!sentTo[0].message.includes('http'));
  assert.strictEqual(memory.rows.get(draft.property.id).status, 'draft');

  const other = await otp.sendOtp({
    purpose: 'map_ad_publish',
    phone: '0551111111',
    meta: { propertyId: draft.property.id },
  });
  await expectThrow(() => service.publishWithOtp({
    propertyId: draft.property.id,
    challengeId: other.challengeId,
    code: other.code,
  }), 400);
  assert.strictEqual(memory.rows.get(draft.property.id).status, 'draft');

  await expectThrow(() => service.publishWithOtp({
    propertyId: draft.property.id,
    challengeId: started.challengeId,
    code: '000000',
  }), 400);
  otp._expire(started.challengeId);
  await expectThrow(() => service.publishWithOtp({
    propertyId: draft.property.id,
    challengeId: started.challengeId,
    code: '123456',
  }), 400);
  assert.strictEqual(memory.rows.get(draft.property.id).status, 'draft');

  const fresh = await service.startPublishOtp({ propertyId: draft.property.id, ip: '127.0.0.1' });
  const code = sentTo.at(-1).message.match(/\*(\d{6})\*/)?.[1];
  const published = await service.publishWithOtp({
    propertyId: draft.property.id,
    challengeId: fresh.challengeId,
    code,
  });
  assert.strictEqual(published.idempotent, false);
  assert.strictEqual(memory.rows.get(draft.property.id).status, 'published');
  const repeated = await service.publishWithOtp({
    propertyId: draft.property.id,
    challengeId: fresh.challengeId,
    code,
  });
  assert.strictEqual(repeated.idempotent, true);
  assert.strictEqual(memory.created.length, 1, 'إعادة الرمز لا تنشئ إعلانًا آخر');

  const pub = toPublicProperty({
    id: draft.property.id,
    title: 'فيلا في المهدية',
    slug: 'villa',
    description: SAMPLE,
    propertyType: 'فيلا',
    listingType: 'sale',
    features: { property_description: SAMPLE, amenities: ['مسبح'] },
    agentPhone: SOURCE,
    contactPhone: '0530792754',
    coverImage: 'https://cdn.example/0-villa.jpg',
    gallery: ['https://cdn.example/0-villa.jpg'],
    latitude: 24.7136,
    longitude: 46.6753,
    price: 2450000,
    area: 600,
  });
  const packed = JSON.stringify(pub);
  assert.ok(!packed.includes('0530792754'));
  assert.ok(!packed.includes('0551234567'));
  assert.ok(!packed.includes('٠٥٣٠٧٩٢٧٥٤'));
  assert.ok(!packed.includes('agentPhone'));
  const shareRes = await fetch('http://127.0.0.1:8080/health').then((res) => res.ok).catch(() => false);
  assert.strictEqual(shareRes, true);

  const after = await snapshot();
  assert.strictEqual(after.count, before.count, 'عدد العقارات تغيّر');
  assert.strictEqual(after.hash, before.hash, 'بيانات العقارات تغيّرت');

  const app = express();
  app.use(express.json());
  app.use(require('../server/routes/adminMapAd'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const anon = await fetch(`http://127.0.0.1:${port}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const marketer = await fetch(`http://127.0.0.1:${port}/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${createToken({ role: 'marketer' })}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.strictEqual(anon.status, 401);
  assert.strictEqual(marketer.status, 401);
  server.close();
  console.log(JSON.stringify({
    ok: true,
    properties: before.count,
    sameDatabase: before.hash === after.hash,
    publishedOnlyAfterCode: true,
    otpPhone: 'authorized-only',
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
