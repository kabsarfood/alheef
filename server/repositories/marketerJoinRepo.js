const { getAdmin, isEnabled } = require('../lib/supabase');
const { normalizePhone, MARKETING_ZONES } = require('../utils/marketerZones');

const TABLE = 'marketer_join_requests';

function validateZone(zone) {
  return Object.prototype.hasOwnProperty.call(MARKETING_ZONES, zone);
}

async function createRequest(body) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  const phone = normalizePhone(body.phone);
  const row = {
    full_name: String(body.fullName || body.full_name || '').trim(),
    phone,
    national_id: String(body.nationalId || body.national_id || '').trim(),
    fal_license: String(body.falLicense || body.fal_license || '').trim(),
    marketing_zone: body.marketingZone || body.marketing_zone,
    status: 'pending',
    updated_at: new Date().toISOString(),
  };
  if (!row.full_name || !phone || !row.national_id || !row.fal_license) {
    throw new Error('أكمل جميع الحقول المطلوبة');
  }
  if (!validateZone(row.marketing_zone)) {
    throw new Error('اختر نطاق التسويق');
  }

  const { data: pending } = await getAdmin()
    .from(TABLE)
    .select('id')
    .eq('phone', phone)
    .eq('status', 'pending')
    .maybeSingle();
  if (pending) throw new Error('لديك طلب قيد المراجعة بالفعل');

  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function listAll({ status } = {}) {
  if (!isEnabled()) return [];
  let q = getAdmin().from(TABLE).select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

async function getById(id) {
  if (!isEnabled()) return null;
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return data;
}

async function updateStatus(id, { status, adminNote, reviewedBy }) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  const patch = {
    status,
    updated_at: new Date().toISOString(),
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewedBy || 'admin',
  };
  if (adminNote != null) patch.admin_note = adminNote;
  const { data, error } = await getAdmin().from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  createRequest,
  listAll,
  getById,
  updateStatus,
};
