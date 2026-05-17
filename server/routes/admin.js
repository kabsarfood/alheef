const express = require('express');
const { normalizeOffer, formatPriceDisplay, buildTitle } = require('../utils/offers');
const { requireAdmin } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../utils/settings');
const { uploadMemory } = require('../middleware/upload');
const { uploadFiles, uploadBuffer } = require('../services/storage');
const propertiesRepo = require('../repositories/propertiesRepo');
const newsRepo = require('../repositories/newsRepo');
const requestsRepo = require('../repositories/requestsRepo');
const subscriptionsRepo = require('../repositories/subscriptionsRepo');

const router = express.Router();
router.use(requireAdmin);

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

// ─── Stats ───
router.get('/stats', async (_req, res) => {
  try {
    const [offersCount, published, newsCount, requestsCount, subscriptionsCount, listingsCount] =
      await Promise.all([
        propertiesRepo.countAll(),
        propertiesRepo.countPublished(),
        newsRepo.countAll(),
        requestsRepo.countPropertyRequests(),
        subscriptionsRepo.countAll(),
        requestsRepo.countOwnerListings(),
      ]);

    res.json({
      offers: offersCount,
      published,
      news: newsCount,
      requests: requestsCount,
      subscriptions: subscriptionsCount,
      listings: listingsCount,
    });
  } catch (err) {
    console.error('[Admin] stats:', err.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الإحصائيات' });
  }
});

// ─── Properties (Offers) ───
router.get('/offers', async (_req, res) => {
  const offers = (await propertiesRepo.listAll()).map(normalizeOffer);
  res.json(offers);
});

router.get('/offers/:id', async (req, res) => {
  const offer = await propertiesRepo.getById(req.params.id);
  if (!offer) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
  res.json(normalizeOffer(offer));
});

router.post('/offers', uploadMemory.array('images', 12), async (req, res) => {
  try {
    const { propertyType, area, contractNumber, location, mapsUrl, price, details, status } =
      req.body;

    if (!propertyType || !location || !price) {
      return res.status(400).json({ success: false, message: 'يرجى تعبئة نوع العقار والموقع والسعر' });
    }

    const images = await uploadFiles(req.files, 'properties');
    const offer = {
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
    };
    offer.title = buildTitle(offer);

    const saved = await propertiesRepo.create(offer);
    res.json({ success: true, message: 'تم حفظ الإعلان بنجاح', data: normalizeOffer(saved) });
  } catch (err) {
    console.error('[Admin] create offer:', err.message);
    res.status(500).json({ success: false, message: err.message || 'فشل الحفظ' });
  }
});

router.put('/offers/:id', uploadMemory.array('images', 12), async (req, res) => {
  try {
    const existing = await propertiesRepo.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });

    const { propertyType, area, contractNumber, location, mapsUrl, price, details, status } =
      req.body;
    const keptImages = parseImagesField(req.body);
    const newImages = await uploadFiles(req.files, 'properties');
    const images = [...keptImages, ...newImages];

    const updated = await propertiesRepo.update(req.params.id, {
      propertyType: propertyType ?? existing.propertyType,
      area: area ?? existing.area,
      contractNumber: contractNumber ?? existing.contractNumber,
      location: location ?? existing.location,
      mapsUrl: mapsUrl ?? existing.mapsUrl,
      price: price ?? existing.price,
      details: details ?? existing.details,
      images,
      image: images[0] || '',
      status: status ?? existing.status,
    });

    res.json({ success: true, message: 'تم تحديث الإعلان', data: normalizeOffer(updated) });
  } catch (err) {
    console.error('[Admin] update offer:', err.message);
    res.status(500).json({ success: false, message: err.message || 'فشل التحديث' });
  }
});

router.delete('/offers/:id', async (req, res) => {
  const ok = await propertiesRepo.remove(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
  res.json({ success: true, message: 'تم حذف الإعلان' });
});

// ─── News ───
router.get('/news', async (_req, res) => {
  res.json(await newsRepo.listAll());
});

router.get('/news/:id', async (req, res) => {
  const item = await newsRepo.getById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'الخبر غير موجود' });
  res.json(item);
});

router.post('/news', async (req, res) => {
  try {
    const { title, category, content, status } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'العنوان والمحتوى مطلوبان' });
    }
    const item = await newsRepo.create({ title, category, content, status });
    res.json({ success: true, message: 'تم نشر الخبر', data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/news/:id', async (req, res) => {
  const { title, category, content, status } = req.body;
  const updated = await newsRepo.update(req.params.id, {
    ...(title && { title }),
    ...(category && { category }),
    ...(content && { content }),
    ...(status && { status }),
  });
  if (!updated) return res.status(404).json({ success: false, message: 'الخبر غير موجود' });
  res.json({ success: true, message: 'تم التحديث', data: updated });
});

router.delete('/news/:id', async (req, res) => {
  const ok = await newsRepo.remove(req.params.id);
  if (!ok) return res.status(404).json({ success: false, message: 'الخبر غير موجود' });
  res.json({ success: true, message: 'تم الحذف' });
});

// ─── Requests & Subscriptions ───
router.get('/requests', async (_req, res) => {
  res.json(await requestsRepo.listPropertyRequests());
});

router.get('/subscriptions', async (_req, res) => {
  res.json(await subscriptionsRepo.listAll());
});

router.get('/listings', async (_req, res) => {
  res.json(await requestsRepo.listOwnerListings());
});

// ─── Settings ───
router.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

async function handleSettingsSave(req, res) {
  try {
    const current = await getSettings();
    const body = req.body || {};

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
      updates.logo = await uploadBuffer(
        req.files.logo[0].buffer,
        req.files.logo[0].originalname,
        'logos'
      );
    }
    if (req.files?.heroImage?.[0]) {
      updates.heroImage = await uploadBuffer(
        req.files.heroImage[0].buffer,
        req.files.heroImage[0].originalname,
        'banners'
      );
    }

    const saved = await saveSettings(updates);
    res.json({ success: true, message: 'تم حفظ الإعدادات', data: saved });
  } catch (err) {
    console.error('[Admin] settings save:', err.message);
    res.status(500).json({ success: false, message: err.message || 'فشل حفظ الإعدادات' });
  }
}

const settingsUpload = uploadMemory.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'heroImage', maxCount: 1 },
]);

function settingsUploadMiddleware(req, res, next) {
  settingsUpload(req, res, (err) => {
    if (err) {
      console.error('[Admin] settings upload:', err.message);
      return res.status(400).json({ success: false, message: err.message || 'فشل رفع الملف' });
    }
    next();
  });
}

router.put('/settings', settingsUploadMiddleware, handleSettingsSave);
router.post('/settings', settingsUploadMiddleware, handleSettingsSave);

module.exports = router;
