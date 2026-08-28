/** تحليل والتحقق من إحداثيات الخريطة */
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');

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

function normalizeCoordsPair(coords) {
  if (!coords) return null;
  const lat = parseCoord(coords.lat);
  const lng = parseCoord(coords.lng);
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng };
}

function pickValid(lat, lng) {
  const pair = normalizeCoordsPair({ lat, lng });
  if (!pair) return null;
  return { lat: pair.lat, lng: pair.lng };
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
      const link = u.searchParams.get('link');
      if (link && MAPS_HOST_RE.test(link) && link !== current) {
        current = link;
        continue;
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

function normalizeMapsUrl(url) {
  return extractMapsUrl(url);
}

function looksLikeMapsUrl(url) {
  const text = normalizeMapsUrl(url);
  if (!text) return false;
  if (normalizeCoordsPair(parseCoordsFromMapsUrl(text))) return true;
  if (/^geo:/i.test(text)) return true;
  return MAPS_HOST_RE.test(text);
}

function isGoogleMapsUrl(url) {
  return MAPS_HOST_RE.test(String(url || ''));
}

function isShortMapsUrl(url) {
  return /(?:^|\/)maps\.app\.goo\.gl\/|(?:^|\/)goo\.gl\/maps\/|share\.google|goo\.gle\/|(?:^|\/)g\.co\//i.test(String(url || ''));
}

function dmsToDecimal(deg, min, sec, hemi) {
  let value = Number(deg) + Number(min) / 60 + Number(sec || 0) / 3600;
  if (!Number.isFinite(value)) return null;
  if (/[SWsw]/i.test(hemi || '')) value = -value;
  return value;
}

function parseDmsPair(text) {
  const re = /(-?\d{1,3})\s*[°\u00B0]\s*(\d{1,2})\s*['\u2032]\s*(\d{1,2}(?:\.\d+)?)\s*["\u2033]?\s*([NSns])[^\d\-]*?(-?\d{1,3})\s*[°\u00B0]\s*(\d{1,2})\s*['\u2032]\s*(\d{1,2}(?:\.\d+)?)\s*["\u2033]?\s*([EWew])/;
  const m = String(text || '').match(re);
  if (!m) return null;
  return pickValid(dmsToDecimal(m[1], m[2], m[3], m[4]), dmsToDecimal(m[5], m[6], m[7], m[8]));
}

function lastMatch(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let found = null;
  let m;
  while ((m = global.exec(text))) found = m;
  return found;
}

/** استخراج خط العرض والطول من رابط Google Maps أو نص إحداثيات */
function parseCoordsFromMapsUrl(url) {
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

  const dms = parseDmsPair(decoded);
  if (dms) return dms;

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
    const matches = decoded.matchAll ? decoded.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)) : [];
    let found = null;
    for (const item of matches) found = item;
    if (!found) {
      const single = decoded.match(re);
      if (single) found = single;
    }
    if (found) {
      const pair = isLngFirst ? pickValid(found[2], found[1]) : pickValid(found[1], found[2]);
      if (pair) return pair;
    }
  }

  return null;
}

function isGoogleNetworkHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    /(?:^|\.)google\.(?:com|[a-z.]+)$/.test(host)
    || /(?:^|\.)(?:maps\.app\.)?goo\.gl$/.test(host)
    || /(?:^|\.)(?:share\.google|goo\.gle|g\.co|googleusercontent\.com|gstatic\.com)$/.test(host)
  );
}

function decodeHttpBody(buffer, encoding) {
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc.includes('br')) return zlib.brotliDecompressSync(buffer).toString('utf8');
    if (enc.includes('gzip')) return zlib.gunzipSync(buffer).toString('utf8');
    if (enc.includes('deflate')) return zlib.inflateSync(buffer).toString('utf8');
  } catch {
    /* keep raw */
  }
  return buffer.toString('utf8');
}

