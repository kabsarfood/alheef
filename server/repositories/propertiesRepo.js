const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToProperty, propertyToRow } = require('../services/mappers');
const { uniqueSlug } = require('../utils/slug');

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
  let q = getAdmin().from(TABLE).select('*', { count: 'exact' });

  if (filters.status) q = q.eq('status', filters.status);
  if (filters.city) q = q.ilike('city', `%${filters.city}%`);
  if (filters.district) q = q.ilike('district', `%${filters.district}%`);
  if (filters.propertyType) q = q.eq('property_type', filters.propertyType);
  if (filters.listingType) q = q.eq('listing_type', filters.listingType);
  if (filters.featured != null) q = q.eq('featured', filters.featured);
  if (filters.minPrice) q = q.gte('price', filters.minPrice);
  if (filters.maxPrice) q = q.lte('price', filters.maxPrice);

  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) {
    console.error('[propertiesRepo] list:', error.message);
    return { items: [], total: 0 };
  }

  const items = [];
  for (const row of data || []) {
    const images = await loadImages(row.id);
    items.push(rowToProperty(row, images));
  }
  return { items, total: count || 0 };
}

async function listPublished(filters, pagination) {
  return list({ ...filters, status: 'published' }, pagination);
}

/** عقارات منشورة ذات إحداثيات — للخريطة (بدون تحميل صور إضافية) */
async function listForMap(filters = {}) {
  if (!isEnabled()) return [];
  let q = getAdmin()
    .from(TABLE)
    .select(
      'id, title, slug, description, property_type, listing_type, city, district, street, price, bedrooms, bathrooms, area, latitude, longitude, cover_image, gallery, reference_no, maps_url'
    )
    .eq('status', 'published')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  if (filters.city) q = q.ilike('city', `%${filters.city}%`);
  if (filters.district) q = q.ilike('district', `%${filters.district}%`);
  if (filters.propertyType) q = q.eq('property_type', filters.propertyType);
  if (filters.listingType) q = q.eq('listing_type', filters.listingType);
  if (filters.minPrice) q = q.gte('price', filters.minPrice);
  if (filters.maxPrice) q = q.lte('price', filters.maxPrice);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) {
    console.error('[propertiesRepo] listForMap:', error.message);
    return [];
  }
  return data || [];
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
  const { data } = await getAdmin().from(TABLE).select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  if (!data) return null;
  const images = await loadImages(data.id);
  await getAdmin().from(TABLE).update({ views_count: (data.views_count || 0) + 1 }).eq('id', data.id);
  return rowToProperty(data, images);
}

async function create(body) {
  if (!isEnabled()) {
    throw new Error(
      'قاعدة البيانات غير متصلة — أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Railway ثم أعد النشر'
    );
  }
  const slug = body.slug || (await uniqueSlug(body.title, (s) => slugExists(s)));
  const row = { ...propertyToRow(body), slug, created_at: new Date().toISOString() };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
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

  const row = { ...propertyToRow({ ...existing, ...body }), slug };
  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
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
  const rows = urls.map((url) => ({
    property_id: propertyId,
    image_url: url,
    sort_order: order++,
  }));
  const { data, error } = await getAdmin().from(IMG_TABLE).insert(rows).select();
  if (error) throw new Error(error.message);

  const gallery = [...existing.map((i) => i.image_url), ...urls];
  const cover = gallery[0];
  await getAdmin().from(TABLE).update({ gallery, cover_image: cover }).eq('id', propertyId);
  return data;
}

async function reorderImages(propertyId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await getAdmin().from(IMG_TABLE).update({ sort_order: i }).eq('id', orderedIds[i]).eq('property_id', propertyId);
  }
  const images = await loadImages(propertyId);
  const gallery = images.map((i) => i.image_url);
  await getAdmin().from(TABLE).update({ gallery, cover_image: gallery[0] || null }).eq('id', propertyId);
  return images;
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
    .eq('status', 'published');
  return count || 0;
}

module.exports = {
  list,
  listPublished,
  listForMap,
  listAll,
  getById,
  getBySlug,
  create,
  update,
  remove,
  addImages,
  reorderImages,
  removeImage,
  countAll,
  countPublished,
};
