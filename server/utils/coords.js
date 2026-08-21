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

  const placeRev = text.match(/!4d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
  if (placeRev) return { lat: placeRev[2], lng: placeRev[1] };

  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { lat: at[1], lng: at[2] };

  const pathPair = text.match(/\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?|\/|$|[,/])/);
  if (pathPair) return { lat: pathPair[1], lng: pathPair[2] };

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

function isGoogleMapsUrl(url) {
  return /google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(String(url || ''));
}

function isShortMapsUrl(url) {
  return /(?:^|\/)maps\.app\.goo\.gl\/|(?:^|\/)goo\.gl\/maps\/|share\.google\.com/i.test(String(url || ''));
}

function normalizeMapsUrl(url) {
  if (!url || typeof url !== 'string') return '';
  let text = url.trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^maps\.app\.goo\.gl\//i.test(text)) return `https://${text}`;
  if (/^goo\.gl\/maps\//i.test(text)) return `https://${text}`;
  if (/^google\.[a-z.]+\/maps/i.test(text)) return `https://${text}`;
  if (/^www\.google\.[a-z.]+\/maps/i.test(text)) return `https://${text}`;
  return text;
}

async function resolveMapsUrl(url) {
  const normalized = normalizeMapsUrl(url);
  if (!normalized) return normalized;
  if (parseCoordsFromMapsUrl(normalized)) return normalized;
  if (!isGoogleMapsUrl(normalized) && !isShortMapsUrl(normalized)) return normalized;

  try {
    const res = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    return res.url || normalized;
  } catch {
    return normalized;
  }
}

async function fetchCoordsFromMapsPage(url) {
  const normalized = normalizeMapsUrl(url);
  if (!normalized || (!isGoogleMapsUrl(normalized) && !isShortMapsUrl(normalized))) return null;

  try {
    const res = await fetch(normalized, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const finalUrl = res.url || normalized;
    const fromUrl = normalizeCoordsPair(parseCoordsFromMapsUrl(finalUrl));
    if (fromUrl) return { ...fromUrl, resolvedUrl: finalUrl };

    const html = await res.text();
    const fromHtml = normalizeCoordsPair(parseCoordsFromMapsUrl(html));
    if (fromHtml) return { ...fromHtml, resolvedUrl: finalUrl };
  } catch {
    /* ignore */
  }

  return null;
}

async function parseCoordsFromMapsUrlResolved(url) {
  const normalized = normalizeMapsUrl(url);
  const direct = normalizeCoordsPair(parseCoordsFromMapsUrl(normalized));
  if (direct) return direct;

  const resolved = await resolveMapsUrl(normalized);
  if (resolved && resolved !== normalized) {
    const fromResolved = normalizeCoordsPair(parseCoordsFromMapsUrl(resolved));
    if (fromResolved) return { ...fromResolved, resolvedUrl: resolved };
  }

  const fromPage = await fetchCoordsFromMapsPage(normalized);
  if (fromPage) return fromPage;

  return null;
}

async function enrichBodyCoords(body) {
  if (!body || typeof body !== 'object') return body;

  const mapsUrl = normalizeMapsUrl(body.mapsUrl || body.maps_url);
  if (mapsUrl) {
    body.mapsUrl = mapsUrl;
    body.maps_url = mapsUrl;

    const coords = await parseCoordsFromMapsUrlResolved(mapsUrl);
    if (coords) {
      body.latitude = coords.lat;
      body.longitude = coords.lng;
      if (coords.resolvedUrl && !parseCoordsFromMapsUrl(mapsUrl)) {
        body.mapsUrl = coords.resolvedUrl;
        body.maps_url = coords.resolvedUrl;
      }
      return body;
    }

    body.latitude = null;
    body.longitude = null;
    return body;
  }

  const lat = parseCoord(body.latitude ?? body.lat);
  const lng = parseCoord(body.longitude ?? body.lng);
  if (isValidCoord(lat, lng)) {
    body.latitude = lat;
    body.longitude = lng;
  }

  return body;
}

module.exports = {
  parseCoord,
  isValidCoord,
  normalizeCoordsPair,
  parseCoordsFromMapsUrl,
  normalizeMapsUrl,
  isGoogleMapsUrl,
  isShortMapsUrl,
  resolveMapsUrl,
  fetchCoordsFromMapsPage,
  parseCoordsFromMapsUrlResolved,
  enrichBodyCoords,
};
