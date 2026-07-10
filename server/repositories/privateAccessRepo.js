const crypto = require('crypto');
const { getAdmin, isEnabled } = require('../lib/supabase');
const { rowToPrivateAccess } = require('../services/mappers');
const { hashPassword } = require('../utils/password');
const { generatePrivateSlug } = require('../utils/privateOffersPath');

const ACCESS_TABLE = 'private_offers_access';
const ACCESS_ID = 'main';

function generateSlug() {
  return generatePrivateSlug();
}

function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

async function ensureAccessConfig() {
  if (!isEnabled()) return null;
  const { data } = await getAdmin().from(ACCESS_TABLE).select('*').eq('id', ACCESS_ID).maybeSingle();
  if (data) return rowToPrivateAccess(data);

  const slug = generateSlug();
  const row = {
    id: ACCESS_ID,
    page_slug: slug,
    access_code_hash: null,
    active: true,
  };
  const { data: created, error } = await getAdmin().from(ACCESS_TABLE).insert(row).select().single();
  if (error) throw new Error(error.message);
  return rowToPrivateAccess(created);
}

async function getAccessConfig() {
  if (!isEnabled()) return null;
  const { data } = await getAdmin().from(ACCESS_TABLE).select('*').eq('id', ACCESS_ID).maybeSingle();
  if (!data) return ensureAccessConfig();
  return rowToPrivateAccess(data);
}

async function getAccessBySlug(slug) {
  if (!isEnabled() || !slug) return null;
  const { data } = await getAdmin()
    .from(ACCESS_TABLE)
    .select('*')
    .eq('page_slug', slug)
    .eq('active', true)
    .maybeSingle();
  return rowToPrivateAccess(data);
}

async function updateAccessCode(newCode) {
  const code = String(newCode || '').trim();
  if (code.length < 4) throw new Error('رمز الدخول يجب أن يكون 4 أحرف على الأقل');
  await ensureAccessConfig();
  const { data, error } = await getAdmin()
    .from(ACCESS_TABLE)
    .update({
      access_code_hash: hashPassword(code),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ACCESS_ID)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateAccess(data);
}

async function regenerateAccessCode() {
  const plainCode = generateAccessCode();
  await ensureAccessConfig();
  const { data, error } = await getAdmin()
    .from(ACCESS_TABLE)
    .update({
      access_code_hash: hashPassword(plainCode),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ACCESS_ID)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const access = rowToPrivateAccess(data);
  access.plainCode = plainCode;
  return access;
}

async function regenerateSlug() {
  await ensureAccessConfig();
  const slug = generateSlug();
  const { data, error } = await getAdmin()
    .from(ACCESS_TABLE)
    .update({
      page_slug: slug,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ACCESS_ID)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateAccess(data);
}

async function setAccessActive(active) {
  await ensureAccessConfig();
  const { data, error } = await getAdmin()
    .from(ACCESS_TABLE)
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq('id', ACCESS_ID)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPrivateAccess(data);
}

module.exports = {
  generateSlug,
  generateAccessCode,
  ensureAccessConfig,
  getAccessConfig,
  getAccessBySlug,
  updateAccessCode,
  regenerateAccessCode,
  regenerateSlug,
  setAccessActive,
};
