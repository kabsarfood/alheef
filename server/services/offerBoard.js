const { getAdmin } = require('../lib/supabase');
const { isValidCoord, cleanMapsShareUrl } = require('../utils/coords');
const { typeKey } = require('../utils/propertyTypes');
const { sealPhone, openPhone, phoneHash } = require('../utils/phoneSeal');
const { normalizeAccountPhone } = require('../utils/phone');

const VISIBLE = ['published', 'approved_published'];
const ARCHIVE = ['sold', 'withdrawn', 'archived', 'hidden', 'rejected'];
const NEAR_METERS = 80;

function fold(value) {
  return String(value || '').trim().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, '');
}

function clean(value) {
  const text = String(value || '').trim();
  return text || '';
}

function pricePerMeter(row) {
  const key = typeKey(row.property_type);
  if (key === 'villa' || key === 'apartment' || key === 'duplex' || key === 'palace') return null;
  const price = Number(row.price);
  const area = Number(row.area);
  if (!(price > 0) || !(area > 0)) return null;
  return Math.round(price / area);
}

function coverOf(row) {
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  return row.cover_image || gallery[0] || '';
}

function card(row) {
  return {
    id: row.id,
    internalRef: row.internal_ref || '',
    requestNumber: row.request_number || '',
    propertyType: row.property_type || '',
    typeKey: typeKey(row.property_type),
    title: row.title || '',
    district: row.district || '',
    city: row.city || '',
    price: row.price != null ? Number(row.price) : null,
    priceType: row.price_type || 'fixed',
    area: row.area != null ? Number(row.area) : null,
    pricePerMeter: pricePerMeter(row),
    planNumber: row.plan_number || '',
    plotNumber: row.plot_number || '',
    direction: row.direction || '',
    streetWidth: row.street_width || '',
    lengths: row.lengths || '',
    coverImage: coverOf(row),
    latitude: isValidCoord(row.latitude, row.longitude) ? Number(row.latitude) : null,
    longitude: isValidCoord(row.latitude, row.longitude) ? Number(row.longitude) : null,
    status: row.status,
    showOnMap: row.show_on_map !== false,
    showOnPrivateOffers: row.show_on_private_offers !== false,
    showOnHomepage: row.homepage_published === true,
    publishedAt: row.approved_at || row.created_at || null,
    updatedAt: row.updated_at || null,
    priceNote: 'السعر المعروض وليس صفقة منفذة',
  };
}

function clientCard(row) {
  const item = card(row);
  return {
    id: item.id,
    internalRef: item.internalRef,
    propertyType: item.propertyType,
    typeKey: item.typeKey,
    title: item.title,
    district: item.district,
    city: item.city,
    price: item.price,
    priceType: item.priceType,
    area: item.area,
    pricePerMeter: item.pricePerMeter,
    planNumber: item.planNumber,
    plotNumber: item.plotNumber,
    direction: item.direction,
    streetWidth: item.streetWidth,
    lengths: item.lengths,
    coverImage: item.coverImage,
    latitude: item.latitude,
    longitude: item.longitude,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    priceNote: item.priceNote,
  };
}

function detail(row, { admin = false } = {}) {
  const gallery = Array.isArray(row.gallery) ? row.gallery.filter(Boolean) : [];
  const base = {
    ...(admin ? card(row) : clientCard(row)),
    description: row.description || '',
    gallery: gallery.length ? gallery : (coverOf(row) ? [coverOf(row)] : []),
  };
  if (!admin) return base;
  const phone = openPhone(row.advertiser_phone_encrypted) || normalizeAccountPhone(row.agent_phone) || '';
  return {
    ...base,
    advertiserPhone: phone,
    advertiserName: row.agent_name || '',
    sourceName: row.source_name || row.source || '',
    sourceUrl: row.source_url || '',
    sourceListingId: row.source_listing_id || '',
    license: row.reference_no || '',
    statusLog: Array.isArray(row.status_log) ? row.status_log : [],
    soldAt: row.sold_at || null,
    withdrawnAt: row.withdrawn_at || null,
    archivedAt: row.archived_at || null,
  };
}

function matchesType(row, key) {
  if (!key || key === 'all') return true;
  return typeKey(row.property_type) === key;
}

