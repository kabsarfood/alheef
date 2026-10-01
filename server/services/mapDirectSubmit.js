const crypto = require('crypto');
const gate = require('./mapApproval');
const { parseListingPaste } = require('../utils/listingPaste');
const { normalizeListingPhone } = require('../utils/phone');
const { cleanMapsShareUrl, looksLikeMapsUrl, parseCoordsFromMapsUrl } = require('../utils/coords');
const { createRateLimiter } = require('../utils/rateLimit');

const DEFAULT_PHONE = '0530792754';
const limiter = createRateLimiter({ max: 30, windowMs: 10 * 60 * 1000 });

function expectedToken() {
  return String(process.env.MAP_SUBMIT_TOKEN || '').trim();
}

function tokenMatches(provided) {
  const expected = expectedToken();
  if (expected.length < 32) return false;
  const left = crypto.createHash('sha256').update(expected).digest();
  const right = crypto.createHash('sha256').update(String(provided || '')).digest();
  return crypto.timingSafeEqual(left, right);
}

function allowIp(req) {
  return limiter.allow(`ip:${limiter.clientKey(req)}`);
}

function allowKey() {
  return limiter.allow(`key:${crypto.createHash('sha256').update(expectedToken()).digest('hex').slice(0, 16)}`);
}

function fail(status, message) {
  return { status, body: { ok: false, message } };
}

function idempotencyKey(mapUrl, plotNumber, planNumber) {
  const material = [mapUrl, plotNumber || '', planNumber || ''].join('\n');
  return `map-direct:${crypto.createHash('sha256').update(material).digest('hex')}`;
}

async function submitDirect(body) {
  const honeypot = String(body?.website || body?.company || '').trim();
  if (honeypot) return fail(400, 'تعذر إرسال الإعلان');

  const details = String(body?.details || '').trim();
  const mapsRaw = String(body?.maps_url || body?.location_url || '').trim();
  if (!details) return fail(400, 'تفاصيل الإعلان مطلوبة');
  if (!looksLikeMapsUrl(mapsRaw)) return fail(400, 'رابط خرائط Google غير صالح');
  const mapUrl = cleanMapsShareUrl(mapsRaw) || mapsRaw;
  if (!parseCoordsFromMapsUrl(mapUrl) && !looksLikeMapsUrl(mapUrl)) {
    return fail(400, 'رابط خرائط Google غير صالح');
  }

  const rawPhone = String(body?.contact_phone || '').trim();
  const phone = normalizeListingPhone(rawPhone || DEFAULT_PHONE);
  if (!phone) return fail(400, 'رقم الجوال غير صالح');

  const parsed = parseListingPaste(details);
  if (!parsed.propertyType) return fail(400, 'لم نتعرف على نوع العقار داخل النص. أضف النوع داخل التفاصيل');
  if (!parsed.city && !parsed.district) return fail(400, 'لم نتعرف على المدينة أو الحي. اذكر الحي داخل التفاصيل');

  const images = Array.isArray(body?.images) ? body.images : [];
  if (images.length > 6) return fail(400, 'الحد الأقصى 6 صور');

  let outcome;
  try {
    outcome = await gate.createRequest({
      property_type: parsed.propertyType,
      details,
      location_url: mapUrl,
      contact_phone: phone,
      source_type: 'heef_map',
      source_name: 'هيف ماب',
      images,
      idempotency_key: idempotencyKey(mapUrl, parsed.plotNumber, parsed.planNumber),
    });
  } catch (error) {
    const status = error.status || 500;
    return fail(status, status === 500 ? 'تعذر إرسال الإعلان' : gate.safeReason(error));
  }

  const requestNumber = outcome.body?.request_number || '';
  const status = outcome.body?.status || '';
  if (!outcome.body?.success || !requestNumber) return fail(outcome.status || 500, 'تعذر إرسال الإعلان');
  console.info(JSON.stringify({
    scope: 'map-direct-submit',
    at: new Date().toISOString(),
    requestNumber,
    status,
    images: images.length,
    idempotent: !!outcome.body.idempotent,
  }));
  return {
    status: outcome.body.idempotent ? 200 : (outcome.status || 201),
    body: {
      ok: true,
      request_number: requestNumber,
      status,
    },
  };
}

module.exports = {
  tokenMatches,
  allowIp,
  allowKey,
  submitDirect,
  DEFAULT_PHONE,
};
