const { isValidSaudiMobile } = require('../utils/phone');

const PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
const DEFAULT_PROTOCOL = '2025-03-26';
const TOOL_NAME = 'create_alheef_map_request';
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_DATA_URL_CHARS = 720000;
const MAX_IMAGES_TOTAL_BYTES = Math.floor(3.5 * 1024 * 1024);
const MAX_DETAILS = 8000;
const TOOL_DESCRIPTION = 'مسار إعلانات شات جي بي تي الوحيد هو رابط الإضافة المفتوح الدائم على /map-submit/ الذي يبقى مفتوحًا. عندما يكتب المستخدم «الهيف ماب» أو يطلب إضافة إعلان، أرسل الإعلان عبر ذلك الرابط نفسه. لا تطلب رابطًا جديدًا، ولا تستخدم رابطًا لمرة واحدة، ولا تنتقل إلى طريقة أخرى. كل إعلان يبقى pending_approval حتى موافقة الأدمن في واتساب، ولا يُنشر من الشات. استخرج البيانات الموجودة فقط ولا تخترع السعر أو جوال المعلن.';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean' },
    request_number: { type: 'string' },
    status: { type: 'string' },
    approval_notification_status: { type: 'string', description: 'sent إذا تأكد إرسال واتساب، وfailed إذا حُفظ الطلب دون تأكيد الإشعار.' },
    message: { type: 'string' },
  },
  required: ['success', 'request_number', 'status', 'approval_notification_status', 'message'],
};

const TOOL = {
  name: TOOL_NAME,
  title: 'إنشاء طلب خريطة الهيف',
  description: TOOL_DESCRIPTION,
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      details: {
        type: 'string',
        description: 'النص الأصلي للإعلان كاملًا كما كتبه المستخدم. لا تختصره ولا تخترع ما ينقصه.',
      },
      source_type: {
        type: 'string',
        enum: ['chatgpt'],
        description: 'مصدر الطلب. القيمة الوحيدة المقبولة من هذه الأداة هي chatgpt.',
      },
      property_type: { type: 'string', description: 'نوع العقار إن ذُكر، مثل فيلا أو شقة أو أرض. لا تخترعه.' },
      district: { type: 'string', description: 'الحي إن ذُكر. لا تخترعه.' },
      area: { type: 'number', description: 'المساحة بالمتر إن ذُكرت. لا تخترعها إن غابت.' },
      plan_number: { type: 'string', description: 'رقم المخطط إن ذُكر. لا تخترعه.' },
      plot_number: { type: 'string', description: 'رقم القطعة إن ذُكر. لا تخترعه.' },
      direction: { type: 'string', description: 'الاتجاه إن ذُكر، مثل جنوب. لا تخترعه.' },
      street_width: { type: 'string', description: 'عرض الشارع إن ذُكر. لا تخترعه.' },
      location_url: { type: 'string', description: 'رابط الموقع كما ورد. لا تستبدله ولا تخترعه.' },
      price: { type: 'number', description: 'السعر إن ذُكر. غيابه لا يمنع الطلب ولا يعني رقمًا مخترعًا.' },
      price_type: { type: 'string', enum: ['fixed', 'auction'], description: 'نوع السعر إن ذُكر فقط: fixed أو auction. لا تخترعه.' },
      contact_phone: {
        type: 'string',
        description: 'جوال صاحب الإعلان إن ذُكر. يُحفظ داخليًا ولا يُعرض للعملاء بدل رقم الهيف. لا تخترعه.',
      },
      images: {
        type: 'array',
        maxItems: MAX_IMAGES,
        items: { type: 'string' },
        description: 'حتى 8 صور. كل عنصر رابط https عام، أو data URL بصيغة jpeg أو png أو webp وبحد 512 ك.ب للصورة. فشل صورة واحدة يرفض الطلب كاملًا.',
      },
      source_name: { type: 'string', description: 'اسم المصدر الظاهر للأدمن. استخدم ChatGPT.' },
      source_url: { type: 'string', description: 'رابط HTTPS عام لصفحة المصدر إن وُجد.' },
      idempotency_key: {
        type: 'string',
        description: 'مفتاح اختياري ثابت لنفس الإعلان. أعد إرساله عند انقطاع الاتصال حتى لا يُنشأ طلب ثانٍ.',
      },
    },
    required: ['details', 'source_type'],
  },
  outputSchema: OUTPUT_SCHEMA,
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

function fail(text) {
  const error = new Error(text);
  error.status = 400;
  return error;
}

