const settingsRepo = require('../repositories/settingsRepo');
const { DEFAULT_SETTINGS } = require('./settingsDefaults');

async function getSettings() {
  return settingsRepo.getSettings();
}

async function saveSettings(updates) {
  return settingsRepo.saveSettings(updates);
}

async function getPublicSettings() {
  const s = await getSettings();
  return {
    updatedAt: s.updatedAt,
    siteName: s.siteName,
    siteTagline: s.siteTagline,
    logo: s.logo,
    heroImage: s.heroImage,
    colors: s.colors,
    hero: s.hero,
    contact: {
      phone: s.contact.phone,
      whatsapp: s.contact.whatsapp,
      email: s.contact.email,
      location: s.contact.location,
      instagram: s.contact.instagram,
      x: s.contact.x,
    },
  };
}

async function getContactConfig() {
  const s = await getSettings();
  return {
    whatsapp: s.contact.whatsapp || process.env.WHATSAPP_NUMBER || '966500000000',
    phone: s.contact.phone || process.env.PHONE_DISPLAY || '050 000 0000',
    email: s.contact.email || '',
    location: s.contact.location || '',
    instagram: s.contact.instagram || process.env.INSTAGRAM_URL || '#',
    x: s.contact.x || process.env.X_URL || '#',
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  getSettings,
  saveSettings,
  getPublicSettings,
  getContactConfig,
};
