const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToProperty, propertyToRow } = require('../services/mappers');
const { uniqueSlug } = require('../utils/slug');
const { parseCoord, isValidCoord } = require('../utils/coords');
const { pickPropertyColumns, stripOptionalMapColumns } = require('../utils/propertyColumns');
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
    const pt = String(query.propertyType).trim();
    q = q.ilike('property_type', `%${pt}%`);
  }
  if (query.listingType) q = q.eq('listing_type', query.listingType);
  if (query.featured != null) q = q.eq('featured', query.featured);
  if (query.minPrice) q = q.gte('price', query.minPrice);
  if (query.maxPrice) q = q.lte('price', query.maxPrice);

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
  return list({ ...filters, status: PUBLIC_STATUSES }, pagination);
}

async function listByMarketer(marketerId, filters = {}, pagination = {}) {
  return list({ ...filters, marketerId }, pagination);
}

/** عقارات منشورة — للخريطة مع فلترة الإحداثيات في الكود */
async function listForMap(filters = {}) {
  if (!isEnabled()) return { rows: [], stats: { error: 'supabase_disabled' } };

  let q = getAdmin().from(TABLE).select('*').in('status', PUBLIC_STATUSES);

  if (filters.city) q = q.ilike('city', `%${filters.city}%`);
  if (filters.district) q = q.ilike('district', `%${filters.district}%`);
  if (filters.propertyType) {
    const pt = String(filters.propertyType).trim();
    q = q.ilike('property_type', `%${pt}%`);
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
  const withCoords = all.filter((row) => isValidCoord(row.latitude, row.longitude));
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
  if (data.license_expires_at && new Date(data.license_expires_at) < new Date()) return null;
  const images = await loadImages(data.id);
  await getAdmin().from(TABLE).update({ views_count: (data.views_count || 0) + 1 }).eq('id', data.id);
  return rowToProperty(data, images);
}

async function insertPropertyRow(row) {
  let payload = pickPropertyColumns(row);
  let { data, error } = await getAdmin().from(TABLE).insert(payload).select().single();
  if (error && /column|schema cache/i.test(error.message)) {
    payload = stripOptionalMapColumns(payload);
    ({ data, error } = await getAdmin().from(TABLE).insert(payload).select().single());
  }
  if (error) throw new Error(error.message);
  return data;
}

async function create(body) {
  if (!isEnabled()) {
    throw new Error(
      'قاعدة البيانات غير متصلة — أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Railway ثم أعد النشر'
    );
  }
  const slug = body.slug || (await uniqueSlug(body.title, (s) => slugExists(s)));
  const row = pickPropertyColumns({
    ...propertyToRow(body),
    slug,
    created_at: new Date().toISOString(),
  });
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

  const row = pickPropertyColumns({ ...propertyToRow({ ...existing, ...body }), slug });
  let { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error && /column|schema cache/i.test(error.message)) {
    const safe = stripOptionalMapColumns(row);
    ({ data, error } = await getAdmin().from(TABLE).update(safe).eq('id', id).select().single());
  }
  if (error) throw new Error(error.message);
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

  const allImages = await loadImages(propertyId);
  const gallery = allImages.map((i) => i.image_url);
  const cover = gallery[0] || null;
  await getAdmin().from(TABLE).update({ gallery, cover_image: cover }).eq('id', propertyId);
  return data;
}

async function reorderImages(propertyId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    await getAdmin().from(IMG_TABLE).update({ sort_order: i }).eq('id', orderedIds[i]).eq('property_id', propertyId);
  }
  const images = await loadImages(propertyId);
  const gallery = images.map((i) => i.image_url);
  await getAdmin().from(TABLE).update({ gallery, cover_image: gallery[0] || null }).eq('id', propertyId);
}

async function removeImage(imageId) {
  const { error } = await getAdmin().from(IMG_TABLE).delete().eq('id', imageId);
  return !error;
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
  removeImage,
  countAll,
  countPublished,
  countPendingReview,
  expireLicenses,
};
