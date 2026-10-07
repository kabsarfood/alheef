const crypto = require('crypto');
const { isEnabled, getAdmin } = require('../lib/supabase');
const { parseToken } = require('../middleware/auth');

const SCOPE = 'alheef.map.submit';
const ACCESS_TTL_SEC = 60 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
const CODE_TTL_SEC = 5 * 60;
const STABLE_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';

let memory = null;
let cimdLoader = null;

function setCimdLoader(fn) {
  cimdLoader = fn;
}

function useMemoryStore() {
  memory = { clients: new Map(), codes: new Map(), tokens: new Map() };
  return memory;
}

function publicBase() {
  return String(process.env.ALHEEF_PUBLIC_BASE_URL || 'https://www.alheef.website').replace(/\/$/, '');
}

function issuer() {
  return publicBase();
}

function resourceUrl() {
  return `${publicBase()}/api/integrations/alheef-map/mcp`;
}

function metadataUrl() {
  return `${publicBase()}/.well-known/oauth-protected-resource/api/integrations/alheef-map/mcp`;
}

function wwwAuthenticate() {
  return `Bearer resource_metadata="${metadataUrl()}", scope="${SCOPE}"`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function isAllowedRedirect(uri) {
  if (uri === STABLE_REDIRECT) return true;
  try {
    const url = new URL(String(uri || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com') return false;
    if (url.username || url.password || url.search || url.hash) return false;
    return /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/.test(url.pathname);
  } catch {
    return false;
  }
}

function isChatGptClientId(clientId) {
  try {
    const url = new URL(String(clientId || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com') return false;
    if (url.username || url.password || url.search || url.hash) return false;
    return url.pathname === '/oauth/client.json'
      || /^\/oauth\/[A-Za-z0-9_-]{1,128}\/client\.json$/.test(url.pathname);
  } catch {
    return false;
  }
}

function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'الهيف ماب',
  };
}

function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    scopes_supported: [SCOPE],
  };
}

function normalizeScope(value) {
  const parts = String(value || SCOPE).trim().split(/\s+/).filter(Boolean);
  const extras = parts.filter((part) => part !== SCOPE && part !== 'offline_access');
  if (!parts.includes(SCOPE) || extras.length) return '';
  return SCOPE;
}

function pkceMatches(verifier, challenge) {
  if (!/^[\w.~-]{43,128}$/.test(String(verifier || ''))) return false;
  const digest = crypto.createHash('sha256').update(String(verifier)).digest('base64url');
  return safeEqual(digest, challenge);
}

async function db() {
  if (!isEnabled()) {
    const error = new Error('قاعدة البيانات غير متصلة');
    error.status = 503;
    throw error;
  }
  return getAdmin();
}

async function saveClient(row) {
  if (memory) {
    memory.clients.set(row.id, row);
    return;
  }
  const { error } = await (await db()).from('chatgpt_oauth_clients').insert(row);
  if (error) throw new Error(error.message);
}

async function readClient(id) {
  if (memory) return memory.clients.get(id) || null;
  const { data, error } = await (await db()).from('chatgpt_oauth_clients').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function saveCode(row) {
  if (memory) {
    memory.codes.set(row.code_hash, row);
    return;
  }
  const { error } = await (await db()).from('chatgpt_oauth_codes').insert(row);
  if (error) throw new Error(error.message);
}

async function consumeCode(codeHash) {
  const now = new Date().toISOString();
  if (memory) {
    const row = memory.codes.get(codeHash);
    if (!row || row.used_at || row.expires_at <= now) return null;
    row.used_at = now;
    return row;
  }
  const { data, error } = await (await db())
    .from('chatgpt_oauth_codes')
    .update({ used_at: now })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .gt('expires_at', now)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function saveToken(row) {
  if (memory) {
    memory.tokens.set(row.token_hash, row);
    return;
  }
  const { error } = await (await db()).from('chatgpt_oauth_tokens').insert(row);
  if (error) throw new Error(error.message);
}

async function readToken(tokenHash) {
  if (memory) return memory.tokens.get(tokenHash) || null;
  const { data, error } = await (await db())
    .from('chatgpt_oauth_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message || '')) return null;
    throw new Error(error.message);
  }
  return data;
}

async function replaceToken(tokenHash) {
  const now = new Date().toISOString();
  if (memory) {
    const row = memory.tokens.get(tokenHash);
    if (!row || row.replaced_at) return null;
    row.replaced_at = now;
    return row;
  }
  const { data, error } = await (await db())
    .from('chatgpt_oauth_tokens')
    .update({ replaced_at: now })
    .eq('token_hash', tokenHash)
    .is('replaced_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function fetchCimd(clientId) {
  if (cimdLoader) return cimdLoader(clientId);
  if (!isChatGptClientId(clientId)) return null;
  const response = await fetch(clientId, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'application/json' },
  });
  if (response.status !== 200) return null;
  const text = await response.text();
  if (text.length > 65536) return null;
  const doc = JSON.parse(text);
  if (doc.client_id && doc.client_id !== clientId) return null;
  const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String) : [];
  return { redirectUris: uris };
}

async function clientAllows(clientId, redirectUri) {
  if (!isAllowedRedirect(redirectUri)) return false;
  if (isChatGptClientId(clientId)) {
    const doc = await fetchCimd(clientId);
    return !!doc && doc.redirectUris.includes(redirectUri);
  }
  const row = await readClient(clientId);
  const uris = Array.isArray(row?.redirect_uris) ? row.redirect_uris : [];
  return uris.includes(redirectUri);
}

function tokenResponse(access, refresh) {
  return {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SEC,
    refresh_token: refresh,
    scope: SCOPE,
  };
}

async function issuePair(clientId, adminId, resource) {
  const access = randomToken();
  const refresh = randomToken();
  const now = Date.now();
  await saveToken({
    token_hash: hashValue(access),
    kind: 'access',
    client_id: clientId,
    scope: SCOPE,
    resource,
    admin_id: adminId,
    expires_at: new Date(now + ACCESS_TTL_SEC * 1000).toISOString(),
    replaced_at: null,
  });
  await saveToken({
    token_hash: hashValue(refresh),
    kind: 'refresh',
    client_id: clientId,
    scope: SCOPE,
    resource,
    admin_id: adminId,
    expires_at: new Date(now + REFRESH_TTL_SEC * 1000).toISOString(),
    replaced_at: null,
  });
  return tokenResponse(access, refresh);
}

function adminFromToken(token) {
  const payload = parseToken(String(token || '').trim());
  if (!payload || payload.role !== 'admin') return null;
  return String(payload.userId || 'alheef-admin');
}

function authorizeQuery(query) {
  const clientId = String(query.client_id || '').trim();
  const redirectUri = String(query.redirect_uri || '').trim();
  const challenge = String(query.code_challenge || '').trim();
  const method = String(query.code_challenge_method || '').trim();
  const state = String(query.state || '');
  const resource = String(query.resource || '').trim();
  const responseType = String(query.response_type || '').trim();
  const scope = normalizeScope(query.scope);
  if (!clientId || !redirectUri || !challenge || state.length > 512 || state.length < 1) {
    return { error: 'invalid_request' };
  }
  if (responseType !== 'code' || method !== 'S256' || !/^[\w-]{43,128}$/.test(challenge)) {
    return { error: 'invalid_request' };
  }
  if (!isAllowedRedirect(redirectUri)) return { error: 'invalid_request' };
  if (resource !== resourceUrl()) return { error: 'invalid_target' };
  if (!scope) return { error: 'invalid_scope' };
  return { clientId, redirectUri, challenge, state, resource, scope };
}

async function beginAuthorize(query) {
  const parsed = authorizeQuery(query);
  if (parsed.error) return parsed;
  const allowed = await clientAllows(parsed.clientId, parsed.redirectUri);
  if (!allowed) return { error: 'invalid_client' };
  return parsed;
}

async function grantConsent(query, adminToken) {
  const parsed = await beginAuthorize(query);
  if (parsed.error) return { ok: false, status: 400, error: parsed.error };
  const adminId = adminFromToken(adminToken);
  if (!adminId) return { ok: false, status: 401, error: 'login_required' };
  const code = randomToken();
  await saveCode({
    code_hash: hashValue(code),
    client_id: parsed.clientId,
    redirect_uri: parsed.redirectUri,
    code_challenge: parsed.challenge,
    scope: parsed.scope,
    resource: parsed.resource,
    admin_id: adminId,
    expires_at: new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString(),
    used_at: null,
  });
  const target = new URL(parsed.redirectUri);
  target.searchParams.set('code', code);
  target.searchParams.set('state', parsed.state);
  target.searchParams.set('iss', issuer());
  return { ok: true, redirect: target.toString() };
}

function errorRedirect(redirectUri, error, state) {
  if (!isAllowedRedirect(redirectUri)) return '';
  const target = new URL(redirectUri);
  target.searchParams.set('error', error);
  target.searchParams.set('iss', issuer());
  if (state) target.searchParams.set('state', state);
  return target.toString();
}

async function exchangeCode(body) {
  const clientId = String(body.client_id || '').trim();
  const code = String(body.code || '').trim();
  const redirectUri = String(body.redirect_uri || '').trim();
  const verifier = String(body.code_verifier || '').trim();
  const resource = String(body.resource || '').trim();
  if (String(body.grant_type || '') !== 'authorization_code') {
    return { status: 400, body: { error: 'unsupported_grant_type' } };
  }
  if (!clientId || !code || !redirectUri || !verifier) {
    return { status: 400, body: { error: 'invalid_request' } };
  }
  if (resource !== resourceUrl()) return { status: 400, body: { error: 'invalid_target' } };
  const allowed = await clientAllows(clientId, redirectUri);
  if (!allowed) return { status: 401, body: { error: 'invalid_client' } };
  const row = await consumeCode(hashValue(code));
  if (!row || row.client_id !== clientId || row.redirect_uri !== redirectUri || row.resource !== resource) {
    return { status: 400, body: { error: 'invalid_grant' } };
  }
  if (!pkceMatches(verifier, row.code_challenge)) {
    return { status: 400, body: { error: 'invalid_grant' } };
  }
  return { status: 200, body: await issuePair(clientId, row.admin_id, resource) };
}

async function refreshTokens(body) {
  const clientId = String(body.client_id || '').trim();
  const refresh = String(body.refresh_token || '').trim();
  const resource = String(body.resource || resourceUrl()).trim();
  if (!clientId || !refresh) return { status: 400, body: { error: 'invalid_request' } };
  if (resource !== resourceUrl()) return { status: 400, body: { error: 'invalid_target' } };
  const row = await replaceToken(hashValue(refresh));
  if (!row || row.kind !== 'refresh' || row.client_id !== clientId || row.resource !== resource) {
    return { status: 400, body: { error: 'invalid_grant' } };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { status: 400, body: { error: 'invalid_grant' } };
  }
  return { status: 200, body: await issuePair(clientId, row.admin_id, resource) };
}

async function verifyAccessToken(token) {
  const row = await readToken(hashValue(token));
  if (!row || row.kind !== 'access' || row.replaced_at) return { ok: false };
  if (row.scope !== SCOPE || row.resource !== resourceUrl()) return { ok: false };
  if (new Date(row.expires_at).getTime() <= Date.now()) return { ok: false };
  return { ok: true, adminId: row.admin_id };
}

async function registerClient(body) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.some((uri) => !isAllowedRedirect(uri))) {
    return { status: 400, body: { error: 'invalid_redirect_uri' } };
  }
  const method = String(body.token_endpoint_auth_method || 'none');
  if (method !== 'none') return { status: 400, body: { error: 'invalid_client_metadata' } };
  const grants = Array.isArray(body.grant_types) ? body.grant_types.map(String) : ['authorization_code', 'refresh_token'];
  if (grants.some((grant) => grant !== 'authorization_code' && grant !== 'refresh_token')) {
    return { status: 400, body: { error: 'invalid_client_metadata' } };
  }
  const id = `dcr_${randomToken()}`;
  const name = String(body.client_name || 'ChatGPT').trim().slice(0, 120) || 'ChatGPT';
  await saveClient({
    id,
    redirect_uris: uris,
    client_name: name,
    auth_method: 'none',
  });
  return {
    status: 201,
    body: {
      client_id: id,
      client_name: name,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
  };
}

module.exports = {
  SCOPE,
  STABLE_REDIRECT,
  useMemoryStore,
  setCimdLoader,
  issuer,
  resourceUrl,
  metadataUrl,
  wwwAuthenticate,
  protectedResourceMetadata,
  authorizationServerMetadata,
  isAllowedRedirect,
  beginAuthorize,
  grantConsent,
  errorRedirect,
  exchangeCode,
  refreshTokens,
  verifyAccessToken,
  registerClient,
  adminFromToken,
};
