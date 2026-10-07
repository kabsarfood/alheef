/**
 * عقد موصل الهيف ماب دون إنشاء طلب حي.
 * node scripts/test-chatgpt-map-mcp.js
 */
process.env.ALHEEF_CHATGPT_CONNECTOR_TOKEN = 'test-token-chatgpt-map-mcp-0001';

const gate = require('../server/services/mapApproval');
const mcp = require('../server/services/chatgptMapMcp');
const router = require('../server/routes/chatgptMapMcp');

gate.createRequest = async () => {
  throw new Error('live createRequest blocked');
};

function assert(cond, message) {
  if (!cond) {
    console.error('FAIL', message);
    process.exit(1);
  }
}

function callRoute({ token, body }) {
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
      json(payload) { resolve({ status: this.statusCode, json: payload, headers: this.headersOut, cookie: this.headersOut['set-cookie'] || null }); return this; },
      type() { return this; },
      send() { resolve({ status: this.statusCode, json: null, headers: this.headersOut, cookie: this.headersOut['set-cookie'] || null }); return this; },
      end() { resolve({ status: this.statusCode, json: null, headers: this.headersOut, cookie: this.headersOut['set-cookie'] || null }); return this; },
    };
    router(req, res, (error) => resolve({ status: 500, json: { error: String(error && error.message || error) } }));
  });
}

async function rpc(message) {
  return mcp.handleRpc(message);
}

function toolText(outcome) {
  return outcome.payload?.result?.content?.[0]?.text || '';
}

(async () => {
  const init = await rpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });
  assert(init.status === 200 && init.payload.result.protocolVersion === '2025-11-25', 'initialize يعيد 2025-11-25');
  assert(init.payload.result.serverInfo.name === 'alheef-map', 'اسم السيرفر alheef-map');
  assert(!init.payload.result.sessionId, 'initialize بلا جلسة');

  const note = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert(note.status === 202 && note.payload == null, 'notifications/initialized يرجع 202 بلا جسم');

  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const tool = list.payload.result.tools[0];
  assert(list.payload.result.tools.length === 1 && tool.name === 'create_alheef_map_request', 'أداة واحدة فقط');
  assert(JSON.stringify(tool.inputSchema.required) === JSON.stringify(['details', 'source_type']), 'الإلزامي details وsource_type فقط');
  ['property_type', 'district', 'area', 'plan_number', 'plot_number', 'direction', 'street_width', 'location_url', 'price', 'price_type', 'contact_phone', 'images', 'source_name', 'source_url', 'idempotency_key']
    .forEach((key) => assert(tool.inputSchema.properties[key], `الحقل ${key} ظاهر`));
  assert(tool.description.includes('رابط الإضافة المفتوح الدائم') && tool.description.includes('لا تطلب رابطًا جديدًا'), 'التعليمات تثبّت الرابط المفتوح مسارًا وحيدًا');
  assert(!tool.description.includes('لا تستخدم /map-submit'), 'التعليمات لا تمنع المسار الدائم');
  assert(tool.inputSchema.properties.images.maxItems === 8, 'حد الصور 8');
  assert(tool.inputSchema.properties.source_type.enum[0] === 'chatgpt', 'source_type = chatgpt');
  assert(tool.description.includes('pending_approval') && tool.description.includes('الهيف ماب'), 'وصف الأداة يوضح الموافقة');

  const denied = await callRoute({
    body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_alheef_map_request', arguments: { details: 'اختبار', source_type: 'chatgpt' } } },
  });
  assert(denied.status === 401 && denied.json?.error?.code === -32002, 'tools/call بدون مفتاح يرجع 401');
  assert(String(denied.headers?.['www-authenticate'] || '').includes('resource_metadata='), '401 يعلن عنوان OAuth ولا يفتح المسار');
  assert(!denied.cookie, 'لا تُضبط cookies');

  const blocked = [];
  gate.createRequest = async (body) => {
    blocked.push(body);
    throw new Error('should not run');
  };
  const redirected = await rpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'create_alheef_map_request', arguments: { details: 'أرض في النرجس', source_type: 'chatgpt' } },
  });
  assert(redirected.payload.result.isError === true && toolText(redirected).includes('رابط الإضافة المفتوح الدائم'), 'استدعاء الأداة لا ينشئ طلبًا ويعيد إلى الرابط الدائم');
  assert(blocked.length === 0, 'أداة الشات لا تنشئ طلب خريطة');

  const approve = await rpc({
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: { name: 'approve_map_request', arguments: { request_number: 'MAP-000099' } },
  });
  assert(approve.payload.result.isError === true, 'لا توجد أداة موافقة أو نشر');
  const unknown = await rpc({ jsonrpc: '2.0', id: 12, method: 'admin/publish' });
  assert(unknown.payload.error.code === -32601, 'طرق الموافقة غير مدعومة');

  const parsed = { area: 100, price: 1000000, priceType: 'auction', planNumber: '1', plotNumber: '2', streetWidth: '10' };
  const overridden = gate.applyStructuredListing({ ...parsed }, { area: 450, plan_number: '2566/ب', plot_number: '4599', street_width: '15', district: 'المهدية', direction: 'جنوب', price: 2500000, price_type: 'fixed' });
  assert(overridden.area === 450 && overridden.planNumber === '2566/ب' && overridden.district === 'المهدية' && overridden.direction === 'جنوب' && overridden.price === 2500000 && overridden.priceType === 'fixed', 'الحقل المنظم يتقدم على النص');
  const kept = gate.applyStructuredListing({ ...parsed }, {});
  assert(kept.area === 100 && kept.price === 1000000 && kept.priceType === 'auction', 'غياب السعر والحقول يترك الاستخراج كما هو');

  console.log('ok chatgpt map mcp');
})().catch((error) => {
  console.error('FAIL', error && error.stack ? error.stack : error);
  process.exit(1);
});
