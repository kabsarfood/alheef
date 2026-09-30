const { parseListingPaste } = require('../utils/listingPaste');
const { isValidSaudiMobile, normalizeAccountPhone } = require('../utils/phone');
const { enrichBodyCoords, isValidCoord } = require('../utils/coords');

async function prepareQuickListing({ text, mapsUrl, contactPhone }) {
  const original = String(text || '').trim();
  if (!original) {
    const error = new Error('الصق نص الإعلان أولاً');
    error.status = 400;
    throw error;
  }

  const parsed = parseListingPaste(original);
  if (!parsed.propertyType) {
    const error = new Error('لم نتعرف على نوع العقار داخل النص. أضف النوع أو استخدم الإضافة الكاملة');
    error.status = 400;
    throw error;
  }
  if (!parsed.city) {
    const error = new Error('لم نتعرف على المدينة أو الحي. اذكر الحي داخل النص أو استخدم الإضافة الكاملة');
    error.status = 400;
    throw error;
  }

  let phone = String(contactPhone || '').trim();
  let phoneNote = '';
  if (!phone) {
    phone = '';
  } else if (!isValidSaudiMobile(phone)) {
    phone = '';
    phoneNote = 'رقم الجوال غير صالح ولم يُحفظ';
  } else {
    phone = normalizeAccountPhone(phone);
  }

  const enriched = await enrichBodyCoords({
    ...parsed,
    description: original,
    mapsUrl: String(mapsUrl || '').trim(),
    contactPhone: phone,
    listingType: parsed.listingType,
  });
  const published = isValidCoord(enriched.latitude, enriched.longitude);
  enriched.status = published ? 'published' : 'draft';

  let message = published
    ? 'تم النشر على الخريطة'
    : 'تم حفظ الإعلان، لكنه يحتاج موقعًا صحيحًا قبل النشر.';
  if (phoneNote) message += ` — ${phoneNote}`;

  return { body: enriched, published, message, parsed };
}

module.exports = { prepareQuickListing };