function httpRequest(url, { timeoutMs = 14000, allowInsecure = false, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const options = {
      method,
      hostname: parsed.hostname,
      servername: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Accept-Encoding': 'identity',
        Cookie: 'CONSENT=YES+',
        Referer: 'https://www.google.com/',
      },
    };
    if (parsed.protocol === 'https:' && allowInsecure && isGoogleNetworkHost(parsed.hostname)) {
      options.rejectUnauthorized = false;
    }
    const req = lib.request(options, (res) => resolve(res));
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('maps_url_timeout'));
    });
    req.end();
  });
}

async function requestMapsUrl(url, method = 'GET') {
  try {
    return await httpRequest(url, { method });
  } catch (err) {
    if (/certificate|UNABLE_TO_VERIFY|SELF_SIGNED/i.test(String(err?.message || err))) {
      return httpRequest(url, { method, allowInsecure: true });
    }
    throw err;
  }
}

async function readResponseBody(res, maxBytes = 450000) {
  const chunks = [];
  let size = 0;
  await new Promise((resolve) => {
    res.on('data', (chunk) => {
      if (size >= maxBytes) {
        try { res.destroy(); } catch { /* ignore */ }
        resolve();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    res.on('end', resolve);
    res.on('error', resolve);
  });
  if (!chunks.length) return Buffer.alloc(0);
  return Buffer.concat(chunks);
}

function extractRedirectTargetFromHtml(html, baseUrl) {
  if (!html) return '';
  const patterns = [
    /http-equiv=["']?refresh["'][^>]*content=["'][^"']*url=['"]?([^"'\s>]+)/i,
    /content=["'][^"']*url=['"]?([^"'\s>]+)["'][^>]*http-equiv=["']?refresh/i,
    /rel=["']canonical["'][^>]*href=["']([^"']+)/i,
    /href=["']([^"']+)["'][^>]*rel=["']canonical["']/i,
    /property=["']og:url["'][^>]*content=["']([^"']+)/i,
    /content=["']([^"']+)["'][^>]*property=["']og:url["']/i,
    /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /location\.replace\(\s*["']([^"']+)["']\s*\)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    try {
      const href = new URL(m[1].replace(/&amp;/g, '&'), baseUrl).href;
      if (href && href !== baseUrl) return href;
    } catch {
      /* next */
    }
  }
  return '';
}

function extractMapsUrlsFromHtml(html) {
  if (!html) return [];
  const urls = [];
  const re = /https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google[^\s"']*|maps\.app\.goo\.gl)[^\s"'<>]*/gi;
  let m;
  while ((m = re.exec(html)) && urls.length < 20) {
    urls.push(trimUrlTail(m[0].replace(/&amp;/g, '&')));
  }
  return urls;
}

function parseCoordsFromHtml(html) {
  if (!html) return null;
  const fromDirect = normalizeCoordsPair(parseCoordsFromMapsUrl(html));
  if (fromDirect) return fromDirect;

  const init = html.match(/\[null,null,(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/);
  if (init) {
    const pair = pickValid(init[1], init[2]);
    if (pair) return pair;
  }

  const center = html.match(/"center"\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/);
  if (center) {
    const pair = pickValid(center[1], center[2]);
    if (pair) return pair;
  }

  const latlng = html.match(/"latitude"\s*:\s*(-?\d+(?:\.\d+)?)[^\}]{0,80}"longitude"\s*:\s*(-?\d+(?:\.\d+)?)/i)
    || html.match(/"lat"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"lng"\s*:\s*(-?\d+(?:\.\d+)?)/i);
  if (latlng) {
    const pair = pickValid(latlng[1], latlng[2]);
    if (pair) return pair;
  }

  return null;
}

async function followMapsRedirects(startUrl, maxHops = 12) {
  let current = normalizeMapsUrl(startUrl);
  if (!current) return { finalUrl: current, html: '' };

  let html = '';
  const seen = new Set();

  for (let hop = 0; hop <= maxHops; hop += 1) {
    current = unwrapMapsUrl(current);
    if (seen.has(current)) break;
    seen.add(current);

    const coordsInCurrent = normalizeCoordsPair(parseCoordsFromMapsUrl(current));
    if (coordsInCurrent) {
      return { finalUrl: current, html, coords: coordsInCurrent };
    }

    let res;
    try {
      res = await requestMapsUrl(current);
    } catch {
      break;
    }

    const buf = await readResponseBody(res);
    html = decodeHttpBody(buf, res.headers['content-encoding']);

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      current = new URL(res.headers.location, current).href;
      const coordsInLocation = normalizeCoordsPair(parseCoordsFromMapsUrl(current));
      if (coordsInLocation) {
        return { finalUrl: current, html, coords: coordsInLocation };
      }
      continue;
    }

    const htmlCoords = parseCoordsFromHtml(html);
    if (htmlCoords) {
      return { finalUrl: current, html, coords: htmlCoords };
    }

    const nextFromHtml = extractRedirectTargetFromHtml(html, current);
    if (nextFromHtml && !seen.has(nextFromHtml)) {
      current = nextFromHtml;
      continue;
    }

    for (const mapsHref of extractMapsUrlsFromHtml(html)) {
      const fromHref = normalizeCoordsPair(parseCoordsFromMapsUrl(mapsHref));
      if (fromHref) {
        return { finalUrl: mapsHref, html, coords: fromHref };
      }
    }

    return { finalUrl: current, html };
  }

  return { finalUrl: current, html };
}

async function resolveMapsUrl(url) {
  const normalized = normalizeMapsUrl(url);
  if (!normalized) return normalized;
  if (parseCoordsFromMapsUrl(normalized)) return normalized;
  if (!isGoogleMapsUrl(normalized) && !isShortMapsUrl(normalized)) return normalized;

  const followed = await followMapsRedirects(normalized);
  return followed.finalUrl || normalized;
}

async function fetchWithFollow(url) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ar,en;q=0.9',
      Cookie: 'CONSENT=YES+',
    },
  });
  const finalUrl = res.url || url;
  const html = await res.text();
  return { finalUrl, html };
}

async function fetchCoordsFromMapsPage(url) {
  const normalized = normalizeMapsUrl(url);
  if (!normalized || (!isGoogleMapsUrl(normalized) && !isShortMapsUrl(normalized) && !/^geo:/i.test(normalized))) {
    return null;
  }

  try {
    const followed = await followMapsRedirects(normalized);
    const finalUrl = followed.finalUrl || normalized;

    if (followed.coords) {
      return { ...followed.coords, resolvedUrl: finalUrl };
    }

    const fromUrl = normalizeCoordsPair(parseCoordsFromMapsUrl(finalUrl));
    if (fromUrl) return { ...fromUrl, resolvedUrl: finalUrl };

    const fromHtml = parseCoordsFromHtml(followed.html || '');
    if (fromHtml) return { ...fromHtml, resolvedUrl: finalUrl };
  } catch {
    /* ignore */
  }

  try {
    const { finalUrl, html } = await fetchWithFollow(normalized);
    const fromUrl = normalizeCoordsPair(parseCoordsFromMapsUrl(finalUrl));
    if (fromUrl) return { ...fromUrl, resolvedUrl: finalUrl };
    const fromHtml = parseCoordsFromHtml(html);
    if (fromHtml) return { ...fromHtml, resolvedUrl: finalUrl };
    for (const href of extractMapsUrlsFromHtml(html)) {
      const pair = normalizeCoordsPair(parseCoordsFromMapsUrl(href));
      if (pair) return { ...pair, resolvedUrl: href };
    }
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

function mapsUrlFromCoords(lat, lng) {
  const pair = normalizeCoordsPair({ lat, lng });
  if (!pair) return '';
  return `https://www.google.com/maps?q=${pair.lat},${pair.lng}`;
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
  extractMapsUrl,
  normalizeMapsUrl,
  looksLikeMapsUrl,
  isGoogleMapsUrl,
  isShortMapsUrl,
  mapsUrlFromCoords,
  resolveMapsUrl,
  fetchCoordsFromMapsPage,
  parseCoordsFromMapsUrlResolved,
  enrichBodyCoords,
};
