const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

let supabaseAdmin = null;
let supabasePublic = null;
let enabled = false;

function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[Supabase] ⚠ SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY غير معرّف — وضع fallback');
    enabled = false;
    return false;
  }

  try {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (SUPABASE_ANON_KEY) {
      supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      console.log('[Supabase] ✓ عميل anon جاهز (للقراءة العامة الاختيارية)');
    } else {
      console.warn('[Supabase] ⚠ SUPABASE_ANON_KEY غير معرّف — القراءة العامة عبر admin فقط');
    }

    enabled = true;
    console.log('[Supabase] ✓ عميل admin جاهز');
    return true;
  } catch (err) {
    console.error('[Supabase] ✗ فشل التهيئة:', err.message);
    enabled = false;
    return false;
  }
}

function isEnabled() {
  return enabled;
}

function getAdmin() {
  if (!enabled || !supabaseAdmin) {
    throw new Error('Supabase غير متصل');
  }
  return supabaseAdmin;
}

function getPublic() {
  if (supabasePublic) return supabasePublic;
  return getAdmin();
}

async function ping() {
  if (!enabled) return { ok: false, reason: 'not_configured' };
  try {
    const { error } = await getAdmin().from('settings').select('id').limit(1);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  initSupabase,
  isEnabled,
  getAdmin,
  getPublic,
  ping,
  SUPABASE_URL,
};
