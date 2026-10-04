const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToProperty, propertyToRowWithColumns } = require('../services/mappers');
const { typeFilterValues } = require('../utils/propertyTypes');
const { uniqueSlug } = require('../utils/slug');
const { parseCoord, isValidCoord } = require('../utils/coords');
const { pickPropertyColumns, missingColumnFromError } = require('../utils/propertyColumns');
const { isMahdiaListing, formatMahdiaRef, nextMahdiaNumber } = require('../utils/internalRef');
const { PUBLIC_STATUSES } = require('../utils/propertyStatus');
const {
  isWorkflowStatus, dbStatusForWorkflowFilter,
} = require('../utils/marketerFeatures');

const TABLE = 'properties';
const IMG_TABLE = 'property_images';

async function loadImages(propertyId) {
  const { data } = await getAdmin()
    .from(IMG_TABLE)
    .select('*')
    .eq('property_id', propertyId)
    .order('sort_order', { ascending: true });
  return data || [];
}

async function slugExists(slug, excludeId = null) {
  let q = getAdmin().from(TABLE).select('id').eq('slug', slug);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  return !!data;
}

async function list(filters = {}, { offset = 0, limit = 12 } = {}) {
  if (!isEnabled()) return { items: [], total: 0 };

  const workflowFilter = filters.status && isWorkflowStatus(filters.status) ? filters.status : null;
  const marketerId = filters.marketerId || null;
  const query = { ...filters };
  delete query.marketerId;
  const publicCatalog = query.publicCatalog === true;
  delete query.publicCatalog;
  if (workflowFilter) query.status = dbStatusForWorkflowFilter(workflowFilter);

  const inMemoryFilter = !!(workflowFilter || marketerId);
  const fetchLimit = inMemoryFilter ? Math.max(limit, 300) : limit;
  const fetchOffset = inMemoryFilter ? 0 : offset;

  let q = getAdmin().from(TABLE).select('*', { count: inMemoryFilter ? undefined : 'exact' });

  if (query.status) {
    if (Array.isArray(query.status)) q = q.in('status', query.status);
    else q = q.eq('status', query.status);
  }
  if (query.city) q = q.ilike('city', `%${query.city}%`);
  if (query.district) q = q.ilike('district', `%${query.district}%`);
  if (query.propertyType) {
    const values = typeFilterValues(query.propertyType);
    if (values.length === 1) q = q.eq('property_type', values[0]);
    else if (values.length) q = q.in('property_type', values);
  }
  if (query.listingType) q = q.eq('listing_type', query.listingType);
  if (query.featured != null) q = q.eq('featured', query.featured);
  if (query.minPrice) q = q.gte('price', query.minPrice);
  if (query.maxPrice) q = q.lte('price', query.maxPrice);
  if (publicCatalog) {
    q = q.or('homepage_published.eq.true,show_on_private_offers.eq.false');
  }

  q = q.order('created_at', { ascending: false }).range(fetchOffset, fetchOffset + fetchLimit - 1);

  const { data, error, count } = await q;
  if (error) {
    console.error('[propertiesRepo] list:', error.message);
    return { items: [], total: 0 };
  }

  let items = [];
  for (const row of data || []) {
    const images = await loadImages(row.id);
    items.push(rowToProperty(row, images));
  }

  if (workflowFilter) items = items.filter((p) => p.status === workflowFilter);
  if (marketerId) items = items.filter((p) => p.marketerId === marketerId);

  if (inMemoryFilter) {
    const total = items.length;
    items = items.slice(offset, offset + limit);
    return { items, total };
  }
  return { items, total: count || 0 };
}

async function listPublished(filters, pagination) {
  return list({ ...filters, status: PUBLIC_STATUSES, publicCatalog: true }, pagination);
}

async function listByMarketer(marketerId, filters = {}, pagination = {}) {
  return list({ ...filters, marketerId }, pagination);
}

/** عقارات منشورة — للخريطة مع فلترة الإحداثيات في الكود */
async function listForMap(filters = {}) {
  if (!isEnabled()) return { rows: [], stats: { error: 'supabase_disabled' } };

  let q = getAdmin().from(TABLE).select('*').in('status', PUBLIC_STATUSES)
    .or('homepage_published.eq.true,show_on_private_offers.eq.false');

  if (filters.city) q = q.ilike('city', `%${filters.city}%`);
  if (filters.district) q = q.ilike('district', `%${filters.district}%`);
  if (filters.propertyType) {
    const values = typeFilterValues(filters.propertyType);
    if (values.length === 1) q = q.eq('property_type', values[0]);
    else if (values.length) q = q.in('property_type', values);
  }
  if (filters.listingType) q = q.eq('listing_type', filters.listingType);
  if (filters.minPrice) q = q.gte('price', filters.minPrice);
  if (filters.maxPrice) q = q.lte('price', filters.maxPrice);

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    console.error('[propertiesRepo] listForMap:', error.message);
    return { rows: [], stats: { error: error.message } };
  }

  const all = data || [];
  const withCoords = all.filter((row) => isValidCoord(row.latitude, row.longitude) && row.show_on_map !== false);
  const missingCoords = all.length - withCoords.length;

  console.log('[propertiesRepo] listForMap:', {
    publishedTotal: all.length,
    withValidCoords: withCoords.length,
    missingCoords,
    filters,
  });

  return {
    rows: withCoords,
    stats: {
      publishedTotal: all.length,
      withValidCoords: withCoords.length,
      missingCoords,
    },
  };
}

