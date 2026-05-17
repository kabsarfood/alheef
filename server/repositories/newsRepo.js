const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToNews } = require('../services/mappers');

const TABLE = 'news';

async function listAll() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin().from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) {
    console.error('[newsRepo] listAll:', error.message);
    return [];
  }
  return (data || []).map(rowToNews);
}

async function listPublished(limit = 20) {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[newsRepo] listPublished:', error.message);
    return [];
  }
  return (data || []).map(rowToNews);
}

async function getById(id) {
  if (!isEnabled()) return null;
  const { data, error } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) return null;
  return rowToNews(data);
}

async function create(item) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {
    title: item.title,
    content: item.content,
    image: item.image || '',
    category: item.category || 'عام',
    status: item.status || 'published',
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error('فشل نشر الخبر');
  return rowToNews(data);
}

async function update(id, patch) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {};
  if (patch.title) row.title = patch.title;
  if (patch.category) row.category = patch.category;
  if (patch.content) row.content = patch.content;
  if (patch.status) row.status = patch.status;
  if (patch.image !== undefined) row.image = patch.image;

  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error || !data) return null;
  return rowToNews(data);
}

async function remove(id) {
  if (!isEnabled()) return false;
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

async function countAll() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

module.exports = {
  listAll,
  listPublished,
  getById,
  create,
  update,
  remove,
  countAll,
};
