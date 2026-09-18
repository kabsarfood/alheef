/**
 * حد محاولات بسيط في الذاكرة (لكل عملية خادم).
 */

function createRateLimiter({ max, windowMs, maxKeys = 5000 }) {
  const map = new Map();

  function clientKey(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
  }

  function allow(key) {
    const now = Date.now();
    let entry = map.get(key);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
    }
    entry.count += 1;
    map.set(key, entry);

    if (map.size > maxKeys) {
      for (const [k, v] of map) {
        if (now > v.reset) map.delete(k);
      }
    }

    return entry.count <= max;
  }

  function allowRequest(req) {
    return allow(clientKey(req));
  }

  return { allow, allowRequest, clientKey };
}

module.exports = { createRateLimiter };
