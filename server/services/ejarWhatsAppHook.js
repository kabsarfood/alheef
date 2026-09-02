/**
 * إشعار واتساب لمكتب الهيف عند وصول طلب عقد إيجار.
 * لا يوجد حاليًا WhatsApp Business API / Twilio في المشروع.
 * اربط المزود لاحقًا عبر متغيرات البيئة دون تعطيل حفظ الطلب.
 */
const { getSiteUrl } = require('../utils/ejarReviewConfig');
const { CONTRACT_KINDS, parsePayload } = require('../utils/ejarContract');

function isWhatsAppApiEnabled() {
  return Boolean(
    process.env.WHATSAPP_API_TOKEN
    || process.env.WHATSAPP_ACCESS_TOKEN
    || process.env.TWILIO_ACCOUNT_SID
    || process.env.TWILIO_AUTH_TOKEN
    || process.env.WHATSAPP_PROVIDER
  );
}

function buildOfficeMessage(request) {
  const payload = parsePayload(request.message);
  const kind = payload.contractKind === 'commercial' ? 'تجاري' : 'سكني';
  const ref = request.referenceNo || payload.referenceNo || request.id;
  const rent = payload.rentAmount != null ? `${payload.rentAmount} ريال` : '—';
  const payment = payload.paymentMethod || '—';
  const adminPath = `/dashboard/requests.html?request=${encodeURIComponent(request.id)}`;
  const adminUrl = `${getSiteUrl()}${adminPath}`;
  return [
    'طلب عقد إيجار جديد',
    '',
    `رقم الطلب: ${ref}`,
    `النوع: ${kind}`,
    `قيمة الإيجار: ${rent}`,
    `طريقة الدفع: ${payment}`,
    'الحالة: جديد',
    '',
    `فتح الطلب: ${adminUrl}`,
  ].join('\n');
}

async function notifyOfficeNewEjarContract(request) {
  if (!request?.id) return { sent: false, skipped: 'no_request' };
  if (!isWhatsAppApiEnabled()) {
    return { sent: false, skipped: 'no_provider' };
  }
  // المزود غير مربوط بعد — لا تفشل الطلب ولا ترسل تكاملًا وهميًا
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[ejar-whatsapp] provider env present but sender is not wired yet');
  }
  return {
    sent: false,
    skipped: 'not_wired',
    message: buildOfficeMessage(request),
    officeNumber: process.env.EJAR_OFFICE_WHATSAPP || process.env.WHATSAPP_NUMBER || '',
    kind: request.requestType,
    priceHint: CONTRACT_KINDS[parsePayload(request.message).contractKind]?.price,
  };
}

module.exports = {
  isWhatsAppApiEnabled,
  buildOfficeMessage,
  notifyOfficeNewEjarContract,
};
