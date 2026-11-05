const crypto = require('crypto');
const { parseSmartListing } = require('../utils/listingPaste');
const { enrichBodyCoords, isValidCoord } = require('../utils/coords');
const { normalizeAccountPhone, isValidSaudiMobile } = require('../utils/phone');
const { getAdminPhoneRaw } = require('../lib/authConfig');
const { sealPhone, phoneHash } = require('../utils/phoneSeal');
const { getAdmin, isEnabled } = require('../lib/supabase');
const propertiesRepo = require('../repositories/propertiesRepo');
const storage = require('./storage');
const otp = require('./whatsappOtpCore');

const deps = {
  getAdmin,
  isEnabled,
  propertiesRepo,
  uploadFiles: (...args) => storage.uploadFiles(...args),
  otp,
};

const PUBLISH_PHONE = '0530792754';

function isDirectAd(row) {
  const key = row?.sourceListingId || row?.source_listing_id || '';
  return String(key).startsWith('adm:');
}
const locks = new Map();

function publishPhone() {
  return normalizeAccountPhone(getAdminPhoneRaw());
}

function idempotencyKey(text, mapsUrl, phone) {
  const raw = [String(text || '').trim(), String(mapsUrl || '').trim(), normalizeAccountPhone(phone) || ''].join('\n');
  return `adm:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

async function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  locks.set(key, gate);
  await previous.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === gate) locks.delete(key);
  }
}

async function findByKey(key) {
  const { data, error } = await deps.getAdmin()
    .from('properties')
    .select('id, status, slug, latitude, longitude, title')
    .eq('source_listing_id', key)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data[0] ? data[0] : null;
}

async function resolveLocation(mapsUrl, latitude, longitude) {
  const body = await enrichBodyCoords({
    mapsUrl: String(mapsUrl || '').trim(),
    latitude,
    longitude,
  });
  const lat = body.latitude;
  const lng = body.longitude;
  if (!isValidCoord(lat, lng)) return null;
  return { latitude: lat, longitude: lng, mapsUrl: body.mapsUrl || body.maps_url || mapsUrl || '' };
}

async function preview(text, mapsUrl, latitude, longitude) {
  const parsed = parseSmartListing(text);
  let location = null;
  try {
    location = await resolveLocation(mapsUrl, latitude, longitude);
  } catch {
    location = null;
  }
  return {
    ...parsed,
    originalText: parsed.description,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    mapsUrl: location?.mapsUrl || mapsUrl || '',
    needsLocation: !location,
  };
}

function applyEdits(parsed, edits = {}) {
  const next = { ...parsed };
  const fields = ['propertyType', 'listingType', 'city', 'district', 'area', 'price', 'priceType', 'pricePerMeter', 'planNumber', 'plotNumber', 'facade', 'bedrooms', 'floors', 'title'];
  fields.forEach((field) => {
    if (edits[field] !== undefined && edits[field] !== null && String(edits[field]).trim() !== '') {
      next[field] = edits[field];
    }
  });
  next.missing = [];
  if (!next.propertyType) next.missing.push('propertyType');
  if (!next.listingType || !['sale', 'rent'].includes(next.listingType)) next.missing.push('listingType');
  return next;
}

async function createDraft({ text, mapsUrl, sourcePhone, edits, latitude, longitude, files }) {
  if (!deps.isEnabled()) {
    const error = new Error('قاعدة البيانات غير متصلة');
    error.status = 503;
    throw error;
  }
  const original = String(text || '').trim();
  if (original.length < 8) {
    const error = new Error('الصق نص الإعلان');
    error.status = 400;
    throw error;
  }
  const phone = normalizeAccountPhone(sourcePhone);
  if (!isValidSaudiMobile(phone)) {
    const error = new Error('أدخل رقم جوال المصدر بشكل صحيح');
    error.status = 400;
    throw error;
  }
  const parsed = applyEdits(parseSmartListing(original), edits);
  if (!String(parsed.city || '').trim()) {
    const error = new Error('أدخل المدينة قبل رفع الإعلان');
    error.status = 400;
    throw error;
  }
  if (parsed.missing.length) {
    const error = new Error('حدد نوع العقار ونوع العملية قبل الرفع');
    error.status = 400;
    error.missing = parsed.missing;
    throw error;
  }
  const location = await resolveLocation(mapsUrl, latitude, longitude);
  if (!location) {
    const error = new Error('تعذر تحديد الموقع. صحح رابط الخريطة أو حدّد النقطة يدويًا');
    error.status = 400;
    throw error;
  }
  const key = idempotencyKey(original, location.mapsUrl || mapsUrl, phone);
  return withLock(key, async () => {
    const existing = await findByKey(key);
    if (existing) return { property: existing, created: false, idempotent: true };
    const sealed = sealPhone(phone);
    const hash = phoneHash(phone);
    const created = await deps.propertiesRepo.create({
      title: parsed.title,
      description: original,
      propertyType: parsed.propertyType,
      listingType: parsed.listingType,
      city: parsed.city,
      district: parsed.district,
      area: parsed.area,
      price: parsed.price,
      priceType: parsed.priceType || 'fixed',
      pricePerMeter: parsed.pricePerMeter,
      planNumber: parsed.planNumber,
      plotNumber: parsed.plotNumber,
      facade: parsed.facade,
      streetWidth: parsed.streetWidth,
      direction: parsed.direction,
      bedrooms: parsed.bedrooms,
      latitude: location.latitude,
      longitude: location.longitude,
      mapsUrl: location.mapsUrl,
      status: 'draft',
      source: 'alheef',
      sourceListingId: key,
      showOnMap: false,
      homepagePublished: false,
      features: {
        amenities: parsed.amenities,
        floors: parsed.floors,
        lengths: parsed.lengths,
        price_per_meter: parsed.pricePerMeter,
      },
    });
    await deps.getAdmin().from('properties').update({
      advertiser_phone_encrypted: sealed,
      advertiser_phone_hash: hash,
      show_on_map: false,
      show_on_private_offers: false,
      homepage_published: false,
      status: 'draft',
    }).eq('id', created.id);
    if (files && files.length) {
      const urls = await deps.uploadFiles(files, 'properties');
      if (urls.length) await deps.propertiesRepo.addImages(created.id, urls.map((file) => file.url || file));
    }
    return { property: { id: created.id, status: 'draft', slug: created.slug, title: created.title }, created: true, idempotent: false };
  });
}

async function startPublishOtp({ propertyId, ip }) {
  const phone = publishPhone();
  if (phone !== PUBLISH_PHONE) {
    const error = new Error('توثيق النشر غير مهيأ على الخادم');
    error.status = 503;
    throw error;
  }
  if (!deps.otp.isEnabled()) {
    const error = new Error('واتساب غير متصل');
    error.status = 503;
    throw error;
  }
  const row = await deps.propertiesRepo.getById(propertyId);
  const dbStatus = row?.dbStatus || row?.status;
  if (!row || !isDirectAd(row)) {
    const error = new Error('الإعلان غير موجود');
    error.status = 404;
    throw error;
  }
  if (dbStatus === 'published') {
    return { alreadyPublished: true, slug: row.slug, id: row.id };
  }
  const sent = await deps.otp.sendOtp({
    purpose: 'map_ad_publish',
    phone,
    meta: { propertyId: row.id },
    ip,
  });
  if (!sent.ok) {
    const error = new Error(deps.otp.errorMessage(sent.reason));
    error.status = sent.reason === 'rate_limited' ? 429 : 400;
    throw error;
  }
  return { challengeId: sent.challengeId, expiresInSec: Math.round(otp.TTL_MS / 1000) };
}

async function publishWithOtp({ propertyId, challengeId, code }) {
  const row = await deps.propertiesRepo.getById(propertyId);
  const dbStatus = row?.dbStatus || row?.status;
  if (!row || !isDirectAd(row)) {
    const error = new Error('الإعلان غير موجود');
    error.status = 404;
    throw error;
  }
  if (dbStatus === 'published') {
    return { slug: row.slug, id: row.id, idempotent: true };
  }
  if (!isValidCoord(row.latitude, row.longitude)) {
    const error = new Error('لا يُنشر الإعلان دون إحداثيات صحيحة');
    error.status = 400;
    throw error;
  }
  const pending = deps.otp._peek(challengeId);
  if (!pending || pending.purpose !== 'map_ad_publish' || pending.meta?.propertyId !== row.id || pending.phone !== PUBLISH_PHONE) {
    const error = new Error('رمز التوثيق غير مرتبط بهذا الإعلان');
    error.status = 400;
    throw error;
  }
  const verified = deps.otp.verifyOtp(challengeId, code);
  if (!verified.ok) {
    const error = new Error(deps.otp.errorMessage(verified.reason));
    error.status = 400;
    throw error;
  }
  if (verified.purpose !== 'map_ad_publish' || verified.meta?.propertyId !== row.id || verified.phone !== PUBLISH_PHONE) {
    const error = new Error('رمز التوثيق غير مرتبط بهذا الإعلان');
    error.status = 400;
    throw error;
  }
  const fresh = await deps.propertiesRepo.getById(propertyId);
  if ((fresh.dbStatus || fresh.status) === 'published') return { slug: fresh.slug, id: fresh.id, idempotent: true };
  const { error } = await deps.getAdmin().from('properties').update({
    status: 'published',
    show_on_map: true,
    show_on_private_offers: true,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).eq('status', 'draft');
  if (error) throw new Error(error.message);
  return { slug: fresh.slug, id: fresh.id, idempotent: false };
}

function useDeps(overrides = {}) {
  Object.assign(deps, overrides);
}

module.exports = {
  PUBLISH_PHONE,
  preview,
  createDraft,
  startPublishOtp,
  publishWithOtp,
  idempotencyKey,
  useDeps,
};
