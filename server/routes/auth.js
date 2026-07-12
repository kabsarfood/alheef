const express = require('express');
const { createToken, verifyToken, checkPassword, parseToken } = require('../middleware/auth');
const marketersRepo = require('../repositories/marketersRepo');
const passwordResetRepo = require('../repositories/passwordResetRepo');
const { sendPasswordResetEmail, buildResetUrl } = require('../services/emailService');
const { normalizeEmail, isValidEmail } = require('../utils/email');

const { normalizePhone } = require('../utils/marketerZones');

const router = express.Router();

const FORGOT_MSG = 'إذا كان البريد مسجّلاً ومعتمداً، سيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.';

function allowedAdminPhone() {
  return normalizePhone(process.env.ADMIN_PHONE || '0530792754');
}

function isAllowedAdminPhone(phone) {
  return normalizePhone(phone) === allowedAdminPhone();
}

router.post('/login', (req, res) => {
  const phone = req.body.phone || req.body.login;
  const { password } = req.body;
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
  const token = createToken({ role: 'admin', userId: allowedAdminPhone() });
  res.json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token,
    role: 'admin',
  });
});

router.post('/marketer/login', async (req, res) => {
  try {
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

router.get('/verify', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const payload = parseToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  res.json({
    success: true,
    authenticated: true,
    role: payload.role,
    marketerId: payload.marketerId || null,
  });
});

router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

module.exports = router;
