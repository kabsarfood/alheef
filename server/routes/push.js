const express = require('express');
const { parseToken } = require('../middleware/auth');
const pushSubscriptionsRepo = require('../repositories/pushSubscriptionsRepo');
const pushNotifications = require('../services/pushNotifications');
const { isEnabled } = require('../lib/supabase');

const router = express.Router();

function requireDb(_req, res, next) {
  if (!isEnabled()) {
    return res.status(503).json({ success: false, message: 'قاعدة البيانات غير متصلة' });
  }
  next();
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.auth = token ? parseToken(token) : null;
  next();
}

router.get('/vapid-public-key', (_req, res) => {
  const publicKey = pushNotifications.getPublicKey();
  if (!publicKey) {
    return res.status(503).json({ success: false, message: 'إشعارات الدفع غير مهيأة على الخادم' });
  }
  res.json({ success: true, publicKey });
});

router.post('/subscribe', requireDb, optionalAuth, async (req, res) => {
  try {
    const { subscription, role, clientKey, email, preferences, offersEnabled } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'اشتراك غير صالح' });
    }

    let resolvedRole = role || 'client';
    let userId = null;
    let marketerId = null;

    if (req.auth) {
      resolvedRole = req.auth.role;
      userId = req.auth.userId || req.auth.role;
      marketerId = req.auth.marketerId || null;
    } else if (!['admin', 'marketer', 'client'].includes(resolvedRole)) {
      resolvedRole = 'client';
    }

    if (resolvedRole === 'client' && !offersEnabled) {
      /* اشتراك عميل بدون موافقة إشعارات العروض */
    }

    const row = await pushSubscriptionsRepo.upsert({
      subscription,
      role: resolvedRole,
      userId,
      marketerId,
      clientKey: clientKey || null,
      email: email || null,
      preferences: preferences || {},
      offersEnabled: resolvedRole === 'client' ? !!offersEnabled : false,
    });

    res.json({ success: true, subscription: row });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/unsubscribe', requireDb, async (req, res) => {
  try {
    const { endpoint, clientKey } = req.body || {};
    if (endpoint) await pushSubscriptionsRepo.deactivate(endpoint);
    if (clientKey) await pushSubscriptionsRepo.deactivateByClientKey(clientKey);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/** اختبار إشعار للأدمن — بعد تفعيل الاشتراك */
router.post('/test-admin', requireDb, optionalAuth, async (req, res) => {
  try {
    if (!req.auth || req.auth.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'غير مصرح — يرجى تسجيل دخول الأدمن' });
    }
    const sent = await pushNotifications.sendToAdmins({
      title: 'اختبار إشعارات الهيف',
      body: 'تم تفعيل إشعارات PWA بنجاح — مكتب الهيف للخدمات العقارية',
      url: '/dashboard/property-reviews.html',
      type: 'test',
      tag: 'alheef-test',
    });
    res.json({ success: true, message: 'تم إرسال إشعار الاختبار للأدمن' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
