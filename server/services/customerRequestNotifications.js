const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');
const pushNotifications = require('./pushNotifications');

async function notifyAdminsNewCustomerRequest(request) {
  if (!request?.id) return null;

  const notification = await adminNotificationsRepo.createCustomerRequestReceived({
    requestId: request.id,
    requestType: request.requestType,
    message: request.message,
  });

  pushNotifications.notifyAdminsClientRequest({
    requestId: request.id,
    requestType: request.requestType,
    message: request.message,
  }).catch((err) => console.error('[push] customer request:', err.message));

  return notification;
}

module.exports = { notifyAdminsNewCustomerRequest };
