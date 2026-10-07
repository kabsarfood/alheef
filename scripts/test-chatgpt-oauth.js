/**
 * OAuth موصل ChatGPT دون إنشاء طلب خريطة ودون شبكة.
 * node scripts/test-chatgpt-oauth.js
 */
const crypto = require('crypto');

process.env.ADMIN_SECRET = 'test-admin-secret-oauth-0001';
process.env.ALHEEF_PUBLIC_BASE_URL = 'https://www.alheef.website';
process.env.ALHEEF_CHATGPT_CONNECTOR_TOKEN = 'test-token-chatgpt-map-mcp-0001';

const oauth = require('../server/services/chatgptOAuth');
const { createToken } = require('../server/middleware/auth');
const mcpRouter = require('../server/routes/chatgptMapMcp');
const gate = require('../server/services/mapApproval');

gate.createRequest = async () => {
  throw new Error('live createRequest blocked');
};

function assert(cond, message) {
  if (!cond) {
    console.error('FAIL', message);
    process.exit(1);
  }
}

function callMcp({ token, body }) {
  return new Promise((resolve) => {
    const headers = { accept: 'application/json, text/event-stream' };
    if (token) headers.authorization = `Bearer ${token}`;
    const req = {
      method: 'POST',
      url: '/mcp',
      originalUrl: '/api/integrations/alheef-map/mcp',
      headers,
      body,
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      get(name) { return headers[String(name || '').toLowerCase()] || ''; },
    };
    const res = {
      statusCode: 200,
      headersOut: {},
      status(code) { this.statusCode = code; return this; },
      set(name, value) { this.headersOut[String(name).toLowerCase()] = value; return this; },
      json(payload) { resolve({ status: this.statusCode, json: payload, headers: this.headersOut }); return this; },
      type() { return this; },
      send() { resolve({ status: this.statusCode, json: null, headers: this.headersOut }); return this; },
      end() { resolve({ status: this.statusCode, json: null, headers: this.headersOut }); return this; },
    };
    mcpRouter(req, res, () => resolve({ status: 500, json: null, headers: {} }));
  });
}

function query(extra = {}) {
  const verifier = `verifier-${'a'.repeat(40)}`;
  return {
    verifier,
    params: {
      response_type: 'code',
      client_id: 'https://chatgpt.com/oauth/client.json',
      redirect_uri: oauth.STABLE_REDIRECT,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 'state-1',
      scope: oauth.SCOPE,
      resource: oauth.resourceUrl(),
      ...extra,
    },
  };
}

