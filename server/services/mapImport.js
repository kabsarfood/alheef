/**
 * استيراد عقار إلى جدول properties.
 *
 * الصور في هذه المرحلة:
 * - رابط https عام يُحفظ كما هو في property_images دون تنزيله.
 * - data:image/jpeg|png|webp;base64 يُرفع عبر Storage الحالي.
 * لا يُجلب رابط خارجي إلى السيرفر، ولا يُنشأ نظام صور جديد.
 */
const crypto = require('crypto');
const { getAdmin } = require('../lib/supabase');
const propertiesRepo = require('../repositories/propertiesRepo');
const { propertyToMapProperty } = require('./mappers');
const { uploadBuffer } = require('./storage');
const { normalizePropertyType } = require('../utils/propertyTypes');
const { normalizeAccountPhone, isValidSaudiMobile } = require('../utils/phone');
const { isValidCoord, parseCoord, parseCoordsFromMapsUrl } = require('../utils/coords');

const SOURCES = new Set(['alheef', 'chatgpt', 'haraj', 'aqar', 'whatsapp', 'manual', 'other']);
const LISTING_ALIASES = {
  sale: 'sale',
  rent: 'rent',
  buy_request: 'buy_request',
  بيع: 'sale',
  ايجار: 'rent',
  إيجار: 'rent',
  'طلب شراء': 'buy_request',
};
const NEAR_METERS = 40;
const CLOSE_RATIO = 0.05;
const MAX_IMAGES = 8;
const MAX_DATA_URL_CHARS = 4_000_000;

function fold(value) {
  return String(value || '')
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text || '';
}

function authorizeImport(header) {
  const expected = String(process.env.ALHEEF_MAP_IMPORT_SECRET || '');
  if (expected.length < 24) return { ok: false, status: 503, message: 'استيراد الخريطة غير مفعّل' };
  const match = String(header || '').match(/^Bearer\s+(\S+)\s*$/i);
  const token = match ? match[1] : '';
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, status: 401, message: 'غير مصرح' };
  return { ok: true };
}

function normalizeListingType(value) {
  const raw = fold(value);
  if (!raw) return '';
  if (LISTING_ALIASES[raw]) return LISTING_ALIASES[raw];
  const compact = raw.replace(/\s+/g, '_');
  return LISTING_ALIASES[compact] || '';
}

