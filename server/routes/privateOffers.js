const express = require('express');
const { isEnabled } = require('../lib/supabase');
const { createPrivateViewerToken, requirePrivateViewer, parseToken } = require('../middleware/auth');
const { verifyPassword } = require('../utils/password');
const privateOffersRepo = require('../repositories/privateOffersRepo');
const privateClientsRepo = require('../repositories/privateClientsRepo');
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

    const globalActive = await privateClientsRepo.isGlobalActive();
    if (!globalActive) {
      return res.status(403).json({
        success: false,
        message: 'صفحة العروض الخاصة موقوفة مؤقتًا — تواصل مع مكتب الهيف',
      });
    }

    const client = await privateClientsRepo.getClientBySlugAny(slug);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'هذا الرابط غير صالح — اطلب رابطًا جديدًا من مكتب الهيف',
      });
    }
    if (!client.active) {
      return res.status(403).json({
        success: false,
        message: 'هذا الرابط متوقف — اطلب رابطًا جديدًا من مكتب الهيف',
      });
    }

    const hash = await privateClientsRepo.getClientCodeHash(slug);
    if (!hash || !verifyPassword(code, hash)) {
      return res.status(401).json({ success: false, message: 'رمز الدخول غير صحيح' });
    }

    await privateClientsRepo.recordClientLogin(client.id);
    const token = createPrivateViewerToken(client.id);
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
