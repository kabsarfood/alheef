const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToBanner } = require('../services/mappers');

const TABLE = 'banners';

async function listActive() {
  if (!isEnabled()) return [];
  const { data } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  return (data || []).map(rowToBanner);
}

async function listAll() {
  if (!isEnabled()) return [];
  const { data } = await getAdmin().from(TABLE).select('*').order('sort_order', { ascending: true });
  return (data || []).map(rowToBanner);
}

async function getById(id) {
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return rowToBanner(data);
}

async function create(body) {
  const row = {
    title: body.title || null,
    image_desktop: body.imageDesktop,
    image_mobile: body.imageMobile || body.imageDesktop,
    button_text: body.buttonText || null,
    button_link: body.buttonLink || null,
    sort_order: body.sortOrder ?? 0,
    active: body.active !== false,
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToBanner(data);
}

async function update(id, body) {
  const row = {
    title: body.title,
    image_desktop: body.imageDesktop,
    image_mobile: body.imageMobile,
    button_text: body.buttonText,
    button_link: body.buttonLink,
    sort_order: body.sortOrder,
    active: body.active,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return rowToBanner(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

module.exports = { listActive, listAll, getById, create, update, remove };
