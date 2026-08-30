const adminNotificationsRepo = require('../repositories/adminNotificationsRepo');
const pushNotifications = require('./pushNotifications');

async function notifyAdminsNewCustomerRequest(request) {
  if (!request?.id) return null;

  try {
    const notification = await adminNotificationsRepo.createCustomerRequestReceived({
      requestId: request.id,
      requestType: request.requestType,
      message: request.message,
      customerName: request.customerName,
      customerPhone: request.customerPhone,
    });

    pushNotifications.notifyAdminsClientRequest({
      requestId: request.id,
      requestType: request.requestType,
      message: request.message,
    }).catch((err) => console.error('[push] customer request:', err.message));

    return notification;
  } catch (err) {
    console.error('[notify] customer request:', err.message);
    return null;
  }
}

module.exports = { notifyAdminsNewCustomerRequest };
