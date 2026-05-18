const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToTestimonial } = require('../services/mappers');

const TABLE = 'testimonials';

async function listActive() {
  if (!isEnabled()) return [];
  const { data } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });
  return (data || []).map(rowToTestimonial);
}

async function listAll() {
  if (!isEnabled()) return [];
  const { data } = await getAdmin().from(TABLE).select('*').order('created_at', { ascending: false });
  return (data || []).map(rowToTestimonial);
}

async function getById(id) {
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return rowToTestimonial(data);
}

async function create(body) {
  const row = {
    customer_name: body.customerName,
    comment: body.comment,
    rating: body.rating ?? 5,
    image: body.image || null,
    active: body.active !== false,
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToTestimonial(data);
}

async function update(id, body) {
  const row = {
    customer_name: body.customerName,
    comment: body.comment,
    rating: body.rating,
    image: body.image,
    active: body.active,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  const { data, error } = await getAdmin().from(TABLE).update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return rowToTestimonial(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

module.exports = { listActive, listAll, getById, create, update, remove };
