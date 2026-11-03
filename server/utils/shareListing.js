const { removePhonesFromText } = require('./publicPropertySanitize');

function stripSharePhones(value) {
  const text = removePhonesFromText(value);
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function absoluteImage(image, origin) {
  const url = String(image || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildListingShare(property, origin) {
  const base = String(origin || 'https://www.alheef.website').replace(/\/$/, '');
  const slug = String(property?.slug || '').trim();
  const page = slug ? `${base}/property.html?slug=${encodeURIComponent(slug)}` : base;
  const body = stripSharePhones(property?.description || property?.title || '');
  const title = stripSharePhones(property?.title || 'إعلان عقاري') || 'إعلان عقاري';
  const maps = String(property?.mapsUrl || property?.maps_url || '').trim();
  const lines = ['🏡 *الهيف العقارية*', '', body || title];
  if (maps && !/wa\.me|api\.whatsapp/i.test(maps)) lines.push('', `📍 الموقع: ${maps}`);
  lines.push('', `🔗 ${page}`, '', '*الهيف العقارية – عروض عقارية على الخريطة*');
  return {
    text: lines.join('\n'),
    url: page,
    title,
    description: (body || title).slice(0, 180),
    image: absoluteImage(property?.coverImage || property?.image || property?.cover_image || '', base),
  };
}

module.exports = { stripSharePhones, buildListingShare };