function optionalNumber(value, label) {
  if (value == null || value === '') return { ok: true, value: null };
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${label} غير صالح` };
  return { ok: true, value: n };
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local')) return false;
    if (host === '0.0.0.0' || host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
    return true;
  } catch {
    return false;
  }
}

function sameText(a, b) {
  return fold(a) !== '' && fold(a) === fold(b);
}

function closeEnough(a, b) {
  if (a == null || b == null) return false;
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < 0) return false;
  const base = Math.max(left, right, 1);
  return Math.abs(left - right) / base <= CLOSE_RATIO;
}

function metersBetween(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}

function fieldOf(row, column, featureKey) {
  if (row[column]) return String(row[column]).trim();
  const features = row.features && typeof row.features === 'object' && !Array.isArray(row.features) ? row.features : {};
  return String(features[featureKey] || '').trim();
}

async function loadRows() {
  const { data, error } = await getAdmin()
    .from('properties')
    .select('id, title, internal_ref, status, source, source_listing_id, source_import_id, reference_no, district, city, plan_number, plot_number, property_type, area, price, latitude, longitude, features');
  if (error) throw new Error(error.message);
  return data || [];
}

async function writeLog(entry) {
  const { error } = await getAdmin().from('property_import_logs').insert({
    property_id: entry.propertyId || null,
    source: entry.source || null,
    source_url: entry.sourceUrl || null,
    source_listing_id: entry.sourceListingId || null,
    source_import_id: entry.sourceImportId || null,
    publish_mode: entry.publishMode || null,
    result: entry.result,
    duplicate_of: entry.duplicateOf || null,
    duplicate_type: entry.duplicateType || null,
    error_message: entry.errorMessage || null,
  });
  if (error) console.error('[map-import] log:', error.message);
}

function successBody(property, extra = {}) {
  return {
    success: true,
    property_id: property.id,
    internal_ref: property.internalRef || property.internal_ref || '',
    status: property.dbStatus || property.status,
    publish_mode: extra.publishMode || null,
    idempotent: !!extra.idempotent,
  };
}

function strongDuplicate(type, row) {
  return {
    status: 409,
    body: {
      success: false,
      duplicate: true,
      duplicate_type: type,
      existing_property_id: row.id,
      existing_internal_ref: row.internal_ref || '',
    },
  };
}

function findDuplicates(input, rows, excludeId) {
  const others = rows.filter((row) => row.id !== excludeId);
  if (input.source && input.sourceListingId) {
    const hit = others.find((row) => row.source === input.source && clean(row.source_listing_id) === input.sourceListingId);
    if (hit) return { strong: strongDuplicate('source_listing_id', hit) };
  }
  if (input.referenceNo) {
    const hit = others.find((row) => clean(row.reference_no) && clean(row.reference_no) === input.referenceNo);
    if (hit) return { strong: strongDuplicate('reference_no', hit) };
  }
  const candidates = [];
  if (input.district && input.planNumber && input.plotNumber) {
    others.forEach((row) => {
      const plan = fieldOf(row, 'plan_number', 'plan_number');
      const plot = fieldOf(row, 'plot_number', 'plot_number');
      if (sameText(row.district, input.district) && sameText(plan, input.planNumber) && sameText(plot, input.plotNumber)) {
        candidates.push({
          id: row.id,
          internal_ref: row.internal_ref || '',
          title: row.title || '',
          duplicate_type: 'plan_plot',
        });
      }
    });
  }
  if (input.latitude != null && input.longitude != null && input.propertyType && input.area != null && input.price != null) {
    others.forEach((row) => {
      if (!isValidCoord(row.latitude, row.longitude)) return;
      if (metersBetween(input.latitude, input.longitude, Number(row.latitude), Number(row.longitude)) > NEAR_METERS) return;
      if (normalizePropertyType(row.property_type) !== input.propertyType) return;
      if (!closeEnough(row.area, input.area) || !closeEnough(row.price, input.price)) return;
      if (candidates.some((item) => item.id === row.id)) return;
      candidates.push({
        id: row.id,
        internal_ref: row.internal_ref || '',
        title: row.title || '',
        duplicate_type: 'coordinates',
      });
    });
  }
  return { candidates };
}

async function resolveImages(images) {
  if (images == null) return { ok: true, urls: [] };
  if (!Array.isArray(images)) return { ok: false, error: 'الصور يجب أن تكون قائمة' };
  if (images.length > MAX_IMAGES) return { ok: false, error: `الحد الأقصى ${MAX_IMAGES} صور` };
  const urls = [];
  for (const item of images) {
    const value = clean(item);
    if (!value) continue;
    if (isPublicHttpsUrl(value)) {
      urls.push(value);
      continue;
    }
    const data = value.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!data) return { ok: false, error: 'الصورة يجب أن تكون رابط https أو ملف base64 مدعوم' };
    if (value.length > MAX_DATA_URL_CHARS) return { ok: false, error: 'الصورة أكبر من الحد المسموح' };
    const ext = data[1].toLowerCase() === 'jpeg' ? 'jpg' : data[1].toLowerCase();
    const buffer = Buffer.from(data[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length) return { ok: false, error: 'ملف الصورة فارغ' };
    const url = await uploadBuffer(buffer, `import.${ext}`, 'properties');
    urls.push(url);
  }
  return { ok: true, urls };
}

function validateAndNormalize(body) {
  const errors = [];
  const source = clean(body.source).toLowerCase();
  const listingType = normalizeListingType(body.listing_type || body.listingType);
  const propertyType = normalizePropertyType(body.property_type || body.propertyType);
  const district = clean(body.district);
  const city = clean(body.city);
  const title = clean(body.title);
  const publishMode = clean(body.publish_mode || body.publishMode);
  const priceType = clean(body.price_type || body.priceType) || 'fixed';
  const price = optionalNumber(body.price, 'السعر');
  const area = optionalNumber(body.area, 'المساحة');
  const phoneRaw = clean(body.contact_phone || body.contactPhone);
  const sourceUrl = clean(body.source_url || body.sourceUrl);
  const mapsUrl = clean(body.maps_url || body.mapsUrl);
  let latitude = body.latitude == null || body.latitude === '' ? null : parseCoord(body.latitude);
  let longitude = body.longitude == null || body.longitude === '' ? null : parseCoord(body.longitude);

  if (!SOURCES.has(source)) errors.push('المصدر غير معروف');
  if (!district) errors.push('الحي مطلوب');
  if (!city) errors.push('المدينة مطلوبة');
  if (!title) errors.push('العنوان مطلوب');
  if (!propertyType) errors.push('نوع العقار غير معروف');
  if (!listingType) errors.push('نوع الإعلان يجب أن يكون بيعًا أو إيجارًا أو طلب شراء');
  if (!['direct', 'review'].includes(publishMode)) errors.push('طريقة النشر يجب أن تكون direct أو review');
  if (!['fixed', 'auction'].includes(priceType)) errors.push('نوع السعر غير صالح');
  if (!price.ok) errors.push(price.error);
  if (!area.ok) errors.push(area.error);
  if (phoneRaw && !isValidSaudiMobile(phoneRaw)) errors.push('رقم الجوال غير صالح');
  if (sourceUrl && !isPublicHttpsUrl(sourceUrl)) errors.push('رابط المصدر يجب أن يكون https عامًا');
  if (mapsUrl && !isPublicHttpsUrl(mapsUrl) && !parseCoordsFromMapsUrl(mapsUrl)) errors.push('رابط الخريطة غير صالح');

  if (!isValidCoord(latitude, longitude) && mapsUrl) {
    const fromUrl = parseCoordsFromMapsUrl(mapsUrl);
    if (fromUrl && isValidCoord(fromUrl.lat, fromUrl.lng)) {
      latitude = fromUrl.lat;
      longitude = fromUrl.lng;
    }
  }
  if ((latitude != null || longitude != null) && !isValidCoord(latitude, longitude)) {
    errors.push('خط العرض أو خط الطول غير صحيح');
  }
  if (publishMode === 'direct' && listingType !== 'buy_request' && !isValidCoord(latitude, longitude)) {
    errors.push('النشر المباشر للبيع أو الإيجار يحتاج إحداثيات صالحة');
  }

  return {
    errors,
    input: {
      source,
      sourceUrl,
      sourceListingId: clean(body.source_listing_id || body.sourceListingId),
      sourceImportId: clean(body.source_import_id || body.sourceImportId),
      publishMode,
      propertyType,
      listingType,
      city,
      district,
      title,
      description: clean(body.description),
      price: price.ok ? price.value : null,
      priceType,
      area: area.ok ? area.value : null,
      planNumber: clean(body.plan_number || body.planNumber),
      plotNumber: clean(body.plot_number || body.plotNumber),
      streetWidth: clean(body.street_width || body.streetWidth),
      direction: clean(body.direction),
      facade: clean(body.facade),
      street: clean(body.street),
      mapsUrl,
      latitude,
      longitude,
      contactPhone: phoneRaw ? normalizeAccountPhone(phoneRaw) : '',
      referenceNo: clean(body.reference_no || body.referenceNo),
      images: body.images,
    },
  };
}

async function importProperty(body) {
  const { errors, input } = validateAndNormalize(body || {});
  if (errors.length) {
    await writeLog({ ...input, result: 'validation_error', errorMessage: errors.join(' — ') });
    return { status: 400, body: { success: false, errors } };
  }

  const rows = await loadRows();
  if (input.sourceImportId) {
    const previous = rows.find((row) => clean(row.source_import_id) === input.sourceImportId);
    if (previous) {
      const property = await propertiesRepo.getById(previous.id);
      await writeLog({ ...input, result: 'idempotent', propertyId: previous.id });
      return { status: 200, body: successBody(property, { publishMode: input.publishMode, idempotent: true }) };
    }
  }

  const dup = findDuplicates(input, rows);
  if (dup.strong) {
    await writeLog({
      ...input,
      result: 'duplicate',
      duplicateOf: dup.strong.body.existing_property_id,
      duplicateType: dup.strong.body.duplicate_type,
    });
    return dup.strong;
  }
  if (dup.candidates.length) {
    await writeLog({
      ...input,
      result: 'possible_duplicate',
      duplicateOf: dup.candidates[0].id,
      duplicateType: dup.candidates[0].duplicate_type,
    });
    return {
      status: 409,
      body: { success: false, duplicate: 'possible', candidates: dup.candidates },
    };
  }

  const images = await resolveImages(input.images);
  if (!images.ok) {
    await writeLog({ ...input, result: 'validation_error', errorMessage: images.error });
    return { status: 400, body: { success: false, errors: [images.error] } };
  }

  const status = input.publishMode === 'direct' ? 'published' : 'draft';
  const created = await propertiesRepo.create({
    title: input.title,
    description: input.description,
    propertyType: input.propertyType,
    listingType: input.listingType,
    city: input.city,
    district: input.district,
    street: input.street,
    price: input.price,
    priceType: input.priceType,
    area: input.area,
    planNumber: input.planNumber,
    plotNumber: input.plotNumber,
    streetWidth: input.streetWidth,
    direction: input.direction,
    facade: input.facade,
    mapsUrl: input.mapsUrl,
    latitude: input.latitude,
    longitude: input.longitude,
    contactPhone: input.listingType === 'buy_request' ? '' : input.contactPhone,
    requestPhone: input.listingType === 'buy_request' ? input.contactPhone : '',
    contractNumber: input.referenceNo,
    source: input.source,
    sourceUrl: input.sourceUrl,
    sourceListingId: input.sourceListingId,
    sourceImportId: input.sourceImportId,
    status,
  });
  if (images.urls.length) await propertiesRepo.addImages(created.id, images.urls);
  const full = await propertiesRepo.getById(created.id);
  await writeLog({ ...input, result: status, propertyId: full.id });
  const payload = successBody(full, { publishMode: input.publishMode });
  if (status === 'published') payload.map_ready = !!propertyToMapProperty(full);
  return { status: 201, body: payload };
}

async function listImportQueue() {
  const { data, error } = await getAdmin()
    .from('properties')
    .select('*')
    .eq('status', 'draft')
    .not('source', 'is', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const items = [];
  for (const row of data || []) {
    if (!row.source) continue;
    const images = await propertiesRepo.getById(row.id);
    items.push(images);
  }
  return items.filter(Boolean);
}

async function reviewDecision(id, { publish, confirmPossible = false } = {}) {
  const existing = await propertiesRepo.getById(id);
  if (!existing || !existing.source) {
    return { status: 404, body: { success: false, message: 'الإعلان المستورد غير موجود' } };
  }
  if (!publish) {
    const updated = await propertiesRepo.update(id, { status: 'archived' });
    await writeLog({
      source: existing.source,
      sourceUrl: existing.sourceUrl,
      sourceListingId: existing.sourceListingId,
      sourceImportId: existing.sourceImportId,
      publishMode: 'review',
      result: 'rejected',
      propertyId: id,
    });
    return { status: 200, body: { success: true, status: updated.status, internal_ref: updated.internalRef } };
  }

  const input = {
    source: existing.source,
    sourceListingId: existing.sourceListingId,
    sourceImportId: '',
    referenceNo: existing.contractNumber,
    district: existing.district,
    planNumber: existing.planNumber,
    plotNumber: existing.plotNumber,
    propertyType: normalizePropertyType(existing.propertyType),
    area: existing.area,
    price: existing.price,
    latitude: existing.latitude,
    longitude: existing.longitude,
  };
  if (existing.listingType !== 'buy_request' && !isValidCoord(existing.latitude, existing.longitude)) {
    return { status: 400, body: { success: false, message: 'النشر يحتاج إحداثيات صالحة' } };
  }
  if (!existing.district || !existing.propertyType || !existing.title) {
    return { status: 400, body: { success: false, message: 'البيانات الأساسية ناقصة' } };
  }
  const dup = findDuplicates(input, await loadRows(), id);
  if (dup.strong) return { status: 200, body: dup.strong.body };
  if (dup.candidates.length && !confirmPossible) {
    return { status: 200, body: { success: false, duplicate: 'possible', candidates: dup.candidates } };
  }
  const updated = await propertiesRepo.update(id, { status: 'published' });
  await writeLog({
    source: existing.source,
    sourceUrl: existing.sourceUrl,
    sourceListingId: existing.sourceListingId,
    sourceImportId: existing.sourceImportId,
    publishMode: 'direct',
    result: 'published',
    propertyId: id,
  });
  return {
    status: 200,
    body: { success: true, status: updated.dbStatus || updated.status, internal_ref: updated.internalRef },
  };
}

module.exports = {
  authorizeImport,
  importProperty,
  listImportQueue,
  reviewDecision,
  normalizeListingType,
  validateAndNormalize,
};
