const express = require('express');
const { uploadMemory } = require('../middleware/upload');
const { createRateLimiter } = require('../utils/rateLimit');
const service = require('../services/adminMapAd');

const router = express.Router();
const previewLimit = createRateLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
const draftLimit = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const otpLimit = createRateLimiter({ max: 6, windowMs: 15 * 60 * 1000 });
const verifyLimit = createRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });

function fail(res, err) {
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'تعذر إكمال الطلب',
    missing: err.missing || undefined,
  });
}

function limited(limiter) {
  return (req, res, next) => {
    if (!limiter.allowRequest(req)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة. حاول بعد قليل.' });
    }
    return next();
  };
}

router.post('/preview', limited(previewLimit), async (req, res) => {
  try {
    const data = await service.preview(req.body?.text, req.body?.mapsUrl, req.body?.latitude, req.body?.longitude);
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/draft', limited(draftLimit), (req, res) => {
  uploadMemory.array('images', 12)(req, res, async (err) => {
    if (err) {
      err.status = err.status || 400;
      if (!err.message || err.message === 'File too large') err.message = 'حجم الصورة أكبر من المسموح';
      return fail(res, err);
    }
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
    } catch (error) {
      fail(res, error);
    }
  });
});

router.post('/:id/otp', limited(otpLimit), async (req, res) => {
  try {
    const data = await service.startPublishOtp({ propertyId: req.params.id, ip: req.ip });
    res.json({ success: true, ...data });
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/verify', limited(verifyLimit), async (req, res) => {
  try {
    const data = await service.publishWithOtp({
      propertyId: req.params.id,
      challengeId: req.body?.challengeId,
      code: req.body?.code,
    });
    res.json({
      success: true,
      ...data,
      mapUrl: data.slug ? `/property.html?slug=${encodeURIComponent(data.slug)}` : '/map',
    });
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;
