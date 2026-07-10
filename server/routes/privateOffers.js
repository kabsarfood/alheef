const express = require('express');
const { isEnabled } = require('../lib/supabase');
const { createPrivateViewerToken, requirePrivateViewer, parseToken } = require('../middleware/auth');
const { verifyPassword } = require('../utils/password');
const privateOffersRepo = require('../repositories/privateOffersRepo');
const privateAccessRepo = require('../repositories/privateAccessRepo');
const { toPublicPrivateOffer } = require('../services/mappers');

const router = express.Router();

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
  next();
}

router.post('/verify', requireDb, async (req, res) => {
  try {
    const slug = String(req.body.slug || '').trim();
    const code = String(req.body.code || '').trim();
    if (!slug || !code) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال رمز الدخول' });
    }

    const access = await privateAccessRepo.getAccessBySlugAny(slug);
    if (!access) {
      return res.status(404).json({
        success: false,
        message: 'هذا الرابط لم يعد صالحًا — ربما تم إنشاء رابط جديد. اطلب الرابط المحدّث من مكتب الهيف',
      });
    }
    if (!access.active) {
      return res.status(403).json({
        success: false,
        message: 'صفحة العروض الخاصة موقوفة مؤقتًا — تواصل مع مكتب الهيف',
      });
    }

    const { data: row } = await require('../lib/supabase').getAdmin()
      .from('private_offers_access')
      .select('access_code_hash')
      .eq('page_slug', slug)
      .maybeSingle();

    if (!row?.access_code_hash) {
      return res.status(503).json({ success: false, message: 'رمز الدخول غير مفعّل بعد — تواصل مع المكتب' });
    }
    if (!verifyPassword(code, row.access_code_hash)) {
      return res.status(401).json({ success: false, message: 'رمز الدخول غير صحيح' });
    }

    const token = createPrivateViewerToken();
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/session', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = parseToken(token);
  if (!payload || payload.role !== 'private_viewer') {
    return res.json({ authenticated: false });
  }
  res.json({ authenticated: true });
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
