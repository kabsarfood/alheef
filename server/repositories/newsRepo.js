const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToNews } = require('../services/mappers');
const { uniqueSlug } = require('../utils/slug');

const TABLE = 'news';

async function slugExists(slug, excludeId = null) {
  let q = getAdmin().from(TABLE).select('id').eq('slug', slug);
  if (excludeId) q = q.neq('id', excludeId);
  const { data } = await q.maybeSingle();
  return !!data;
}

async function listAll({ offset = 0, limit = 50 } = {}) {
  if (!isEnabled()) return { items: [], total: 0 };
  const { data, error, count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { items: [], total: 0 };
  return { items: (data || []).map(rowToNews), total: count || 0 };
}

async function listPublished({ offset = 0, limit = 12 } = {}) {
  if (!isEnabled()) return { items: [], total: 0 };
  const { data, error, count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { items: [], total: 0 };
  return { items: (data || []).map(rowToNews), total: count || 0 };
}

async function getById(id) {
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return rowToNews(data);
}

async function getBySlug(slug) {
  const { data } = await getAdmin().from(TABLE).select('*').eq('slug', slug).eq('status', 'published').maybeSingle();
  return rowToNews(data);
}

async function create(body) {
  const slug = body.slug || (await uniqueSlug(body.title, (s) => slugExists(s)));
  const row = {
    title: body.title,
    slug,
    content: body.content,
    image: body.image || null,
    status: body.status || 'published',
    created_at: new Date().toISOString(),
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToNews(data);
}

async function update(id, body) {
  const existing = await getById(id);
  if (!existing) return null;
  let slug = body.slug || existing.slug;
  if (body.title && !body.slug) slug = await uniqueSlug(body.title, (s) => slugExists(s, id));
  const row = {
    title: body.title ?? existing.title,
    slug,
    content: body.content ?? existing.content,
    image: body.image ?? existing.image,
    status: body.status ?? existing.status,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return rowToNews(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

async function countAll() {
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

module.exports = { listAll, listPublished, getById, getBySlug, create, update, remove, countAll };
