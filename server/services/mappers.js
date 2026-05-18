const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');

function rowToSettings(row) {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    id: row.id,
    siteName: row.site_name,
    siteDescription: row.site_description,
    logoUrl: row.logo_url,
    faviconUrl: row.favicon_url,
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    heroImage: row.hero_image,
    heroMobileImage: row.hero_mobile_image,
    whatsappNumber: row.whatsapp_number,
    email: row.email,
    phone: row.phone,
    address: row.address,
    googleMap: row.google_map,
    instagram: row.instagram,
    twitter: row.twitter,
    snapchat: row.snapchat,
    tiktok: row.tiktok,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    footerText: row.footer_text,
    aboutText: row.about_text,
    visionText: row.vision_text,
    missionText: row.mission_text,
    updatedAt: row.updated_at,
  };
}

function settingsToRow(app) {
  return {
    id: 'main',
    site_name: app.siteName,
    site_description: app.siteDescription,
    logo_url: app.logoUrl,
    favicon_url: app.faviconUrl,
    hero_title: app.heroTitle,
    hero_subtitle: app.heroSubtitle,
    hero_image: app.heroImage,
    hero_mobile_image: app.heroMobileImage,
    whatsapp_number: app.whatsappNumber,
    email: app.email,
    phone: app.phone,
    address: app.address,
    google_map: app.googleMap,
    instagram: app.instagram,
    twitter: app.twitter,
    snapchat: app.snapchat,
    tiktok: app.tiktok,
    primary_color: app.primaryColor,
    secondary_color: app.secondaryColor,
    footer_text: app.footerText,
    about_text: app.aboutText,
    vision_text: app.visionText,
    mission_text: app.missionText,
    updated_at: new Date().toISOString(),
  };
}

function rowToProperty(row, images = []) {
  if (!row) return null;
  const gallery = images.length
    ? images.map((i) => i.image_url)
    : Array.isArray(row.gallery)
      ? row.gallery
      : [];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    propertyType: row.property_type,
    listingType: row.listing_type,
    city: row.city,
    district: row.district,
    street: row.street,
    price: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    area: row.area,
    age: row.age,
    latitude: row.latitude,
    longitude: row.longitude,
    videoUrl: row.video_url,
    mapsUrl: row.maps_url || '',
    coverImage: row.cover_image || gallery[0] || '',
    gallery,
    images: images.map((i) => ({ id: i.id, url: i.image_url, sortOrder: i.sort_order })),
    features: row.features || [],
    featured: row.featured,
    status: row.status,
    agentName: row.agent_name,
    agentPhone: row.agent_phone,
    viewsCount: row.views_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    location: [row.city, row.district].filter(Boolean).join(' — '),
    priceDisplay: row.price != null ? Number(row.price).toLocaleString('ar-SA') : '',
    contractNumber: row.reference_no || '',
  };
}

function propertyToRow(body) {
  return {
    title: body.title,
    slug: body.slug,
    description: body.description || '',
    property_type: body.propertyType || body.property_type,
    listing_type: body.listingType || body.listing_type || 'sale',
    city: body.city,
    district: body.district || null,
    street: body.street || null,
    price: body.price != null && body.price !== '' ? Number(body.price) : null,
    bedrooms: body.bedrooms != null && body.bedrooms !== '' ? parseInt(body.bedrooms, 10) : null,
    bathrooms: body.bathrooms != null && body.bathrooms !== '' ? parseInt(body.bathrooms, 10) : null,
    area: body.area != null && body.area !== '' ? Number(body.area) : null,
    age: body.age != null && body.age !== '' ? parseInt(body.age, 10) : null,
    latitude: body.latitude != null && body.latitude !== '' ? Number(body.latitude) : null,
    longitude: body.longitude != null && body.longitude !== '' ? Number(body.longitude) : null,
    video_url: body.videoUrl || body.video_url || null,
    maps_url: body.mapsUrl || body.maps_url || null,
    cover_image: body.coverImage || body.cover_image || null,
    gallery: body.gallery || [],
    features: body.features || [],
    featured: !!body.featured,
    status: body.status || 'draft',
    agent_name: body.agentName || body.agent_name || null,
    agent_phone: body.agentPhone || body.agent_phone || null,
    reference_no: body.contractNumber || body.referenceNo || body.reference_no || null,
    updated_at: new Date().toISOString(),
  };
}

