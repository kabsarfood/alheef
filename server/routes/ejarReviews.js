const express = require('express');
const { isEnabled } = require('../lib/supabase');
const ejarReviewTokensRepo = require('../repositories/ejarReviewTokensRepo');
const ejarReviewsRepo = require('../repositories/ejarReviewsRepo');
const requestsRepo = require('../repositories/requestsRepo');
const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');
const pushNotifications = require('../services/pushNotifications');
const {
  generateToken,
  buildReviewUrl,
  buildWhatsAppMessage,
  sanitizeComment,
  resolveDisplayName,
  parseEjarRequestMessage,
} = require('../services/ejarReviewService');
const { getReviewLinkExpiryDays } = require('../utils/ejarReviewConfig');

const router = express.Router();

const rateMap = new Map();

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
  next();
}

function checkRateLimit(key, max = 8, windowMs = 60000) {
  const now = Date.now();
  let entry = rateMap.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + windowMs };
  }
  entry.count += 1;
  rateMap.set(key, entry);
  return entry.count <= max;
}

async function resolveTokenState(rawToken) {
  const tokenRow = await ejarReviewTokensRepo.findByRawToken(rawToken);
  if (!tokenRow) return { state: 'invalid' };

  const existingReview = await ejarReviewsRepo.getByTokenId(tokenRow.id);
  if (existingReview || tokenRow.status === 'used') {
    return { state: 'used', tokenRow };
  }

  if (tokenRow.status === 'revoked') return { state: 'invalid', tokenRow };
  if (tokenRow.status === 'expired') return { state: 'expired', tokenRow };

  const expiresAt = new Date(tokenRow.expiresAt);
  if (expiresAt.getTime() < Date.now()) {
    await ejarReviewTokensRepo.markExpired(tokenRow.id);
    return { state: 'expired', tokenRow };
  }

  if (tokenRow.status !== 'active') return { state: 'invalid', tokenRow };

  const request = await requestsRepo.getById(tokenRow.requestId);
  const meta = parseEjarRequestMessage(request?.message);
  return {
    state: 'active',
    tokenRow,
    city: meta.city || null,
  };
}

router.get('/reviews/public', requireDb, async (_req, res) => {
  try {
    const stats = await ejarReviewsRepo.getPublicStats();
    const reviews = stats.visible ? await ejarReviewsRepo.listPublic(6) : [];
    res.json({ success: true, ...stats, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/review/:token', requireDb, async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`view:${ip}`, 30, 60000)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة — حاول لاحقًا' });
    }

    const resolved = await resolveTokenState(req.params.token);
    if (resolved.state === 'invalid') {
      return res.status(404).json({ success: false, state: 'invalid', message: 'الرابط غير صالح' });
    }
    if (resolved.state === 'expired') {
      return res.json({
        success: false,
        state: 'expired',
        message: 'انتهت صلاحية رابط التقييم. يمكنك التواصل مع مكتب الهيف إذا رغبت في تقييم الخدمة.',
      });
    }
    if (resolved.state === 'used') {
      return res.json({
        success: false,
        state: 'used',
        message: 'شكرًا لك، تم تسجيل تقييمك مسبقًا.',
      });
    }

    res.json({
      success: true,
      state: 'active',
      city: resolved.city || '',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/review/:token/submit', requireDb, async (req, res) => {
  try {
    const rawToken = req.params.token;
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(`submit:${ip}`, 5, 60000)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة — حاول لاحقًا' });
    }

    if (req.body.website) {
      return res.status(400).json({ success: false, message: 'تعذر إرسال التقييم' });
    }

    const resolved = await resolveTokenState(rawToken);
    if (resolved.state === 'invalid') {
      return res.status(404).json({ success: false, state: 'invalid', message: 'الرابط غير صالح' });
    }
    if (resolved.state === 'expired') {
      return res.status(410).json({
        success: false,
        state: 'expired',
        message: 'انتهت صلاحية رابط التقييم. يمكنك التواصل مع مكتب الهيف إذا رغبت في تقييم الخدمة.',
      });
    }
    if (resolved.state === 'used') {
      return res.status(409).json({
        success: false,
        state: 'used',
        message: 'شكرًا لك، تم تسجيل تقييمك مسبقًا.',
      });
    }

    const rating = parseInt(req.body.rating, 10);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'يرجى اختيار تقييم من 1 إلى 5 نجوم' });
    }

    const city = String(req.body.city || resolved.city || '').trim().slice(0, 60) || null;
    const displayName = resolveDisplayName({
      displayNameType: req.body.displayNameType,
      displayName: req.body.displayName,
      city,
    });
    const comment = sanitizeComment(req.body.comment);
    const publishConsent = !!req.body.publishConsent;

    const review = await ejarReviewsRepo.create({
      requestId: resolved.tokenRow.requestId,
      reviewTokenId: resolved.tokenRow.id,
      rating,
      comment,
      displayName,
      city,
      publishConsent,
    });

    await ejarReviewTokensRepo.markUsed(resolved.tokenRow.id);

    await adminNotificationsRepo.createEjarReviewReceived({
      reviewId: review.id,
      requestId: review.requestId,
      rating: review.rating,
    });

    pushNotifications.notifyAdminsEjarReview({
      reviewId: review.id,
      rating: review.rating,
    }).catch((err) => console.warn('[push] ejar review:', err.message));

    res.json({
      success: true,
      message: 'شكرًا لتقييمك',
      reviewId: review.id,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// Exported for admin token creation
router.createReviewLinkForRequest = async function createReviewLinkForRequest(requestId) {
  const request = await requestsRepo.getById(requestId);
  if (!request) throw new Error('الطلب غير موجود');
  if (request.requestType !== 'ejar_contract') {
    throw new Error('رابط التقييم متاح لطلبات عقود الإيجار فقط');
  }

  const rawToken = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + getReviewLinkExpiryDays());

  await ejarReviewTokensRepo.create({
    requestId,
    rawToken,
    expiresAt: expiresAt.toISOString(),
  });

  const reviewUrl = buildReviewUrl(rawToken);
  const whatsappMessage = buildWhatsAppMessage(reviewUrl);
  const phone = String(request.customerPhone || '').replace(/\D/g, '');
  const whatsappUrl = phone
    ? `https://wa.me/966${phone.startsWith('0') ? phone.slice(1) : phone}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  return {
    reviewUrl,
    whatsappMessage,
    whatsappUrl,
    expiresAt: expiresAt.toISOString(),
    expiryDays: getReviewLinkExpiryDays(),
  };
};
