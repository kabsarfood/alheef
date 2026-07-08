const { getAdmin, isEnabled } = require('../lib/supabase');
const { hashPassword, verifyPassword } = require('../utils/password');
const { normalizePhone } = require('../utils/marketerZones');
const { normalizeEmail, isValidEmail } = require('../utils/email');

const TABLE = 'marketer_join_requests';

function validateZone(zone) {
  const { MARKETING_ZONES } = require('../utils/marketerZones');
  return Object.prototype.hasOwnProperty.call(MARKETING_ZONES, zone);
}

async function assertUniqueContact({ phone, email, excludeRequestId } = {}) {
  let qPhone = getAdmin().from(TABLE).select('id').eq('phone', phone).eq('status', 'pending');
  if (excludeRequestId) qPhone = qPhone.neq('id', excludeRequestId);
  const { data: pendingPhone } = await qPhone.maybeSingle();
  if (pendingPhone) throw new Error('لديك طلب قيد المراجعة بهذا الرقم');

  let qEmail = getAdmin().from(TABLE).select('id').ilike('email', email).eq('status', 'pending');
  if (excludeRequestId) qEmail = qEmail.neq('id', excludeRequestId);
  const { data: pendingEmail } = await qEmail.maybeSingle();
  if (pendingEmail) throw new Error('لديك طلب قيد المراجعة بهذا البريد');

  const { data: marketerPhone } = await getAdmin().from('marketers').select('id').eq('phone', phone).maybeSingle();
  if (marketerPhone) throw new Error('رقم الجوال مسجّل مسبقاً');

  const { data: marketerEmail } = await getAdmin().from('marketers').select('id').ilike('email', email).maybeSingle();
  if (marketerEmail) throw new Error('البريد الإلكتروني مسجّل مسبقاً');
}

async function createRequest(body) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');

  const phone = normalizePhone(body.phone);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || body.confirm_password || '');

  const row = {
    full_name: String(body.fullName || body.full_name || '').trim(),
    phone,
    email,
    national_id: String(body.nationalId || body.national_id || '').trim(),
    fal_license: String(body.falLicense || body.fal_license || '').trim(),
    marketing_zone: body.marketingZone || body.marketing_zone,
    status: 'pending',
    updated_at: new Date().toISOString(),
  };

  if (!row.full_name || !phone || !email || !row.national_id || !row.fal_license) {
    throw new Error('أكمل جميع الحقول المطلوبة');
  }
  if (!isValidEmail(email)) throw new Error('أدخل بريداً إلكترونياً صالحاً');
  if (!validateZone(row.marketing_zone)) throw new Error('اختر نطاق التسويق');
  if (!password || password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
  if (password !== confirmPassword) throw new Error('كلمتا المرور غير متطابقتين');

  await assertUniqueContact({ phone, email });
  row.password_hash = hashPassword(password);

  const { data, error } = await getAdmin().from(TABLE).insert(row).select().single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      if (/phone/i.test(error.message)) throw new Error('رقم الجوال مسجّل مسبقاً');
      if (/email/i.test(error.message)) throw new Error('البريد الإلكتروني مسجّل مسبقاً');
    }
    if (/does not exist|schema cache/i.test(error.message)) {
      throw new Error('نظام طلبات الانضمام غير مهيأ بعد — تواصل مع إدارة المكتب');
    }
    throw new Error(error.message);
  }
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
