const settingsRepo = require('../repositories/settingsRepo');
const { toPublicSettings } = require('../services/mappers');
const { DEFAULT_SETTINGS } = require('./settingsDefaults');

async function getSettings() {
  return settingsRepo.getSettings();
}

async function saveSettings(updates) {
  return settingsRepo.saveSettings(updates);
}

async function getPublicSettings() {
  return toPublicSettings(await getSettings());
}

async function getContactConfig() {
  const s = await getSettings();
  return {
    whatsapp: s.whatsappNumber || process.env.WHATSAPP_NUMBER || '966500000000',
    phone: s.phone || process.env.PHONE_DISPLAY || '050 000 0000',
    email: s.email || '',
    location: s.address || '',
    instagram: s.instagram || process.env.INSTAGRAM_URL || '#',
    x: s.twitter || process.env.X_URL || '#',
    snapchat: s.snapchat || '',
    tiktok: s.tiktok || '',
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  getPublicSettings,
  getContactConfig,
};
