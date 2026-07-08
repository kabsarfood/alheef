const { getAdmin, isEnabled } = require('../lib/supabase');
const { hashPassword, verifyPassword } = require('../utils/password');
const { normalizePhone } = require('../utils/marketerZones');

const TABLE = 'marketers';

async function findByPhone(phone) {
  if (!isEnabled()) return null;
  const normalized = normalizePhone(phone);
  const { data } = await getAdmin().from(TABLE).select('*').eq('phone', normalized).maybeSingle();
  return data;
}

async function getById(id) {
  if (!isEnabled()) return null;
  const { data } = await getAdmin().from(TABLE).select('*').eq('id', id).maybeSingle();
  return data;
}

async function listAll() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin().from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

async function createFromJoinRequest(request) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  const existing = await findByPhone(request.phone);
  if (existing) throw new Error('يوجد حساب مسوق بهذا الرقم مسبقاً');

  const row = {
    join_request_id: request.id,
    full_name: request.full_name,
    phone: normalizePhone(request.phone),
    national_id: request.national_id,
    fal_license: request.fal_license,
    marketing_zone: request.marketing_zone,
    password_hash: null,
    must_set_password: true,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return data;
}

async function setPassword(id, password) {
  const password_hash = hashPassword(password);
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({
      password_hash,
      must_set_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function verifyLogin(phone, password) {
  const marketer = await findByPhone(phone);
  if (!marketer || marketer.status !== 'active') return { ok: false, reason: 'not_found' };
  if (marketer.must_set_password || !marketer.password_hash) {
    return { ok: false, reason: 'needs_password', marketer };
  }
  if (!verifyPassword(password, marketer.password_hash)) {
    return { ok: false, reason: 'bad_password' };
  }
  return { ok: true, marketer };
}

async function setupFirstPassword(phone, nationalId, password) {
  const marketer = await findByPhone(phone);
  if (!marketer || marketer.status !== 'active') throw new Error('الحساب غير موجود');
  if (String(marketer.national_id).trim() !== String(nationalId).trim()) {
    throw new Error('رقم الهوية غير متطابق');
  }
  if (!marketer.must_set_password && marketer.password_hash) {
    throw new Error('كلمة المرور مُنشأة مسبقاً — استخدم تسجيل الدخول');
  }
  return setPassword(marketer.id, password);
}

async function setStatus(id, status) {
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function toPublic(marketer) {
  if (!marketer) return null;
  return {
    id: marketer.id,
    fullName: marketer.full_name,
    phone: marketer.phone,
    marketingZone: marketer.marketing_zone,
    mustSetPassword: marketer.must_set_password,
    status: marketer.status,
  };
}

module.exports = {
  findByPhone,
  getById,
  listAll,
  createFromJoinRequest,
  setPassword,
  verifyLogin,
  setupFirstPassword,
  setStatus,
  toPublic,
};
