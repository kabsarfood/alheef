const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

function saveJson(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  let existing = [];
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      existing = [];
    }
  }
  existing.push({ ...data, createdAt: new Date().toISOString() });
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf8');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/i;
    const ext = allowed.test(path.extname(file.originalname));
    const mime = allowed.test(file.mimetype);
    cb(ext && mime ? null : new Error('نوع الملف غير مدعوم'), ext && mime);
  },
});

router.post('/request-property', (req, res) => {
  const { propertyType, city, district, budget, description, phone } = req.body;
  if (!propertyType || !city || !phone) {
    return res.status(400).json({ success: false, message: 'يرجى تعبئة الحقول المطلوبة' });
  }
  saveJson('requests.json', { propertyType, city, district, budget, description, phone });
  res.json({ success: true, message: 'تم استلام طلبك بنجاح، سنتواصل معك قريباً' });
});

router.post(
  '/list-property',
  upload.array('images', 6),
  (req, res) => {
    const { ownerName, phone, propertyType, city, description } = req.body;
    if (!ownerName || !phone || !propertyType || !city) {
      return res.status(400).json({ success: false, message: 'يرجى تعبئة الحقول المطلوبة' });
    }
    const images = (req.files || []).map((f) => `/uploads/${f.filename}`);
    saveJson('listings.json', { ownerName, phone, propertyType, city, description, images });
    res.json({ success: true, message: 'تم استلام عرضك بنجاح، سيراجعه فريقنا' });
  }
);

router.post('/subscribe', (req, res) => {
  const { name, phone, interests } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال الاسم ورقم الجوال' });
  }
  saveJson('subscriptions.json', { name, phone, interests });
  res.json({ success: true, message: 'تم الاشتراك بنجاح، سيصلك الجديد قريباً' });
});

router.get('/offers', (_req, res) => {
  const { readJson } = require('../utils/dataStore');
  const { toPublicOffer } = require('../utils/offers');
  const offers = readJson('offers.json')
    .filter((o) => (o.status || 'published') === 'published')
    .map(toPublicOffer);
  res.json(offers);
});

router.get('/news', (_req, res) => {
  const { readJson } = require('../utils/dataStore');
  const news = readJson('news.json')
    .filter((n) => (n.status || 'published') === 'published')
    .slice(0, 20);
  res.json(news);
});

module.exports = router;
