const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  readJson,
  writeJson,
  nextId,
  findById,
  updateJson,
  deleteJson,
} = require('../utils/dataStore');
const { normalizeOffer, formatPriceDisplay, buildTitle } = require('../utils/offers');
const { requireAdmin } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../utils/settings');

const router = express.Router();
router.use(requireAdmin);
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/i;
    const ok = allowed.test(path.extname(file.originalname)) && allowed.test(file.mimetype);
    cb(ok ? null : new Error('نوع الملف غير مدعوم'), ok);
  },
});

function parseImagesField(body) {
  if (body.existingImages) {
    try {
      return JSON.parse(body.existingImages);
    } catch {
      return [];
    }
  }
  return [];
}

function mapUploaded(files) {
  return (files || []).map((f) => `/uploads/${f.filename}`);
}

// ─── Stats ───
router.get('/stats', (_req, res) => {
  const offers = readJson('offers.json');
  const news = readJson('news.json');
  const requests = readJson('requests.json');
  const subscriptions = readJson('subscriptions.json');
  const listings = readJson('listings.json');

  res.json({
    offers: offers.length,
    published: offers.filter((o) => (o.status || 'published') === 'published').length,
    news: news.length,
    requests: requests.length,
    subscriptions: subscriptions.length,
    listings: listings.length,
  });
});

// ─── Offers CRUD ───
router.get('/offers', (_req, res) => {
  const offers = readJson('offers.json').map(normalizeOffer);
  res.json(offers);
});

router.get('/offers/:id', (req, res) => {
  const offer = findById('offers.json', req.params.id);
  if (!offer) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
  res.json(normalizeOffer(offer));
});

router.post('/offers', upload.array('images', 12), (req, res) => {
  const { propertyType, area, contractNumber, location, mapsUrl, price, details, status } = req.body;

  if (!propertyType || !location || !price) {
    return res.status(400).json({ success: false, message: 'يرجى تعبئة نوع العقار والموقع والسعر' });
  }

  const images = mapUploaded(req.files);
  const now = new Date().toISOString();
  const offer = {
    id: nextId(readJson('offers.json')),
    propertyType,
    area: area || '',
    contractNumber: contractNumber || '',
    location,
    mapsUrl: mapsUrl || '',
    price,
    priceDisplay: formatPriceDisplay(price),
    details: details || '',
    images,
    image: images[0] || '',
    status: status || 'published',
    createdAt: now,
    updatedAt: now,
  };
  offer.title = buildTitle(offer);

  const offers = readJson('offers.json');
  offers.push(offer);
  writeJson('offers.json', offers);

  res.json({ success: true, message: 'تم حفظ الإعلان بنجاح', data: normalizeOffer(offer) });
});

router.put('/offers/:id', upload.array('images', 12), (req, res) => {
  const existing = findById('offers.json', req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });

  const { propertyType, area, contractNumber, location, mapsUrl, price, details, status } = req.body;
  const keptImages = parseImagesField(req.body);
  const newImages = mapUploaded(req.files);
  const images = [...keptImages, ...newImages];

  const updated = updateJson('offers.json', req.params.id, {
    propertyType: propertyType ?? existing.propertyType,
    area: area ?? existing.area,
    contractNumber: contractNumber ?? existing.contractNumber,
    location: location ?? existing.location,
    mapsUrl: mapsUrl ?? existing.mapsUrl,
    price: price ?? existing.price,
    priceDisplay: price ? formatPriceDisplay(price) : existing.priceDisplay,
    details: details ?? existing.details,
    images,
    image: images[0] || '',
    status: status ?? existing.status,
    title: buildTitle({
      propertyType: propertyType ?? existing.propertyType,
      location: location ?? existing.location,
    }),
  });

  res.json({ success: true, message: 'تم تحديث الإعلان', data: normalizeOffer(updated) });
});

