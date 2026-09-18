/**
 * جهات اتصال مركزية — مستقلة عن صلاحيات الدخول (app_user_roles).
 * الجوال المطبّع = مفتاح فريد؛ الصفات والمصادر تراكمية.
 */
const { getAdmin, isEnabled } = require('../lib/supabase');
const {
  normalizeAccountPhone,
  isValidSaudiMobile,
  toE164,
} = require('../utils/phone');

const CONTACTS = 'contacts';
const ROLES = 'contact_business_roles';
const SOURCES = 'contact_sources';

const BUSINESS_ROLES = new Set([
  'landlord',
  'tenant',
  'broker',
  'marketer',
  'client',
  'staff',
  'private_client',
  'inquirer',
  'owner',
]);

const SOURCES_SET = new Set([
  'ejar_contract',
  'private_offer',
  'marketer',
  'property_inquiry',
  'manual_import',
  'website',
  'whatsapp',
  'otp_verify',
  'admin',
]);

function isContactsSchemaError(message) {
  return /contacts|contact_business_roles|contact_sources|schema cache|does not exist|Could not find/i.test(
    String(message || '')
  );
}

function displayFromNormalized(normalized) {
  return toE164(normalized) || normalized;
}

async function findByPhone(phone) {
  if (!isEnabled()) return null;
  const normalized = normalizeAccountPhone(phone);
  if (!normalized) return null;
  const { data, error } = await getAdmin()
    .from(CONTACTS)
    .select('*')
    .eq('phone_normalized', normalized)
    .maybeSingle();
  if (error) {
    if (isContactsSchemaError(error.message)) return null;
    throw new Error(error.message);
  }
  return data || null;
}

