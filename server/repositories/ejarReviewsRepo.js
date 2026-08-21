const { getAdmin, isEnabled } = require('../lib/supabase');
const { getMinReviewsToDisplay } = require('../utils/ejarReviewConfig');

const TABLE = 'ejar_reviews';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requestId: row.request_id,
    reviewTokenId: row.review_token_id,
    rating: row.rating,
    comment: row.comment,
    displayName: row.display_name,
    city: row.city,
    publishConsent: row.publish_consent,
    status: row.status,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    displayName: row.displayName || 'عميل',
    city: row.city,
    submittedAt: row.submittedAt,
  };
}

async function create(body) {
  if (!isEnabled()) throw new Error('Supabase غير متصل');
  const row = {
    request_id: body.requestId,
    review_token_id: body.reviewTokenId,
    rating: body.rating,
    comment: body.comment || null,
    display_name: body.displayName || null,
    city: body.city || null,
    publish_consent: !!body.publishConsent,
    status: 'pending',
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function getById(id) {
  if (!isEnabled() || !id) return null;
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return mapRow(data);
}

async function getByTokenId(reviewTokenId) {
  if (!isEnabled() || !reviewTokenId) return null;
  const { data } = await getAdmin().from(TABLE).select('*').eq('review_token_id', reviewTokenId).maybeSingle();
  return mapRow(data);
}

async function listAdmin({ status, limit = 100 } = {}) {
  if (!isEnabled()) return [];
  let q = getAdmin().from(TABLE).select('*').order('submitted_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(mapRow);
}

async function countPending() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count || 0;
}

async function countPublicApproved() {
  if (!isEnabled()) return 0;
  const { count } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .eq('publish_consent', true);
  return count || 0;
}

async function getPublicStats() {
  if (!isEnabled()) {
    return { count: 0, average: 0, visible: false, minRequired: getMinReviewsToDisplay() };
  }
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('rating')
    .eq('status', 'approved')
    .eq('publish_consent', true);
  if (error) throw new Error(error.message);
  const rows = data || [];
  const count = rows.length;
  const minRequired = getMinReviewsToDisplay();
  const average = count
    ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
    : 0;
  return { count, average, visible: count >= minRequired, minRequired };
}

async function listPublic(limit = 6) {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('status', 'approved')
    .eq('publish_consent', true)
    .order('approved_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []).map(mapRow).map(toPublic);
}

async function setStatus(id, status) {
  const patch = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'approved') patch.approved_at = new Date().toISOString();
  const { data, error } = await getAdmin().from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

module.exports = {
  create,
  getById,
  getByTokenId,
  listAdmin,
  countPending,
  countPublicApproved,
  getPublicStats,
  listPublic,
  setStatus,
  mapRow,
  toPublic,
};
