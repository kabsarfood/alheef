/**
 * عقد موصل الهيف ماب دون إنشاء طلب حي.
 * node scripts/test-chatgpt-map-mcp.js
 */
process.env.ALHEEF_CHATGPT_CONNECTOR_TOKEN = 'test-token-chatgpt-map-mcp-0001';

const gate = require('../server/services/mapApproval');
const mcp = require('../server/services/chatgptMapMcp');
const router = require('../server/routes/chatgptMapMcp');

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
      json(payload) { resolve({ status: this.statusCode, json: payload, cookie: this.headersOut['set-cookie'] || null }); return this; },
      type() { return this; },
      send() { resolve({ status: this.statusCode, json: null, cookie: this.headersOut['set-cookie'] || null }); return this; },
      end() { resolve({ status: this.statusCode, json: null, cookie: this.headersOut['set-cookie'] || null }); return this; },
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
  assert(tool.description.includes('map-submit') === false || tool.description.includes('لا تستخدم /map-submit'), 'التعليمات تمنع الرجوع إلى map-submit');
  assert(tool.inputSchema.properties.images.maxItems === 8, 'حد الصور 8');
  assert(tool.inputSchema.properties.source_type.enum[0] === 'chatgpt', 'source_type = chatgpt');
  assert(tool.description.includes('pending_approval') && tool.description.includes('الهيف ماب'), 'وصف الأداة يوضح الموافقة');

  const denied = await callRoute({
    body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_alheef_map_request', arguments: { details: 'اختبار', source_type: 'chatgpt' } } },
  });
  assert(denied.status === 401 && denied.json?.error?.code === -32002, 'tools/call بدون مفتاح يرجع 401');
  assert(!denied.cookie, 'لا تُضبط cookies');

  const blocked = [];
  gate.createRequest = async (body) => {
    blocked.push(body);
    throw new Error('should not run');
  };
  const missing = await rpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'create_alheef_map_request', arguments: { source_type: 'chatgpt' } },
  });
  assert(missing.payload.result.isError === true && toolText(missing).includes('تفاصيل'), 'غياب details يرفض الطلب');
  const nine = await rpc({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'create_alheef_map_request',
      arguments: { details: 'أرض في النرجس', source_type: 'chatgpt', images: Array.from({ length: 9 }, (_, i) => `https://cdn.example.com/${i}.jpg`) },
    },
  });
  assert(nine.payload.result.isError === true && toolText(nine).includes('8'), 'تسع صور ترفض');
  const badImage = await rpc({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'create_alheef_map_request',
      arguments: {
        details: 'أرض في النرجس',
        source_type: 'chatgpt',
        images: ['https://cdn.example.com/a.jpg', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'https://cdn.example.com/b.jpg'],
      },
    },
  });
  assert(badImage.payload.result.isError === true && !badImage.payload.result.structuredContent, 'صورة غير مسموحة ترفض الطلب كاملًا');
  const huge = Buffer.alloc((512 * 1024) + 8);
  huge[0] = 0xff; huge[1] = 0xd8; huge[2] = 0xff;
  const oversized = await rpc({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'create_alheef_map_request',
      arguments: { details: 'أرض في النرجس', source_type: 'chatgpt', images: [`data:image/jpeg;base64,${huge.toString('base64')}`] },
    },
  });
  assert(oversized.payload.result.isError === true && toolText(oversized).includes('512'), 'الصورة الكبيرة ترجع خطأ مفهوم');
  assert(blocked.length === 0, 'فشل الصور أو الحقول لا ينشئ طلبًا');

  const seen = [];
  gate.createRequest = async (body) => {
    seen.push(body);
    const repeat = body.idempotency_key === 'retry-same' && seen.filter((item) => item.idempotency_key === 'retry-same').length > 1;
    return {
      status: repeat ? 200 : 201,
      body: {
        success: true,
        request_number: 'MAP-000099',
        request_id: 'test-request',
        status: 'pending_approval',
        approval_notification_status: 'sent',
        idempotent: repeat,
      },
    };
  };

  const original = 'الهيف ماب\nأرض في النرجس للبيع. النص الأصلي كامل.';
  const created = await rpc({
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'create_alheef_map_request',
      arguments: {
        details: original,
        source_type: 'chatgpt',
        property_type: 'أرض',
        district: 'المهدية',
        area: 450,
        plan_number: '2566/ب',
        plot_number: '4599',
        direction: 'جنوب',
        street_width: '15',
        location_url: 'https://maps.google.com/?q=24.8,46.7',
        images: [TINY_PNG, 'https://cdn.example.com/photo.jpg'],
        source_name: 'ChatGPT',
        idempotency_key: 'retry-same',
      },
    },
  });
  const safe = created.payload.result.structuredContent;
  assert(created.payload.result.isError === false, 'الاستدعاء المصرح ينجح في الاختبار');
  assert(safe.success === true && safe.request_number === 'MAP-000099' && safe.status === 'pending_approval', 'النتيجة المنظمة فيها رقم الطلب');
  assert(safe.approval_notification_status === 'sent' && safe.message.includes('إرسال إشعار الموافقة') && !safe.message.includes('تم نشر'), 'الرسالة تؤكد واتساب فقط عند الإرسال');
  assert(toolText(created).includes('MAP-000099'), 'النص يذكر رقم الطلب');
  assert(seen[0].details === original.trim(), 'details يبقى النص الأصلي');
  assert(seen[0].area === 450 && seen[0].plan_number === '2566/ب' && seen[0].plot_number === '4599' && seen[0].district === 'المهدية' && seen[0].direction === 'جنوب', 'الحقول المنظمة تُمرر');
  assert(seen[0].price == null && seen[0].price_type == null && seen[0].contact_phone == null, 'غياب السعر والجوال لا يخترع قيمة');
  assert(seen[0].images.length === 2, 'الصور الصالحة تُمرر');
  assert(seen[0].idempotency_key === 'retry-same', 'idempotency_key يُمرر');

  const partial = await rpc({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'create_alheef_map_request', arguments: { details: 'شقة في الملقا للبيع', source_type: 'chatgpt' } },
  });
  assert(partial.payload.result.isError === false && partial.payload.result.structuredContent.request_number === 'MAP-000099', 'غياب أحد الحقول الستة لا يمنع الطلب');
  assert(seen.at(-1).area == null && seen.at(-1).location_url == null && seen.at(-1).images.length === 0, 'الحقول الغائبة لا تُخترع');

  const again = await rpc({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'create_alheef_map_request',
      arguments: { details: original, source_type: 'chatgpt', idempotency_key: 'retry-same' },
    },
  });
  assert(again.payload.result.structuredContent.request_number === 'MAP-000099', 'إعادة المفتاح تعيد رقم الطلب نفسه');
  assert(seen.filter((item) => item.idempotency_key === 'retry-same').length === 2, 'المفتاح يُرسل في المحاولتين');

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
