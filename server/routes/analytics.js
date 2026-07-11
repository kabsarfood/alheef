const express = require('express');
const { isEnabled } = require('../lib/supabase');
const siteAnalyticsRepo = require('../repositories/siteAnalyticsRepo');

const router = express.Router();
const recentHits = new Map();

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

router.post('/pageview', async (req, res) => {
  try {
    if (!isEnabled()) return res.json({ success: true });
    const path = String(req.body.path || '/').trim();
    const sessionKey = String(req.body.sessionKey || '').trim();
    if (!sessionKey || !rateLimit(sessionKey)) {
      return res.json({ success: true });
    }
    await siteAnalyticsRepo.recordPageView(path, sessionKey);
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

module.exports = router;
