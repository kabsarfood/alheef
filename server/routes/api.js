const express = require('express');
const { getPublicSettings, getContactConfig } = require('../utils/settings');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { toLegacyPublicOffer, toPublicProperty, rowToMapProperty, toPublicSettings } = require('../services/mappers');
const { LEGEND } = require('../utils/mapTypes');
const { uploadPublic } = require('../middleware/upload');
const { uploadFiles } = require('../services/storage');
const propertiesRepo = require('../repositories/propertiesRepo');
const newsRepo = require('../repositories/newsRepo');
const bannersRepo = require('../repositories/bannersRepo');
const testimonialsRepo = require('../repositories/testimonialsRepo');
const requestsRepo = require('../repositories/requestsRepo');
const subscriptionsRepo = require('../repositories/subscriptionsRepo');
const { notifyAdminsNewCustomerRequest } = require('../services/customerRequestNotifications');
const { isPublicStatus } = require('../utils/propertyStatus');
const { isEnabled } = require('../lib/supabase');
const { handleParseMapCoords } = require('../handlers/mapCoords');

const router = express.Router();

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
  next();
}

router.post('/map/parse-coords', handleParseMapCoords);

// ─── Settings ───
router.get('/settings', async (_req, res) => {
  try {
    res.json(await getPublicSettings());
  } catch (err) {
    const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');
    res.json(toPublicSettings(DEFAULT_SETTINGS));
  }
});

router.get('/config', async (_req, res) => {
  try {
    res.json(await getContactConfig());
  } catch {
    res.json({});
  }
});

// ─── Properties ───
router.get('/properties', async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const filters = {
      city: req.query.city,
      district: req.query.district,
      propertyType: req.query.property_type || req.query.type,
      listingType: req.query.listing_type,
      featured: req.query.featured === 'true' ? true : undefined,
      minPrice: req.query.min_price,
      maxPrice: req.query.max_price,
    };
    const { items, total } = await propertiesRepo.listPublished(filters, { offset, limit });
    res.json(paginatedResponse(items.map(toPublicProperty), total, page, limit));
  } catch (err) {
    console.error('[API] properties:', err.message);
    res.json(paginatedResponse([], 0, 1, 12));
  }
});

// ─── الخريطة العقارية ───
router.get('/map/legend', (_req, res) => {
  res.json({ legend: LEGEND });
});

router.get('/map/properties', async (req, res) => {
  try {
    const filters = {
      city: req.query.city,
      district: req.query.district,
      propertyType: req.query.property_type || req.query.type,
      listingType: req.query.listing_type,
      minPrice: req.query.min_price,
      maxPrice: req.query.max_price,
    };
    const { rows, stats } = await propertiesRepo.listForMap(filters);
    const items = rows.map(rowToMapProperty);
    console.log('[API] GET /api/map/properties', {
      returned: items.length,
      publishedTotal: stats.publishedTotal,
      withValidCoords: stats.withValidCoords,
      missingCoords: stats.missingCoords,
    });
    res.json({ success: true, items, total: items.length, meta: stats });
  } catch (err) {
    console.error('[API] map/properties:', err.message);
    res.json({ success: true, items: [], total: 0, meta: { error: err.message } });
  }
});

router.get('/map/filters', async (_req, res) => {
  try {
    const { rows } = await propertiesRepo.listForMap({});
    const cities = [...new Set(rows.map((r) => r.city).filter(Boolean))].sort();
    const districts = [...new Set(rows.map((r) => r.district).filter(Boolean))].sort();
    const types = [...new Set(rows.map((r) => r.property_type).filter(Boolean))].sort();
    res.json({ cities, districts, types });
  } catch {
    res.json({ cities: [], districts: [], types: [] });
  }
});

