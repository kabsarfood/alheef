const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToRequest } = require('../services/mappers');

const TABLE = 'requests';

async function listAll({ offset = 0, limit = 100 } = {}) {
  if (!isEnabled()) return { items: [], total: 0 };
  const { data, error, count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { items: [], total: 0 };
  return { items: (data || []).map(rowToRequest), total: count || 0 };
}

async function create(body) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {
    customer_name: body.customerName || body.customer_name || null,
    customer_phone: body.customerPhone || body.customer_phone || null,
    customer_email: body.customerEmail || body.customer_email || null,
    request_type: body.requestType || body.request_type,
    property_id: body.propertyId || body.property_id || null,
    message: body.message || null,
    status: 'new',
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToRequest(data);
}

async function updateStatus(id, status) {
  const { data, error } = await getAdmin().from(TABLE).update({ status }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return rowToRequest(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

async function countAll() {
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

async function countByStatus(status) {
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', status);
  return count || 0;
}

module.exports = { listAll, create, updateStatus, remove, countAll, countByStatus };
