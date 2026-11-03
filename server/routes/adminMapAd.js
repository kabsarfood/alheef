const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { uploadMemory } = require('../middleware/upload');
const service = require('../services/adminMapAd');

const router = express.Router();
router.use(requireAdmin);

function fail(res, err) {
  const status = err.status || 500;
  res.status(status).json({ success: false, message: err.message || 'تعذر إكمال الطلب', missing: err.missing || undefined });
}

router.post('/preview', async (req, res) => {
  try {
    const data = await service.preview(req.body?.text, req.body?.mapsUrl, req.body?.latitude, req.body?.longitude);
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/draft', uploadMemory.array('images', 12), async (req, res) => {
  try {
    let edits = {};
    if (req.body?.edits) {
      edits = typeof req.body.edits === 'string' ? JSON.parse(req.body.edits) : req.body.edits;
    }
    const result = await service.createDraft({
      text: req.body?.text,
      mapsUrl: req.body?.mapsUrl,
      sourcePhone: req.body?.sourcePhone,
      latitude: req.body?.latitude,
      longitude: req.body?.longitude,
      edits,
      files: req.files || [],
    });
    res.json({ success: true, ...result });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/otp', async (req, res) => {
  try {
    const data = await service.startPublishOtp({ propertyId: req.params.id, ip: req.ip });
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/verify', async (req, res) => {
  try {
    const data = await service.publishWithOtp({
      propertyId: req.params.id,
      challengeId: req.body?.challengeId,
      code: req.body?.code,
    });
    res.json({
      success: true,
      ...data,
      mapUrl: data.slug ? `/property.html?slug=${encodeURIComponent(data.slug)}` : '/private-offers',
    });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
