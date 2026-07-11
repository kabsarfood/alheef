const crypto = require('crypto');
const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToPrivateClient } = require('../services/mappers');
const { hashPassword } = require('../utils/password');
const { generatePrivateSlug } = require('../utils/privateOffersPath');

const SETTINGS_TABLE = 'private_offers_settings';
const CLIENTS_TABLE = 'private_client_access';
const SETTINGS_ID = 'main';

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

async function createClient({ clientLabel } = {}) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  await ensureSettings();
  const plainCode = generateAccessCode();
  const row = {
    client_label: String(clientLabel || '').trim() || 'عميل',
    page_slug: generatePrivateSlug(),
    access_code_hash: hashPassword(plainCode),
    active: true,
  };
  const { data, error } = await getAdmin().from(CLIENTS_TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  const client = rowToPrivateClient(data);
  client.plainCode = plainCode;
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
  const client = rowToPrivateClient(data);
  client.plainCode = code;
  return client;
}

async function regenerateClientAccess(id) {
  const plainCode = generateAccessCode();
  const slug = generatePrivateSlug();
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      page_slug: slug,
      access_code_hash: hashPassword(plainCode),
      active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const client = rowToPrivateClient(data);
  client.plainCode = plainCode;
  return client;
}

async function setClientActive(id, active) {
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateClient(data);
}

async function updateClientLabel(id, clientLabel) {
  const { data, error } = await getAdmin()
    .from(CLIENTS_TABLE)
    .update({
      client_label: String(clientLabel || '').trim() || 'عميل',
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
  getClientBySlug,
  getClientBySlugAny,
  getClientCodeHash,
  createClient,
  updateClientCode,
  regenerateClientAccess,
  setClientActive,
  updateClientLabel,
  recordClientLogin,
  getClientsVisitSummary,
};