async function getMapDiagnostics() {
  if (!isEnabled()) return null;
  const { data: published } = await getAdmin()
    .from(TABLE)
    .select('id, title, status, latitude, longitude')
    .eq('status', 'published');
  const rows = published || [];
  return {
    published: rows.length,
    withCoords: rows.filter((r) => isValidCoord(r.latitude, r.longitude)).length,
    withoutCoords: rows.filter((r) => !isValidCoord(r.latitude, r.longitude)).map((r) => ({
      id: r.id,
      title: r.title,
    })),
    draft: null,
  };
}

async function listAll(pagination) {
  return list({}, pagination);
}

async function getById(id) {
  if (!isEnabled()) return null;
  const { data, error } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const images = await loadImages(id);
  return rowToProperty(data, images);
}

async function getBySlug(slug) {
  if (!isEnabled()) return null;
  const { data } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('slug', slug)
    .in('status', PUBLIC_STATUSES)
    .maybeSingle();
  if (!data) return null;
  if (data.show_on_private_offers !== false && data.homepage_published !== true) return null;
  if (data.license_expires_at && new Date(data.license_expires_at) < new Date()) return null;
  const images = await loadImages(data.id);
  await getAdmin().from(TABLE).update({ views_count: (data.views_count || 0) + 1 }).eq('id', data.id);
  return rowToProperty(data, images);
}

function assertCoords(row) {
  const hasLat = row.latitude != null && row.latitude !== '';
  const hasLng = row.longitude != null && row.longitude !== '';
  if ((hasLat || hasLng) && !isValidCoord(row.latitude, row.longitude)) {
    throw new Error('خط العرض أو خط الطول غير صحيح');
  }
  const published = row.status === 'published';
  const buy = row.listing_type === 'buy_request';
  if (published && !buy && !isValidCoord(row.latitude, row.longitude)) {
    throw new Error('نشر الإعلان على الخريطة يحتاج خط عرض وخط طول صحيحين');
  }
}

async function syncCoverAndGallery(propertyId) {
  const images = await loadImages(propertyId);
  const gallery = images.map((img) => img.image_url);
  await getAdmin().from(TABLE).update({
    gallery,
    cover_image: gallery[0] || null,
  }).eq('id', propertyId);
  return gallery;
}

/**
 * يحذف العمود الناقص فقط ويعيد المحاولة.
 * هكذا تُحفظ facade و contact_phone إذا كانت موجودة،
 * حتى لو كان plot_number أو direction غير مضافين بعد.
 */
async function writeRow(payload, run) {
  let current = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await run({ ...current });
    if (!error) return data;
    const missing = missingColumnFromError(error.message);
    if (!missing || !Object.prototype.hasOwnProperty.call(current, missing)) {
      throw new Error(error.message);
    }
    delete current[missing];
  }
  throw new Error('تعذر حفظ العقار');
}

async function nextMahdiaRef() {
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('internal_ref')
    .like('internal_ref', 'H-MHD-%');
  if (error) throw new Error(error.message);
  return formatMahdiaRef(nextMahdiaNumber((data || []).map((row) => row.internal_ref)));
}

/** الرقم الممنوح سابقًا يبقى. المهدية بلا رقم تأخذ الرقم التالي. غير المهدية تبقى بلا رقم. */
async function resolveInternalRef(existing, body) {
  if (existing?.internalRef) return existing.internalRef;
  const source = {
    district: body?.district != null ? body.district : existing?.district,
    city: body?.city != null ? body.city : existing?.city,
    title: body?.title != null ? body.title : existing?.title,
  };
  if (!isMahdiaListing(source)) return null;
  return nextMahdiaRef();
}

async function insertPropertyRow(row) {
  let payload = pickPropertyColumns(row);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await writeRow(payload, (current) => getAdmin().from(TABLE).insert(current).select().single());
    } catch (err) {
      const retry = payload.internal_ref && /internal_ref|duplicate key/i.test(err.message) && attempt < 4;
      if (!retry) throw err;
      payload = { ...payload, internal_ref: await nextMahdiaRef() };
    }
  }
  throw new Error('تعذر منح رقم الهيف الداخلي');
}

