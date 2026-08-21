let webpush = null;
try {
  webpush = require('web-push');
} catch {
  console.warn('[push] حزمة web-push غير مثبتة — نفّذ npm install');
}
const pushSubscriptionsRepo = require('../repositories/pushSubscriptionsRepo');
const privateClientsRepo = require('../repositories/privateClientsRepo');
const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');
const { buildPrivateShareUrl } = require('../utils/privateOffersPath');
const { PRIVATE_PROPERTY_TYPES } = require('./mappers');

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

async function notifyAdminsEjarReview({ reviewId, rating }) {
  const unreadCount = await adminNotificationsRepo.countUnread();
  const stars = '⭐'.repeat(Math.min(5, Math.max(1, parseInt(rating, 10) || 0)));
  await sendToAdmins({
    title: 'تقييم جديد لعقد إيجار',
    body: `وصل تقييم جديد ${stars} ويحتاج إلى مراجعتك قبل النشر.`,
    url: `/dashboard/ejar-reviews.html?review=${reviewId || ''}`,
    type: 'ejar_review_received',
    badgeCount: unreadCount,
    tag: `ejar-review-${reviewId}`,
  });
}

async function notifyAdminsClientRequest({ requestId, requestType, message }) {
  const unreadCount = await adminNotificationsRepo.countUnread();
  const { title, body } = adminNotificationsRepo.buildCustomerRequestNotificationContent({
    requestType,
    message,
  });
  await sendToAdmins({
    title,
    body: body.slice(0, 180),
    url: requestId ? `/dashboard/requests.html?request=${requestId}` : '/dashboard/requests.html',
    type: adminNotificationsRepo.CUSTOMER_REQUEST_TYPE,
    badgeCount: unreadCount,
    tag: requestId ? `customer-request-${requestId}` : 'customer-request',
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
    title: 'إعلان عقاري جديد',
    body: [property.title, property.district, property.city].filter(Boolean).join(' — ').slice(0, 180),
    url: property.slug ? `/property.html?slug=${property.slug}` : `/property.html?id=${property.id}`,
    type: 'new_offer',
    tag: `offer-${property.id}`,
    badgeCount: 1,
    icon: '/assets/icon-192.png?v=5',
    badge: '/assets/icon-192.png?v=5',
  };

  await sendToMany(subs, payload);
}

async function notifyClientsPrivateOffer(offer) {
  const subs = await pushSubscriptionsRepo.listPrivateOfferSubscribers();
  if (!subs.length || !offer) return;

  const typeLabel = PRIVATE_PROPERTY_TYPES[offer.propertyType] || offer.propertyType || 'عرض خاص';
  const parts = [
    typeLabel,
    offer.area != null ? `${offer.area} م²` : '',
    offer.street || '',
    offer.offerNumber,
  ].filter(Boolean);
  const body = parts.join(' — ').slice(0, 180);

  const bySlug = new Map();
  subs.forEach((sub) => {
    const slug = sub.preferences?.privateSlug;
    if (!slug) return;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(sub);
  });

  for (const [slug, rows] of bySlug) {
    const client = await privateClientsRepo.getClientBySlug(slug);
    if (!client) continue;
    await sendToMany(rows, {
      title: 'عرض خاص جديد',
      body,
      url: buildPrivateShareUrl(slug),
      type: 'private_offer',
      tag: `private-${offer.id}`,
      badgeCount: 1,
      icon: '/assets/icon-192.png?v=5',
      badge: '/assets/icon-192.png?v=5',
    });
  }
}

function shouldNotifyPrivateOffer(offer) {
  return !!(offer && offer.visible && offer.active && offer.status !== 'hidden');
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
  notifyAdminsEjarReview,
  notifyAdminsClientRequest,
  notifyMarketerPropertyReview,
  notifyClientsNewOffer,
  notifyClientsPrivateOffer,
  shouldNotifyPrivateOffer,
  generateVapidKeys,
};
