const express = require('express');
const multer = require('multer');
const marketerJoinRepo = require('../repositories/marketerJoinRepo');
const marketersRepo = require('../repositories/marketersRepo');
const propertiesRepo = require('../repositories/propertiesRepo');
const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');
const pushNotifications = require('../services/pushNotifications');
const { enrichBodyCoords } = require('../utils/coords');
const { createToken, requireMarketer, parseToken } = require('../middleware/auth');
const { uploadFiles } = require('../services/storage');
const { canMarketerEdit, canMarketerDelete } = require('../utils/propertyStatus');
const { JOIN_STATUS_LABELS, PROPERTY_STATUS_LABELS, zoneLabel } = require('../utils/marketerZones');
const { requireDb } = require('../middleware/requireDb');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function mapJoinRequest(r) {
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    nationalId: r.national_id,
    falLicense: r.fal_license,
    marketingZone: r.marketing_zone,
    marketingZoneLabel: zoneLabel(r.marketing_zone),
    status: r.status,
    statusLabel: JOIN_STATUS_LABELS[r.status] || r.status,
    adminNote: r.admin_note || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    reviewedAt: r.reviewed_at,
  };
}

/** عام — طلب الانضمام */
router.post('/join', requireDb, async (req, res) => {
  try {
    const row = await marketerJoinRepo.createRequest(req.body);
    res.json({
      success: true,
      message: 'تم استلام طلبك، وسيتم مراجعته من إدارة مكتب الهيف.',
      request: mapJoinRequest(row),
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** مسوق — معلومات الجلسة */
router.get('/me', requireMarketer, async (req, res) => {
  try {
    const marketer = await marketersRepo.getById(req.auth.marketerId);
    if (!marketer) return res.status(404).json({ success: false, message: 'الحساب غير موجود' });
    res.json({ success: true, marketer: marketersRepo.toPublic(marketer) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** مسوق — إحصائيات لوحة التحكم */
router.get('/stats', requireMarketer, async (req, res) => {
  try {
    const id = req.auth.marketerId;
    const { items } = await propertiesRepo.listByMarketer(id, {}, { limit: 500 });
    const counts = {
      all: items.length,
      pending_review: 0,
      needs_changes: 0,
      approved_published: 0,
      published: 0,
      expired: 0,
      rejected: 0,
      draft: 0,
      hidden: 0,
      archived: 0,
    };
    items.forEach((p) => {
      if (counts[p.status] != null) counts[p.status] += 1;
    });
    counts.published = items.filter((p) => p.status === 'published' || p.status === 'approved_published').length;
    counts.approved_published = counts.published;
    res.json({ success: true, counts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** مسوق — قائمة إعلاناتي */
router.get('/properties', requireMarketer, async (req, res) => {
  try {
    const status = req.query.status || '';
    const filters = {};
    if (status) filters.status = status;
    const { items } = await propertiesRepo.listByMarketer(req.auth.marketerId, filters, { limit: 200 });
    res.json({
      success: true,
      items: items.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        statusLabel: PROPERTY_STATUS_LABELS[p.status] || p.status,
        city: p.city,
        district: p.district,
        price: p.priceDisplay,
        createdAt: p.createdAt,
        adminFeedback: p.adminFeedback || '',
        licenseExpiresAt: p.licenseExpiresAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/properties/:id', requireMarketer, async (req, res) => {
  try {
    const p = await propertiesRepo.getById(req.params.id);
    if (!p || p.marketerId !== req.auth.marketerId) {
      return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
    }
    res.json({ success: true, property: p });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** مسوق — إضافة إعلان (نشر مباشر بدون مراجعة) */
router.post('/properties', requireMarketer, upload.array('images', 20), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const body = await enrichBodyCoords({
      ...req.body,
      marketerId: req.auth.marketerId,
      status: 'approved_published',
      homepage_published: true,
      approved_at: now,
      approved_by: req.auth.marketerId,
      listingType: req.body.listingType || 'sale',
    });
    const p = await propertiesRepo.create(body);
    const urls = await uploadFiles(req.files, 'properties');
    if (urls.length) await propertiesRepo.addImages(p.id, urls);
    const full = await propertiesRepo.getById(p.id);

    pushNotifications.notifyClientsNewOffer({
      id: full.id,
      slug: full.slug,
      title: full.title,
      city: full.city,
      district: full.district,
    }).catch((err) => console.error('[push] new offer:', err.message));

    res.json({
      success: true,
      message: 'تم نشر الإعلان على الموقع',
      property: full,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** مسوق — تعديل إعلان */
router.put('/properties/:id', requireMarketer, upload.array('images', 20), async (req, res) => {
  try {
    const existing = await propertiesRepo.getById(req.params.id);
    if (!existing || existing.marketerId !== req.auth.marketerId) {
      return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
    }
    if (!canMarketerEdit(existing.status)) {
      return res.status(403).json({ success: false, message: 'لا يمكن تعديل هذا الإعلان في حالته الحالية' });
    }
    const body = await enrichBodyCoords({
      ...req.body,
      marketerId: req.auth.marketerId,
      status: existing.status === 'needs_changes' ? 'approved_published' : existing.status,
      homepage_published: existing.status === 'needs_changes' ? true : undefined,
      approved_at: existing.status === 'needs_changes' ? new Date().toISOString() : undefined,
      approved_by: existing.status === 'needs_changes' ? req.auth.marketerId : undefined,
    });
    const p = await propertiesRepo.update(req.params.id, body);
    const urls = await uploadFiles(req.files, 'properties');
    if (urls.length) await propertiesRepo.addImages(p.id, urls);
    const full = await propertiesRepo.getById(p.id);

    if (existing.status === 'needs_changes') {
      pushNotifications.notifyClientsNewOffer({
        id: full.id,
        slug: full.slug,
        title: full.title,
        city: full.city,
        district: full.district,
      }).catch((err) => console.error('[push] new offer:', err.message));
    }

    res.json({
      success: true,
      message: 'تم حفظ التعديلات وإرسالها للمراجعة',
      property: await propertiesRepo.getById(p.id),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/properties/:id', requireMarketer, async (req, res) => {
  try {
    const existing = await propertiesRepo.getById(req.params.id);
    if (!existing || existing.marketerId !== req.auth.marketerId) {
      return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
    }
    if (!canMarketerDelete(existing.status)) {
      return res.status(403).json({ success: false, message: 'لا يمكن حذف إعلان منشور' });
    }
    await propertiesRepo.remove(req.params.id);
    res.json({ success: true, message: 'تم حذف الإعلان' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
