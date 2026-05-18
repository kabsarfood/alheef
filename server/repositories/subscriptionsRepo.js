const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToSubscription } = require('../services/mappers');

const TABLE = 'subscriptions';

async function listAll({ offset = 0, limit = 100 } = {}) {
  if (!isEnabled()) return { items: [], total: 0 };
  const { data, error, count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return { items: [], total: 0 };
  return { items: (data || []).map(rowToSubscription), total: count || 0 };
}

async function create(email) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const { data, error } = await getAdmin()
    .from(TABLE)
    .insert({ email: email.trim().toLowerCase() })
    .select()
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error('هذا البريد مسجّل مسبقاً');
    }
    throw new Error(error.message);
  }
  return rowToSubscription(data);
}

async function remove(id) {
  const { error } = await getAdmin().from(TABLE).delete().eq('id', id);
  return !error;
}

async function countAll() {
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

module.exports = { listAll, create, remove, countAll };
