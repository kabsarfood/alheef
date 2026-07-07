const { DEFAULT_SETTINGS } = require('../utils/settingsDefaults');
const { parseCoord } = require('../utils/coords');

/** يحوّل قيمة رقمية قد تحتوي أرقاماً عربية أو وحدة (م²) إلى رقم، وإلا null */
function parseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

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
  const extra = readMapExtras(row);
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
    plotNumber: row.plot_number || '',
    planNumber: row.plan_number || '',
    direction: row.direction || '',
    streetWidth: row.street_width || '',
    priceType: row.price_type || 'fixed',
    contactPhone: extra.isBuyRequest ? extra.requestPhone : (row.contact_phone || row.agent_phone || extra.contactPhone),
    requestPropertyKind: extra.requestPropertyKind || row.property_type,
    requestUsage: extra.requestUsage,
    requestPhone: extra.requestPhone,
    isBuyRequest: extra.isBuyRequest,
  };
}

function readMapExtras(row) {
  const f = row.features && typeof row.features === 'object' && !Array.isArray(row.features)
    ? row.features
    : {};
  const isBuy = row.listing_type === 'buy_request' || f.is_buy_request;
  return {
    plotNumber: row.plot_number || f.plot_number || f.plotNumber || '',
    planNumber: row.plan_number || f.plan_number || f.planNumber || '',
    direction: row.direction || f.direction || '',
    streetWidth: row.street_width || f.street_width || f.streetWidth || '',
    priceType: row.price_type || f.price_type || f.priceType || 'fixed',
    contactPhone: isBuy
      ? ''
      : (row.contact_phone || row.agent_phone || f.contact_phone || f.contactPhone || ''),
    requestPropertyKind: f.request_property_kind || f.requestPropertyKind || '',
    requestUsage: f.request_usage || f.requestUsage || '',
    requestPhone: f.request_phone || f.requestPhone || '',
    isBuyRequest: !!isBuy,
  };
}

/** حقول الخريطة — تُخزَّن في features إن لم تكن الأعمدة منفّذة في Supabase بعد */
function buildMapFeatures(body) {
  const listing = body.listingType || body.listing_type || 'sale';
  const isBuy = listing === 'buy_request';

  const mapFields = {
    plot_number: body.plotNumber || body.plot_number || null,
    plan_number: body.planNumber || body.plan_number || null,
    direction: body.direction || null,
    street_width: body.streetWidth || body.street_width || null,
    price_type: body.priceType || body.price_type || 'fixed',
    contact_phone: isBuy ? null : (body.contactPhone || body.contact_phone || null),
  };

  let f = body.features;
  if (Array.isArray(f)) {
    f = f.length ? { amenities: f } : {};
  } else if (f && typeof f === 'object') {
    f = { ...f };
  } else {
    f = {};
  }

  Object.entries(mapFields).forEach(([k, v]) => {
    if (v != null && v !== '') f[k] = v;
  });

  if (isBuy) {
    f.is_buy_request = true;
    f.request_property_kind = body.requestPropertyKind || body.request_property_kind || body.propertyType || '';
    f.request_usage = body.requestUsage || body.request_usage || '';
    const reqPhone = body.requestPhone || body.request_phone || '';
    if (reqPhone) f.request_phone = reqPhone;
  }

  return f;
}

function propertyToRow(body) {
  const lat = parseCoord(body.latitude ?? body.lat);
  const lng = parseCoord(body.longitude ?? body.lng);
  const listing = body.listingType || body.listing_type || 'sale';
  const isBuy = listing === 'buy_request';
  const contactPhone = isBuy
    ? null
    : (body.contactPhone || body.contact_phone || body.agentPhone || body.agent_phone || null);

  const propertyType = isBuy
    ? (body.requestPropertyKind || body.request_property_kind || body.propertyType || 'طلب شراء')
    : (body.propertyType || body.property_type);

  const priceRaw = isBuy ? (body.budget ?? body.price) : body.price;

  return {
    title: body.title,
    slug: body.slug,
    description: body.description || '',
    property_type: propertyType,
    listing_type: listing,
    city: body.city,
    district: body.district || null,
    street: body.street || null,
    price: parseNumber(priceRaw),
    bedrooms: body.bedrooms != null && body.bedrooms !== '' ? parseInt(body.bedrooms, 10) : null,
    bathrooms: body.bathrooms != null && body.bathrooms !== '' ? parseInt(body.bathrooms, 10) : null,
    area: parseNumber(body.area),
    age: body.age != null && body.age !== '' ? parseInt(body.age, 10) : null,
    latitude: lat,
    longitude: lng,
    video_url: body.videoUrl || body.video_url || null,
    maps_url: body.mapsUrl || body.maps_url || null,
    cover_image: body.coverImage || body.cover_image || null,
    gallery: body.gallery || [],
    features: buildMapFeatures(body),
    featured: !!body.featured,
    status: body.status || 'draft',
    agent_name: body.agentName || body.agent_name || null,
    agent_phone: isBuy ? (body.requestPhone || body.request_phone || null) : contactPhone,
    reference_no: body.contractNumber || body.referenceNo || body.reference_no || null,
    updated_at: new Date().toISOString(),
  };
}

