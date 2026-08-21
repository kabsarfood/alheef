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
    'السلام عليكم، نشكرك لاختيار مكتب الهيف للخدمات العقارية.',
    'يسعدنا تقييم تجربتك معنا في خدمة عقود الإيجار من خلال الرابط التالي:',
    reviewUrl,
    'تقييمك يساعدنا على تطوير الخدمة، وشكرًا لثقتك.',
  ].join('\n');
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
  starsText,
  sanitizeComment,
  resolveDisplayName,
  parseEjarRequestMessage,
};