function toPublicProperty(p) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    type: p.propertyType,
    propertyType: p.propertyType,
    listingType: p.listingType,
    city: p.city,
    district: p.district,
    location: p.location,
    price: p.priceDisplay,
    priceRaw: p.price,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    latitude: p.latitude,
    longitude: p.longitude,
    image: p.coverImage,
    coverImage: p.coverImage,
    gallery: p.gallery,
    featured: p.featured,
    features: p.features,
    referenceNo: p.contractNumber || '',
    mapsUrl: p.mapsUrl || '',
  };
}

function rowToMapProperty(row) {
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  const cover = row.cover_image || gallery[0] || '';
  const priceNum = row.price != null ? Number(row.price) : null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    propertyType: row.property_type,
    listingType: row.listing_type,
    city: row.city,
    district: row.district,
    location: [row.city, row.district].filter(Boolean).join(' — '),
    price: priceNum,
    priceDisplay: priceNum != null ? priceNum.toLocaleString('ar-SA') : '',
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    area: row.area,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    coverImage: cover,
    gallery: gallery.length ? gallery : cover ? [cover] : [],
    referenceNo: row.reference_no || '',
    mapsUrl: row.maps_url || '',
  };
}

function rowToNews(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    image: row.image,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToBanner(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    imageDesktop: row.image_desktop,
    imageMobile: row.image_mobile || row.image_desktop,
    buttonText: row.button_text,
    buttonLink: row.button_link,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
  };
}

function rowToTestimonial(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerName: row.customer_name,
    comment: row.comment,
    rating: row.rating,
    image: row.image,
    active: row.active,
    createdAt: row.created_at,
  };
}

function rowToRequest(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    requestType: row.request_type,
    propertyId: row.property_id,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

function rowToSubscription(row) {
  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
  };
}

/** توافق مع الواجهة القديمة */
function toLegacyPublicOffer(p) {
  return {
    id: p.id,
    title: p.title,
    type: p.propertyType,
    location: p.location,
    area: p.area ? `${p.area} م²` : '',
    price: p.priceDisplay,
    image: p.coverImage,
  };
}

function toPublicSettings(s) {
  return {
    updatedAt: s.updatedAt,
    siteName: s.siteName,
    siteDescription: s.siteDescription,
    logo: s.logoUrl,
    favicon: s.faviconUrl,
    heroImage: s.heroImage,
    heroMobileImage: s.heroMobileImage,
    colors: {
      primary: s.primaryColor,
      gold: s.secondaryColor,
      textPrimary: '#000000',
      textSecondary: '#1a1a1a',
    },
    hero: {
      label: s.heroSubtitle,
      title: s.heroTitle,
      description: s.siteDescription,
    },
    contact: {
      phone: s.phone,
      whatsapp: s.whatsappNumber,
      email: s.email,
      location: s.address,
      instagram: s.instagram,
      x: s.twitter,
      snapchat: s.snapchat,
      tiktok: s.tiktok,
    },
    aboutText: s.aboutText,
    visionText: s.visionText,
    missionText: s.missionText,
    footerText: s.footerText,
    googleMap: s.googleMap,
  };
}

module.exports = {
  rowToSettings,
  settingsToRow,
  rowToProperty,
  propertyToRow,
  toPublicProperty,
  rowToMapProperty,
  toLegacyPublicOffer,
  toPublicSettings,
  rowToNews,
  rowToBanner,
  rowToTestimonial,
  rowToRequest,
  rowToSubscription,
};
