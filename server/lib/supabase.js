const { createClient } = require('@supabase/supabase-js');

let supabaseAdmin = null;
let supabasePublic = null;
let enabled = false;
let lastUrl = '';

function readEnv() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim().replace(/\/$/, '');

  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    ''
  ).trim();

  const anonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return { url, serviceKey, anonKey };
}

function initSupabase() {
  const { url, serviceKey, anonKey } = readEnv();
  lastUrl = url;

  if (!url || !serviceKey) {
    enabled = false;
    supabaseAdmin = null;
    supabasePublic = null;
    if (!url) {
      console.warn('[Supabase] ⚠ SUPABASE_URL غير معرّف');
    } else {
      console.warn('[Supabase] ⚠ SUPABASE_SERVICE_ROLE_KEY غير معرّف');
    }
    return false;
  }

  try {
    const { retryFetch } = require('./retryFetch');
    const clientOptions = {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: retryFetch },
    };

    supabaseAdmin = createClient(url, serviceKey, clientOptions);

    if (anonKey) {
      supabasePublic = createClient(url, anonKey, clientOptions);
    } else {
      supabasePublic = null;
    }

    enabled = true;
    console.log('[Supabase] ✓ متصل —', url);
    return true;
  } catch (err) {
    console.error('[Supabase] ✗ فشل التهيئة:', err.message);
    enabled = false;
    return false;
  }
}

function isEnabled() {
  if (!enabled) initSupabase();
  return enabled;
}

function getAdmin() {
  if (!isEnabled() || !supabaseAdmin) {
    const { url, serviceKey } = readEnv();
    if (!url || !serviceKey) {
      throw new Error(
        'قاعدة البيانات غير متصلة — أضف SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في Railway (Variables) ثم Redeploy'
      );
    }
    throw new Error('Supabase غير متصل — تحقق من مفتاح service_role وأعد نشر المشروع');
  }
  return supabaseAdmin;
}

function getPublic() {
  if (supabasePublic) return supabasePublic;
  return getAdmin();
}

async function ping() {
  if (!isEnabled()) {
    const { url, serviceKey } = readEnv();
    if (!url && !serviceKey) return { ok: false, reason: 'missing_env' };
    if (!url) return { ok: false, reason: 'missing_supabase_url' };
    if (!serviceKey) return { ok: false, reason: 'missing_service_role_key' };
    return { ok: false, reason: 'not_initialized' };
  }
  try {
    const { error } = await getAdmin().from('settings').select('id').limit(1);
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return { ok: false, reason: 'schema_missing', hint: 'نفّذ supabase/schema.sql في SQL Editor' };
      }
      return { ok: false, reason: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function getStatus() {
  const { url, serviceKey, anonKey } = readEnv();
  return {
    configured: !!(url && serviceKey),
    enabled: isEnabled(),
    url: url || null,
    hasAnonKey: !!anonKey,
  };
}

module.exports = {
  initSupabase,
  isEnabled,
  getAdmin,
  getPublic,
  ping,
  getStatus,
  get SUPABASE_URL() {
    return readEnv().url || lastUrl;
  },
};
