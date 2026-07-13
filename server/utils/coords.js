/** تحليل والتحقق من إحداثيات الخريطة */
function parseCoord(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '.').trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function isValidCoord(lat, lng) {
  const la = parseCoord(lat);
  const lo = parseCoord(lng);
  if (la == null || lo == null) return false;
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return false;
  if (la === 0 && lo === 0) return false;
  return true;
}

/** استخراج خط العرض والطول من رابط Google Maps */
function parseCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const text = url.trim();
  const at = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (at) return { lat: at[1], lng: at[2] };
  const q = text.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (q) return { lat: q[1], lng: q[2] };
  const ll = text.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (ll) return { lat: ll[1], lng: ll[2] };
  const center = text.match(/[?&]center=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (center) return { lat: center[1], lng: center[2] };
  return null;
}

module.exports = { parseCoord, isValidCoord, parseCoordsFromMapsUrl };