async function addBusinessRole(contactId, role) {
  if (!BUSINESS_ROLES.has(role)) return;
  const now = new Date().toISOString();
  const { data: existing } = await getAdmin()
    .from(ROLES)
    .select('contact_id')
    .eq('contact_id', contactId)
    .eq('role', role)
    .maybeSingle();
  if (existing) {
    await getAdmin()
      .from(ROLES)
      .update({ last_seen_at: now })
      .eq('contact_id', contactId)
      .eq('role', role);
    return;
  }
  const { error } = await getAdmin().from(ROLES).insert({
    contact_id: contactId,
    role,
    first_seen_at: now,
    last_seen_at: now,
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    if (isContactsSchemaError(error.message)) return;
    throw new Error(error.message);
  }
}

async function addSource(contactId, source, sourceRef = null, meta = {}) {
  if (!SOURCES_SET.has(source)) return;
  const ref = sourceRef ? String(sourceRef).slice(0, 120) : null;
  const now = new Date().toISOString();

  let q = getAdmin()
    .from(SOURCES)
    .select('id')
    .eq('contact_id', contactId)
    .eq('source', source);
  q = ref == null ? q.is('source_ref', null) : q.eq('source_ref', ref);
  const { data: existing } = await q.maybeSingle();

  if (existing?.id) {
    await getAdmin()
      .from(SOURCES)
      .update({
        seen_at: now,
        meta: meta && typeof meta === 'object' ? meta : {},
      })
      .eq('id', existing.id);
    return;
  }

  const { error } = await getAdmin().from(SOURCES).insert({
    contact_id: contactId,
    source,
    source_ref: ref,
    meta: meta && typeof meta === 'object' ? meta : {},
    seen_at: now,
  });
  if (error) {
    if (isContactsSchemaError(error.message) || /duplicate|unique/i.test(error.message)) return;
    console.warn('[contacts] source:', error.message);
  }
}

/**
 * إيجاد أو إنشاء جهة اتصال بالجوال المطبّع (بدون تكرار).
 */
async function upsertContact({
  phone,
  name = null,
  businessRole = null,
  businessRoles = [],
  source = null,
  sourceRef = null,
  sourceMeta = {},
  appUserId = null,
} = {}) {
  const normalized = normalizeAccountPhone(phone);
  if (!isValidSaudiMobile(normalized)) {
    return { ok: false, reason: 'bad_phone' };
  }
  if (!isEnabled()) {
    return { ok: false, reason: 'db_unavailable', phone: normalized };
  }

  const now = new Date().toISOString();
  let contact = await findByPhone(normalized);
  let created = false;

  if (!contact) {
    const row = {
      phone_normalized: normalized,
      phone_display: displayFromNormalized(normalized),
      name: name ? String(name).trim().slice(0, 120) || null : null,
      first_seen_at: now,
      last_seen_at: now,
      created_at: now,
      updated_at: now,
      marketing_status: 'unknown',
      do_not_contact: false,
      tags: [],
    };
    if (appUserId) row.app_user_id = appUserId;

    const { data, error } = await getAdmin().from(CONTACTS).insert(row).select().single();
    if (error) {
      if (isContactsSchemaError(error.message)) {
        return { ok: false, reason: 'schema_missing', phone: normalized };
      }
      if (/duplicate|unique/i.test(error.message)) {
        contact = await findByPhone(normalized);
      } else {
        throw new Error(error.message);
      }
    } else {
      contact = data;
      created = true;
    }
  }

  if (!contact) {
    return { ok: false, reason: 'not_found', phone: normalized };
  }

  const patch = {
    last_seen_at: now,
    updated_at: now,
  };
  if (name && String(name).trim()) {
    const trimmed = String(name).trim().slice(0, 120);
    if (!contact.name) patch.name = trimmed;
  }
  if (appUserId && !contact.app_user_id) {
    patch.app_user_id = appUserId;
  }
  if (!contact.phone_display) {
    patch.phone_display = displayFromNormalized(normalized);
  }

  const { data: updated, error: updErr } = await getAdmin()
    .from(CONTACTS)
    .update(patch)
    .eq('id', contact.id)
    .select()
    .single();
  if (updErr && !isContactsSchemaError(updErr.message)) {
    console.warn('[contacts] update:', updErr.message);
  } else if (updated) {
    contact = updated;
  }

  const roles = [];
  if (businessRole) roles.push(businessRole);
  for (const r of businessRoles) roles.push(r);
  for (const role of roles) {
    await addBusinessRole(contact.id, role);
  }

  if (source) {
    await addSource(contact.id, source, sourceRef, sourceMeta);
  }

  return { ok: true, created, contact, phone: normalized };
}

/**
 * ربط جهة اتصال بحساب دخول إن وُجد / أُنشئ لاحقاً.
 */
async function linkAppUser(phoneOrContactId, appUserId) {
  if (!isEnabled() || !appUserId) return { ok: false };
  let contact = null;
  if (/^[0-9a-f-]{36}$/i.test(String(phoneOrContactId || ''))) {
    const { data } = await getAdmin().from(CONTACTS).select('*').eq('id', phoneOrContactId).maybeSingle();
    contact = data;
  } else {
    contact = await findByPhone(phoneOrContactId);
  }
  if (!contact) return { ok: false, reason: 'not_found' };

  await getAdmin()
    .from(CONTACTS)
    .update({
      app_user_id: appUserId,
      updated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
    .eq('id', contact.id);

  try {
    await getAdmin()
      .from('app_users')
      .update({ contact_id: contact.id, updated_at: new Date().toISOString() })
      .eq('id', appUserId);
  } catch {
    /* عمود contact_id قد لا يكون جاهزاً بعد */
  }

  return { ok: true, contactId: contact.id, appUserId };
}

/**
 * حفظ أطراف عقد إيجار كجهات اتصال (بدون إنشاء حسابات دخول).
 */
function submitterBusinessRole(data) {
  const raw = String(data.submitterRelation || data.submitterRole || '').trim().toLowerCase();
  if (raw === 'landlord' || raw.includes('مؤجر')) return 'landlord';
  if (raw === 'tenant' || raw.includes('مستأجر')) return 'tenant';
  if (raw === 'broker' || raw.includes('وسيط') || raw.includes('وكيل') || raw.includes('ابن') || raw.includes('ابنة')) {
    return 'broker';
  }
  return 'broker';
}

async function ingestEjarContractParties(data, requestId) {
  const parties = [
    { phone: data.ownerPhone, name: data.ownerName, role: 'landlord' },
    { phone: data.tenantPhone, name: data.tenantName, role: 'tenant' },
    {
      phone: data.submitterPhone,
      name: data.submitterName,
      role: submitterBusinessRole(data),
    },
    { phone: data.subtenantPhone, name: data.subtenantName, role: 'tenant' },
    { phone: data.subleasePhone, name: data.subleaseName || data.subleaseRepName, role: 'landlord' },
  ];

  const results = [];
  for (const p of parties) {
    if (!isValidSaudiMobile(p.phone)) continue;
    const r = await upsertContact({
      phone: p.phone,
      name: p.name,
      businessRole: p.role,
      source: 'ejar_contract',
      sourceRef: requestId || data.referenceNo || null,
      sourceMeta: {
        contractType: data.contractType || null,
        party: p.role,
      },
    });
    results.push(r);
  }
  return results;
}

module.exports = {
  BUSINESS_ROLES,
  SOURCES_SET,
  findByPhone,
  upsertContact,
  linkAppUser,
  addBusinessRole,
  addSource,
  ingestEjarContractParties,
  isContactsSchemaError,
};
