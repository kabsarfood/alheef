/**
 * Alheef — shared maps coordinate parsing (mirrors server/utils/coords.js)
 */
const AlheefCoords = (() => {
  const MAPS_HOST_RE = /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google|share\.google|goo\.gle|g\.co\/|plus\.codes|maps\.apple\.com/i;

  function stripInvisibleChars(text) {
    return String(text || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
  }

  function normalizeDigits(text) {
    return String(text || '')
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  }

  function parseCoord(value) {
    if (value == null || value === '') return null;
    const n = Number(normalizeDigits(String(value)).replace(/,/g, '.').trim());
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

  function pickValid(lat, lng) {
    return normalize({ lat, lng });
  }

  function decodeRepeated(text) {
    let prev = String(text || '');
    for (let i = 0; i < 3; i += 1) {
      try {
        const next = decodeURIComponent(prev);
        if (next === prev) break;
        prev = next;
      } catch {
        break;
      }
    }
    return prev;
  }

  function unwrapMapsUrl(url) {
    let current = String(url || '').trim();
    for (let i = 0; i < 5; i += 1) {
      const intent = current.match(/^intent:\/\/([^#]+)/i);
      if (intent) {
        current = `https://${intent[1]}`;
        continue;
      }
      try {
        const u = new URL(current);
        if (/(^|\.)google\./i.test(u.hostname) && /^\/url\/?$/i.test(u.pathname)) {
          const next = u.searchParams.get('q') || u.searchParams.get('url');
          if (next) {
            current = next;
            continue;
          }
        }
      } catch {
        break;
      }
      break;
    }
    return current;
  }

  function trimUrlTail(url) {
    return String(url || '')
      .replace(/^[«“"'`(\[]+/g, '')
      .replace(/[)\]\}>«”"'`,.،؛]+$/g, '');
  }

  function addHttpsIfNeeded(url) {
    const text = stripInvisibleChars(url);
    if (!text) return '';
    if (/^(https?:|geo:)/i.test(text)) return text;
    if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|share\.google|goo\.gle|g\.co\/|plus\.codes\/|maps\.apple\.com)/i.test(text)) {
      return `https://${text}`;
    }
    if (/^(www\.)?(google\.[a-z.]+\/maps|maps\.google)/i.test(text)) {
      return `https://${text}`;
    }
    return text;
  }

  function extractMapsUrl(raw) {
    const text = normalizeDigits(stripInvisibleChars(raw));
    if (!text) return '';

    const candidates = [];
    const urlRe = /https?:\/\/[^\s<>]+/gi;
    let m;
    while ((m = urlRe.exec(text))) {
      candidates.push(trimUrlTail(m[0]));
    }

    const bareRe = /(?:maps\.app\.goo\.gl|goo\.gl\/maps|share\.google(?:\.com)?|goo\.gle|g\.co|plus\.codes|(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)|maps\.apple\.com)[^\s<>]*/gi;
    while ((m = bareRe.exec(text))) {
      candidates.push(trimUrlTail(m[0]));
    }

    for (const candidate of candidates) {
      if (MAPS_HOST_RE.test(candidate) || /^geo:/i.test(candidate)) {
        return addHttpsIfNeeded(unwrapMapsUrl(candidate));
      }
    }

    if (candidates.length) return addHttpsIfNeeded(unwrapMapsUrl(candidates[0]));
    return addHttpsIfNeeded(unwrapMapsUrl(text));
  }

  function normalizeMapsUrl(url) {
    return extractMapsUrl(url);
  }

  function lastMatch(text, re) {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const global = new RegExp(re.source, flags);
    let found = null;
    let match;
    while ((match = global.exec(text))) found = match;
    return found;
  }

  function dmsToDecimal(deg, min, sec, hemi) {
    let value = Number(deg) + Number(min) / 60 + Number(sec || 0) / 3600;
    if (!Number.isFinite(value)) return null;
    if (/[SWsw]/i.test(hemi || '')) value = -value;
    return value;
  }

  function parseFromMapsUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const extracted = extractMapsUrl(url) || stripInvisibleChars(url);
    const decoded = decodeRepeated(extracted);

    const geo = decoded.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
    if (geo) {
      const pair = pickValid(geo[1], geo[2]);
      if (pair) return pair;
    }

    const plain = decoded.match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,،]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (plain) {
      const pair = pickValid(plain[1], plain[2]);
      if (pair) return pair;
    }

    const place = lastMatch(decoded, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
    if (place) {
      const pair = pickValid(place[1], place[2]);
      if (pair) return pair;
    }

    const placeRev = lastMatch(decoded, /!4d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
    if (placeRev) {
      const pair = pickValid(placeRev[2], placeRev[1]);
      if (pair) return pair;
    }

    const embed = lastMatch(decoded, /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
    if (embed) {
      const pair = pickValid(embed[2], embed[1]);
      if (pair) return pair;
    }

    const at = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
      const pair = pickValid(at[1], at[2]);
      if (pair) return pair;
    }

    const dmsRe = /(-?\d{1,3})\s*[°\u00B0]\s*(\d{1,2})\s*['\u2032]\s*(\d{1,2}(?:\.\d+)?)\s*["\u2033]?\s*([NSns])[^\d\-]*?(-?\d{1,3})\s*[°\u00B0]\s*(\d{1,2})\s*['\u2032]\s*(\d{1,2}(?:\.\d+)?)\s*["\u2033]?\s*([EWew])/;
    const dms = decoded.match(dmsRe);
    if (dms) {
      const pair = pickValid(dmsToDecimal(dms[1], dms[2], dms[3], dms[4]), dmsToDecimal(dms[5], dms[6], dms[7], dms[8]));
      if (pair) return pair;
    }

    const patterns = [
      /[?&](?:q|query)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)[%2C,\s+،]+(-?\d+(?:\.\d+)?)/i,
      /[?&](?:ll|sll|center|daddr|saddr|destination|origin)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
      /\/search\/(-?\d+(?:\.\d+)?)[%2C,\s+]+(-?\d+(?:\.\d+)?)/i,
      /\/dir\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
      /[?&]lat(?:itude)?=(-?\d+(?:\.\d+)?)(?:&|$)[^?#]*[?&]lng(?:itude)?=(-?\d+(?:\.\d+)?)/i,
      /[?&]lng(?:itude)?=(-?\d+(?:\.\d+)?)(?:&|$)[^?#]*[?&]lat(?:itude)?=(-?\d+(?:\.\d+)?)/i,
      /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\/|\?|$)/i,
      /\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?|\/|$|[,/])/,
    ];

    for (const re of patterns) {
      const isLngFirst = /lng(?:itude)?=/.test(re.source) && re.source.indexOf('lng') < re.source.indexOf('lat');
      const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
      let found = null;
      let item;
      while ((item = global.exec(decoded))) found = item;
      if (found) {
        const pair = isLngFirst ? pickValid(found[2], found[1]) : pickValid(found[1], found[2]);
        if (pair) return pair;
      }
    }

    return null;
  }

  function looksLikeMapsUrl(url) {
    const text = normalizeMapsUrl(url);
    if (!text) return false;
    if (normalize(parseFromMapsUrl(text))) return true;
    if (/^geo:/i.test(text)) return true;
    return MAPS_HOST_RE.test(text);
  }

  function isShortMapsUrl(url) {
    return /(?:^|\/)maps\.app\.goo\.gl\/|(?:^|\/)goo\.gl\/maps\/|share\.google|goo\.gle\/|(?:^|\/)g\.co\//i.test(String(url || ''));
  }

  const TRACKING_QUERY_KEYS = [
    'authuser', 'entry', 'g_ep', 'skid', 'g_st', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  ];

  function cleanMapsShareUrl(url) {
    const normalized = normalizeMapsUrl(url);
    if (!normalized || isShortMapsUrl(normalized) || /^geo:/i.test(normalized)) return normalized;
    try {
      const parsed = new URL(normalized);
      TRACKING_QUERY_KEYS.forEach((key) => parsed.searchParams.delete(key));
      return parsed.href;
    } catch {
      return normalized;
    }
  }

  function preferStoredMapsUrl(original, resolvedUrl) {
    const pasted = normalizeMapsUrl(original);
    if (!pasted) return cleanMapsShareUrl(resolvedUrl || '');
    if (isShortMapsUrl(pasted)) return pasted;
    return cleanMapsShareUrl(resolvedUrl || pasted);
  }

  function mapsUrlFromCoords(lat, lng) {
    const pair = normalize({ lat, lng });
    if (!pair) return '';
    return `https://www.google.com/maps?q=${pair.lat},${pair.lng}`;
  }

  return {
    parseCoord,
    isValidCoord,
    normalize,
    extractMapsUrl,
    normalizeMapsUrl,
    looksLikeMapsUrl,
    isShortMapsUrl,
    cleanMapsShareUrl,
    preferStoredMapsUrl,
    parseFromMapsUrl,
    mapsUrlFromCoords,
  };
})();
