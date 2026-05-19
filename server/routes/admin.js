const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { getSettings, saveSettings } = require('../utils/settings');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { uploadMemory } = require('../middleware/upload');
const { uploadFiles, uploadBuffer } = require('../services/storage');
const propertiesRepo = require('../repositories/propertiesRepo');
const newsRepo = require('../repositories/newsRepo');
const bannersRepo = require('../repositories/bannersRepo');
const testimonialsRepo = require('../repositories/testimonialsRepo');
const requestsRepo = require('../repositories/requestsRepo');
const subscriptionsRepo = require('../repositories/subscriptionsRepo');
const { propertyToMapProperty } = require('../services/mappers');

const router = express.Router();
router.use(requireAdmin);

// ─── حالة النظام / Supabase ───
router.get('/system-status', async (_req, res) => {
  const { ping, getStatus } = require('../lib/supabase');
  const status = getStatus();
  const db = await ping();
  res.json({
    supabase: {
      configured: status.configured,
      connected: status.enabled && db.ok,
      url: status.url,
      reason: db.reason || null,
      hint: db.hint || null,
    },
  });
});

router.get('/map/coords-warnings', async (_req, res) => {
  try {
    const diag = await propertiesRepo.getMapDiagnostics();
    res.json({ success: true, ...diag });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Stats ───
router.get('/stats', async (_req, res) => {
  try {
    const [offers, published, news, requests, subscriptions] = await Promise.all([
      propertiesRepo.countAll(),
      propertiesRepo.countPublished(),
      newsRepo.countAll(),
      requestsRepo.countAll(),
      subscriptionsRepo.countAll(),
    ]);
    res.json({ offers, published, news, requests, subscriptions, listings: 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Settings GET/PUT ───
router.get('/settings', async (_req, res) => {
  res.json(await getSettings());
});

router.put('/settings', uploadMemory.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'favicon', maxCount: 1 },
  { name: 'heroImage', maxCount: 1 },
  { name: 'heroMobileImage', maxCount: 1 },
]), async (req, res) => {
  try {
    const body = { ...req.body };
    const files = req.files || {};

    if (files.logo?.[0]) {
      body.logoUrl = await uploadBuffer(files.logo[0].buffer, files.logo[0].originalname, 'logos');
    }
    if (files.favicon?.[0]) {
      body.faviconUrl = await uploadBuffer(files.favicon[0].buffer, files.favicon[0].originalname, 'logos');
    }
    if (files.heroImage?.[0]) {
      body.heroImage = await uploadBuffer(files.heroImage[0].buffer, files.heroImage[0].originalname, 'banners');
    }
    if (files.heroMobileImage?.[0]) {
      body.heroMobileImage = await uploadBuffer(files.heroMobileImage[0].buffer, files.heroMobileImage[0].originalname, 'banners');
    }

    const map = {
      siteName: body.siteName,
      siteDescription: body.siteDescription,
      logoUrl: body.logoUrl,
      faviconUrl: body.faviconUrl,
      heroTitle: body.heroTitle,
      heroSubtitle: body.heroSubtitle,
      heroImage: body.heroImage,
      heroMobileImage: body.heroMobileImage,
      whatsappNumber: body.whatsappNumber,
      email: body.email,
      phone: body.phone,
      address: body.address,
      googleMap: body.googleMap,
      instagram: body.instagram,
      twitter: body.twitter,
      snapchat: body.snapchat,
      tiktok: body.tiktok,
      primaryColor: body.primaryColor,
      secondaryColor: body.secondaryColor,
      footerText: body.footerText,
      aboutText: body.aboutText,
      visionText: body.visionText,
      missionText: body.missionText,
    };
    Object.keys(map).forEach((k) => map[k] === undefined && delete map[k]);

    const saved = await saveSettings(map);
    res.json({ success: true, settings: saved });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Properties CRUD ───
router.get('/properties', async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { limit: 50 });
  const { items, total } = await propertiesRepo.listAll({ offset, limit });
  res.json(paginatedResponse(items, total, page, limit));
});

router.get('/offers', async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { limit: 50 });
  const { items, total } = await propertiesRepo.listAll({ offset, limit });
  res.json(items);
});

router.get('/properties/:id', async (req, res) => {
  const p = await propertiesRepo.getById(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'غير موجود' });
  res.json(p);
});

router.get('/offers/:id', async (req, res) => {
  const p = await propertiesRepo.getById(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'غير موجود' });
  res.json(p);
});

router.post('/properties', uploadMemory.array('images', 20), async (req, res) => {
  try {
    const body = req.body;
    let features = [];
    try {
      if (body.features) features = JSON.parse(body.features);
    } catch { features = []; }
    const p = await propertiesRepo.create({ ...body, features });
    const urls = await uploadFiles(req.files, 'properties');
    if (urls.length) await propertiesRepo.addImages(p.id, urls);
    const full = await propertiesRepo.getById(p.id);
    res.json({
      success: true,
      property: full,
      mapProperty: propertyToMapProperty(full),
      message: 'تم الحفظ بنجاح',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/offers', uploadMemory.array('images', 20), async (req, res) => {
  try {
    const body = req.body;
    let features = [];
    try {
      if (body.features) features = JSON.parse(body.features);
    } catch { features = []; }
    const p = await propertiesRepo.create({ ...body, features });
    const urls = await uploadFiles(req.files, 'properties');
    if (urls.length) await propertiesRepo.addImages(p.id, urls);
    const full = await propertiesRepo.getById(p.id);
    res.json({
      success: true,
      offer: full,
      mapProperty: propertyToMapProperty(full),
      message: 'تم الحفظ بنجاح',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/properties/:id', uploadMemory.array('images', 20), async (req, res) => {
  try {
    const body = req.body;
    if (body.features && typeof body.features === 'string') {
      body.features = JSON.parse(body.features);
    }
    const p = await propertiesRepo.update(req.params.id, body);
    if (!p) return res.status(404).json({ success: false, message: 'غير موجود' });
    const urls = await uploadFiles(req.files, 'properties');
    if (urls.length) await propertiesRepo.addImages(p.id, urls);
    res.json({ success: true, property: await propertiesRepo.getById(p.id) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/offers/:id', uploadMemory.array('images', 20), async (req, res) => {
  try {
    const body = req.body;
    if (body.features && typeof body.features === 'string') {
      body.features = JSON.parse(body.features);
    }
    const p = await propertiesRepo.update(req.params.id, body);
    if (!p) return res.status(404).json({ success: false, message: 'غير موجود' });
    const urls = await uploadFiles(req.files, 'properties');
    if (urls.length) await propertiesRepo.addImages(p.id, urls);
    res.json({ success: true, offer: await propertiesRepo.getById(p.id) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/properties/:id', async (req, res) => {
  const ok = await propertiesRepo.remove(req.params.id);
  res.json({ success: ok });
});

router.delete('/offers/:id', async (req, res) => {
  const ok = await propertiesRepo.remove(req.params.id);
  res.json({ success: ok });
});

router.put('/properties/:id/images/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'ترتيب غير صالح' });
    }
    await propertiesRepo.reorderImages(req.params.id, order);
    res.json({ success: true, property: await propertiesRepo.getById(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/properties/images/:imageId', async (req, res) => {
  const ok = await propertiesRepo.removeImage(req.params.imageId);
  res.json({ success: ok });
});

// ─── Banners CRUD ───
router.get('/banners', async (_req, res) => {
  res.json(await bannersRepo.listAll());
});

router.post('/banners', uploadMemory.fields([
  { name: 'imageDesktop', maxCount: 1 },
  { name: 'imageMobile', maxCount: 1 },
]), async (req, res) => {
  try {
    const body = req.body;
    if (req.files?.imageDesktop?.[0]) {
      body.imageDesktop = await uploadBuffer(req.files.imageDesktop[0].buffer, req.files.imageDesktop[0].originalname, 'banners');
    }
    if (req.files?.imageMobile?.[0]) {
      body.imageMobile = await uploadBuffer(req.files.imageMobile[0].buffer, req.files.imageMobile[0].originalname, 'banners');
    }
    if (!body.imageDesktop) {
      return res.status(400).json({ success: false, message: 'صورة سطح المكتب مطلوبة' });
    }
    const b = await bannersRepo.create(body);
    res.json({ success: true, banner: b });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/banners/:id', uploadMemory.fields([
  { name: 'imageDesktop', maxCount: 1 },
  { name: 'imageMobile', maxCount: 1 },
]), async (req, res) => {
  try {
    const body = req.body;
    if (req.files?.imageDesktop?.[0]) {
      body.imageDesktop = await uploadBuffer(req.files.imageDesktop[0].buffer, req.files.imageDesktop[0].originalname, 'banners');
    }
    if (req.files?.imageMobile?.[0]) {
      body.imageMobile = await uploadBuffer(req.files.imageMobile[0].buffer, req.files.imageMobile[0].originalname, 'banners');
    }
    const b = await bannersRepo.update(req.params.id, body);
    res.json({ success: true, banner: b });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/banners/:id', async (req, res) => {
  res.json({ success: await bannersRepo.remove(req.params.id) });
});

// ─── News CRUD ───
router.get('/news', async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { limit: 50 });
  const { items, total } = await newsRepo.listAll({ offset, limit });
  res.json(paginatedResponse(items, total, page, limit));
});

router.post('/news', uploadMemory.single('image'), async (req, res) => {
  try {
    const body = req.body;
    if (req.file) {
      body.image = await uploadBuffer(req.file.buffer, req.file.originalname, 'news');
    }
    const n = await newsRepo.create(body);
    res.json({ success: true, news: n });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/news/:id', uploadMemory.single('image'), async (req, res) => {
  try {
    const body = req.body;
    if (req.file) {
      body.image = await uploadBuffer(req.file.buffer, req.file.originalname, 'news');
    }
    const n = await newsRepo.update(req.params.id, body);
    res.json({ success: true, news: n });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/news/:id', async (req, res) => {
  res.json({ success: await newsRepo.remove(req.params.id) });
});

// ─── Testimonials CRUD ───
router.get('/testimonials', async (_req, res) => {
  res.json(await testimonialsRepo.listAll());
});

router.post('/testimonials', uploadMemory.single('image'), async (req, res) => {
  try {
    const body = req.body;
    if (req.file) {
      body.image = await uploadBuffer(req.file.buffer, req.file.originalname, 'assets');
    }
    body.rating = parseInt(body.rating, 10) || 5;
    const t = await testimonialsRepo.create(body);
    res.json({ success: true, testimonial: t });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/testimonials/:id', uploadMemory.single('image'), async (req, res) => {
  try {
    const body = req.body;
    if (req.file) {
      body.image = await uploadBuffer(req.file.buffer, req.file.originalname, 'assets');
    }
    if (body.rating) body.rating = parseInt(body.rating, 10);
    const t = await testimonialsRepo.update(req.params.id, body);
    res.json({ success: true, testimonial: t });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/testimonials/:id', async (req, res) => {
  res.json({ success: await testimonialsRepo.remove(req.params.id) });
});

// ─── Requests ───
router.get('/requests', async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { limit: 100 });
  const { items, total } = await requestsRepo.listAll({ offset, limit });
  res.json(paginatedResponse(items, total, page, limit));
});

router.put('/requests/:id/status', async (req, res) => {
  try {
    const r = await requestsRepo.updateStatus(req.params.id, req.body.status);
    res.json({ success: true, request: r });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/requests/:id', async (req, res) => {
  res.json({ success: await requestsRepo.remove(req.params.id) });
});

// ─── Subscriptions ───
router.get('/subscriptions', async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query, { limit: 100 });
  const { items, total } = await subscriptionsRepo.listAll({ offset, limit });
  res.json(paginatedResponse(items, total, page, limit));
});

router.delete('/subscriptions/:id', async (req, res) => {
  res.json({ success: await subscriptionsRepo.remove(req.params.id) });
});

module.exports = router;