router.delete('/offers/:id', (req, res) => {
  const ok = deleteJson('offers.json', req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
  res.json({ success: true, message: 'تم حذف الإعلان' });
});

// ─── News CRUD ───
router.get('/news', (_req, res) => {
  res.json(readJson('news.json'));
});

router.get('/news/:id', (req, res) => {
  const item = findById('news.json', req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'الخبر غير موجود' });
  res.json(item);
});

router.post('/news', (req, res) => {
  const { title, category, content, status } = req.body;
  if (!title || !content) {
    return res.status(400).json({ success: false, message: 'العنوان والمحتوى مطلوبان' });
  }

  const now = new Date().toISOString();
  const item = {
    id: nextId(readJson('news.json')),
    title,
    category: category || 'عام',
    content,
    status: status || 'published',
    createdAt: now,
    updatedAt: now,
  };

  const items = readJson('news.json');
  items.unshift(item);
  writeJson('news.json', items);
  res.json({ success: true, message: 'تم نشر الخبر', data: item });
});

router.put('/news/:id', (req, res) => {
  const { title, category, content, status } = req.body;
  const updated = updateJson('news.json', req.params.id, {
    ...(title && { title }),
    ...(category && { category }),
    ...(content && { content }),
    ...(status && { status }),
  });
  if (!updated) return res.status(404).json({ success: false, message: 'الخبر غير موجود' });
  res.json({ success: true, message: 'تم التحديث', data: updated });
});

router.delete('/news/:id', (req, res) => {
  const ok = deleteJson('news.json', req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'الخبر غير موجود' });
  res.json({ success: true, message: 'تم الحذف' });
});

// ─── Requests & Subscriptions (read-only for now) ───
router.get('/requests', (_req, res) => res.json(readJson('requests.json').reverse()));
router.get('/subscriptions', (_req, res) => res.json(readJson('subscriptions.json').reverse()));
router.get('/listings', (_req, res) => res.json(readJson('listings.json').reverse()));

// ─── Site Settings ───
router.get('/settings', (_req, res) => {
  res.json(getSettings());
});

router.put(
  '/settings',
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'heroImage', maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const current = getSettings();
      const body = req.body;

      const updates = {
        siteName: body.siteName ?? current.siteName,
        siteTagline: body.siteTagline ?? current.siteTagline,
        hero: {
          label: body.heroLabel ?? current.hero?.label,
          title: body.heroTitle ?? current.hero?.title,
          description: body.heroDescription ?? current.hero?.description,
          btnOffers: body.heroBtnOffers ?? current.hero?.btnOffers,
          btnRequest: body.heroBtnRequest ?? current.hero?.btnRequest,
        },
        contact: {
          phone: body.contactPhone ?? current.contact?.phone,
          whatsapp: body.contactWhatsapp ?? current.contact?.whatsapp,
          email: body.contactEmail ?? current.contact?.email,
          location: body.contactLocation ?? current.contact?.location,
          instagram: body.contactInstagram ?? current.contact?.instagram,
          x: body.contactX ?? current.contact?.x,
        },
        colors: {
          primary: body.colorPrimary ?? current.colors?.primary,
          gold: body.colorGold ?? current.colors?.gold,
          textPrimary: body.colorTextPrimary ?? current.colors?.textPrimary,
          textSecondary: body.colorTextSecondary ?? current.colors?.textSecondary,
          border: body.colorBorder ?? current.colors?.border,
          buttonPrimary: body.colorButtonPrimary ?? current.colors?.buttonPrimary,
        },
      };

      if (body.logoUrl) updates.logo = body.logoUrl;
      if (body.heroImageUrl) updates.heroImage = body.heroImageUrl;

      if (req.files?.logo?.[0]) {
        updates.logo = `/uploads/${req.files.logo[0].filename}`;
      }
      if (req.files?.heroImage?.[0]) {
        updates.heroImage = `/uploads/${req.files.heroImage[0].filename}`;
      }

      const saved = saveSettings(updates);
      res.json({ success: true, message: 'تم حفظ الإعدادات', data: saved });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'فشل حفظ الإعدادات' });
    }
  }
);

module.exports = router;
