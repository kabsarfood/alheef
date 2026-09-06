const express = require('express');
const path = require('path');
const multer = require('multer');
const { isEnabled } = require('../lib/supabase');
const requestsRepo = require('../repositories/requestsRepo');
const { notifyAdminsNewCustomerRequest } = require('../services/customerRequestNotifications');
const { notifyOfficeNewEjarContract } = require('../services/ejarWhatsAppHook');
const { validateAndNormalize, flattenContractBody } = require('../utils/ejarContract');
const { createDeedUploadSlot, publicUrlForDeedPath, uploadDeedFromFile } = require('../services/storage');

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
  limits: { fileSize: DEED_MAX_BYTES, files: 1, fields: 4, fieldSize: 256 * 1024 },
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

function normalizeDeedFile(req) {
  const uploaded = req.files && req.files.deedImage;
  req.file = Array.isArray(uploaded) ? uploaded[0] : uploaded || req.file;
  if (req.file && !path.extname(req.file.originalname || '')) {
    req.file.originalname = `deed${deedExtFromMime(req.file.mimetype) || '.jpg'}`;
  }
}

async function resolveDeedUrl(body) {
  const objectPath = String(body?.deedObjectPath || '').trim();
  if (!objectPath) return '';
  return publicUrlForDeedPath(objectPath);
}

router.post('/deed/prepare', requireDb, async (req, res) => {
  try {
    const name = String(req.body?.name || 'deed.jpg');
    const type = String(req.body?.type || '');
    const size = Number(req.body?.size) || 0;
    if (size > DEED_MAX_BYTES) {
      return res.status(400).json({ success: false, message: 'حجم المرفق كبير. الحد الأقصى 32 ميجا.' });
    }
    if (!isAllowedDeedUpload({ originalname: name, mimetype: type })) {
      return res.status(400).json({ success: false, message: 'صيغة المرفق غير مدعومة. ارفع صورة أو ملف PDF.' });
    }
    const slot = await createDeedUploadSlot(name, type);
    res.json({ success: true, ...slot });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'تعذر تجهيز رفع الملف' });
  }
});

router.post('/deed', requireDb, (req, res) => {
  deedUpload.single('deedImage')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: 'تعذر رفع المرفق. استخدم صورة أو PDF بحجم لا يتجاوز 32 ميجا.',
      });
    }
    try {
      normalizeDeedFile(req);
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يُرفق ملف' });
      }
      const uploaded = await uploadDeedFromFile(req.file);
      if (!uploaded.url && !uploaded.path) {
        return res.status(500).json({ success: false, message: 'تعذر حفظ المرفق' });
      }
      res.json({ success: true, url: uploaded.url, path: uploaded.path });
    } catch (uploadErr) {
      res.status(500).json({ success: false, message: uploadErr.message || 'تعذر حفظ المرفق' });
    }
  });
});

router.post('/contracts', requireDb, async (req, res) => {
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
    try {
      deedImageUrl = await resolveDeedUrl(body);
    } catch (deedErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[ejar-contract] deed:', deedErr.message);
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
