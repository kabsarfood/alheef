const { getAdmin, isEnabled } = require('../lib/supabase');

const TABLE = 'admin_notifications';

function mapRow(row) {
  if (!row) return null;
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    propertyId: row.property_id,
    marketerId: row.marketer_id,
    payload,
    isRead: row.is_read,
    createdAt: row.created_at,
    marketerName: payload.marketerName || '',
    propertyType: payload.propertyType || '',
    district: payload.district || '',
    price: payload.price || '',
    propertyCreatedAt: payload.createdAt || row.created_at,
  };
}

async function createPropertyPendingReview({ propertyId, marketerId, marketerName, propertyType, district, price, createdAt }) {
  if (!isEnabled()) return null;
  const row = {
    type: 'property_pending_review',
    title: 'إعلان جديد بانتظار المراجعة',
    property_id: propertyId,
    marketer_id: marketerId || null,
    payload: {
      marketerName: marketerName || '',
      propertyType: propertyType || '',
      district: district || '',
      price: price || '',
      createdAt: createdAt || new Date().toISOString(),
    },
    is_read: false,
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function list({ unreadOnly = false, limit = 50 } = {}) {
  if (!isEnabled()) return [];
  let q = getAdmin().from(TABLE).select('*').order('created_at', { ascending: false }).limit(limit);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(mapRow);
}

async function countUnread() {
  if (!isEnabled()) return 0;
  const { count, error } = await getAdmin()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);
  if (error) return 0;
  return count || 0;
}

async function markRead(id) {
  if (!isEnabled()) return null;
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function markReadByPropertyId(propertyId) {
  if (!isEnabled() || !propertyId) return;
  await getAdmin()
    .from(TABLE)
    .update({ is_read: true })
    .eq('property_id', propertyId)
    .eq('is_read', false);
}

async function markAllRead() {
  if (!isEnabled()) return;
  await getAdmin().from(TABLE).update({ is_read: true }).eq('is_read', false);
}

module.exports = {
  createPropertyPendingReview,
  list,
  countUnread,
  markRead,
  markReadByPropertyId,
  markAllRead,
};
