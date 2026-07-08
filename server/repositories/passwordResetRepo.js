const crypto = require('crypto');
const { getAdmin, isEnabled } = require('../lib/supabase');

const TABLE = 'marketer_password_reset_tokens';
const TTL_MS = 15 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function invalidateForMarketer(marketerId) {
  if (!isEnabled() || !marketerId) return;
  await getAdmin()
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('marketer_id', marketerId)
    .is('used_at', null);
}

async function createToken(marketerId) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  await invalidateForMarketer(marketerId);

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { error } = await getAdmin().from(TABLE).insert({
    marketer_id: marketerId,
    token_hash: hashToken(rawToken),
    expires_at: expiresAt,
  });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      throw new Error('نظام استعادة كلمة المرور غير مهيأ بعد');
    }
    throw new Error(error.message);
  }
  return { token: rawToken, expiresAt };
}

async function findValidToken(rawToken) {
  if (!isEnabled() || !rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('id, marketer_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

async function markUsed(id) {
  if (!isEnabled() || !id) return;
  await getAdmin()
    .from(TABLE)
    .update({ used_at: new Date().toISOString() })
    .eq('id', id);
}

module.exports = {
  createToken,
  findValidToken,
  markUsed,
  TTL_MS,
};
