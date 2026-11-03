const assert = require('assert');
const http = require('http');
const express = require('express');
const { parseSmartListing } = require('../server/utils/listingPaste');
const { buildListingShare } = require('../server/utils/shareListing');
const { redactPublicStrings } = require('../server/utils/publicPropertySanitize');
const otp = require('../server/services/whatsappOtpCore');
const { buildMessage } = require('../server/services/whatsappOtpCore');

const sample = `للبيع فيلا بحي المهدية
المساحة ٦٠٠م
شارع ٢٠ شمالي و١٥ غربي
6 غرف ومسبح ومصعد
السعر ٢.٤٥٠ مليون
مخطط 2566/أ قطعة 8509
جوال المصدر 0530792754`;

const parsed = parseSmartListing(sample);
assert.strictEqual(parsed.listingType, 'sale');
assert.strictEqual(parsed.propertyType, 'فيلا');
assert.strictEqual(parsed.district, 'المهدية');
assert.strictEqual(parsed.area, 600);
assert.strictEqual(parsed.price, 2450000);
assert.strictEqual(parsed.priceType, 'fixed');
assert.strictEqual(parsed.plotNumber, '8509');
assert.ok(String(parsed.planNumber).includes('2566'));
assert.strictEqual(parsed.streets.length, 2);
assert.strictEqual(parsed.bedrooms, 6);
assert.ok(parsed.amenities.includes('مسبح'));
assert.strictEqual(parsed.description, sample);

const perMeter = parseSmartListing('البيع ٣١٠٠ للمتر أرض المساحة 400 متر');
assert.strictEqual(perMeter.listingType, 'sale');
assert.strictEqual(perMeter.priceType, 'per_meter');
assert.strictEqual(perMeter.pricePerMeter, 3100);
assert.strictEqual(perMeter.price, null);
assert.ok(String(perMeter.propertyType).includes('أرض'));

const som = parseSmartListing('شقة على السوم');
assert.strictEqual(som.priceType, 'som');
assert.strictEqual(som.price, null);
assert.strictEqual(som.propertyType, 'شقة');

const missing = parseSmartListing('عقار مميز قريب من الخدمات');
assert.ok(missing.missing.includes('listingType'));
assert.strictEqual(missing.description.includes('عقار مميز'), true);

const share = buildListingShare({
  slug: 'villa-test',
  title: 'فيلا في المهدية',
  description: sample,
  mapsUrl: 'https://maps.google.com/?q=24.7,46.6',
  coverImage: 'https://www.alheef.website/images/logo-alheef.png',
}, 'https://www.alheef.website');
assert.ok(share.text.includes('المساحة ٦٠٠م'));
assert.ok(share.text.includes('https://www.alheef.website/property.html?slug=villa-test'));
assert.ok(!share.text.includes('0530792754'));
assert.ok(!share.text.includes('966530792754'));
assert.strictEqual(share.image, 'https://www.alheef.website/images/logo-alheef.png');

const pub = redactPublicStrings({
  title: 'فيلا',
  description: 'للتواصل 0530792754',
  agent_phone: '0530792754',
  advertiser_phone_encrypted: 'secret',
  sourcePhone: '0530792754',
});
const packed = JSON.stringify(pub);
assert.ok(!packed.includes('0530792754'));
assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'agent_phone'));
assert.ok(!Object.prototype.hasOwnProperty.call(pub, 'sourcePhone'));

otp._resetForTests();
otp._setSender(async () => ({ ok: true }));
(async () => {
  const sent = await otp.sendOtp({
    purpose: 'map_ad_publish',
    phone: '0530792754',
    meta: { propertyId: 'draft-1' },
  });
  assert.strictEqual(sent.ok, true);
  const message = buildMessage('map_ad_publish', sent.code);
  assert.ok(message.startsWith('رمز توثيق رفع إعلان عقاري – الهيف العقارية'));
  assert.ok(!message.includes('http'));
  const peek = otp._peek(sent.challengeId);
  assert.strictEqual(peek.meta.propertyId, 'draft-1');
  assert.strictEqual(peek.phone, '0530792754');
  const bad = otp.verifyOtp(sent.challengeId, '000000');
  assert.strictEqual(bad.ok, false);
  const good = otp.verifyOtp(sent.challengeId, sent.code);
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.meta.propertyId, 'draft-1');
  const again = otp.verifyOtp(sent.challengeId, sent.code);
  assert.strictEqual(again.ok, false);

  const second = await otp.sendOtp({
    purpose: 'map_ad_publish',
    phone: '0530792754',
    meta: { propertyId: 'draft-2' },
  });
  otp._expire(second.challengeId);
  const expired = otp.verifyOtp(second.challengeId, second.code);
  assert.strictEqual(expired.ok, false);

  const other = await otp.sendOtp({
    purpose: 'map_ad_publish',
    phone: '0551111111',
    meta: { propertyId: 'draft-3' },
  });
  assert.notStrictEqual(otp._peek(other.challengeId).phone, '0530792754');

  const app = express();
  app.use(express.json());
  app.use(require('../server/routes/adminMapAd'));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(res.status, 401);
  const preview = await fetch(`http://127.0.0.1:${port}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: sample }) });
  assert.strictEqual(preview.status, 401);
  server.close();
  console.log('admin map ad tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
