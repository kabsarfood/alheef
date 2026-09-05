const express = require('express');
const path = require('path');
const multer = require('multer');
const { isEnabled } = require('../lib/supabase');
const requestsRepo = require('../repositories/requestsRepo');
const { notifyAdminsNewCustomerRequest } = require('../services/customerRequestNotifications');
const { notifyOfficeNewEjarContract } = require('../services/ejarWhatsAppHook');
const { validateAndNormalize, flattenContractBody } = require('../utils/ejarContract');
const { uploadFiles } = require('../services/storage');

const router = express.Router();
const rateMap = new Map();

const DEED_MAX_BYTES = 32 * 1024 * 1024;

function deedExtFromMime(mime) {
  const type = String(mime || '').toLowerCase();
  if (type === 'application/pdf') return '.pdf';
  if (type === 'image/png') return '.png';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/gif') return '.gif';
  if (type === 'image/bmp') return '.bmp';
  if (type === 'image/tiff') return '.tiff';
  if (type === 'image/heic') return '.heic';
  if (type === 'image/heif') return '.heif';
  if (type === 'image/avif') return '.avif';
  if (/^image\//.test(type)) return '.jpg';
  return '';
}

function isAllowedDeedUpload(file) {
  if (!file) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  const name = String(file.originalname || '');
  const mimeOk = (/^image\//i.test(mime) && mime !== 'image/svg+xml') || mime === 'application/pdf';
  const extOk = /\.(jpe?g|png|webp|gif|bmp|tif|tiff|heic|heif|avif|pdf)$/i.test(name);
  return mimeOk || extOk || (!mime && !path.extname(name));
}

const deedUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DEED_MAX_BYTES, files: 1, fields: 40, fieldSize: 256 * 1024 },
  fileFilter(_req, file, cb) {
    if (!file || !String(file.originalname || '').trim()) return cb(null, false);
    if (isAllowedDeedUpload(file)) return cb(null, true);
    cb(new Error('نوع الملف غير مدعوم'));
  },
});

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
  next();
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(key, max = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  let entry = rateMap.get(key);
  if (!entry || now > entry.reset) {
    entry = { count: 0, reset: now + windowMs };
  }
  entry.count += 1;
  rateMap.set(key, entry);
  if (rateMap.size > 5000) {
    for (const [k, v] of rateMap) {
      if (now > v.reset) rateMap.delete(k);
    }
  }
  return entry.count <= max;
}

function acceptUpload(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('multipart/form-data')) return next();
  deedUpload.fields([{ name: 'deedImage', maxCount: 1 }])(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: 'تعذر رفع مرفق الصك. استخدم صورة أو ملف PDF بحجم لا يتجاوز 32 ميجا.',
      });
    }
    const uploaded = req.files && req.files.deedImage;
    req.file = Array.isArray(uploaded) ? uploaded[0] : uploaded || req.file;
    if (req.file && !path.extname(req.file.originalname || '')) {
      req.file.originalname = `deed${deedExtFromMime(req.file.mimetype) || '.jpg'}`;
    }
    next();
  });
}

router.post('/contracts', requireDb, acceptUpload, async (req, res) => {
  try {
    const body = flattenContractBody(req.body || {});
    if (String(body.website || '').trim()) {
      return res.json({ success: true, message: 'تم استلام طلبك بنجاح' });
    }

    const ip = clientKey(req);
    if (!checkRateLimit(`ejar-contract:${ip}`)) {
      return res.status(429).json({
        success: false,
        message: 'تم إرسال عدد كبير من الطلبات. يرجى المحاولة بعد قليل.',
      });
    }

    const result = validateAndNormalize(body);
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: Object.values(result.errors)[0] || 'يرجى مراجعة البيانات المدخلة',
        errors: result.errors,
      });
    }

    let deedImageUrl = '';
    if (req.file) {
      const urls = await uploadFiles([req.file], 'ejar-deeds', { compress: false });
      deedImageUrl = urls[0] || '';
      if (!deedImageUrl) {
        return res.status(500).json({ success: false, message: 'تعذر حفظ صورة الصك. يرجى المحاولة مرة أخرى.' });
      }
    }
    const created = await requestsRepo.createEjarContract({
      ...result.data,
      deedImageUrl,
    });
    await notifyAdminsNewCustomerRequest(created);
    notifyOfficeNewEjarContract(created).catch(() => {});

    res.json({
      success: true,
      message: 'تم استلام طلبك بنجاح',
      referenceNo: created.referenceNo,
      requestId: created.id,
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ejar-contract]', err.message);
    }
    res.status(500).json({ success: false, message: 'تعذر حفظ الطلب. يرجى المحاولة مرة أخرى.' });
  }
});

module.exports = router;
module.exports.checkRateLimit = checkRateLimit;
