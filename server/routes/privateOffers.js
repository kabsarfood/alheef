const express = require('express');
const { isEnabled } = require('../lib/supabase');
const { createPrivateViewerToken, requirePrivateViewer, parseToken, revokeToken } = require('../middleware/auth');
const { createRateLimiter } = require('../utils/rateLimit');
const { phonesEqual, isValidSaudiMobile, normalizeAccountPhone } = require('../utils/phone');
const otpCore = require('../services/whatsappOtpCore');
const appUsersRepo = require('../repositories/appUsersRepo');
const privateOffersRepo = require('../repositories/privateOffersRepo');
const privateClientsRepo = require('../repositories/privateClientsRepo');
const { toPublicPrivateOffer } = require('../services/mappers');
const offerBoard = require('../services/offerBoard');
const offerLeads = require('../services/offerLeads');
const device = require('../services/privateDevice');

const router = express.Router();
const otpRate = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

const GENERIC_DENY = 'تعذر التحقق — تأكد من الرقم أو تواصل مع مكتب الهيف';

function maskPhone(phone) {
  const local = normalizeAccountPhone(phone);
  if (!local) return '';
  return `${local.slice(0, 2)}••• ••${local.slice(-2)}`;
}

async function guardRow(clientId) {
  if (!clientId) return null;
  const { getAdmin } = require('../lib/supabase');
  const { data } = await getAdmin()
    .from('private_client_access')
    .select('id, phone, active, device_status, device_token_hash, access_epoch, page_slug, client_label')
    .eq('id', clientId)
    .maybeSingle();
  return data || null;
}

