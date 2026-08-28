/**
 * node scripts/test-coords-parsing.js
 */
const {
  parseCoordsFromMapsUrl,
  normalizeCoordsPair,
  isValidCoord,
  looksLikeMapsUrl,
  normalizeMapsUrl,
  extractMapsUrl,
} = require('../server/utils/coords');

function expect(label, ok, extra) {
  console.log(ok ? '✓' : '✗', label, extra || '');
  return ok ? 0 : 1;
}

const samples = [
  ['@ format', 'https://www.google.com/maps/place/test/@24.774265,46.738586,17z', 24.774265, 46.738586],
  ['!3d!4d format', 'https://www.google.com/maps/place/x/@24.77,46.73/data=!3d24.7768444!4d46.7385861', 24.7768444, 46.7385861],
  ['q= format', 'https://maps.google.com/?q=24.7136,46.6753', 24.7136, 46.6753],
  ['q=loc:', 'https://www.google.com/maps?q=loc:24.7136,46.6753', 24.7136, 46.6753],
  ['query api=1', 'https://www.google.com/maps/search/?api=1&query=24.7136,46.6753', 24.7136, 46.6753],
  ['plain coords', '24.7136, 46.6753', 24.7136, 46.6753],
  ['arabic comma coords', '24.7136،46.6753', 24.7136, 46.6753],
  ['center=', 'https://www.google.com/maps?q=foo&center=24.65,46.71', 24.65, 46.71],
  ['google.com.sa', 'https://www.google.com.sa/maps/@24.7136,46.6753,17z', 24.7136, 46.6753],
  ['embed !2d!3d', 'https://www.google.com/maps/embed?pb=!1m14!1m8!2d46.6753!3d24.7136', 24.7136, 46.6753],
  ['geo uri', 'geo:24.7136,46.6753', 24.7136, 46.6753],
  ['place path coords', 'https://www.google.com/maps/place/24.7136,46.6753', 24.7136, 46.6753],
  ['g_st tracking', 'https://www.google.com/maps/@24.7136,46.6753,19z?g_st=ic', 24.7136, 46.6753],
  ['ll=', 'https://maps.google.com/?ll=24.7136,46.6753', 24.7136, 46.6753],
  ['arabic digits', '٢٤.٧١٣٦, ٤٦.٦٧٥٣', 24.7136, 46.6753],
];

let failed = 0;
samples.forEach(([label, input, expLat, expLng]) => {
  const coords = normalizeCoordsPair(parseCoordsFromMapsUrl(input));
  const ok = coords && Math.abs(coords.lat - expLat) < 0.0001 && Math.abs(coords.lng - expLng) < 0.0001;
  failed += expect(label, ok, coords || 'null');
});

const mixed = 'موقع العقار في الرياض\nhttps://maps.app.goo.gl/AbCdEfGh?g_st=ic\n';
failed += expect(
  'extract mixed WhatsApp text',
  extractMapsUrl(mixed) === 'https://maps.app.goo.gl/AbCdEfGh?g_st=ic',
  extractMapsUrl(mixed),
);
failed += expect('looksLike mixed WhatsApp text', looksLikeMapsUrl(mixed));
failed += expect(
  'bare short link gets https',
  normalizeMapsUrl('maps.app.goo.gl/AbCdEfGh') === 'https://maps.app.goo.gl/AbCdEfGh',
  normalizeMapsUrl('maps.app.goo.gl/AbCdEfGh'),
);
failed += expect('looksLike share.google', looksLikeMapsUrl('https://share.google/abc123'));
failed += expect('looksLike google.com.sa', looksLikeMapsUrl('https://www.google.com.sa/maps/place/Riyadh'));
failed += expect(
  'looksLike wrapped url',
  looksLikeMapsUrl('«https://maps.app.goo.gl/xyz»'),
);

const dms = parseCoordsFromMapsUrl('https://www.google.com/maps/place/24°42\'48.9"N+46°40\'31.1"E');
failed += expect(
  'DMS in place path',
  !!(dms && Math.abs(dms.lat - 24.713583) < 0.001 && Math.abs(dms.lng - 46.675306) < 0.001),
  dms,
);

if (!isValidCoord(24.7, 46.6)) {
  failed += expect('isValidCoord Riyadh', false);
} else {
  failed += expect('isValidCoord Riyadh', true);
}

process.exit(failed ? 1 : 0);