router.get('/properties/slug/:slug', async (req, res) => {
  try {
    const p = await propertiesRepo.getBySlug(req.params.slug);
    if (!p || !isPublicStatus(p.status)) {
      return res.status(404).json({ success: false, message: 'العقار غير موجود' });
    }
    res.json(toPublicProperty(p));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/properties/id/:id', async (req, res) => {
  try {
    const p = await propertiesRepo.getById(req.params.id);
    if (!p || !isPublicStatus(p.status)) {
      return res.status(404).json({ success: false, message: 'العقار غير موجود' });
    }
    res.json(toPublicProperty(p));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** توافق الواجهة القديمة */
router.get('/offers', async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query, { limit: 24 });
    const { items } = await propertiesRepo.listPublished({}, { offset, limit });
    res.json(items.map((p) => toLegacyPublicOffer(p)));
  } catch {
    res.json([]);
  }
});

// ─── Banners ───
router.get('/banners', async (_req, res) => {
  try {
    res.json(await bannersRepo.listActive());
  } catch {
    res.json([]);
  }
});

// ─── Testimonials ───
router.get('/testimonials', async (_req, res) => {
  try {
    res.json(await testimonialsRepo.listActive());
  } catch {
    res.json([]);
  }
});

// ─── News ───
router.get('/news', async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);
    const { items, total } = await newsRepo.listPublished({ offset, limit });
    res.json(paginatedResponse(items, total, page, limit));
  } catch {
    res.json(paginatedResponse([], 0, 1, 12));
  }
});

router.get('/news/slug/:slug', async (req, res) => {
  const item = await newsRepo.getBySlug(req.params.slug);
  if (!item) return res.status(404).json({ success: false, message: 'غير موجود' });
  res.json(item);
});

// ─── Forms ───
router.post('/requests', requireDb, async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, requestType, propertyId, message } = req.body;
    if (!requestType) {
      return res.status(400).json({ success: false, message: 'نوع الطلب مطلوب' });
    }
    const request = await requestsRepo.create({
      customerName,
      customerPhone,
      customerEmail,
      requestType,
      propertyId,
      message,
    });
    await notifyAdminsNewCustomerRequest(request);
    res.json({ success: true, message: 'تم استلام طلبك بنجاح', requestId: request.id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/request-property', requireDb, async (req, res) => {
  try {
    const { propertyType, city, district, streetWidth, street_width, budget, description, phone, name } = req.body;
    if (!propertyType || !city || !phone) {
      return res.status(400).json({ success: false, message: 'يرجى تعبئة الحقول المطلوبة' });
    }
    const request = await requestsRepo.create({
      customerName: name,
      customerPhone: phone,
      requestType: 'property_search',
      message: JSON.stringify({
        propertyType,
        city,
        district,
        streetWidth: streetWidth || street_width || '',
        budget,
        description,
      }),
    });
    await notifyAdminsNewCustomerRequest(request);
    res.json({ success: true, message: 'تم استلام طلبك بنجاح، سنتواصل معك قريباً', requestId: request.id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post(
  '/list-property',
  requireDb,
  uploadPublic.array('images', 12),
  async (req, res) => {
    try {
      const { ownerName, phone, propertyType, city, description } = req.body;
      if (!ownerName || !phone || !propertyType || !city) {
        return res.status(400).json({ success: false, message: 'يرجى تعبئة الحقول المطلوبة' });
      }
      const images = await uploadFiles(req.files, 'properties');
      const request = await requestsRepo.create({
        customerName: ownerName,
        customerPhone: phone,
        requestType: 'owner_listing',
        message: JSON.stringify({ propertyType, city, description, images }),
      });
      await notifyAdminsNewCustomerRequest(request);
      res.json({ success: true, message: 'تم استلام عرضك بنجاح', requestId: request.id });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

router.post('/subscribe', requireDb, async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    if (!email) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال البريد الإلكتروني' });
    }
    await subscriptionsRepo.create(email);
    res.json({ success: true, message: 'تم الاشتراك بنجاح' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