async function guardBySlug(slug) {
  const loaded = await loadActiveClientForSlug(slug);
  if (loaded.error) return loaded;
  const row = await guardRow(loaded.client.id);
  if (!row) return { error: { status: 404, message: 'هذا الرابط غير صالح — اطلب رابطًا جديدًا من مكتب الهيف' } };
  return { client: loaded.client, row };
}

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
    if (!slug) {
      return res.status(400).json({ success: false, message: 'الرابط غير صالح' });
    }

    const loaded = await guardBySlug(slug);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    if (loaded.row.device_status === 'revoked') {
      return res.status(403).json({ success: false, code: 'other_device', message: device.OTHER_MESSAGE });
    }

    const clientPhone = normalizeAccountPhone(loaded.row.phone);
    if (!clientPhone || !isValidSaudiMobile(clientPhone)) {
      return res.status(400).json({ success: false, message: GENERIC_DENY });
    }

    const sent = await otpCore.sendOtp({
      purpose: 'private_offer',
      phone: clientPhone,
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

/** الرابط داخل رسالة واتساب — يعيد الرمز فقط لنفس الجهاز الذي طلب الدخول */
router.post('/otp/autofill', requireDb, async (req, res) => {
  try {
    if (!otpRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: otpCore.errorMessage('rate_limited') });
    }
    const slug = String(req.body.slug || '').trim();
    const fill = String(req.body.fill || '').trim();
    if (!slug || fill.length < 16) {
      return res.status(400).json({ success: false, message: 'تعذر تعبئة الرمز. انسخه من واتساب والصقه في المربع' });
    }

    const loaded = await guardBySlug(slug);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    if (loaded.row.device_status === 'revoked') {
      return res.status(403).json({ success: false, code: 'other_device', message: device.OTHER_MESSAGE });
    }

    const claimed = otpCore.claimAutofill(fill);
    if (!claimed.ok) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية رابط التعبئة. انسخ الرمز من واتساب والصقه في المربع' });
    }
    if (claimed.purpose !== 'private_offer' || claimed.meta?.slug !== slug) {
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }

    res.json({
      success: true,
      challengeId: claimed.challengeId,
      code: claimed.code,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر تعبئة الرمز' });
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

    const loaded = await guardBySlug(slug);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    if (!phonesEqual(result.phone, loaded.row.phone)) {
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }
    const state = device.deviceState(loaded.row, device.readDeviceCookie(req));
    if (loaded.row.device_status === 'revoked') {
      await privateClientsRepo.noteDeviceAttempt(loaded.row.id, device.deviceKind(req.headers['user-agent']));
      return res.status(403).json({ success: false, code: 'other_device', message: device.OTHER_MESSAGE });
    }
    if (state === 'same') {
      device.setDeviceCookie(req, res, device.readDeviceCookie(req));
      await privateClientsRepo.touchClientDevice(loaded.row.id);
    } else {
      const secret = device.newDeviceSecret();
      const payload = {
        tokenHash: device.hashDevice(secret),
        label: device.deviceLabel(req.headers['user-agent']),
      };
      try {
        if (state === 'other') await privateClientsRepo.rebindClientDevice(loaded.row.id, payload);
        else await privateClientsRepo.bindClientDevice(loaded.row.id, payload);
      } catch (err) {
        if (err.code === 'DEVICE_BOUND') {
          return res.status(403).json({ success: false, code: 'other_device', message: device.OTHER_MESSAGE });
        }
        throw err;
      }
      device.setDeviceCookie(req, res, secret);
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
    const fresh = await guardRow(loaded.row.id);
    const token = createPrivateViewerToken(loaded.client.id, fresh?.access_epoch);
    res.json({ success: true, token, clientName: loaded.client.clientLabel || '' });
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

router.get('/gate', requireDb, async (req, res) => {
  try {
    const slug = String(req.query.slug || '').trim();
    const loaded = await guardBySlug(slug);
    if (loaded.error) {
      return res.status(loaded.error.status).json({ success: false, message: loaded.error.message });
    }
    const state = device.deviceState(loaded.row, device.readDeviceCookie(req));
    if (loaded.row.device_status === 'revoked') {
      return res.json({ success: true, state: 'other', message: device.OTHER_MESSAGE });
    }
    res.json({
      success: true,
      state: state === 'same' ? 'same' : 'open',
      phoneMasked: maskPhone(loaded.row.phone),
      clientName: loaded.client.clientLabel || '',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر فتح الرابط' });
  }
});

router.get('/session', requireDb, async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = parseToken(token);
  if (!payload || payload.role !== 'private_viewer') {
    return res.json({ authenticated: false });
  }
  const row = await guardRow(payload.userId);
  const state = device.deviceState(row, device.readDeviceCookie(req));
  if (!row || row.active === false || state !== 'same' || Number(payload.epoch) !== Number(row.access_epoch)) {
    return res.json({ authenticated: false });
  }
  await privateClientsRepo.touchClientDevice(row.id);
  res.json({
    authenticated: true,
    token: createPrivateViewerToken(row.id, row.access_epoch),
    clientName: row.client_label || '',
    slug: row.page_slug || '',
  });
});

router.post('/portal/otp/send', requireDb, async (req, res) => {
  try {
    if (!otpRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: otpCore.errorMessage('rate_limited') });
    }
    const phone = normalizeAccountPhone(req.body?.phone);
    if (!phone || !isValidSaudiMobile(phone)) {
      return res.status(400).json({ success: false, message: 'أدخل رقم جوال سعودي صحيح' });
    }
    const client = await privateClientsRepo.findActiveClientByPhone(phone);
    if (!client) {
      return res.status(403).json({
        success: false,
        code: 'not_activated',
        message: 'أول دخول يتم من الرابط الذي يصلك من الهيف. بعد تفعيل واتساب يمكنك الدخول من هنا.',
      });
    }
    const row = await guardRow(client.id);
    const state = device.deviceState(row, device.readDeviceCookie(req));
    if (state !== 'same') {
      const message = state === 'open'
        ? 'فعّل الدخول أول مرة من الرابط على هذا الجهاز، ثم عد من بوابة المستخدم.'
        : device.OTHER_MESSAGE;
      return res.status(403).json({ success: false, code: 'other_device', message });
    }
    const sent = await otpCore.sendOtp({
      purpose: 'user_portal',
      phone,
      meta: { clientAccessId: client.id, slug: row.page_slug },
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

router.post('/portal/otp/verify', requireDb, async (req, res) => {
  try {
    if (!otpRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: otpCore.errorMessage('rate_limited') });
    }
    const phone = normalizeAccountPhone(req.body?.phone);
    const challengeId = String(req.body?.challengeId || '').trim();
    const code = String(req.body?.code || '').trim();
    if (!phone || !challengeId || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'أدخل رمز التحقق المكوّن من 6 أرقام' });
    }
    const result = otpCore.verifyOtp(challengeId, code);
    if (!result.ok) {
      const status = result.reason === 'bad_code' ? 401 : 400;
      return res.status(status).json({ success: false, message: otpCore.errorMessage(result.reason) });
    }
    if (result.purpose !== 'user_portal' || !phonesEqual(result.phone, phone)) {
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }
    const client = await privateClientsRepo.findActiveClientByPhone(phone);
    const row = client ? await guardRow(client.id) : null;
    if (!row || result.meta?.clientAccessId !== row.id) {
      return res.status(401).json({ success: false, message: GENERIC_DENY });
    }
    const state = device.deviceState(row, device.readDeviceCookie(req));
    if (state !== 'same') {
      return res.status(403).json({ success: false, code: 'other_device', message: device.OTHER_MESSAGE });
    }
    device.setDeviceCookie(req, res, device.readDeviceCookie(req));
    await privateClientsRepo.touchClientDevice(row.id);
    await privateClientsRepo.recordClientLogin(row.id);
    const fresh = await guardRow(row.id);
    res.json({
      success: true,
      token: createPrivateViewerToken(row.id, fresh?.access_epoch),
      slug: row.page_slug || '',
      clientName: row.client_label || '',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر التحقق من الرمز' });
  }
});

router.post('/logout', requireDb, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  revokeToken(token);
  res.json({ success: true });
});

async function requireSameDevice(req, res, next) {
  try {
    const row = await guardRow(req.auth?.userId);
    const state = device.deviceState(row, device.readDeviceCookie(req));
    if (!row || row.active === false || state !== 'same') {
      return res.status(403).json({ success: false, code: 'other_device', message: device.OTHER_MESSAGE });
    }
    if (Number(req.auth?.epoch) !== Number(row.access_epoch)) {
      return res.status(401).json({ success: false, message: 'انتهت الجلسة' });
    }
    await privateClientsRepo.touchClientDevice(row.id);
    return next();
  } catch (err) {
    return res.status(403).json({ success: false, message: device.OTHER_MESSAGE });
  }
}

router.get('/board', requireDb, requirePrivateViewer, requireSameDevice, async (_req, res) => {
  try {
    const items = await offerBoard.listClientCatalog();
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر تحميل العروض' });
  }
});

router.post('/board/:id/share', requireDb, requirePrivateViewer, requireSameDevice, async (req, res) => {
  try {
    const outcome = await offerLeads.shareListing({
      clientId: req.auth.userId,
      propertyId: String(req.params.id || ''),
    });
    res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.warn('[offer-leads] share failed');
    res.status(500).json({ success: false, message: 'تعذر إرسال الإعلان' });
  }
});

router.get('/board/:id', requireDb, requirePrivateViewer, requireSameDevice, async (req, res) => {
  try {
    const item = await offerBoard.getBoardItem(req.params.id, { admin: false });
    if (!item) return res.status(404).json({ success: false, message: 'العرض غير متاح' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر فتح العرض' });
  }
});

router.get('/', requireDb, requirePrivateViewer, requireSameDevice, async (_req, res) => {
  try {
    const offers = await privateOffersRepo.listPublic();
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', requireDb, requirePrivateViewer, requireSameDevice, async (req, res) => {
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
