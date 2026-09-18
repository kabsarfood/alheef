/**
 * حسابات المنصة: الجوال = الهوية، الأدوار = صلاحيات منفصلة.
 * إنشاء الحساب فقط بعد نجاح OTP (ليس عند الإرسال).
 */
const { getAdmin, isEnabled } = require('../lib/supabase');
const {
  normalizeAccountPhone,
  isValidSaudiMobile,
  toE164,
} = require('../utils/phone');

const USERS_TABLE = 'app_users';
const ROLES_TABLE = 'app_user_roles';
const VALID_ROLES = new Set(['client', 'marketer', 'staff', 'admin']);

function isUsersSchemaReadyError(message) {
  return /app_users|schema cache|does not exist|Could not find/i.test(String(message || ''));
}

async function findByPhone(phone) {
  if (!isEnabled()) return null;
  const normalized = normalizeAccountPhone(phone);
  if (!normalized) return null;
  const { data, error } = await getAdmin()
    .from(USERS_TABLE)
    .select('*')
    .eq('phone', normalized)
    .maybeSingle();
  if (error) {
    if (isUsersSchemaReadyError(error.message)) return null;
    throw new Error(error.message);
  }
  return data || null;
}

async function getRoles(userId) {
  if (!isEnabled() || !userId) return [];
  const { data, error } = await getAdmin()
    .from(ROLES_TABLE)
    .select('role')
    .eq('user_id', userId);
  if (error) {
    if (isUsersSchemaReadyError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((r) => r.role);
}

async function addRole(userId, role) {
  if (!VALID_ROLES.has(role)) throw new Error('دور غير صالح');
  const { error } = await getAdmin()
    .from(ROLES_TABLE)
    .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });
  if (error) throw new Error(error.message);
}

/**
 * بعد نجاح OTP فقط: إيجاد الحساب أو إنشاء client افتراضي.
 * @param {object} opts
 * @param {string} opts.phone
 * @param {string[]} [opts.ensureRoles] - أدوار تُضاف إن لم تكن موجودة (مثل marketer بعد دخول مسوق)
 * @param {boolean} [opts.createIfMissing=true]
 * @param {string} [opts.defaultRole='client'] - عند الإنشاء الجديد فقط
 */
async function ensureUserAfterOtpVerify({
  phone,
  ensureRoles = [],
  createIfMissing = true,
  defaultRole = 'client',
} = {}) {
  const normalized = normalizeAccountPhone(phone);
  if (!isValidSaudiMobile(normalized)) {
    return { ok: false, reason: 'bad_phone' };
  }
  if (!isEnabled()) {
    return { ok: false, reason: 'db_unavailable', phone: normalized };
  }

  let user = await findByPhone(normalized);
  let created = false;

  if (!user && createIfMissing) {
    if (!VALID_ROLES.has(defaultRole)) {
      return { ok: false, reason: 'bad_role' };
    }
    const row = {
      phone: normalized,
      phone_e164: toE164(normalized),
      status: 'active',
      last_login_at: new Date().toISOString(),
    };
    const { data, error } = await getAdmin()
      .from(USERS_TABLE)
      .insert(row)
      .select()
      .single();
    if (error) {
      if (isUsersSchemaReadyError(error.message)) {
        return { ok: false, reason: 'schema_missing', phone: normalized };
      }
      // سباق فريد: أعد القراءة
      if (/duplicate|unique/i.test(error.message)) {
        user = await findByPhone(normalized);
      } else {
        throw new Error(error.message);
      }
    } else {
      user = data;
      created = true;
      try {
        await addRole(user.id, defaultRole);
      } catch (err) {
        if (!isUsersSchemaReadyError(err.message)) throw err;
      }
    }
  }

  if (!user) {
    return { ok: false, reason: 'not_found', phone: normalized };
  }

  await getAdmin()
    .from(USERS_TABLE)
    .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', user.id);

  for (const role of ensureRoles) {
    if (!VALID_ROLES.has(role)) continue;
    try {
      await addRole(user.id, role);
    } catch (err) {
      if (!isUsersSchemaReadyError(err.message)) throw err;
    }
  }

  const roles = await getRoles(user.id);

  // ربط/إنشاء جهة اتصال — منفصلة عن صلاحيات الحساب
  try {
    const contactsRepo = require('./contactsRepo');
    const businessRoles = [];
    if (ensureRoles.includes('marketer') || defaultRole === 'marketer') {
      businessRoles.push('marketer');
    } else if (ensureRoles.includes('staff') || defaultRole === 'staff') {
      businessRoles.push('staff');
    } else if (!(ensureRoles.includes('admin') || defaultRole === 'admin')) {
      businessRoles.push('client');
    }
    const contactResult = await contactsRepo.upsertContact({
      phone: normalized,
      businessRoles,
      source: 'otp_verify',
      sourceRef: user.id,
      appUserId: user.id,
    });
    if (contactResult.ok && contactResult.contact?.id) {
      await contactsRepo.linkAppUser(contactResult.contact.id, user.id);
    }
  } catch (err) {
    console.warn('[contacts] link after otp:', err.message);
  }

  return {
    ok: true,
    created,
    user,
    roles,
    phone: normalized,
  };
}

function hasRole(roles, role) {
  return Array.isArray(roles) && roles.includes(role);
}

module.exports = {
  VALID_ROLES,
  findByPhone,
  getRoles,
  addRole,
  ensureUserAfterOtpVerify,
  hasRole,
};
