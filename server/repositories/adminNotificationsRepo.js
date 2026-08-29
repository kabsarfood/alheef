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

const EJAR_REVIEW_TYPE = 'ejar_review_received';
const CUSTOMER_REQUEST_TYPE = 'customer_request_received';

function parseEjarContractKind(message) {
  if (!message) return '';
  try {
    const parsed = typeof message === 'string' ? JSON.parse(message) : message;
    const ct = String(parsed?.contractType || '').trim();
    if (ct === 'سكني' || ct === 'residential') return 'سكني';
    if (ct === 'تجاري' || ct === 'commercial') return 'تجاري';
  } catch {
    /* ignore invalid JSON */
  }
  return '';
}

function buildCustomerRequestNotificationContent({ requestType, message }) {
  if (requestType === 'ejar_contract') {
    const kind = parseEjarContractKind(message);
    return {
      title: 'طلب جديد لعقد إيجار',
      body: kind
        ? `وصل طلب جديد لإنشاء عقد إيجار ${kind} ويحتاج إلى المتابعة.`
        : 'وصل طلب جديد لإنشاء عقد إيجار ويحتاج إلى المتابعة.',
    };
  }
  if (requestType === 'property_search') {
    return {
      title: 'طلب جديد للبحث عن عقار',
      body: 'وصل طلب جديد للبحث عن عقار ويحتاج إلى المتابعة.',
    };
  }
  if (requestType === 'owner_listing') {
    return {
      title: 'طلب جديد لعرض عقار',
      body: 'وصل طلب جديد لعرض عقار ويحتاج إلى المتابعة.',
    };
  }
  if (requestType === 'marketer_join') {
    return {
      title: 'طلب انضمام لفريق الهيف',
      body: 'وصل طلب جديد للانضمام لفريق المسوقين ويحتاج إلى المراجعة.',
    };
  }
  return {
    title: 'طلب عميل جديد',
    body: 'وصل طلب عميل جديد ويحتاج إلى المتابعة.',
  };
}

function starsBody(rating) {
  const n = Math.min(5, Math.max(1, parseInt(rating, 10) || 0));
  return `وصل تقييم جديد ${'⭐'.repeat(n)} ويحتاج إلى مراجعتك قبل النشر.`;
}

async function findEjarReviewNotification(reviewId) {
  if (!isEnabled() || !reviewId) return null;
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('type', EJAR_REVIEW_TYPE)
    .filter('payload->>reviewId', 'eq', String(reviewId))
    .maybeSingle();
  if (error) return null;
  return mapRow(data);
}

async function createEjarReviewReceived({ reviewId, requestId, rating }) {
  if (!isEnabled() || !reviewId) return null;

  const existing = await findEjarReviewNotification(reviewId);
  if (existing) return existing;

  const body = starsBody(rating);
  const row = {
    type: EJAR_REVIEW_TYPE,
    title: 'تقييم جديد لعقد إيجار',
    property_id: null,
    marketer_id: null,
    payload: {
      reviewId: String(reviewId),
      requestId: requestId ? String(requestId) : '',
      rating: parseInt(rating, 10) || 0,
      body,
    },
    is_read: false,
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function markReadByReviewId(reviewId) {
  if (!isEnabled() || !reviewId) return;
  await getAdmin()
    .from(TABLE)
    .update({ is_read: true })
    .eq('type', EJAR_REVIEW_TYPE)
    .filter('payload->>reviewId', 'eq', String(reviewId))
    .eq('is_read', false);
}

async function findRequestNotification(requestId) {
  if (!isEnabled() || !requestId) return null;
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('type', CUSTOMER_REQUEST_TYPE)
    .filter('payload->>requestId', 'eq', String(requestId))
    .maybeSingle();
  if (error) return null;
  return mapRow(data);
}

async function createCustomerRequestReceived({ requestId, requestType, message }) {
  if (!isEnabled() || !requestId) return null;

  const existing = await findRequestNotification(requestId);
  if (existing) return existing;

  const { title, body } = buildCustomerRequestNotificationContent({ requestType, message });
  const row = {
    type: CUSTOMER_REQUEST_TYPE,
    title,
    property_id: null,
    marketer_id: null,
    payload: {
      requestId: String(requestId),
      requestType: requestType || '',
      body,
      createdAt: new Date().toISOString(),
    },
    is_read: false,
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function markReadByRequestId(requestId) {
  if (!isEnabled() || !requestId) return;
  await getAdmin()
    .from(TABLE)
    .update({ is_read: true })
    .eq('type', CUSTOMER_REQUEST_TYPE)
    .filter('payload->>requestId', 'eq', String(requestId))
    .eq('is_read', false);
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
  CUSTOMER_REQUEST_TYPE,
  buildCustomerRequestNotificationContent,
  createPropertyPendingReview,
  createEjarReviewReceived,
  createCustomerRequestReceived,
  findEjarReviewNotification,
  findRequestNotification,
  markReadByReviewId,
  markReadByRequestId,
  list,
  countUnread,
  markRead,
  markReadByPropertyId,
  markAllRead,
};
