const assert = require('assert');
const http = require('http');
const express = require('express');
const publicMapAd = require('../server/routes/publicMapAd');
const adminMapAd = require('../server/routes/adminMapAd');
const service = require('../server/services/adminMapAd');

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

    const draft = await fetch(`${base}/api/map-ads/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'قصير' }),
    });
    const draftBody = await draft.json();
    assert.notStrictEqual(draft.status, 401);
    assert.strictEqual(draft.status, 503);
    assert.ok(draftBody.message);

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
