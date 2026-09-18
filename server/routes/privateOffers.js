const express = require('express');
const { isEnabled } = require('../lib/supabase');
const { createPrivateViewerToken, requirePrivateViewer, parseToken } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');
const { phonesEqual, isValidSaudiMobile, normalizeAccountPhone } = require('../utils/phone');
const otpCore = require('../services/whatsappOtpCore');
const appUsersRepo = require('../repositories/appUsersRepo');
const privateOffersRepo = require('../repositories/privateOffersRepo');
const privateClientsRepo = require('../repositories/privateClientsRepo');
const { toPublicPrivateOffer } = require('../services/mappers');

const router = express.Router();
const otpRate = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

const GENERIC_DENY = 'تعذر التحقق — تأكد من الرقم أو تواصل مع مكتب الهيف';

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
  next();
}

async function loadActiveClientForSlug(slug) {
  const globalActive = await privateClientsRepo.isGlobalActive();
  if (!globalActive) {
    return { error: { status: 403, message: 'صفحة العروض الخاصة موقوفة مؤقتًا — تواصل مع مكتب الهيف' } };
  }
  const client = await privateClientsRepo.getClientBySlugAny(slug);
  if (!client) {
    return { error: { status: 404, message: 'هذا الرابط غير صالح — اطلب رابطًا جديدًا من مكتب الهيف' } };
  }
  if (!client.active) {
    return { error: { status: 403, message: 'هذا الرابط متوقف — اطلب رابطًا جديدًا من مكتب الهيف' } };
  }
  return { client };
}

/** إرسال OTP — لا يُنشأ حساب هنا */
router.post('/otp/send', requireDb, async (req, res) => {
  try {
    if (!otpRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: otpCore.errorMessage('rate_limited') });
    }
    const slug = String(req.body.slug || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!slug || !phone) {
      return res.status(400).json({ success: false, message: 'أدخل رقم الجوال' });
    }
    if (!isValidSaudiMobile(phone)) {
      return res.status(400).json({ success: false, message: otpCore.errorMessage('bad_phone') });
    }

    const loaded = await loadActiveClientForSlug(slug);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }

    const clientPhone = normalizeAccountPhone(loaded.client.phone);
    if (!clientPhone || !phonesEqual(phone, clientPhone)) {
      // لا نكشف إن الرقم مختلف عن المسجّل
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }

    const sent = await otpCore.sendOtp({
      purpose: 'private_offer',
      phone,
      meta: { slug, clientAccessId: loaded.client.id },
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    });
    if (!sent.ok) {
      const status = sent.reason === 'rate_limited' || sent.reason === 'cooldown' ? 429
        : sent.reason === 'not_configured' ? 503 : 400;
      return res.status(status).json({ success: false, message: otpCore.errorMessage(sent.reason) });
    }

    res.json({
      success: true,
      challengeId: sent.challengeId,
      cooldownSec: sent.cooldownSec,
      expiresInSec: sent.expiresInSec,
      message: 'تم إرسال رمز التحقق إلى واتساب',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر إرسال رمز التحقق' });
  }
});

router.post('/otp/resend', requireDb, async (req, res) => {
  try {
    if (!otpRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: otpCore.errorMessage('rate_limited') });
    }
    const challengeId = String(req.body.challengeId || '').trim();
    if (!challengeId) {
      return res.status(400).json({ success: false, message: otpCore.errorMessage('invalid') });
    }
    const sent = await otpCore.resendOtp(challengeId);
    if (!sent.ok) {
      const status = sent.reason === 'rate_limited' || sent.reason === 'cooldown' ? 429 : 400;
      return res.status(status).json({
        success: false,
        message: otpCore.errorMessage(sent.reason),
        retryAfter: sent.cooldownSec || undefined,
      });
    }
    res.json({
      success: true,
      challengeId: sent.challengeId,
      cooldownSec: sent.cooldownSec,
      expiresInSec: sent.expiresInSec,
      message: 'تم إعادة إرسال رمز التحقق إلى واتساب',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر إعادة إرسال الرمز' });
  }
});

/** بعد نجاح OTP: إنشاء/جلب app_users ثم منح دخول العرض إن طابق الرقم */
router.post('/otp/verify', requireDb, async (req, res) => {
  try {
    if (!otpRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: otpCore.errorMessage('rate_limited') });
    }
    const slug = String(req.body.slug || '').trim();
    const challengeId = String(req.body.challengeId || '').trim();
    const code = String(req.body.code || '').trim();
    if (!slug || !challengeId || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'أدخل رمز التحقق المكوّن من 6 أرقام' });
    }

    const result = otpCore.verifyOtp(challengeId, code);
    if (!result.ok) {
      const status = result.reason === 'bad_code' ? 401 : 400;
      return res.status(status).json({ success: false, message: otpCore.errorMessage(result.reason) });
    }
    if (result.purpose !== 'private_offer' || result.meta?.slug !== slug) {
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }

    // إنشاء حساب client فقط بعد نجاح التحقق
    try {
      await appUsersRepo.ensureUserAfterOtpVerify({
        phone: result.phone,
        defaultRole: 'client',
        createIfMissing: true,
      });
    } catch (err) {
      console.warn('[private-offers] app_users:', err.message);
    }

    const loaded = await loadActiveClientForSlug(slug);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    if (!phonesEqual(result.phone, loaded.client.phone)) {
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }

    try {
      const contactsRepo = require('../repositories/contactsRepo');
      await contactsRepo.upsertContact({
        phone: result.phone,
        name: loaded.client.clientLabel || null,
        businessRole: 'private_client',
        businessRoles: ['client'],
        source: 'private_offer',
        sourceRef: slug,
      });
    } catch (err) {
      console.warn('[private-offers] contacts:', err.message);
    }

    await privateClientsRepo.recordClientLogin(loaded.client.id);
    const token = createPrivateViewerToken(loaded.client.id);
    res.json({ success: true, token, phone: result.phone });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر التحقق من الرمز' });
  }
});

/** مسار قديم — لم يعد يدعم رمز الدخول المستقل */
router.post('/verify', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'تم الانتقال للتحقق عبر واتساب — أدخل رقم الجوال ثم رمز التحقق',
  });
});

router.get('/session', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = parseToken(token);
  if (!payload || payload.role !== 'private_viewer') {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true, clientId: payload.userId || null });
});

router.get('/', requireDb, requirePrivateViewer, async (_req, res) => {
  try {
    const offers = await privateOffersRepo.listPublic();
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', requireDb, requirePrivateViewer, async (req, res) => {
  try {
    const offer = await privateOffersRepo.getById(req.params.id);
    if (!offer || !offer.active || !offer.visible || offer.status === 'hidden') {
      return res.status(404).json({ success: false, message: 'العرض غير متاح' });
    }
    res.json({ success: true, offer: toPublicPrivateOffer(offer) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
