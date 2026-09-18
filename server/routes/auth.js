const express = require('express');
const { createToken, checkPassword, parseToken, revokeToken, extractBearerToken } = require('../middleware/auth');
const { getAdminPhoneRaw } = require('../lib/authConfig');
const { createRateLimiter } = require('../utils/rateLimit');
const marketersRepo = require('../repositories/marketersRepo');
const passwordResetRepo = require('../repositories/passwordResetRepo');
const otpService = require('../services/otpService');
const appUsersRepo = require('../repositories/appUsersRepo');
const { sendPasswordResetEmail, buildResetUrl } = require('../services/emailService');
const { normalizeEmail, isValidEmail } = require('../utils/email');
const { isValidSaudiMobile, normalizeAccountPhone } = require('../utils/phone');

const { normalizePhone } = require('../utils/marketerZones');

const router = express.Router();

const LOGIN_RATE_MSG = 'محاولات كثيرة — حاول مرة أخرى بعد ربع ساعة';
const loginRate = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const setupPasswordRate = createRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const forgotPasswordRate = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const otpIpRate = createRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
const otpStartRate = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

function allowOtpIp(req) {
  return otpIpRate.allowRequest(req);
}

async function startOtpChallenge(res, { purpose, phone, marketerId, userId, pendingMessage }) {
  const sent = await otpService.sendLoginOtp({ purpose, phone, marketerId, userId });
  if (!sent.ok) {
    const status = sent.reason === 'rate_limited' ? 429 : 503;
    return res.status(status).json({
      success: false,
      message: otpService.otpErrorMessage(sent.reason),
    });
  }
  return res.json({
    success: true,
    needsOtp: true,
    challengeId: sent.challengeId,
    message: pendingMessage || 'تم إرسال رمز التحقق إلى واتساب',
  });
}

const FORGOT_MSG = 'إذا كان البريد مسجّلاً ومعتمداً، سيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.';
const ADMIN_DENY = 'غير مصرح بالدخول إلى لوحة التحكم';

function allowedAdminPhone() {
  const raw = getAdminPhoneRaw();
  return raw ? normalizePhone(raw) : '';
}

function isAllowedAdminPhone(phone) {
  const allowed = allowedAdminPhone();
  if (!allowed) return false;
  return normalizePhone(phone) === allowed;
}

/** أدمن = ADMIN_PHONE من env أو دور admin في app_users (ليس إثبات OTP وحده) */
async function isAuthorizedAdminPhone(phone) {
  const normalized = normalizeAccountPhone(phone) || normalizePhone(phone);
  if (!normalized) return false;
  if (isAllowedAdminPhone(normalized)) return true;
  try {
    const user = await appUsersRepo.findByPhone(normalized);
    if (!user) return false;
    const roles = await appUsersRepo.getRoles(user.id);
    return Array.isArray(roles) && roles.includes('admin');
  } catch {
    return false;
  }
}

/**
 * بدء OTP للأدمن بالجوال فقط (بدون كلمة مرور).
 * كلمة المرور تبقى متاحة عبر POST /login كـ fallback.
 */
router.post('/otp/start', async (req, res) => {
  try {
    if (!otpStartRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: LOGIN_RATE_MSG });
    }
    if (!otpService.isEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'خدمة التحقق عبر واتساب غير مهيأة — استخدم الدخول بكلمة المرور مؤقتاً',
      });
    }
    const phone = String(req.body.phone || req.body.login || '').trim();
    if (!phone || !isValidSaudiMobile(phone)) {
      return res.status(400).json({ success: false, message: 'أدخل رقم جوال سعودي صحيح' });
    }

    const authorized = await isAuthorizedAdminPhone(phone);
    if (!authorized) {
      // لا نكشف إن الرقم أدمن أم لا
      return res.status(401).json({ success: false, message: ADMIN_DENY });
    }

    const adminPhone = normalizeAccountPhone(phone);
    return startOtpChallenge(res, {
      purpose: 'admin',
      phone: adminPhone,
      userId: adminPhone,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر إرسال رمز التحقق' });
  }
});