function isPublicHttps(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function finiteNumber(value) {
  if (value == null || value === '') return undefined;
  const n = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function imageKindOf(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return '';
}

function checkImages(images) {
  if (images == null) return [];
  if (!Array.isArray(images)) throw fail('حقل الصور يجب أن يكون قائمة');
  if (images.length > MAX_IMAGES) throw fail(`الحد الأقصى ${MAX_IMAGES} صور`);
  let total = 0;
  const clean = [];
  images.forEach((item, index) => {
    const label = `الصورة ${index + 1}`;
    const text = String(item || '').trim();
    if (!text) throw fail(`${label} فارغة. أصلح الصور ثم أعد الإرسال؛ لن يُنشأ طلب ناقص`);
    if (text.startsWith('data:')) {
      if (text.length > MAX_DATA_URL_CHARS) {
        throw fail(`${label} تتجاوز 512 ك.ب. أرسل رابط https أو صورة أصغر`);
      }
      const match = text.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i);
      if (!match) throw fail(`${label} يجب أن تكون jpeg أو png أو webp`);
      const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
      if (!buffer.length || !imageKindOf(buffer)) throw fail(`${label} غير صالحة`);
      if (buffer.length > MAX_IMAGE_BYTES) throw fail(`${label} تتجاوز 512 ك.ب. أرسل رابط https أو صورة أصغر`);
      total += buffer.length;
      if (total > MAX_IMAGES_TOTAL_BYTES) throw fail('مجموع الصور يتجاوز الحد. أرسل روابط https أو صورًا أصغر');
      clean.push(text);
      return;
    }
    if (text.length > 2000 || !isPublicHttps(text)) throw fail(`${label}: رابط الصورة غير مسموح. استخدم https عامًا`);
    clean.push(text);
  });
  return clean;
}

function requestFrom(args) {
  const details = String(args.details || '');
  const trimmed = details.trim();
  if (!trimmed) throw fail('تفاصيل الإعلان مطلوبة');
  if (trimmed.length > MAX_DETAILS) throw fail('نص الإعلان يتجاوز الحد');
  const sourceType = String(args.source_type || '').trim().toLowerCase();
  if (sourceType !== 'chatgpt') throw fail('مصدر هذه الأداة يجب أن يكون chatgpt');

  const body = {
    details: trimmed,
    source_type: 'chatgpt',
    source_name: String(args.source_name || 'ChatGPT').trim().slice(0, 120) || 'ChatGPT',
  };

  if (args.property_type != null && String(args.property_type).trim()) {
    body.property_type = String(args.property_type).trim().slice(0, 40);
  }
  if (args.district != null && String(args.district).trim()) body.district = String(args.district).trim().slice(0, 80);
  if (args.direction != null && String(args.direction).trim()) body.direction = String(args.direction).trim().slice(0, 80);
  if (args.area != null && args.area !== '') {
    const area = finiteNumber(args.area);
    if (area == null || area <= 0) throw fail('المساحة غير صالحة');
    body.area = area;
  }
  ['plan_number', 'plot_number', 'street_width'].forEach((key) => {
    if (args[key] == null || args[key] === '') return;
    const text = String(args[key]).trim();
    if (!text) return;
    body[key] = text.slice(0, 80);
  });
  if (args.location_url != null && String(args.location_url).trim()) {
    const location = String(args.location_url).trim();
    if (location.length > 2000 || !/^https:\/\//i.test(location)) throw fail('رابط الموقع يجب أن يكون https');
    body.location_url = location;
  }
  if (args.price != null && args.price !== '') {
    const price = finiteNumber(args.price);
    if (price == null || price <= 0) throw fail('السعر غير صالح');
    body.price = price;
  }
  if (args.price_type != null && String(args.price_type).trim()) {
    const priceType = String(args.price_type).trim().toLowerCase();
    if (priceType !== 'fixed' && priceType !== 'auction') throw fail('نوع السعر غير صالح');
    body.price_type = priceType;
  }
  if (args.contact_phone != null && String(args.contact_phone).trim()) {
    const phone = String(args.contact_phone).trim();
    if (!isValidSaudiMobile(phone)) throw fail('رقم الجوال غير صالح');
    body.contact_phone = phone;
  }
  if (args.source_url != null && String(args.source_url).trim()) {
    const sourceUrl = String(args.source_url).trim();
    if (!isPublicHttps(sourceUrl)) throw fail('رابط المصدر غير مسموح');
    body.source_url = sourceUrl;
  }
  if (args.idempotency_key != null && String(args.idempotency_key).trim()) {
    body.idempotency_key = String(args.idempotency_key).trim().slice(0, 200);
  }
  body.images = checkImages(args.images);
  return body;
}

function publicToolBody(body) {
  const requestNumber = body?.request_number || '';
  const saved = body?.success === true && !!requestNumber;
  const status = body?.status || '';
  const notice = saved ? (body?.approval_notification_status || 'failed') : 'not_sent';
  let message = 'لم يُحفظ الطلب.';
  if (saved && notice === 'sent' && status === 'pending_approval') {
    message = 'تم حفظ الطلب وإرسال إشعار الموافقة إلى واتساب. بانتظار موافقة الأدمن، ولم يُنشر الإعلان.';
  } else if (saved && status === 'pending_approval') {
    message = 'تم حفظ الطلب، ولم يتأكد إرسال إشعار واتساب. لم يُنشر الإعلان.';
  } else if (saved) {
    message = `الطلب ${requestNumber} مسجّل بحالة ${status}. هذه الأداة لا توافق ولا تنشر.`;
  }
  return {
    success: saved,
    request_number: requestNumber,
    status,
    approval_notification_status: notice,
    message,
  };
}

async function callTool(params) {
  if (params?.name !== TOOL_NAME) {
    return { isError: true, text: 'الأداة غير متاحة. هذه الأداة لا توافق ولا ترفض ولا تنشر.' };
  }
  return {
    isError: true,
    text: 'إعلانات شات جي بي تي تُرسل فقط عبر رابط الإضافة المفتوح الدائم. استخدم الرابط نفسه لكل إعلان، ولا تطلب رابطًا جديدًا.',
  };
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
        serverInfo: { name: 'alheef-map', version: '1.1.0' },
        instructions: TOOL_DESCRIPTION,
      },
    };
  }
  if (method === 'ping') return { id, result: {} };
  if (method === 'tools/list') return { id, result: { tools: [TOOL] } };
  if (method === 'tools/call') {
    const called = await callTool(message.params || {});
    const result = {
      content: [{ type: 'text', text: called.text }],
      isError: called.isError,
    };
    if (!called.isError && called.structured) result.structuredContent = called.structured;
    return { id, result };
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
  TOOL,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  handleRpc,
};
