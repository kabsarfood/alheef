let webpush = null;
try {
  webpush = require('web-push');
} catch {
  console.warn('[push] حزمة web-push غير مثبتة — نفّذ npm install');
}
const pushSubscriptionsRepo = require('../repositories/pushSubscriptionsRepo');
const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');

let vapidReady = false;

function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@alheef.website';
  return { publicKey, privateKey, subject };
}

function initVapid() {
  if (vapidReady) return true;
  if (!webpush) return false;
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys غير معرّفة — أضف VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY في .env');
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
  return true;
}

function getPublicKey() {
  return getVapidConfig().publicKey || null;
}

function toWebPushSub(row) {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

async function sendToSubscription(row, payload) {
  if (!initVapid()) return { ok: false, reason: 'no_vapid' };
  try {
    await webpush.sendNotification(toWebPushSub(row), JSON.stringify(payload), {
      TTL: 60 * 60 * 24,
    });
    return { ok: true };
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await pushSubscriptionsRepo.deactivate(row.endpoint);
    }
    return { ok: false, reason: err.message };
  }
}

async function sendToMany(rows, payload) {
  if (!rows.length) return;
  await Promise.all(rows.map((row) => sendToSubscription(row, payload)));
}

async function sendToAdmins(payload) {
  const rows = await pushSubscriptionsRepo.listByRole('admin');
  await sendToMany(rows, payload);
}

async function sendToMarketer(marketerId, payload) {
  const rows = await pushSubscriptionsRepo.listByMarketerId(marketerId);
  await sendToMany(rows, payload);
}

async function notifyAdminsPropertyPendingReview({ propertyId, marketerName, propertyType, district }) {
  const unreadCount = await adminNotificationsRepo.countUnread();
  const body = [marketerName, propertyType, district].filter(Boolean).join(' — ');
  await sendToAdmins({
    title: 'إعلان جديد بانتظار المراجعة',
    body: body || 'راجع الإعلان من لوحة التحكم',
    url: `/dashboard/property-reviews.html?property=${propertyId || ''}`,
    type: 'property_pending_review',
    badgeCount: unreadCount,
    tag: `review-${propertyId}`,
  });
}

async function notifyAdminsClientRequest({ requestType, customerName, message }) {
  const unreadCount = await adminNotificationsRepo.countUnread();
  await sendToAdmins({
    title: 'طلب عميل جديد',
    body: [customerName, requestType, message].filter(Boolean).join(' — ').slice(0, 180),
    url: '/dashboard/requests.html',
    type: 'client_request',
    badgeCount: unreadCount,
    tag: 'client-request',
  });
}

async function notifyMarketerPropertyReview({ marketerId, propertyId, action, title, feedback }) {
  const actionTitles = {
    approve: 'تم قبول إعلانك',
    needs_changes: 'إعلانك يحتاج تعديل',
    reject: 'تم رفض إعلانك',
    expired: 'انتهى ترخيص إعلانك',
  };
  const msgTitle = title || actionTitles[action] || 'تحديث على إعلانك';
  const url = action === 'expired'
    ? '/marketer/properties.html?status=expired'
    : `/marketer/properties.html`;

  await sendToMarketer(marketerId, {
    title: msgTitle,
    body: feedback || 'افتح لوحة مسوق الهيف للتفاصيل',
    url,
    type: `marketer_${action}`,
    tag: `marketer-${propertyId || action}`,
  });
}

async function notifyClientsNewOffer(property) {
  const subs = await pushSubscriptionsRepo.listOfferSubscribers();
  if (!subs.length) return;

  const payload = {
    title: 'عرض عقاري جديد يناسبك',
    body: [property.title, property.district, property.city].filter(Boolean).join(' — ').slice(0, 180),
    url: property.slug ? `/property.html?slug=${property.slug}` : `/property.html?id=${property.id}`,
    type: 'new_offer',
    tag: `offer-${property.id}`,
  };

  await sendToMany(subs, payload);
}

function generateVapidKeys() {
  if (!webpush) throw new Error('web-push غير مثبتة');
  return webpush.generateVAPIDKeys();
}

module.exports = {
  initVapid,
  getPublicKey,
  sendToSubscription,
  sendToAdmins,
  sendToMarketer,
  notifyAdminsPropertyPendingReview,
  notifyAdminsClientRequest,
  notifyMarketerPropertyReview,
  notifyClientsNewOffer,
  generateVapidKeys,
};