(async () => {
  oauth.useMemoryStore();
  oauth.setCimdLoader(async (clientId) => {
    assert(clientId === 'https://chatgpt.com/oauth/client.json', 'لا يُجلب عميل من خارج ChatGPT');
    return { redirectUris: [oauth.STABLE_REDIRECT] };
  });

  const meta = oauth.authorizationServerMetadata();
  assert(meta.authorization_response_iss_parameter_supported === true, 'iss مدعوم');
  assert(meta.code_challenge_methods_supported.includes('S256'), 'PKCE S256');
  assert(JSON.stringify(meta.token_endpoint_auth_methods_supported) === JSON.stringify(['none']), 'العميل عام عبر PKCE');
  assert(meta.client_id_metadata_document_supported === true, 'CIMD مفعّل');
  assert(oauth.protectedResourceMetadata().resource === oauth.resourceUrl(), 'المورد هو مسار MCP');
  assert(oauth.isAllowedRedirect('https://evil.example/steal') === false, 'إعادة التوجيه محصورة في ChatGPT');

  const admin = createToken({ role: 'admin', userId: 'admin-1' });
  const { verifier, params } = query();
  const granted = await oauth.grantConsent(params, admin);
  assert(granted.ok === true, 'موافقة الأدمن تصدر رمزًا');
  const back = new URL(granted.redirect);
  assert(back.searchParams.get('iss') === oauth.issuer(), 'الرد يعيد iss');
  assert(back.origin + back.pathname === oauth.STABLE_REDIRECT, 'العودة إلى عنوان ChatGPT الثابت');
  const code = back.searchParams.get('code');

  const exchanged = await oauth.exchangeCode({
    grant_type: 'authorization_code',
    client_id: params.client_id,
    code,
    redirect_uri: params.redirect_uri,
    code_verifier: verifier,
    resource: params.resource,
  });
  assert(exchanged.status === 200 && exchanged.body.token_type === 'Bearer', 'تبديل الرمز يعيد Bearer');
  assert(exchanged.body.scope === oauth.SCOPE, 'النطاق هو إنشاء طلب الخريطة فقط');
  const verified = await oauth.verifyAccessToken(exchanged.body.access_token);
  assert(verified.ok === true && verified.adminId === 'admin-1', 'الرمز مربوط بالأدمن');

  const reused = await oauth.exchangeCode({
    grant_type: 'authorization_code',
    client_id: params.client_id,
    code,
    redirect_uri: params.redirect_uri,
    code_verifier: verifier,
    resource: params.resource,
  });
  assert(reused.status === 400 && reused.body.error === 'invalid_grant', 'الرمز يُستخدم مرة واحدة');

  const bad = await oauth.exchangeCode({
    grant_type: 'authorization_code',
    client_id: params.client_id,
    code: 'not-a-code',
    redirect_uri: params.redirect_uri,
    code_verifier: verifier,
    resource: 'https://evil.example/mcp',
  });
  assert(bad.body.error === 'invalid_target', 'مورد مختلف يُرفض');

  const refreshed = await oauth.refreshTokens({
    grant_type: 'refresh_token',
    client_id: params.client_id,
    refresh_token: exchanged.body.refresh_token,
    resource: params.resource,
  });
  assert(refreshed.status === 200, 'تجديد الرمز يعمل');
  const oldRefresh = await oauth.refreshTokens({
    grant_type: 'refresh_token',
    client_id: params.client_id,
    refresh_token: exchanged.body.refresh_token,
    resource: params.resource,
  });
  assert(oldRefresh.status === 400, 'رمز التجديد القديم يُلغى');

  const outsider = await oauth.grantConsent({ ...params, redirect_uri: 'https://evil.example/callback' }, admin);
  assert(outsider.ok === false, 'وجهة خارج ChatGPT لا تُقبل');
  const visitor = await oauth.grantConsent(params, 'not-an-admin');
  assert(visitor.status === 401, 'غير الأدمن لا يمنح الربط');

  const registered = await oauth.registerClient({
    redirect_uris: [oauth.STABLE_REDIRECT],
    token_endpoint_auth_method: 'none',
    client_name: 'ChatGPT',
  });
  assert(registered.status === 201 && registered.body.client_id.startsWith('dcr_'), 'التسجيل الديناميكي بلا سر في الرابط');
  const rejected = await oauth.registerClient({ redirect_uris: ['https://evil.example/callback'] });
  assert(rejected.status === 400, 'تسجيل وجهة خارجية يُرفض');

  const open = await callMcp({ body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert(open.status === 401 && open.json.error.code === -32002, 'المسار بلا مصادقة يبقى مرفوضًا');
  assert(String(open.headers['www-authenticate'] || '').includes(oauth.metadataUrl()), 'التحدي يوجه ChatGPT إلى OAuth');

  const listed = await callMcp({
    token: refreshed.body.access_token,
    body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  });
  assert(listed.status === 200, 'رمز OAuth يفتح قائمة الأدوات');
  assert(listed.json.result.tools[0].name === 'create_alheef_map_request', 'الأداة الظاهرة هي إنشاء الطلب');

  const noted = await callMcp({
    token: process.env.ALHEEF_CHATGPT_CONNECTOR_TOKEN,
    body: { jsonrpc: '2.0', method: 'notifications/initialized' },
  });
  assert(noted.status === 202 && noted.headers['content-length'] === '0', 'إشعار التهيئة 202 بلا محتوى');

  console.log('ok chatgpt oauth');
})().catch((error) => {
  console.error('FAIL', error);
  process.exit(1);
});