function inBounds(row, bounds) {
  if (!bounds) return true;
  if (!isValidCoord(row.latitude, row.longitude)) return false;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
}

async function loadRows(statuses) {
  const { data, error } = await getAdmin()
    .from('properties')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}

async function listBoard(query = {}, options = {}) {
  const admin = options.admin === true;
  const archive = admin && (query.archive === '1' || query.archive === 'true');
  const rows = await loadRows(archive ? ARCHIVE : VISIBLE);
  const bounds = ['north', 'south', 'east', 'west'].every((key) => query[key] != null && query[key] !== '')
    ? {
      north: Number(query.north),
      south: Number(query.south),
      east: Number(query.east),
      west: Number(query.west),
    }
    : null;
  const filtered = rows.filter((row) => {
    if (!archive && row.show_on_private_offers === false) return false;
    if (query.map === '1' && row.show_on_map === false) return false;
    if (query.map === '1' && !isValidCoord(row.latitude, row.longitude)) return false;
    if (!matchesType(row, query.type)) return false;
    if (!inBounds(row, bounds)) return false;
    return true;
  });
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(query.limit, 10) || 24));
  const start = (page - 1) * limit;
  return {
    items: filtered.slice(start, start + limit).map((row) => (admin ? card(row) : clientCard(row))),
    total: filtered.length,
    page,
    limit,
  };
}

async function getBoardItem(id, { admin = false } = {}) {
  const { data, error } = await getAdmin().from('properties').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!admin && (!VISIBLE.includes(data.status) || data.show_on_private_offers === false)) return null;
  return detail(data, { admin });
}