async function create(body) {
  if (!isEnabled()) {
    throw new Error(
      'قاعدة البيانات غير متصلة — أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Railway ثم أعد النشر'
    );
  }
  const slug = body.slug || (await uniqueSlug(body.title, (s) => slugExists(s)));
  const internalRef = await resolveInternalRef(null, body);
  const row = pickPropertyColumns({
    ...propertyToRowWithColumns({ ...body, internalRef }),
    slug,
    created_at: new Date().toISOString(),
  });
  assertCoords(row);
  const data = await insertPropertyRow(row);
  return rowToProperty(data, []);
}

async function update(id, body) {
  if (!isEnabled()) {
    throw new Error(
      'قاعدة البيانات غير متصلة — أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Railway ثم أعد النشر'
    );
  }
  const existing = await getById(id);
  if (!existing) return null;

  let slug = body.slug || existing.slug;
  if (body.title && !body.slug) {
    slug = await uniqueSlug(body.title, (s) => slugExists(s, id));
  }

  const internalRef = await resolveInternalRef(existing, body);
  const row = pickPropertyColumns({
    ...propertyToRowWithColumns({ ...existing, ...body, internalRef }),
    slug,
  });
  assertCoords(row);
  const data = await writeRow(row, (current) => getAdmin().from(TABLE).update(current).eq('id', id).select().single());
  const images = await loadImages(id);
  return rowToProperty(data, images);
}

async function remove(id) {
  if (!isEnabled()) return false;
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

async function addImages(propertyId, urls) {
  if (!urls?.length) return [];
  const existing = await loadImages(propertyId);
  let order = existing.length;
  const rows = urls.map((url) => {
    order += 1;
    return { property_id: propertyId, image_url: url, sort_order: order };
  });
  const { data, error } = await getAdmin().from(IMG_TABLE).insert(rows).select();
  if (error) throw new Error(error.message);

  await syncCoverAndGallery(propertyId);
  return data;
}

async function reorderImages(propertyId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await getAdmin().from(IMG_TABLE).update({ sort_order: i }).eq('id', orderedIds[i]).eq('property_id', propertyId);
  }
  await syncCoverAndGallery(propertyId);
}

async function retainImages(propertyId, keptUrls) {
  const urls = (keptUrls || []).map((url) => String(url || '').trim()).filter(Boolean);
  const existing = await loadImages(propertyId);
  for (const img of existing) {
    if (!urls.includes(img.image_url)) {
      await getAdmin().from(IMG_TABLE).delete().eq('id', img.id);
    }
  }
  const remaining = await loadImages(propertyId);
  const byUrl = new Map(remaining.map((img) => [img.image_url, img]));
  let order = 0;
  for (const url of urls) {
    const img = byUrl.get(url);
    if (!img) continue;
    order += 1;
    await getAdmin().from(IMG_TABLE).update({ sort_order: order }).eq('id', img.id);
  }
  await syncCoverAndGallery(propertyId);
}

async function removeImage(imageId) {
  const { data } = await getAdmin().from(IMG_TABLE).select('property_id').eq('id', imageId).maybeSingle();
  const { error } = await getAdmin().from(IMG_TABLE).delete().eq('id', imageId);
  if (error) return false;
  if (data?.property_id) await syncCoverAndGallery(data.property_id);
  return true;
}

async function countAll() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

async function countPublished() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .in('status', PUBLIC_STATUSES);
  return count || 0;
}

async function expireLicenses() {
  if (!isEnabled()) return { count: 0, items: [] };
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .in('status', PUBLIC_STATUSES)
    .lt('license_expires_at', today)
    .not('license_expires_at', 'is', null)
    .select('id, marketer_id, title, district');
  if (error) {
    console.error('[propertiesRepo] expireLicenses:', error.message);
    return { count: 0, items: [] };
  }
  const items = (data || []).map((r) => ({
    id: r.id,
    marketerId: r.marketer_id,
    title: r.title,
    district: r.district,
  }));
  return { count: items.length, items };
}

async function countPendingReview() {
  const { items } = await list({ status: 'pending_review' }, { limit: 500 });
  return items.length;
}

async function updateStatus(id, patch) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  const existing = await getById(id);
  if (!existing) throw new Error('غير موجود');
  const body = {
    ...existing,
    adminFeedback: patch.admin_feedback ?? existing.adminFeedback,
    internalNotes: patch.internal_notes ?? existing.internalNotes,
    reviewedBy: patch.reviewed_by ?? existing.reviewedBy,
    reviewedAt: patch.reviewed_at ?? existing.reviewedAt,
    approvedBy: patch.approved_by ?? existing.approvedBy,
    approvedAt: patch.approved_at ?? existing.approvedAt,
    homepagePublished: patch.homepage_published ?? existing.homepagePublished,
    status: patch.status ?? existing.status,
  };
  return update(id, body);
}

module.exports = {
  list,
  listPublished,
  listByMarketer,
  listForMap,
  getMapDiagnostics,
  listAll,
  getById,
  getBySlug,
  create,
  update,
  updateStatus,
  remove,
  addImages,
  reorderImages,
  retainImages,
  removeImage,
  countAll,
  countPublished,
  countPendingReview,
  expireLicenses,
};
