const crypto = require('crypto');
const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToPrivateClient } = require('../services/mappers');
const { hashPassword } = require('../utils/password');
const { generatePrivateSlug } = require('../utils/privateOffersPath');
const { normalizeAccountPhone, phonesEqual } = require('../utils/phone');

const SETTINGS_TABLE = 'private_offers_settings';
const CLIENTS_TABLE = 'private_client_access';
const SETTINGS_ID = 'main';

// access_code_hash حقل قديم غير مستخدم في الدخول.
// الدخول يتم برقم واتساب والجهاز المعتمد فقط. تُحفظ البصمة حتى لا يُحذف العمود، ولا يُعاد النص إلى الواجهة.
// access_code_hash حقل legacy غير مستخدم في الدخول. التحقق يتم عبر واتساب والجهاز فقط.
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function ensureSettings() {
  if (!isEnabled()) return null;
  const { data } = await getAdmin().from(SETTINGS_TABLE).select('*').eq('id', SETTINGS_ID).maybeSingle();
  if (data) return data;
  const { data: created, error } = await getAdmin()
    .from(SETTINGS_TABLE)
    .insert({ id: SETTINGS_ID, active: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created;
}

async function getSettings() {
  const row = await ensureSettings();
  if (!row) return { active: true };
  return { active: row.active !== false, updatedAt: row.updated_at };
}

async function setGlobalActive(active) {
  await ensureSettings();
  const { data, error } = await getAdmin()
    .from(SETTINGS_TABLE)
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq('id', SETTINGS_ID)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { active: data.active !== false, updatedAt: data.updated_at };
}

async function isGlobalActive() {
  const s = await getSettings();
  return s.active !== false;
}

async function listClients() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrivateClient);
}

async function findActiveClientByPhone(phone) {
  if (!isEnabled()) return null;
  const { data, error } = await getAdmin().from(CLIENTS_TABLE).select('*').eq('active', true);
  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrivateClient).find((row) => phonesEqual(row.phone, phone) && row.deviceStatus === 'active') || null;
}

/** عميل وافق عليه الأدمن وما زال نشطًا. الجهاز غير الملغى يكفي لباب المستخدم. */
async function findPortalClientByPhone(phone) {
  if (!isEnabled()) return null;
  const { data, error } = await getAdmin().from(CLIENTS_TABLE).select('*').eq('active', true);
  if (error) throw new Error(error.message);
  return (data || []).map(rowToPrivateClient).find((row) => phonesEqual(row.phone, phone) && row.deviceStatus !== 'revoked') || null;
}

async function getClientById(id) {
  if (!isEnabled() || !id) return null;
  const { data } = await getAdmin().from(CLIENTS_TABLE).select('*').eq('id', id).maybeSingle();
  return rowToPrivateClient(data);
}

async function getClientBySlug(slug) {
  if (!isEnabled() || !slug) return null;
  const { data } = await getAdmin()
    .from(CLIENTS_TABLE)
    .select('*')
    .eq('page_slug', slug)
    .eq('active', true)
    .maybeSingle();
  return rowToPrivateClient(data);
}

async function getClientBySlugAny(slug) {
  if (!isEnabled() || !slug) return null;
  const { data } = await getAdmin()
    .from(CLIENTS_TABLE)
    .select('*')
    .eq('page_slug', slug)
    .maybeSingle();
  return rowToPrivateClient(data);
}

async function getClientCodeHash(slug) {
  if (!isEnabled() || !slug) return null;
  const { data } = await getAdmin()
    .from(CLIENTS_TABLE)
    .select('access_code_hash')
    .eq('page_slug', slug)
    .maybeSingle();
  return data?.access_code_hash || null;
}

function normalizeClientFields({
  clientLabel,
  phone,
  requestType,
  propertyKind,
  requiredArea,
} = {}) {
  const kind = ['land', 'villa', 'building'].includes(propertyKind) ? propertyKind : 'land';
  const areaRaw = requiredArea;
  const area = areaRaw != null && areaRaw !== '' ? Number(areaRaw) : null;
  return {
    client_label: String(clientLabel || '').trim() || 'عميل',
    phone: normalizeAccountPhone(phone) || String(phone || '').trim(),
    request_type: requestType === 'rent' ? 'rent' : 'buy',
    property_kind: kind,
    required_area: Number.isFinite(area) && area > 0 ? area : null,
  };
}

