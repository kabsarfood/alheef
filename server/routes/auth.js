const express = require('express');
const { createToken, verifyToken, checkPassword, parseToken } = require('../middleware/auth');
const marketersRepo = require('../repositories/marketersRepo');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة المرور' });
  }
  if (!checkPassword(password)) {
    return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
  }
  const token = createToken({ role: 'admin' });
  res.json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token,
    role: 'admin',
  });
});

router.post('/marketer/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'أدخل رقم الجوال' });
    const result = await marketersRepo.verifyLogin(phone, password);
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
      message: 'تمت الموافقة عليك لتكون أحد فريق المسوقين لدى مكتب الهيف للخدمات العقارية.',
      token,
      role: 'marketer',
      marketer: marketersRepo.toPublic(marketer),
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/marketer/forgot-password', async (req, res) => {
  res.json({
    success: true,
    message: 'تواصل مع إدارة مكتب الهيف عبر واتساب لإعادة تعيين كلمة المرور.',
  });
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

