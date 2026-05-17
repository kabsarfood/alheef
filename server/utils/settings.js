const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', '..', 'data', 'settings.json');

const DEFAULT_SETTINGS = {
  siteName: 'الهيف العقارية',
  siteTagline: 'للخدمات العقارية',
  logo: '/images/logo-alheef.png',
  heroImage: 'https://images.unsplash.com/photo-1600585154340-be6162a9a2c9?w=1920&q=85',
  colors: {
    primary: '#1E2A38',
    gold: '#C5A46D',
    textPrimary: '#111111',
    textSecondary: '#444444',
    border: 'rgba(197, 164, 109, 0.32)',
    buttonPrimary: '#1E2A38',
  },
  hero: {
    label: 'مكتب عقاري سحابي',
    title: 'الهيف للخدمات العقارية',
    description:
      'خبرة وثقة في الخدمات والتسويق العقاري — نُقدّم لك تجربة عقارية راقية تليق بمستوى تطلعاتك',
    btnOffers: 'تصفح العروض',
    btnRequest: 'اطلب عقارك',
  },
  contact: {
    phone: '050 000 0000',
    whatsapp: '966500000000',
    email: 'info@alheef.com',
    location: 'الرياض، المملكة العربية السعودية',
    instagram: 'https://instagram.com/alheef',
    x: 'https://x.com/alheef',
  },
};

function deepMerge(target, source) {
  const out = { ...target };
  Object.keys(source || {}).forEach((key) => {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object'
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined && source[key] !== '') {
      out[key] = source[key];
    }
  });
  return out;
}

function getSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return deepMerge(DEFAULT_SETTINGS, raw);
  } catch {
    return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  }
}

function saveSettings(updates) {
  const merged = deepMerge(getSettings(), updates);
  merged.updatedAt = new Date().toISOString();
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function getPublicSettings() {
  const s = getSettings();
  return {
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

function getContactConfig() {
  const s = getSettings();
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
  SETTINGS_PATH,
};
