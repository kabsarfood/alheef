const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToSubscription } = require('../services/mappers');

const TABLE = 'subscriptions';

async function create(payload) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const { error } = await getAdmin().from(TABLE).insert({
    name: payload.name,
    phone: payload.phone,
    interests: payload.interests || '',
  });
  if (error) {
    console.error('[subscriptionsRepo] create:', error.message);
    throw new Error('فشل حفظ الاشتراك');
  }
}

async function listAll() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []).map(rowToSubscription);
}

async function countAll() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin().from(TABLE).select('*', { count: 'exact', head: true });
  return count || 0;
}

module.exports = { create, listAll, countAll };
