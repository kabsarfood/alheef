const { getAdmin, isEnabled } = require('../lib/supabase');

const TABLE = 'push_subscriptions';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    role: row.role,
    userId: row.user_id,
    marketerId: row.marketer_id,
    clientKey: row.client_key,
    email: row.email,
    preferences: row.preferences || {},
    offersEnabled: row.offers_enabled,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function subscriptionKeys(sub) {
  const keys = sub.keys || sub;
  return {
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  };
}

async function upsert({ subscription, role, userId, marketerId, clientKey, email, preferences, offersEnabled, privateOffersEnabled }) {
  if (!isEnabled()) throw new Error('قاعدة البيانات غير متصلة');
  const { endpoint, p256dh, auth } = subscriptionKeys(subscription);
  if (!endpoint || !p256dh || !auth) throw new Error('بيانات الاشتراك غير مكتملة');

  const mergedPreferences = {
    ...(preferences && typeof preferences === 'object' ? preferences : {}),
    listings: !!offersEnabled,
    privateOffers: !!privateOffersEnabled,
  };

  const row = {
    endpoint,
    p256dh,
    auth,
    role: role || 'client',
    user_id: userId || null,
    marketer_id: marketerId || null,
    client_key: clientKey || null,
    email: email ? email.trim().toLowerCase() : null,
    preferences: mergedPreferences,
    offers_enabled: !!offersEnabled,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getAdmin()
    .from(TABLE)
    .upsert(row, { onConflict: 'endpoint' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

async function deactivate(endpoint) {
  if (!isEnabled() || !endpoint) return;
  await getAdmin()
    .from(TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('endpoint', endpoint);
}

async function deactivateByClientKey(clientKey) {
  if (!isEnabled() || !clientKey) return;
  await getAdmin()
    .from(TABLE)
    .update({ is_active: false, offers_enabled: false, updated_at: new Date().toISOString() })
    .eq('client_key', clientKey)
    .eq('role', 'client');
}

async function listByRole(role) {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('role', role)
    .eq('is_active', true);
  if (error) return [];
  return (data || []).map(mapRow);
}

async function listByMarketerId(marketerId) {
  if (!isEnabled() || !marketerId) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('marketer_id', marketerId)
    .eq('is_active', true);
  if (error) return [];
  return (data || []).map(mapRow);
}

async function listOfferSubscribers() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('role', 'client')
    .eq('is_active', true)
    .eq('offers_enabled', true);
  if (error) return [];
  return (data || []).map(mapRow);
}

async function listPrivateOfferSubscribers() {
  if (!isEnabled()) return [];
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('role', 'client')
    .eq('is_active', true);
  if (error) return [];
  return (data || [])
    .filter((row) => row.preferences && row.preferences.privateOffers === true)
    .map(mapRow);
}

async function mergeSubscriptionPreferences(endpoint, patch = {}) {
  if (!isEnabled() || !endpoint) return null;
  const { data: existing } = await getAdmin()
    .from(TABLE)
    .select('*')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (!existing) return null;
  const prefs = { ...(existing.preferences || {}), ...patch };
  const offersEnabled = patch.listings != null ? !!patch.listings : !!existing.offers_enabled;
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({
      preferences: prefs,
      offers_enabled: offersEnabled,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('endpoint', endpoint)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
}

module.exports = {
  upsert,
  deactivate,
  deactivateByClientKey,
  listByRole,
  listByMarketerId,
  listOfferSubscribers,
  listPrivateOfferSubscribers,
  mergeSubscriptionPreferences,
  mapRow,
};
