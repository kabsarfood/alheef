const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');

function rowToSettings(row) {
  if (!row) {
    return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  }
  const extra = row.extra || {};
  return {
    siteName: row.site_name || DEFAULT_SETTINGS.siteName,
    siteTagline: extra.siteTagline || DEFAULT_SETTINGS.siteTagline,
    logo: row.logo_url || DEFAULT_SETTINGS.logo,
    heroImage: row.banner_url || DEFAULT_SETTINGS.heroImage,
    colors: {
      primary: row.primary_color || DEFAULT_SETTINGS.colors.primary,
      gold: row.secondary_color || DEFAULT_SETTINGS.colors.gold,
      textPrimary: extra.textPrimary || DEFAULT_SETTINGS.colors.textPrimary,
      textSecondary: extra.textSecondary || DEFAULT_SETTINGS.colors.textSecondary,
      border: extra.border || DEFAULT_SETTINGS.colors.border,
      buttonPrimary: extra.buttonPrimary || DEFAULT_SETTINGS.colors.buttonPrimary,
    },
    hero: {
      label: extra.heroLabel || DEFAULT_SETTINGS.hero.label,
      title: row.hero_title || DEFAULT_SETTINGS.hero.title,
      description: row.hero_description || DEFAULT_SETTINGS.hero.description,
      btnOffers: extra.heroBtnOffers || DEFAULT_SETTINGS.hero.btnOffers,
      btnRequest: extra.heroBtnRequest || DEFAULT_SETTINGS.hero.btnRequest,
    },
    contact: {
      phone: extra.phone || DEFAULT_SETTINGS.contact.phone,
      whatsapp: row.whatsapp || DEFAULT_SETTINGS.contact.whatsapp,
      email: row.email || DEFAULT_SETTINGS.contact.email,
      location: row.address || DEFAULT_SETTINGS.contact.location,
      instagram: extra.instagram || DEFAULT_SETTINGS.contact.instagram,
      x: extra.x || DEFAULT_SETTINGS.contact.x,
    },
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

function settingsToRow(app) {
  const extra = {
    siteTagline: app.siteTagline,
    heroLabel: app.hero?.label,
    heroBtnOffers: app.hero?.btnOffers,
    heroBtnRequest: app.hero?.btnRequest,
    phone: app.contact?.phone,
    instagram: app.contact?.instagram,
    x: app.contact?.x,
    textPrimary: app.colors?.textPrimary,
    textSecondary: app.colors?.textSecondary,
    buttonPrimary: app.colors?.buttonPrimary,
    border: app.colors?.border,
  };

  return {
    id: 'main',
    site_name: app.siteName,
    hero_title: app.hero?.title,
    hero_description: app.hero?.description,
    logo_url: app.logo,
    banner_url: app.heroImage,
    whatsapp: app.contact?.whatsapp,
    email: app.contact?.email,
    address: app.contact?.location,
    primary_color: app.colors?.primary,
    secondary_color: app.colors?.gold,
    extra,
    updated_at: new Date().toISOString(),
  };
}

function rowToProperty(row) {
  if (!row) return null;
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    id: row.id,
    propertyType: row.type,
    type: row.type,
    area: row.area || '',
    contractNumber: row.reference_no || '',
    mediationNo: row.mediation_no || '',
    location: row.location || '',
    latitude: row.latitude,
    longitude: row.longitude,
    mapsUrl: row.maps_url || '',
    price: row.price || '',
    priceDisplay: row.price_display || '',
    details: row.details || '',
    images,
    image: images[0] || '',
    title: row.title || '',
    status: row.status || 'published',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function propertyToRow(offer) {
  return {
    reference_no: offer.contractNumber || offer.reference_no || '',
    type: offer.propertyType || offer.type,
    area: offer.area ? String(offer.area).replace(/\s*م²\s*/g, '').trim() : '',
    mediation_no: offer.mediationNo || offer.mediation_no || '',
    location: offer.location,
    latitude: offer.latitude ?? null,
    longitude: offer.longitude ?? null,
    price: String(offer.price),
    price_display: offer.priceDisplay || '',
    details: offer.details || '',
    status: offer.status || 'published',
    images: offer.images || (offer.image ? [offer.image] : []),
    maps_url: offer.mapsUrl || '',
    title: offer.title || '',
    updated_at: new Date().toISOString(),
  };
}

function rowToNews(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    image: row.image || '',
    category: row.category || 'عام',
    status: row.status || 'published',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** طلب بحث عقار (الشكل القديم للوحة التحكم) */
function rowToPropertyRequest(row) {
  const d = row.details || {};
  return {
    id: row.id,
    propertyType: d.propertyType,
    city: d.city,
    district: d.district,
    budget: d.budget,
    description: d.description,
    phone: row.phone,
    createdAt: row.created_at,
  };
}

/** عرض مالك (الشكل القديم) */
function rowToListing(row) {
  const d = row.details || {};
  return {
    id: row.id,
    ownerName: row.name || d.ownerName,
    phone: row.phone,
    propertyType: d.propertyType,
    city: d.city,
    description: d.description,
    images: d.images || [],
    createdAt: row.created_at,
  };
}

function rowToSubscription(row) {
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone,
    interests: row.interests || '',
    createdAt: row.created_at,
  };
}

module.exports = {
  rowToSettings,
  settingsToRow,
  rowToProperty,
  propertyToRow,
  rowToNews,
  rowToPropertyRequest,
  rowToListing,
  rowToSubscription,
};
