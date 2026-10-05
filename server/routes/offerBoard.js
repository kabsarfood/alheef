const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const board = require('../services/offerBoard');
const offerLeads = require('../services/offerLeads');

const router = express.Router();
router.use(requireAdmin);

const publicRouter = express.Router();

publicRouter.get('/', async (req, res) => {
  try {
    const data = await board.listBoard({ ...req.query, archive: '0' }, { admin: false });
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[offer-board]', err.message);
    res.status(500).json({ ok: false, message: 'تعذر تحميل العروض' });
  }
});

publicRouter.get('/:id', async (req, res) => {
  try {
    const item = await board.getBoardItem(req.params.id, { admin: false });
    if (!item) return res.status(404).json({ ok: false, message: 'العقار غير موجود' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error('[offer-board]', err.message);
    res.status(500).json({ ok: false, message: 'تعذر تحميل التفاصيل' });
  }
});

router.get('/', async (req, res) => {
  try {
    const data = await board.listBoard(req.query, { admin: true });
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[offer-board]', err.message);
    res.status(500).json({ ok: false, message: 'تعذر تحميل العروض' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await board.getBoardItem(req.params.id, { admin: true });
    if (!item) return res.status(404).json({ ok: false, message: 'العقار غير موجود' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error('[offer-board]', err.message);
    res.status(500).json({ ok: false, message: 'تعذر تحميل التفاصيل' });
  }
});

router.post('/:id/share', async (req, res) => {
  try {
    const clientId = String(req.body?.clientId || '').trim();
    if (!clientId) return res.status(400).json({ success: false, message: 'اختر العميل' });
    const outcome = await offerLeads.shareListing({
      clientId,
      propertyId: req.params.id,
      audience: 'admin',
    });
    res.status(outcome.status).json(outcome.body);
  } catch (err) {
    console.warn('[offer-board] admin share failed');
    res.status(500).json({ success: false, message: 'تعذر إرسال الإعلان' });
  }
});

router.post('/:id/action', async (req, res) => {
  try {
    const item = await board.applyAction(req.params.id, String(req.body?.action || ''));
    res.json({ ok: true, item });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ ok: false, message: status === 500 ? 'تعذر تحديث الإعلان' : err.message });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