/** نسخة مع أعمدة منفصلة — بعد تنفيذ migration 002 في Supabase */
function propertyToRowWithColumns(body) {
  const row = propertyToRow(body);
  const f = row.features && typeof row.features === 'object' ? row.features : {};
  return {
    ...row,
    plot_number: f.plot_number || null,
    plan_number: f.plan_number || null,
    direction: f.direction || null,
    street_width: f.street_width || null,
    price_type: f.price_type || 'fixed',
    contact_phone: f.contact_phone || row.agent_phone || null,
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

function propertyToMapProperty(p) {
  if (!p) return null;
  return rowToMapProperty({
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    property_type: p.propertyType,
    listing_type: p.listingType,
    city: p.city,
    district: p.district,
    price: p.price,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    area: p.area,
    latitude: p.latitude,
    longitude: p.longitude,
    cover_image: p.coverImage,
    gallery: p.gallery || [],
    reference_no: p.contractNumber,
    maps_url: p.mapsUrl,
    plot_number: p.plotNumber,
    plan_number: p.planNumber,
    direction: p.direction,
    street_width: p.streetWidth,
    price_type: p.priceType,
    contact_phone: p.contactPhone,
    agent_phone: p.contactPhone || p.agentPhone,
    features: buildMapFeatures({
      ...p,
      listingType: p.listingType,
      features: p.features && typeof p.features === 'object' ? p.features : {},
    }),
  });
}

function rowToMapProperty(row) {
  const gallery = Array.isArray(row.gallery) ? row.gallery : [];
  const cover = row.cover_image || gallery[0] || '';
  const priceNum = row.price != null ? Number(row.price) : null;
  const extra = readMapExtras(row);
  const lat = parseCoord(row.latitude);
  const lng = parseCoord(row.longitude);
  const priceType = extra.priceType || 'fixed';
  const isBuyRequest = row.listing_type === 'buy_request' || extra.isBuyRequest;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description || '',
    propertyType: row.property_type,
    listingType: row.listing_type,
    isBuyRequest,
    requestUsage: extra.requestUsage,
    requestPropertyKind: extra.requestPropertyKind,
    city: row.city,
    district: row.district,
    location: [row.city, row.district].filter(Boolean).join(' — '),
    price: priceNum,
    priceDisplay: isBuyRequest
      ? (priceNum != null ? priceNum.toLocaleString('ar-SA') : '')
      : (priceType === 'auction' ? 'على السوم' : (priceNum != null ? priceNum.toLocaleString('ar-SA') : '')),
    priceType,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    area: row.area,
    latitude: lat,
    longitude: lng,
    coverImage: cover,
    gallery: gallery.length ? gallery : cover ? [cover] : [],
    referenceNo: row.reference_no || '',
    mapsUrl: row.maps_url || '',
    plotNumber: extra.plotNumber,
    planNumber: extra.planNumber,
    direction: extra.direction,
    streetWidth: extra.streetWidth,
    contactPhone: isBuyRequest ? '' : extra.contactPhone,
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
    slug: p.slug,
    title: p.title,
    type: p.propertyType,
    location: p.location,
    area: p.area ? `${p.area} م²` : '',
    price: p.priceDisplay,
    image: p.coverImage,
    description: p.description || '',
    listingType: p.listingType || '',
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
  propertyToMapProperty,
  toLegacyPublicOffer,
  toPublicSettings,
  rowToNews,
  rowToBanner,
  rowToTestimonial,
  rowToRequest,
  rowToSubscription,
};
