const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToProperty, propertyToRow } = require('../services/mappers');
const { formatPriceDisplay, buildTitle } = require('../utils/offers');

const TABLE = 'properties';

async function listAll() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin().from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('[propertiesRepo] listAll:', error.message);
    return [];
  }
  return (data || []).map(rowToProperty);
}

async function listPublished() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[propertiesRepo] listPublished:', error.message);
    return [];
  }
  return (data || []).map(rowToProperty);
}

async function getById(id) {
  if (!isEnabled()) return null;
  const { data, error } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[propertiesRepo] getById:', error.message);
    return null;
  }
  return rowToProperty(data);
}

async function create(offer) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {
    ...propertyToRow(offer),
    price_display: offer.priceDisplay || formatPriceDisplay(offer.price),
    title: offer.title || buildTitle(offer),
    created_at: new Date().toISOString(),
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) {
    console.error('[propertiesRepo] create:', error.message);
    throw new Error('فشل إنشاء الإعلان');
  }
  return rowToProperty(data);
}

async function update(id, patch) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const existing = await getById(id);
  if (!existing) return null;

  const merged = { ...existing, ...patch };
  if (patch.price) merged.priceDisplay = formatPriceDisplay(patch.price);
  merged.title = buildTitle(merged);

  const row = {
    ...propertyToRow(merged),
    price_display: merged.priceDisplay || formatPriceDisplay(merged.price),
    title: merged.title,
  };

  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error) {
    console.error('[propertiesRepo] update:', error.message);
    throw new Error('فشل تحديث الإعلان');
  }
  return rowToProperty(data);
}

async function remove(id) {
  if (!isEnabled()) return false;
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[propertiesRepo] remove:', error.message);
    return false;
  }
  return true;
}

async function countPublished() {
  if (!isEnabled()) return 0;
  const { count, error } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published');
  if (error) return 0;
  return count || 0;
}

async function countAll() {
  if (!isEnabled()) return 0;
  const { count, error } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  if (error) return 0;
  return count || 0;
}

module.exports = {
  listAll,
  listPublished,
  getById,
  create,
  update,
  remove,
  countPublished,
  countAll,
};
