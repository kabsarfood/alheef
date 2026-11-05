const assert = require('assert');
const http = require('http');
const express = require('express');
const publicMapAd = require('../server/routes/publicMapAd');
const adminMapAd = require('../server/routes/adminMapAd');
const service = require('../server/services/adminMapAd');
const { propertyToRowWithColumns } = require('../server/services/mappers');

const baseRow = { title: 'فيلا', propertyType: 'فيلا', listingType: 'sale', city: 'الرياض' };
assert.strictEqual(propertyToRowWithColumns({ ...baseRow, priceType: 'som' }).price_type, 'auction');
assert.strictEqual(propertyToRowWithColumns({ ...baseRow, priceType: 'على السوم' }).price_type, 'auction');
assert.strictEqual(propertyToRowWithColumns({ ...baseRow, priceType: 'per_meter' }).price_type, 'fixed');
assert.strictEqual(propertyToRowWithColumns({ ...baseRow, priceType: 'fixed' }).price_type, 'fixed');

service.useDeps({ isEnabled: () => false });

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/map-ads', publicMapAd);
  app.use('/api/admin/map-ads', adminMapAd);
  const server = await listen(app);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const preview = await fetch(`${base}/api/map-ads/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'للبيع فيلا بحي المهدية المساحة 600م السعر 2450000' }),
    });
    const previewBody = await preview.json();
    assert.strictEqual(preview.status, 200);
    assert.strictEqual(previewBody.success, true);
    assert.strictEqual(previewBody.listingType, 'sale');

    const denied = await fetch(`${base}/api/map-ads/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'إعلان تجريبي', verifyPhone: '0551112233' }),
    });
    const deniedBody = await denied.json();
    assert.strictEqual(denied.status, 403);
    assert.strictEqual(deniedBody.message, 'أنت غير مصرح لك بالإعلان');

    const missingPhone = await fetch(`${base}/api/map-ads/x/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0550000000' }),
    });
    const missingBody = await missingPhone.json();
    assert.strictEqual(missingPhone.status, 403);
    assert.strictEqual(missingBody.message, 'أنت غير مصرح لك بالإعلان');

    const allowed = await fetch(`${base}/api/map-ads/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'قصير', verifyPhone: '0530792754' }),
    });
    const allowedBody = await allowed.json();
    assert.strictEqual(allowed.status, 503);
    assert.ok(allowedBody.message);
    assert.notStrictEqual(allowedBody.message, 'أنت غير مصرح لك بالإعلان');

    const admin = await fetch(`${base}/api/admin/map-ads/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(admin.status, 401);
    console.log('public map ad ok');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
