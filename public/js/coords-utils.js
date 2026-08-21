/**
 * Alheef — shared maps coordinate parsing (mirrors server/utils/coords.js)
 */
const AlheefCoords = (() => {
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

  function normalize(coords) {
    if (!coords) return null;
    const lat = parseCoord(coords.lat);
    const lng = parseCoord(coords.lng);
    if (!isValidCoord(lat, lng)) return null;
    return { lat, lng };
  }

  function parseFromMapsUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let text = url.trim();
    try {
      text = decodeURIComponent(text);
    } catch {
      /* keep */
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

  function resolveFormCoords(mapsUrl, latValue, lngValue) {
    const fromUrl = normalize(parseFromMapsUrl(mapsUrl));
    if (fromUrl) return fromUrl;
    const fromManual = normalize({ lat: latValue, lng: lngValue });
    if (fromManual) return fromManual;
    return null;
  }

  return {
    parseCoord,
    isValidCoord,
    normalize,
    parseFromMapsUrl,
    resolveFormCoords,
  };
})();
