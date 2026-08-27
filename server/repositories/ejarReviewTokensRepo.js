const { getAdmin, isEnabled } = require('../lib/supabase');
const { hashToken } = require('../services/ejarReviewService');

const TABLE = 'ejar_review_tokens';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

async function revokeActiveForRequest(requestId) {
  if (!isEnabled() || !requestId) return;
  await getAdmin()
    .from(TABLE)
    .update({ status: 'revoked' })
    .eq('request_id', requestId)
    .eq('status', 'active');
}

async function create({ requestId, rawToken, expiresAt }) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  await revokeActiveForRequest(requestId);
  const row = {
    request_id: requestId,
    token_hash: hashToken(rawToken),
    status: 'active',
    expires_at: expiresAt,
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function findByRawToken(rawToken) {
  if (!isEnabled() || !rawToken) return null;
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('token_hash', hashToken(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function getActiveByRequestId(requestId) {
  if (!isEnabled() || !requestId) return null;
  const { data } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('request_id', requestId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return mapRow(data);
}

async function markUsed(id) {
  const now = new Date().toISOString();
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({ status: 'used', used_at: now })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function markExpired(id) {
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({ status: 'expired' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function countDistinctCompletedRequests() {
  if (!isEnabled()) return 0;
  const ids = new Set();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await getAdmin()
      .from(TABLE)
      .select('request_id')
      .range(from, from + pageSize - 1);
    if (error) return ids.size;
    const rows = data || [];
    rows.forEach((row) => {
      if (row.request_id) ids.add(row.request_id);
    });
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 50000) break;
  }
  return ids.size;
}

module.exports = {
  create,
  findByRawToken,
  getActiveByRequestId,
  markUsed,
  markExpired,
  revokeActiveForRequest,
  countDistinctCompletedRequests,
};