function formatClientDbError(error) {
  const msg = String(error?.message || error || '');
  const { isSchemaCacheColumnError } = require('../lib/sqlMigrations');
  if (isSchemaCacheColumnError(msg)) {
    return 'قاعدة البيانات تحتاج تحديثاً لحقول العميل (الجوال، نوع الطلب…). أضف SUPABASE_DB_PASSWORD في Railway وأعد النشر، أو نفّذ migration 011 في Supabase SQL Editor.';
  }
  return msg;
}

async function ensureClientFieldsSchema() {
  const { ensurePrivateClientRequestFields } = require('../lib/sqlMigrations');
  const result = await ensurePrivateClientRequestFields();
  if (!result.ready) {
    const err = new Error(result.message);
    err.hint = result.hint;
    err.statusCode = 503;
    throw err;
  }
  return result;
}

async function insertClientRow(row) {
  return getAdmin().from(CLIENTS_TABLE).insert(row).select().single();
}
async function createClient(fields = {}) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  await ensureSettings();
  await ensureClientFieldsSchema();
  const plainCode = generateAccessCode();
  const row = {
    ...normalizeClientFields(fields),
    page_slug: generatePrivateSlug(),
    access_code_hash: hashPassword(plainCode),
    active: true,
  };
  let { data, error } = await insertClientRow(row);
  if (error && require('../lib/sqlMigrations').isSchemaCacheColumnError(error.message)) {
    await ensureClientFieldsSchema();
    ({ data, error } = await insertClientRow(row));
  }
  if (error) throw new Error(formatClientDbError(error));
  const client = rowToPrivateClient(data);
  try {
    const contactsRepo = require('./contactsRepo');
    if (client.phone) {
      await contactsRepo.upsertContact({
        phone: client.phone,
        name: client.clientLabel,
        businessRole: 'private_client',
        source: 'private_offer',
        sourceRef: client.pageSlug || client.id,
      });
    }
  } catch (err) {
    console.warn('[contacts] private client create:', err.message);
  }
  return client;
}

async function updateClientCode(id, newCode) {
  const code = String(newCode || '').trim();
  if (code.length < 4) throw new Error('رمز الدخول يجب أن يكون 4 أحرف على الأقل');
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      access_code_hash: hashPassword(code),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateClient(data);
}

async function nextEpoch(existing) {
  return (Number(existing?.accessEpoch) || 1) + 1;
}

async function regenerateClientAccess(id) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('العميل غير موجود');
  const plainCode = generateAccessCode();
  const slug = generatePrivateSlug();
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      page_slug: slug,
      access_code_hash: hashPassword(plainCode),
      active: true,
      device_status: 'none',
      device_token_hash: null,
      device_bound_at: null,
      device_last_seen_at: null,
      device_label: null,
      access_epoch: await nextEpoch(existing),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateClient(data);
}

async function setClientActive(id, active) {
  const existing = await getClientById(id);
  const patch = { active: !!active, updated_at: new Date().toISOString() };
  if (!active && existing) patch.access_epoch = await nextEpoch(existing);
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateClient(data);
}

async function updateClientLabel(id, clientLabel) {
  return updateClientDetails(id, { clientLabel });
}

async function updateClientDetails(id, fields = {}) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('العميل غير موجود');
  await ensureClientFieldsSchema();
  const nextPhone = fields.phone != null ? fields.phone : existing.phone;
  const phoneChanged = normalizeAccountPhone(existing.phone) !== normalizeAccountPhone(nextPhone);
  const patch = normalizeClientFields({
    clientLabel: fields.clientLabel != null ? fields.clientLabel : existing.clientLabel,
    phone: fields.phone != null ? fields.phone : existing.phone,
    requestType: fields.requestType != null ? fields.requestType : existing.requestType,
    propertyKind: fields.propertyKind != null ? fields.propertyKind : existing.propertyKind,
    requiredArea: fields.requiredArea !== undefined ? fields.requiredArea : existing.requiredArea,
  });
  const replacementCode = phoneChanged ? generateAccessCode() : '';
  const reset = phoneChanged ? {
    page_slug: generatePrivateSlug(),
    access_code_hash: hashPassword(replacementCode),
    active: true,
    device_status: 'none',
    device_token_hash: null,
    device_bound_at: null,
    device_last_seen_at: null,
    device_label: null,
    access_epoch: await nextEpoch(existing),
  } : {};
  let { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      ...patch,
      ...reset,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error && require('../lib/sqlMigrations').isSchemaCacheColumnError(error.message)) {
    await ensureClientFieldsSchema();
    ({ data, error } = await getAdmin()
      .from(CLIENTS_TABLE)
      .update({
        ...patch,
        ...reset,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single());
  }
  if (error) throw new Error(formatClientDbError(error));
  const client = rowToPrivateClient(data);
  if (phoneChanged) client.accessReset = true;
  try {
    const contactsRepo = require('./contactsRepo');
    if (client.phone) {
      await contactsRepo.upsertContact({
        phone: client.phone,
        name: client.clientLabel,
        businessRole: 'private_client',
        source: 'private_offer',
        sourceRef: client.pageSlug || client.id,
      });
    }
  } catch (err) {
    console.warn('[contacts] private client update:', err.message);
  }
  return client;
}

async function bindClientDevice(id, { tokenHash, label }) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('العميل غير موجود');
  if (existing.deviceStatus === 'active' || existing.deviceStatus === 'revoked') {
    const err = new Error('DEVICE_BOUND');
    err.code = 'DEVICE_BOUND';
    throw err;
  }
  const now = new Date().toISOString();
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      device_status: 'active',
      device_token_hash: tokenHash,
      device_bound_at: now,
      device_last_seen_at: now,
      device_label: label || null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('device_status', 'none')
    .select();
  if (error) throw new Error(error.message);
  if (!data || !data.length) {
    const err = new Error('DEVICE_BOUND');
    err.code = 'DEVICE_BOUND';
    throw err;
  }
  return rowToPrivateClient(data[0]);
}

