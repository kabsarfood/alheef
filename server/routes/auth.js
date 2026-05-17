const express = require('express');
const { createToken, verifyToken, checkPassword } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة المرور' });
  }
  if (!checkPassword(password)) {
    return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
  }
  const token = createToken();
  res.json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token,
  });
});

router.get('/verify', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!verifyToken(token)) {
    return res.status(401).json({ success: false, authenticated: false });
  }
  res.json({ success: true, authenticated: true });
});

router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'تم تسجيل الخروج' });
});

module.exports = router;
