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

function normalizeCoordsPair(coords) {
  if (!coords) return null;
  const lat = parseCoord(coords.lat);
  const lng = parseCoord(coords.lng);
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng };
}

/** استخراج خط العرض والطول من رابط Google Maps أو نص إحداثيات */
function parseCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let text = url.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep original */
  }

  const plain = text.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (plain) return { lat: plain[1], lng: plain[2] };

  const place = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
  if (place) return { lat: place[1], lng: place[2] };

  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { lat: at[1], lng: at[2] };

  const patterns = [
    /[?&]q=(-?\d+(?:\.\d+)?)[,%2C\s+]+(-?\d+(?:\.\d+)?)/i,
    /[?&]query=(-?\d+(?:\.\d+)?)[,%2C\s+]+(-?\d+(?:\.\d+)?)/i,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /[?&]center=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /\/search\/(-?\d+(?:\.\d+)?)[,%2C+]+(-?\d+(?:\.\d+)?)/i,
    /[?&]lat=(-?\d+(?:\.\d+)?)(?:&|$)[^?#]*[?&]lng=(-?\d+(?:\.\d+)?)/i,
    /[?&]latitude=(-?\d+(?:\.\d+)?)(?:&|$)[^?#]*[?&]longitude=(-?\d+(?:\.\d+)?)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) return { lat: m[1], lng: m[2] };
  }

  return null;
}

function isShortMapsUrl(url) {
  return /(?:^|\/)maps\.app\.goo\.gl\/|(?:^|\/)goo\.gl\/maps\/|share\.google\.com/i.test(String(url || ''));
}

async function resolveMapsUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!isShortMapsUrl(trimmed) && parseCoordsFromMapsUrl(trimmed)) return trimmed;

  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlheefBot/1.0)' },
    });
    return res.url || trimmed;
  } catch {
    return trimmed;
  }
}

async function parseCoordsFromMapsUrlResolved(url) {
  const direct = normalizeCoordsPair(parseCoordsFromMapsUrl(url));
  if (direct) return direct;

  const resolved = await resolveMapsUrl(url);
  if (resolved && resolved !== url) {
    const fromResolved = normalizeCoordsPair(parseCoordsFromMapsUrl(resolved));
    if (fromResolved) return { ...fromResolved, resolvedUrl: resolved };
  }

  return null;
}

async function enrichBodyCoords(body) {
  if (!body || typeof body !== 'object') return body;

  let lat = parseCoord(body.latitude ?? body.lat);
  let lng = parseCoord(body.longitude ?? body.lng);
  if (isValidCoord(lat, lng)) {
    body.latitude = lat;
    body.longitude = lng;
    return body;
  }

  const mapsUrl = body.mapsUrl || body.maps_url;
  if (!mapsUrl) return body;

  const coords = await parseCoordsFromMapsUrlResolved(mapsUrl);
  if (coords) {
    body.latitude = coords.lat;
    body.longitude = coords.lng;
    if (coords.resolvedUrl && !parseCoordsFromMapsUrl(mapsUrl)) {
      body.mapsUrl = coords.resolvedUrl;
      body.maps_url = coords.resolvedUrl;
    }
  }

  return body;
}

module.exports = {
  parseCoord,
  isValidCoord,
  normalizeCoordsPair,
  parseCoordsFromMapsUrl,
  isShortMapsUrl,
  resolveMapsUrl,
  parseCoordsFromMapsUrlResolved,
  enrichBodyCoords,
};
