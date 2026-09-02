const crypto = require('crypto');
const { getReviewLinkExpiryDays, getSiteUrl, getMaxCommentLength } = require('../utils/ejarReviewConfig');

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildReviewUrl(token) {
  return `${getSiteUrl()}/ejar/review/${token}`;
}

function starsText(rating) {
  const n = Math.min(5, Math.max(1, parseInt(rating, 10) || 0));
  return '⭐'.repeat(n);
}

function buildWhatsAppMessage(reviewUrl) {
  return [
    'تشرفنا في خدمتكم في الهيف العقارية',
    'أرجو التقييم عبر الرابط التالي:',
    reviewUrl,
  ].join('\n');
}

function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return digits;
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^5\d{8}$/.test(digits)) return `966${digits}`;
  return '';
}

function customerPhoneFromRequest(request) {
  const meta = parseEjarRequestMessage(request?.message);
  return request?.customerPhone || meta.ownerPhone || meta.tenantPhone || '';
}

function buildCustomerWhatsAppUrl(phone, reviewUrl) {
  const n = toWhatsAppNumber(phone);
  if (!n) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(buildWhatsAppMessage(reviewUrl))}`;
}

function sanitizeComment(text) {
  if (!text) return null;
  const trimmed = String(text).trim().slice(0, getMaxCommentLength());
  return trimmed || null;
}

function resolveDisplayName({ displayNameType, displayName, city }) {
  const type = displayNameType || 'anonymous';
  const name = String(displayName || '').trim().slice(0, 80);
  if (type === 'first' || type === 'short') return name || null;
  if (type === 'city') {
    const c = String(city || '').trim().slice(0, 60);
    return c ? `عميل من ${c}` : 'عميل';
  }
  return null;
}

function parseEjarRequestMessage(message) {
  if (!message) return {};
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

module.exports = {
  generateToken,
  hashToken,
  buildReviewUrl,
  buildWhatsAppMessage,
  toWhatsAppNumber,
  customerPhoneFromRequest,
  buildCustomerWhatsAppUrl,
  starsText,
  sanitizeComment,
  resolveDisplayName,
  parseEjarRequestMessage,
};