router.post('/login', async (req, res) => {
  if (!loginRate.allowRequest(req)) {
    return res.status(429).json({ success: false, message: LOGIN_RATE_MSG });
  }
  const phone = req.body.phone || req.body.login;
  const { password } = req.body;
  if (!allowedAdminPhone()) {
    return res.status(503).json({
      success: false,
      message: 'دخول الإدارة غير مفعّل — عرّف ADMIN_PHONE في المتغيرات',
    });
  }
  if (!phone) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال رقم الجوال' });
  }
  if (!password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة المرور' });
  }
  if (!isAllowedAdminPhone(phone)) {
    return res.status(401).json({ success: false, message: 'رقم الجوال غير مصرح له بالدخول إلى لوحة التحكم' });
  }
  if (!checkPassword(password)) {
    return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
  }
  const adminPhone = allowedAdminPhone();
  if (otpService.isEnabled()) {
    return startOtpChallenge(res, {
      purpose: 'admin',
      phone: adminPhone,
      userId: adminPhone,
    });
  }
  const token = createToken({ role: 'admin', userId: adminPhone });
  res.json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token,
    role: 'admin',
    phone: adminPhone,
  });
});

router.post('/marketer/login', async (req, res) => {
  try {
    if (!loginRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: LOGIN_RATE_MSG });
    }
    const login = req.body.login || req.body.phone || req.body.email;
    const { password } = req.body;
    if (!login) {
      return res.status(400).json({ success: false, message: 'أدخل رقم الجوال أو البريد الإلكتروني' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'أدخل كلمة المرور' });
    }

    const result = await marketersRepo.verifyLogin(login, password);
    if (!result.ok) {
      if (result.reason === 'needs_password') {
        return res.status(403).json({
          success: false,
          needsPasswordSetup: true,
          message: 'يجب إنشاء كلمة مرور لأول مرة',
        });
      }
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    if (otpService.isEnabled()) {
      return startOtpChallenge(res, {
        purpose: 'marketer',
        phone: result.marketer.phone,
        marketerId: result.marketer.id,
        userId: result.marketer.id,
      });
    }

    const token = createToken({ role: 'marketer', marketerId: result.marketer.id, userId: result.marketer.id });
    res.json({
      success: true,
      message: 'مرحباً بك في لوحة مسوق الهيف',
      token,
      role: 'marketer',
      marketer: marketersRepo.toPublic(result.marketer),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/marketer/setup-password', async (req, res) => {
  try {
    if (!setupPasswordRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: LOGIN_RATE_MSG });
    }
    const { phone, nationalId, password, confirmPassword } = req.body;
    if (!phone || !nationalId || !password) {
      return res.status(400).json({ success: false, message: 'أكمل جميع الحقول' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'كلمتا المرور غير متطابقتين' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور 6 أحرف على الأقل' });
    }
    const marketer = await marketersRepo.setupFirstPassword(phone, nationalId, password);
    if (otpService.isEnabled()) {
      return startOtpChallenge(res, {
        purpose: 'marketer',
        phone: marketer.phone,
        marketerId: marketer.id,
        userId: marketer.id,
        pendingMessage: 'تم إنشاء كلمة المرور — أدخل رمز التحقق المرسل إلى واتساب',
      });
    }
    const token = createToken({ role: 'marketer', marketerId: marketer.id, userId: marketer.id });
    res.json({
      success: true,
      message: 'تم إنشاء كلمة المرور بنجاح',
      token,
      role: 'marketer',
      marketer: marketersRepo.toPublic(marketer),
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/marketer/forgot-password', async (req, res) => {
  try {
    if (!forgotPasswordRate.allowRequest(req)) {
      return res.status(429).json({ success: false, message: LOGIN_RATE_MSG });
    }
    const email = normalizeEmail(req.body.email);
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'أدخل بريداً إلكترونياً صالحاً' });
    }

    const marketer = await marketersRepo.findApprovedByEmail(email);
    if (marketer) {
      const { token } = await passwordResetRepo.createToken(marketer.id);
      const resetUrl = buildResetUrl(token);
      await sendPasswordResetEmail(email, resetUrl);
    }

    res.json({ success: true, message: FORGOT_MSG });
  } catch (err) {
    console.warn('[auth] forgot-password:', err.message);
    res.json({ success: true, message: FORGOT_MSG });
  }
});

router.post('/marketer/reset-password', async (req, res) => {
  try {
    const { token, password, confirmPassword } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'رابط غير صالح' });
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور 6 أحرف على الأقل' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'كلمتا المرور غير متطابقتين' });
    }

    const row = await passwordResetRepo.findValidToken(token);
    if (!row) {
      return res.status(400).json({ success: false, message: 'الرابط منتهٍ أو غير صالح — اطلب رابطاً جديداً' });
    }

    await marketersRepo.setPassword(row.marketer_id, password);
    await passwordResetRepo.markUsed(row.id);

    res.json({ success: true, message: 'تم تعيين كلمة المرور الجديدة — يمكنك تسجيل الدخول الآن' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/otp/verify', async (req, res) => {
  try {
    if (!allowOtpIp(req)) {
      return res.status(429).json({ success: false, message: otpService.otpErrorMessage('rate_limited') });
    }
    const challengeId = String(req.body.challengeId || '').trim();
    const code = String(req.body.code || '').trim();
    if (!challengeId || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'أدخل رمز التحقق المكوّن من 6 أرقام' });
    }
    const result = otpService.verify(challengeId, code);
    if (!result.ok) {
      const status = result.reason === 'bad_code' ? 401 : 400;
      return res.status(status).json({ success: false, message: otpService.otpErrorMessage(result.reason) });
    }

    // إنشاء/تحديث app_users بعد نجاح OTP فقط (لا يُمنح admin تلقائياً)
    if (result.purpose === 'admin') {
      const allowed = await isAuthorizedAdminPhone(result.phone);
      if (!allowed) {
        return res.status(401).json({ success: false, message: ADMIN_DENY });
      }
      try {
        await appUsersRepo.ensureUserAfterOtpVerify({
          phone: result.phone,
          ensureRoles: ['admin'],
          defaultRole: 'admin',
          createIfMissing: true,
        });
      } catch (err) {
        console.warn('[auth] app_users after otp:', err.message);
      }
      const token = createToken({ role: 'admin', userId: result.userId || result.phone });
      return res.json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح',
        token,
        role: 'admin',
        phone: result.phone,
      });
    }
    if (result.purpose === 'marketer') {
      try {
        await appUsersRepo.ensureUserAfterOtpVerify({
          phone: result.phone,
          ensureRoles: ['marketer'],
          defaultRole: 'marketer',
          createIfMissing: true,
        });
      } catch (err) {
        console.warn('[auth] app_users after otp:', err.message);
      }
      const marketer = await marketersRepo.getById(result.marketerId);
      if (!marketer || marketer.status !== 'active') {
        return res.status(401).json({ success: false, message: 'الحساب غير متاح' });
      }
      const token = createToken({ role: 'marketer', marketerId: marketer.id, userId: marketer.id });
      return res.json({
        success: true,
        message: 'مرحباً بك في لوحة مسوق الهيف',
        token,
        role: 'marketer',
        marketer: marketersRepo.toPublic(marketer),
      });
    }
    return res.status(400).json({ success: false, message: 'انتهت صلاحية رمز التحقق — أعد تسجيل الدخول' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر التحقق من الرمز' });
  }
});

router.post('/otp/resend', async (req, res) => {
  try {
    if (!allowOtpIp(req)) {
      return res.status(429).json({ success: false, message: otpService.otpErrorMessage('rate_limited') });
    }
    const challengeId = String(req.body.challengeId || '').trim();
    if (!challengeId) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية رمز التحقق — أعد تسجيل الدخول' });
    }
    const sent = await otpService.resend(challengeId);
    if (!sent.ok) {
      const status = sent.reason === 'rate_limited' || sent.reason === 'cooldown' ? 429 : 400;
      return res.status(status).json({ success: false, message: otpService.otpErrorMessage(sent.reason) });
    }
    return res.json({
      success: true,
      challengeId: sent.challengeId,
      message: 'تم إعادة إرسال رمز التحقق إلى واتساب',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'تعذر إعادة إرسال الرمز' });
  }
});

router.get('/verify', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = parseToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  res.json({
    success: true,
    authenticated: true,
    role: payload.role,
    marketerId: payload.marketerId || null,
    adminPhone: payload.role === 'admin' ? (payload.userId || allowedAdminPhone() || null) : null,
  });
});

router.post('/logout', (req, res) => {
  const token = extractBearerToken(req);
  if (token) revokeToken(token);
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

module.exports = router;