async function rebindClientDevice(id, { tokenHash, label }) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('العميل غير موجود');
  if (existing.deviceStatus === 'revoked') {
    const err = new Error('DEVICE_BOUND');
    err.code = 'DEVICE_BOUND';
    throw err;
  }
  const now = new Date().toISOString();
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      device_status: 'active',
      device_token_hash: tokenHash,
      device_bound_at: now,
      device_last_seen_at: now,
      device_label: label || null,
      updated_at: now,
    })
    .eq('id', id)
    .select();
  if (error) throw new Error(error.message);
  if (!data || !data.length) throw new Error('العميل غير موجود');
  return rowToPrivateClient(data[0]);
}

async function touchClientDevice(id) {
  const now = new Date().toISOString();
  await getAdmin().from(CLIENTS_TABLE).update({
    device_last_seen_at: now,
    updated_at: now,
  }).eq('id', id);
}

async function noteDeviceAttempt(id, kind) {
  const existing = await getClientById(id);
  if (!existing) return;
  const raw = await getAdmin().from(CLIENTS_TABLE).select('device_attempts').eq('id', id).maybeSingle();
  const attempts = Array.isArray(raw.data?.device_attempts) ? raw.data.device_attempts.slice(-19) : [];
  attempts.push({ at: new Date().toISOString(), kind: String(kind || 'متصفح آخر').slice(0, 40) });
  await getAdmin().from(CLIENTS_TABLE).update({ device_attempts: attempts }).eq('id', id);
}

async function revokeClientDevice(id) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('العميل غير موجود');
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      device_status: 'revoked',
      active: false,
      access_epoch: await nextEpoch(existing),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateClient(data);
}

async function endClientSessions(id) {
  const existing = await getClientById(id);
  if (!existing) throw new Error('العميل غير موجود');
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      access_epoch: await nextEpoch(existing),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateClient(data);
}

async function recordClientLogin(id) {
  if (!isEnabled() || !id) return;
  const client = await getClientById(id);
  if (!client) return;
  await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      login_count: (client.loginCount || 0) + 1,
      visit_count: (client.visitCount || 0) + 1,
      last_visit_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

async function getClientsVisitSummary() {
  const clients = await listClients();
  return {
    totalClients: clients.length,
    activeClients: clients.filter((c) => c.active).length,
    totalLogins: clients.reduce((n, c) => n + (c.loginCount || 0), 0),
    totalVisits: clients.reduce((n, c) => n + (c.visitCount || 0), 0),
  };
}

module.exports = {
  generateAccessCode,
  ensureSettings,
  getSettings,
  setGlobalActive,
  isGlobalActive,
  listClients,
  getClientById,
  findActiveClientByPhone,
  findPortalClientByPhone,
  getClientBySlug,
  getClientBySlugAny,
  getClientCodeHash,
  createClient,
  updateClientCode,
  regenerateClientAccess,
  setClientActive,
  updateClientLabel,
  updateClientDetails,
  recordClientLogin,
  getClientsVisitSummary,
  bindClientDevice,
  rebindClientDevice,
  touchClientDevice,
  noteDeviceAttempt,
  revokeClientDevice,
  endClientSessions,
};
