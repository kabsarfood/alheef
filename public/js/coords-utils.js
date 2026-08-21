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

  function stripInvisibleChars(text) {
    return String(text || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .trim();
  }

  function normalizeMapsUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let text = stripInvisibleChars(url);
    if (!text) return '';
    if (/^https?:\/\//i.test(text)) return text;
    if (/^maps\.app\.goo\.gl\//i.test(text)) return `https://${text}`;
    if (/^goo\.gl\/maps\//i.test(text)) return `https://${text}`;
    if (/^google\.[a-z.]+\/maps/i.test(text)) return `https://${text}`;
    if (/^www\.google\.[a-z.]+\/maps/i.test(text)) return `https://${text}`;
    return text;
  }

  function looksLikeMapsUrl(url) {
    const text = normalizeMapsUrl(url);
    return /^https?:\/\//i.test(text)
      && /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google/i.test(text);
  }

  function parseFromMapsUrl(url) {
    const text = normalizeMapsUrl(url);
    if (!text) return null;
    let decoded = text;
    try {
      decoded = decodeURIComponent(text);
    } catch {
      /* keep */
    }

    const plain = decoded.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (plain) return { lat: plain[1], lng: plain[2] };

    const place = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
    if (place) return { lat: place[1], lng: place[2] };

    const placeRev = decoded.match(/!4d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
    if (placeRev) return { lat: placeRev[2], lng: placeRev[1] };

    const at = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) return { lat: at[1], lng: at[2] };

    const pathPair = decoded.match(/\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?|\/|$|[,/])/);
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
      const m = decoded.match(re);
      if (m) return { lat: m[1], lng: m[2] };
    }

    return null;
  }

  return {
    parseCoord,
    isValidCoord,
    normalize,
    normalizeMapsUrl,
    looksLikeMapsUrl,
    parseFromMapsUrl,
  };
})();
