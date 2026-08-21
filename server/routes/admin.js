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
const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');
const privateOffersRepo = require('../repositories/privateOffersRepo');
const privateClientsRepo = require('../repositories/privateClientsRepo');
const siteAnalyticsRepo = require('../repositories/siteAnalyticsRepo');
const { buildPrivateShareUrl } = require('../utils/privateOffersPath');
const { propertyToMapProperty } = require('../services/mappers');
const { enrichBodyCoords, parseCoordsFromMapsUrlResolved, normalizeCoordsPair, parseCoordsFromMapsUrl } = require('../utils/coords');

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

router.post('/apply-schema', async (_req, res) => {
  try {
    const { applyMigrationsIfNeeded, getSchemaStatus } = require('../lib/sqlMigrations');
    const before = await getSchemaStatus();
    const result = await applyMigrationsIfNeeded({ silent: true });
    const after = await getSchemaStatus();
    res.json({
      success: result.ok !== false && after.allReady,
      before,
      after,
      ...result,
      message: after.allReady
        ? 'جميع تحديثات قاعدة البيانات مفعّلة'
        : after.privateClientFields
          ? 'بعض الهجرات ما زالت معلّقة — راجع after.privateClientFields'
          : (result.message || 'تعذر التفعيل — تحقق من SUPABASE_DB_PASSWORD'),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/map/coords-warnings', async (_req, res) => {
  try {
    const diag = await propertiesRepo.getMapDiagnostics();
    res.json({ success: true, ...diag });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/map/parse-coords', async (req, res) => {
  try {
    const url = String(req.body?.url || req.body?.mapsUrl || '').trim();
    if (!url) {
      return res.status(400).json({ success: false, message: 'الرابط مطلوب' });
    }
    const { normalizeMapsUrl } = require('../utils/coords');
    const normalized = normalizeMapsUrl(url);
    const direct = normalizeCoordsPair(parseCoordsFromMapsUrl(normalized));
    if (direct) {
      return res.json({ success: true, ...direct, source: 'direct' });
    }
    const resolved = await parseCoordsFromMapsUrlResolved(normalized);
    if (!resolved) {
      return res.json({
        success: false,
        message: 'تعذر استخراج الإحداثيات — انسخ رابط «مشاركة» من Google Maps (مشاركة ← نسخ الرابط) وليس نص العنوان',
      });
    }
    res.json({
      success: true,
      lat: resolved.lat,
      lng: resolved.lng,
      resolvedUrl: resolved.resolvedUrl || null,
      source: resolved.resolvedUrl ? 'resolved' : 'direct',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Stats ───
router.get('/stats', async (_req, res) => {
  try {
    const [offers, published, pendingReview, unreadNotifications, news, requests, subscriptions, siteAnalytics, privateClients] = await Promise.all([
      propertiesRepo.countAll(),
      propertiesRepo.countPublished(),
      propertiesRepo.countPendingReview(),
      adminNotificationsRepo.countUnread(),
      newsRepo.countAll(),
      requestsRepo.countAll(),
      subscriptionsRepo.countAll(),
      siteAnalyticsRepo.getSummary(),
      privateClientsRepo.getClientsVisitSummary(),
    ]);
    res.json({
      offers,
      published,
      pendingReview,
      unreadNotifications,
      news,
      requests,
      subscriptions,
      listings: 0,
      siteAnalytics,
      privateClients,
    });
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
    const body = await enrichBodyCoords({ ...req.body });
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
    const body = await enrichBodyCoords({ ...req.body });
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
    const body = await enrichBodyCoords({ ...req.body });
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
    const body = await enrichBodyCoords({ ...req.body });
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

router.put('/requests/:id/read-notification', async (req, res) => {
  try {
    await adminNotificationsRepo.markReadByRequestId(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
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

// ─── طلبات انضمام المسوقين ───
const marketerJoinRepo = require('../repositories/marketerJoinRepo');
const marketersRepo = require('../repositories/marketersRepo');
const pushNotifications = require('../services/pushNotifications');
const { PUBLIC_STATUSES, JOIN_STATUS_LABELS, PROPERTY_STATUS_LABELS, zoneLabel } = require('../utils/marketerZones');

function mapJoinRow(r) {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    email: r.email || '',
    nationalId: r.national_id,
    falLicense: r.fal_license,
    marketingZone: r.marketing_zone,
    marketingZoneLabel: zoneLabel(r.marketing_zone),
    status: r.status,
    statusLabel: JOIN_STATUS_LABELS[r.status] || r.status,
    adminNote: r.admin_note || '',
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
  };
}

router.get('/marketer-join-requests', async (req, res) => {
  try {
    const rows = await marketerJoinRepo.listAll({ status: req.query.status });
    res.json({ success: true, items: rows.map(mapJoinRow) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/marketer-join-requests/:id', async (req, res) => {
  try {
    const { status, adminNote, action } = req.body;
    const request = await marketerJoinRepo.getById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    const nextStatus = status || (action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'needs_info' ? 'needs_info' : request.status);
    const updated = await marketerJoinRepo.updateStatus(request.id, {
      status: nextStatus,
      adminNote,
      reviewedBy: 'admin',
    });

    let marketer = null;
    let approvalMessage = null;
    if (nextStatus === 'approved') {
      marketer = await marketersRepo.createFromJoinRequest(updated);
      approvalMessage = 'تمت الموافقة عليك لتكون أحد فريق المسوقين لدى مكتب الهيف للخدمات العقارية.';
    }

    res.json({
      success: true,
      request: mapJoinRow(updated),
      marketer: marketer ? marketersRepo.toPublic(marketer) : null,
      approvalMessage,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/marketers', async (_req, res) => {
  try {
    const rows = await marketersRepo.listAll();
    res.json({
      success: true,
      items: rows.map((m) => ({
        ...marketersRepo.toPublic(m),
        nationalId: m.national_id,
        falLicense: m.fal_license,
        marketingZoneLabel: zoneLabel(m.marketing_zone),
        statusLabel: m.status === 'active' ? 'نشط' : m.status === 'suspended' ? 'موقوف' : m.status,
        createdAt: m.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/marketers/:id/status', async (req, res) => {
  try {
    const m = await marketersRepo.setStatus(req.params.id, req.body.status);
    res.json({ success: true, marketer: marketersRepo.toPublic(m) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── مراجعة إعلانات المسوقين ───
router.get('/notifications', async (req, res) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const items = await adminNotificationsRepo.list({ unreadOnly, limit: 30 });
    const unreadCount = await adminNotificationsRepo.countUnread();
    res.json({ success: true, items, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    const item = await adminNotificationsRepo.markRead(req.params.id);
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/notifications/read-all', async (_req, res) => {
  try {
    await adminNotificationsRepo.markAllRead();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/property-reviews', async (req, res) => {
  try {
    const status = req.query.status || 'pending_review';
    const { items } = await propertiesRepo.list({ status }, { limit: 200 });
    const marketers = await marketersRepo.listAll();
    const marketerMap = Object.fromEntries(marketers.map((m) => [m.id, m]));
    res.json({
      success: true,
      items: items.map((p) => {
        const marketer = p.marketerId ? marketerMap[p.marketerId] : null;
        return {
          id: p.id,
          title: p.title,
          status: p.status,
          statusLabel: PROPERTY_STATUS_LABELS[p.status] || p.status,
          marketerId: p.marketerId,
          marketerName: marketer?.full_name || '—',
          propertyType: p.propertyType,
          city: p.city,
          district: p.district,
          price: p.priceDisplay,
          priceRaw: p.price,
          createdAt: p.createdAt,
          reviewedAt: p.reviewedAt,
          reviewedBy: p.reviewedBy,
          approvedAt: p.approvedAt,
          approvedBy: p.approvedBy,
          homepagePublished: p.homepagePublished,
          licenseExpiresAt: p.licenseExpiresAt,
          adminFeedback: p.adminFeedback || '',
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/properties/:id/review', async (req, res) => {
  try {
    const { action, adminFeedback, internalNotes } = req.body;
    const existing = await propertiesRepo.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'غير موجود' });

    const now = new Date().toISOString();
    const patch = {
      admin_feedback: adminFeedback ?? existing.adminFeedback,
      internal_notes: internalNotes ?? existing.internalNotes,
      reviewed_by: req.auth?.userId || 'admin',
      reviewed_at: now,
    };

    if (action === 'approve') {
      patch.status = 'approved_published';
      patch.approved_at = now;
      patch.approved_by = req.auth?.userId || 'admin';
      patch.homepage_published = true;
    } else if (action === 'needs_changes') {
      patch.status = 'needs_changes';
      patch.admin_feedback = adminFeedback || 'يرجى تعديل الإعلان وفق الملاحظات';
    } else if (action === 'hide') {
      patch.status = 'hidden';
      patch.homepage_published = false;
    } else if (action === 'archive') {
      patch.status = 'archived';
      patch.homepage_published = false;
    } else if (action === 'reject') {
      patch.status = 'rejected';
      patch.homepage_published = false;
      patch.admin_feedback = adminFeedback || 'تم رفض الإعلان من إدارة المكتب';
    }

    const updated = await propertiesRepo.updateStatus(req.params.id, {
      status: patch.status,
      admin_feedback: patch.admin_feedback,
      internal_notes: patch.internal_notes,
      reviewed_by: patch.reviewed_by,
      reviewed_at: patch.reviewed_at,
      approved_by: patch.approved_by,
      approved_at: patch.approved_at,
      homepage_published: patch.homepage_published,
    });
    await adminNotificationsRepo.markReadByPropertyId(req.params.id);

    if (existing.marketerId && ['approve', 'needs_changes', 'reject'].includes(action)) {
      pushNotifications.notifyMarketerPropertyReview({
        marketerId: existing.marketerId,
        propertyId: existing.id,
        action,
        feedback: patch.admin_feedback || updated.adminFeedback || '',
      }).catch((err) => console.error('[push] marketer review:', err.message));
    }

    if (action === 'approve') {
      pushNotifications.notifyClientsNewOffer({
        id: updated.id,
        slug: updated.slug,
        title: updated.title,
        city: updated.city,
        district: updated.district,
      }).catch((err) => console.error('[push] new offer:', err.message));
    }

    res.json({ success: true, property: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ─── العروض الخاصة — إعدادات عامة وعملاء بروابط مستقلة ───
router.get('/private-offers/settings', async (_req, res) => {
  try {
    const settings = await privateClientsRepo.getSettings();
    const summary = await privateClientsRepo.getClientsVisitSummary();
    res.json({ success: true, settings, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/private-offers/settings/active', async (req, res) => {
  try {
    const settings = await privateClientsRepo.setGlobalActive(req.body.active !== false);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/private-offers/clients', async (_req, res) => {
  try {
    const clients = await privateClientsRepo.listClients();
    res.json({
      success: true,
      clients: clients.map((c) => ({
        ...c,
        shareUrl: buildPrivateShareUrl(c.pageSlug),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/private-offers/clients', async (req, res) => {
  try {
    const client = await privateClientsRepo.createClient({
      clientLabel: req.body.clientLabel,
      phone: req.body.phone,
      requestType: req.body.requestType,
      propertyKind: req.body.propertyKind,
      requiredArea: req.body.requiredArea,
    });
    res.json({
      success: true,
      client: {
        ...client,
        shareUrl: buildPrivateShareUrl(client.pageSlug),
      },
      accessCode: client.plainCode,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/private-offers/clients/:id/code', async (req, res) => {
  try {
    const code = String(req.body.accessCode || '').trim();
    if (!code) return res.status(400).json({ success: false, message: 'يرجى إدخال رمز الدخول' });
    const client = await privateClientsRepo.updateClientCode(req.params.id, code);
    res.json({
      success: true,
      accessCode: client.plainCode,
      client: { ...client, shareUrl: buildPrivateShareUrl(client.pageSlug) },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/private-offers/clients/:id/regenerate', async (req, res) => {
  try {
    const client = await privateClientsRepo.regenerateClientAccess(req.params.id);
    res.json({
      success: true,
      accessCode: client.plainCode,
      client: { ...client, shareUrl: buildPrivateShareUrl(client.pageSlug) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/private-offers/clients/:id/active', async (req, res) => {
  try {
    const client = await privateClientsRepo.setClientActive(req.params.id, req.body.active !== false);
    res.json({
      success: true,
      client: { ...client, shareUrl: buildPrivateShareUrl(client.pageSlug) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/private-offers/clients/:id/label', async (req, res) => {
  try {
    const client = await privateClientsRepo.updateClientLabel(req.params.id, req.body.clientLabel);
    res.json({
      success: true,
      client: { ...client, shareUrl: buildPrivateShareUrl(client.pageSlug) },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/private-offers/clients/:id', async (req, res) => {
  try {
    const client = await privateClientsRepo.updateClientDetails(req.params.id, {
      clientLabel: req.body.clientLabel,
      phone: req.body.phone,
      requestType: req.body.requestType,
      propertyKind: req.body.propertyKind,
      requiredArea: req.body.requiredArea,
    });
    res.json({
      success: true,
      client: { ...client, shareUrl: buildPrivateShareUrl(client.pageSlug) },
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/private-offers', async (_req, res) => {
  try {
    const offers = await privateOffersRepo.listAll();
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function notifyPrivateOfferIfNeeded(offer, existing = null) {
  if (!pushNotifications.shouldNotifyPrivateOffer(offer)) return;
  if (existing && pushNotifications.shouldNotifyPrivateOffer(existing)) return;
  const globalActive = await privateClientsRepo.isGlobalActive();
  if (!globalActive) return;
  await pushNotifications.notifyClientsPrivateOffer(offer);
}

function parsePrivateOfferGallery(raw) {
  if (raw == null || raw === '') return undefined;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const decoded = typeof raw === 'string' && raw.includes('%')
      ? decodeURIComponent(raw)
      : raw;
    const parsed = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : undefined;
  } catch {
    return undefined;
  }
}

function parsePrivateOfferBody(body) {
  return {
    listingType: body.listingType === 'rent' ? 'rent' : 'sale',
    propertyType: body.propertyType || 'other',
    area: body.area,
    street: body.street,
    plotNumber: body.plotNumber,
    planNumber: body.planNumber,
    price: body.price,
    location: body.location,
    showLocation: body.showLocation !== 'false' && body.showLocation !== false,
    shortDescription: body.shortDescription,
    coverImage: body.coverImage,
    gallery: parsePrivateOfferGallery(body.gallery),
    status: body.status || 'available',
    internalNotes: body.internalNotes,
    visible: body.visible !== 'false' && body.visible !== false,
    active: body.active !== 'false' && body.active !== false,
    sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
  };
}

router.post('/private-offers', uploadMemory.fields([
  { name: 'images', maxCount: 20 },
]), async (req, res) => {
  try {
    const body = parsePrivateOfferBody(req.body);
    const files = req.files?.images || [];
    if (files.length) {
      const urls = await uploadFiles(files, 'private-offers');
      body.gallery = urls;
      body.coverImage = urls[0];
    }
    if (!body.coverImage && !body.gallery?.length) {
      return res.status(400).json({ success: false, message: 'يرجى إرفاق صورة واحدة على الأقل' });
    }
    const offer = await privateOffersRepo.create(body);
    notifyPrivateOfferIfNeeded(offer).catch((err) => console.error('[push] private offer:', err.message));
    res.json({ success: true, offer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/private-offers/:id', uploadMemory.fields([
  { name: 'images', maxCount: 20 },
]), async (req, res) => {
  try {
    const existing = await privateOffersRepo.getById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'العرض غير موجود' });

    const body = parsePrivateOfferBody(req.body);
    const files = req.files?.images || [];
    if (files.length) {
      const urls = await uploadFiles(files, 'private-offers');
      const keepGallery = body.gallery || existing.gallery || [];
      body.gallery = [...keepGallery, ...urls];
      if (!body.coverImage) body.coverImage = body.gallery[0];
    } else if (body.gallery === undefined) {
      body.gallery = existing.gallery;
      body.coverImage = body.coverImage || existing.coverImage;
    }

    const offer = await privateOffersRepo.update(req.params.id, body);
    notifyPrivateOfferIfNeeded(offer, existing).catch((err) => console.error('[push] private offer:', err.message));
    res.json({ success: true, offer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/private-offers/:id', async (req, res) => {
  try {
    const ok = await privateOffersRepo.remove(req.params.id);
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── تقييمات عقود الإيجار ───
const ejarReviewsRoutes = require('./ejarReviews');
const ejarReviewsRepo = require('../repositories/ejarReviewsRepo');

router.get('/ejar-reviews/stats', async (_req, res) => {
  try {
    const pendingCount = await ejarReviewsRepo.countPending();
    res.json({ success: true, pendingCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/ejar-reviews', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const items = await ejarReviewsRepo.listAdmin({ status });
    const pendingCount = await ejarReviewsRepo.countPending();
    res.json({ success: true, items, pendingCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/ejar-reviews/tokens', async (req, res) => {
  try {
    const requestId = req.body.requestId;
    if (!requestId) {
      return res.status(400).json({ success: false, message: 'معرّف الطلب مطلوب' });
    }
    const link = await ejarReviewsRoutes.createReviewLinkForRequest(requestId);
    res.json({ success: true, ...link });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/ejar-reviews/:id/approve', async (req, res) => {
  try {
    const review = await ejarReviewsRepo.setStatus(req.params.id, 'approved');
    if (!review) return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
    const publicStats = await ejarReviewsRepo.getPublicStats();
    res.json({ success: true, review, publicStats });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/ejar-reviews/:id/hide', async (req, res) => {
  try {
    const review = await ejarReviewsRepo.setStatus(req.params.id, 'hidden');
    if (!review) return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
    res.json({ success: true, review });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/ejar-reviews/:id/read-notification', async (req, res) => {
  try {
    await adminNotificationsRepo.markReadByReviewId(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
