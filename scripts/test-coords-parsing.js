/**
 * node scripts/test-coords-parsing.js
 */
const {
  parseCoordsFromMapsUrl,
  normalizeCoordsPair,
  isValidCoord,
} = require('../server/utils/coords');

const samples = [
  ['@ format', 'https://www.google.com/maps/place/test/@24.774265,46.738586,17z', 24.774265, 46.738586],
  ['!3d!4d format', 'https://www.google.com/maps/place/x/@24.77,46.73/data=!3d24.7768444!4d46.7385861', 24.7768444, 46.7385861],
  ['q= format', 'https://maps.google.com/?q=24.7136,46.6753', 24.7136, 46.6753],
  ['plain coords', '24.7136, 46.6753', 24.7136, 46.6753],
  ['center=', 'https://www.google.com/maps?q=foo&center=24.65,46.71', 24.65, 46.71],
];

let failed = 0;
samples.forEach(([label, input, expLat, expLng]) => {
  const coords = normalizeCoordsPair(parseCoordsFromMapsUrl(input));
  const ok = coords && Math.abs(coords.lat - expLat) < 0.0001 && Math.abs(coords.lng - expLng) < 0.0001;
  console.log(ok ? '✓' : '✗', label, coords || 'null');
  if (!ok) failed += 1;
});

if (!isValidCoord(24.7, 46.6)) {
  console.error('✗ isValidCoord Riyadh');
  failed += 1;
} else {
  console.log('✓ isValidCoord Riyadh');
}

process.exit(failed ? 1 : 0);
