const express = require('express');
const { parseToken } = require('../middleware/auth');
const { isEnabled } = require('../lib/supabase');
const siteAnalyticsRepo = require('../repositories/siteAnalyticsRepo');

const router = express.Router();
const recentHits = new Map();

const SKIP_PATH_PREFIXES = ['/dashboard', '/marketer'];

function rateLimit(sessionKey) {
  const now = Date.now();
  const last = recentHits.get(sessionKey) || 0;
  if (now - last < 2000) return false;
  recentHits.set(sessionKey, now);
  if (recentHits.size > 5000) {
    const cutoff = now - 60000;
    for (const [k, t] of recentHits) {
      if (t < cutoff) recentHits.delete(k);
    }
  }
  return true;
}

function shouldSkipAnalytics(req, path) {
  if (SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) return true;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = parseToken(token);
  if (payload && payload.role === 'admin') return true;
  if (req.body?.skip === true) return true;
  return false;
}

router.post('/pageview', async (req, res) => {
  try {
    if (!isEnabled()) return res.json({ success: true });
    const path = String(req.body.path || '/').trim();
    const sessionKey = String(req.body.sessionKey || '').trim();
    if (shouldSkipAnalytics(req, path) || !sessionKey || !rateLimit(sessionKey)) {
      return res.json({ success: true });
    }
    await siteAnalyticsRepo.recordPageView(path, sessionKey);
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

module.exports = router;
