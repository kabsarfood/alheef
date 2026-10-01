const gate = require('./mapApproval');

const PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18']);
const DEFAULT_PROTOCOL = '2025-03-26';
const TOOL_NAME = 'create_alheef_map_request';

const TOOL = {
  name: TOOL_NAME,
  title: 'إنشاء طلب خريطة الهيف',
  description: 'ينشئ طلب إضافة عقار إلى خريطة الهيف بحالة pending_approval فقط. لا يوافق على الطلب، ولا ينشر إعلانًا، ولا يمنح جلسة أدمن. استخدم source_type بقيمة chatgpt عندما يأتي الطلب من المحادثة.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      property_type: { type: 'string', description: 'نوع العقار، مثل فيلا أو شقة أو أرض.' },
      details: { type: 'string', description: 'نص الإعلان كما كتبه المستخدم.' },
      location_url: { type: 'string', description: 'رابط خرائط الموقع إن وُجد.' },
      contact_phone: { type: 'string', description: 'جوال التواصل السعودي إن وُجد.' },
      source_type: {
        type: 'string',
        enum: [...gate.SOURCES],
        description: 'مصدر الطلب. استخدم chatgpt لمحادثة ChatGPT.',
      },
      source_name: { type: 'string', description: 'اسم المصدر الظاهر للأدمن.' },
      source_url: { type: 'string', description: 'رابط HTTPS عام لصفحة المصدر إن وُجد.' },
      images: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string' },
        description: 'حتى 8 صور، كل عنصر رابط https عام أو data URL لصورة.',
      },
    },
    required: ['details', 'source_type'],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};

function protocolOf(params) {
  const requested = String(params?.protocolVersion || '');
  return PROTOCOL_VERSIONS.has(requested) ? requested : DEFAULT_PROTOCOL;
}

function argumentsOf(params) {
  const raw = params?.arguments;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function requestFrom(args) {
  return {
    property_type: args.property_type,
    details: args.details,
    location_url: args.location_url,
    contact_phone: args.contact_phone,
    source_type: args.source_type,
    source_name: args.source_name,
    source_url: args.source_url,
    images: args.images,
  };
}

function publicToolBody(body) {
  const status = body?.status || null;
  return {
    success: body?.success === true,
    request_number: body?.request_number || null,
    request_id: body?.request_id || null,
    status,
    duplicate: body?.duplicate === true,
    idempotent: body?.idempotent === true,
    message: status === 'pending_approval'
      ? 'تم حفظ الطلب بانتظار موافقة الأدمن. هذه الأداة لا توافق ولا تنشر.'
      : 'لم تُنفَّذ موافقة أو نشر من هذه الأداة.',
  };
}

async function callTool(params) {
  if (params?.name !== TOOL_NAME) {
    return { isError: true, text: 'الأداة غير متاحة' };
  }
  const args = argumentsOf(params);
  if (args.images != null && !Array.isArray(args.images)) {
    return { isError: true, text: 'حقل الصور يجب أن يكون قائمة' };
  }
  try {
    const outcome = await gate.createRequest(requestFrom(args));
    const safe = publicToolBody(outcome.body);
    console.info(JSON.stringify({
      scope: 'chatgpt-map-tool',
      at: new Date().toISOString(),
      tool: TOOL_NAME,
      status: safe.status,
      requestNumber: safe.request_number,
      duplicate: safe.duplicate,
    }));
    return { isError: false, text: JSON.stringify(safe) };
  } catch (error) {
    const status = error.status || 500;
    return { isError: true, text: status === 500 ? 'تعذر استقبال الطلب' : gate.safeReason(error) };
  }
}

async function handleMessage(message) {
  const id = message?.id ?? null;
  const method = String(message?.method || '');
  if (!method) return { id, error: { code: -32600, message: 'طلب غير صالح' } };
  if (method === 'initialize') {
    return {
      id,
      result: {
        protocolVersion: protocolOf(message.params),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'alheef-map', version: '1.0.0' },
        instructions: 'أداة create_alheef_map_request تنشئ طلب موافقة فقط. لا تستخدمها للموافقة أو النشر.',
      },
    };
  }
  if (method === 'ping') return { id, result: {} };
  if (method === 'tools/list') return { id, result: { tools: [TOOL] } };
  if (method === 'tools/call') {
    const called = await callTool(message.params || {});
    return {
      id,
      result: {
        content: [{ type: 'text', text: called.text }],
        isError: called.isError,
      },
    };
  }
  return { id, error: { code: -32601, message: 'الطريقة غير مدعومة' } };
}

function isNotification(message) {
  return message && Object.prototype.hasOwnProperty.call(message, 'method') && !Object.prototype.hasOwnProperty.call(message, 'id');
}

async function handleRpc(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, payload: { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'طلب غير صالح' } } };
  }
  if (isNotification(body)) return { status: 202, payload: null };
  const outcome = await handleMessage(body);
  if (outcome.error) {
    return { status: 200, payload: { jsonrpc: '2.0', id: outcome.id, error: outcome.error } };
  }
  return { status: 200, payload: { jsonrpc: '2.0', id: outcome.id, result: outcome.result } };
}

module.exports = {
  TOOL_NAME,
  handleRpc,
};
