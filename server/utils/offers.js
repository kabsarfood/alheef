function formatPriceDisplay(price) {
  const num = String(price).replace(/[^\d]/g, '');
  if (!num) return price;
  return Number(num).toLocaleString('ar-SA');
}

function buildTitle(offer) {
  if (offer.title) return offer.title;
  const type = offer.propertyType || offer.type || 'عقار';
  const loc = offer.location || '';
  return loc ? `${type} — ${loc}` : type;
}

function normalizeOffer(offer) {
  const images = offer.images?.length
    ? offer.images
    : offer.image
      ? [offer.image]
      : [];

  const primaryImage = images[0] || '';

  return {
    id: offer.id,
    propertyType: offer.propertyType || offer.type || '',
    type: offer.propertyType || offer.type || '',
    area: offer.area ? (String(offer.area).includes('م²') ? offer.area : `${offer.area} م²`) : '',
    contractNumber: offer.contractNumber || '',
    location: offer.location || '',
    mapsUrl: offer.mapsUrl || '',
    price: offer.price || '',
    priceDisplay: offer.priceDisplay || formatPriceDisplay(offer.price),
    details: offer.details || '',
    images,
    image: primaryImage,
    title: buildTitle(offer),
    status: offer.status || 'published',
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

function toPublicOffer(offer) {
  const n = normalizeOffer(offer);
  return {
    id: n.id,
    title: n.title,
    location: n.location,
    area: n.area,
    price: n.priceDisplay || n.price,
    image: n.image,
    type: n.propertyType,
    mapsUrl: n.mapsUrl,
    details: n.details,
    images: n.images,
  };
}

module.exports = { normalizeOffer, toPublicOffer, formatPriceDisplay, buildTitle };