function metersBetween(lat1, lng1, lat2, lng2) {
  const r = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function samePlace(row, input) {
  const plan = fold(row.plan_number) && fold(row.plan_number) === fold(input.planNumber);
  const plot = fold(row.plot_number) && fold(row.plot_number) === fold(input.plotNumber);
  if (!plan || !plot) return false;
  if (fold(row.district) && fold(input.district) && fold(row.district) === fold(input.district)) return true;
  const left = cleanMapsShareUrl(row.maps_url || '');
  const right = cleanMapsShareUrl(input.mapsUrl || '');
  if (left && right && left === right) return true;
  if (isValidCoord(row.latitude, row.longitude) && isValidCoord(input.latitude, input.longitude)) {
    return metersBetween(Number(row.latitude), Number(row.longitude), Number(input.latitude), Number(input.longitude)) <= NEAR_METERS;
  }
  return false;
}

async function findConfirmedDuplicate(input, excludeId) {
  const { data, error } = await getAdmin()
    .from('properties')
    .select('id, internal_ref, reference_no, source, source_listing_id, plan_number, plot_number, district, latitude, longitude, maps_url, status')
    .limit(1000);
  if (error) return null;
  const rows = (data || []).filter((row) => row.id !== excludeId);
  const license = clean(input.referenceNo || input.license);
  if (license) {
    const hit = rows.find((row) => clean(row.reference_no) === license);
    if (hit) return { ...hit, duplicateType: 'license' };
  }
  const source = clean(input.source);
  const listingId = clean(input.sourceListingId || input.source_listing_id);
  if (source && listingId) {
    const hit = rows.find((row) => clean(row.source) === source && clean(row.source_listing_id) === listingId);
    if (hit) return { ...hit, duplicateType: 'source_listing' };
  }
  if (clean(input.planNumber) && clean(input.plotNumber)) {
    const hit = rows.find((row) => samePlace(row, input));
    if (hit) return { ...hit, duplicateType: 'plan_plot' };
  }
  return null;
}

async function patchProperty(id, patch) {
  const { error } = await getAdmin().from('properties').update(patch).eq('id', id);
  if (!error) return true;
  const missing = String(error.message || '').match(/column ["']?(?:[\w]+\.)?([a-z0-9_]+)["']? does not exist|could not find the ['"]([a-z0-9_]+)['"] column/i);
  const column = missing && (missing[1] || missing[2]);
  if (!column || !Object.prototype.hasOwnProperty.call(patch, column)) throw new Error(error.message);
  const next = { ...patch };
  delete next[column];
  if (!Object.keys(next).length) return false;
  return patchProperty(id, next);
}

async function appendLog(row, entry) {
  const log = Array.isArray(row.status_log) ? row.status_log.slice(-19) : [];
  log.push({ at: new Date().toISOString(), ...entry });
  return log;
}

async function markVisible(id, { requestNumber, phone } = {}) {
  const patch = {
    show_on_private_offers: true,
    show_on_map: true,
    updated_at: new Date().toISOString(),
  };
  if (requestNumber) patch.request_number = requestNumber;
  if (phone) {
    const sealed = sealPhone(phone);
    const hash = phoneHash(phone);
    if (sealed) patch.advertiser_phone_encrypted = sealed;
    if (hash) patch.advertiser_phone_hash = hash;
  }
  await patchProperty(id, patch);
}

async function refreshExisting(existingId, body) {
  const current = await getAdmin().from('properties').select('*').eq('id', existingId).maybeSingle();
  const row = current.data;
  if (!row) return null;
  const patch = { last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (body.price != null && body.price !== '') patch.price = body.price;
  if (body.area != null && body.area !== '') patch.area = body.area;
  if (body.description && String(body.description).length >= String(row.description || '').length) patch.description = body.description;
  if (!row.source_url && body.sourceUrl) patch.source_url = body.sourceUrl;
  if (!row.source_name && (body.sourceName || body.source)) patch.source_name = body.sourceName || body.source;
  if (!row.cover_image && body.coverImage) patch.cover_image = body.coverImage;
  patch.status_log = await appendLog(row, { action: 'refresh', note: 'تحديث الإعلان نفسه دون نسخة جديدة' });
  await patchProperty(existingId, patch);
  return row;
}

const ACTIONS = {
  publish: { status: 'published', show_on_private_offers: true, show_on_map: true },
  reject: { status: 'rejected', show_on_private_offers: false, show_on_map: false, homepage_published: false },
  hide: { status: 'hidden', show_on_private_offers: false, show_on_map: false },
  sold: { status: 'sold', show_on_private_offers: false, show_on_map: false, homepage_published: false, sold_at: true },
  withdrawn: { status: 'withdrawn', show_on_private_offers: false, show_on_map: false, homepage_published: false, withdrawn_at: true },
  reactivate: { status: 'published', show_on_private_offers: true, show_on_map: true },
  map_on: { show_on_map: true },
  map_off: { show_on_map: false },
  offers_on: { show_on_private_offers: true },
  offers_off: { show_on_private_offers: false },
  homepage_on: { homepage_published: true },
  homepage_off: { homepage_published: false },
};

async function applyAction(id, action) {
  const spec = ACTIONS[action];
  if (!spec) {
    const error = new Error('إجراء غير معروف');
    error.status = 400;
    throw error;
  }
  if (action === 'homepage_on' && !VISIBLE.includes((await getAdmin().from('properties').select('status').eq('id', id).maybeSingle()).data?.status)) {
    const error = new Error('الصفحة الرئيسية للإعلانات المعتمدة فقط');
    error.status = 400;
    throw error;
  }
  const current = await getAdmin().from('properties').select('*').eq('id', id).maybeSingle();
  if (!current.data) {
    const error = new Error('العقار غير موجود');
    error.status = 404;
    throw error;
  }
  const now = new Date().toISOString();
  const patch = { updated_at: now, status_log: await appendLog(current.data, { action, status: spec.status || current.data.status }) };
  Object.entries(spec).forEach(([key, value]) => {
    if (value === true && (key === 'sold_at' || key === 'withdrawn_at')) patch[key] = now;
    else patch[key] = value;
  });
  if (action === 'sold') patch.sold_at = now;
  if (action === 'withdrawn') patch.withdrawn_at = now;
  if (action === 'publish') patch.approved_at = current.data.approved_at || now;
  await patchProperty(id, patch);
  return getBoardItem(id, { admin: true });
}

module.exports = {
  VISIBLE,
  card,
  clientCard,
  detail,
  listBoard,
  getBoardItem,
  findConfirmedDuplicate,
  markVisible,
  refreshExisting,
  applyAction,
  pricePerMeter,
};
