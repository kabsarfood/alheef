const express = require('express');
const { normalizeOffer, toPublicOffer } = require('../utils/offers');
const { getPublicSettings } = require('../utils/settings');
const { uploadPublic } = require('../middleware/upload');
const { uploadFiles } = require('../services/storage');
const propertiesRepo = require('../repositories/propertiesRepo');
const newsRepo = require('../repositories/newsRepo');
const requestsRepo = require('../repositories/requestsRepo');
const subscriptionsRepo = require('../repositories/subscriptionsRepo');
const { isEnabled } = require('../lib/supabase');

const router = express.Router();

router.post('/request-property', async (req, res) => {
  try {
    const { propertyType, city, district, budget, description, phone } = req.body;
    if (!propertyType || !city || !phone) {
      return res.status(400).json({ success: false, message: 'يرجى تعبئة الحقول المطلوبة' });
    }
    if (!isEnabled()) {
      return res.status(503).json({ success: false, message: 'الخدمة غير متاحة مؤقتاً' });
    }
    await requestsRepo.createPropertyRequest({
      propertyType,
      city,
      district,
      budget,
      description,
      phone,
    });
    res.json({ success: true, message: 'تم استلام طلبك بنجاح، سنتواصل معك قريباً' });
  } catch (err) {
    console.error('[API] request-property:', err.message);
    res.status(500).json({ success: false, message: err.message || 'حدث خطأ' });
  }
});

router.post(
  '/list-property',
  uploadPublic.array('images', 6),
  async (req, res) => {
    try {
      const { ownerName, phone, propertyType, city, description } = req.body;
      if (!ownerName || !phone || !propertyType || !city) {
        return res.status(400).json({ success: false, message: 'يرجى تعبئة الحقول المطلوبة' });
      }
      if (!isEnabled()) {
        return res.status(503).json({ success: false, message: 'الخدمة غير متاحة مؤقتاً' });
      }
      const images = await uploadFiles(req.files, 'properties');
      await requestsRepo.createOwnerListing({
        ownerName,
        phone,
        propertyType,
        city,
        description,
        images,
      });
      res.json({ success: true, message: 'تم استلام عرضك بنجاح، سيراجعه فريقنا' });
    } catch (err) {
      console.error('[API] list-property:', err.message);
      res.status(500).json({ success: false, message: err.message || 'حدث خطأ' });
    }
  }
);

router.post('/subscribe', async (req, res) => {
  try {
    const { name, phone, interests } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال الاسم ورقم الجوال' });
    }
    if (!isEnabled()) {
      return res.status(503).json({ success: false, message: 'الخدمة غير متاحة مؤقتاً' });
    }
    await subscriptionsRepo.create({ name, phone, interests });
    res.json({ success: true, message: 'تم الاشتراك بنجاح، سيصلك الجديد قريباً' });
  } catch (err) {
    console.error('[API] subscribe:', err.message);
    res.status(500).json({ success: false, message: err.message || 'حدث خطأ' });
  }
});

router.get('/offers', async (_req, res) => {
  try {
    const offers = (await propertiesRepo.listPublished()).map((o) =>
      toPublicOffer(normalizeOffer(o))
    );
    res.json(offers);
  } catch (err) {
    console.error('[API] offers:', err.message);
    res.json([]);
  }
});

router.get('/news', async (_req, res) => {
  try {
    const news = await newsRepo.listPublished(20);
    res.json(news);
  } catch (err) {
    console.error('[API] news:', err.message);
    res.json([]);
  }
});

router.get('/settings', async (_req, res) => {
  try {
    res.json(await getPublicSettings());
  } catch (err) {
    console.error('[API] settings:', err.message);
    const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');
    res.json({
      ...DEFAULT_SETTINGS,
      contact: DEFAULT_SETTINGS.contact,
      hero: DEFAULT_SETTINGS.hero,
      colors: DEFAULT_SETTINGS.colors,
    });
  }
});

module.exports = router;
