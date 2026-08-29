const {
  normalizeMapsUrl,
  normalizeCoordsPair,
  parseCoordsFromMapsUrl,
  parseCoordsFromMapsUrlResolved,
  looksLikeMapsUrl,
} = require('../utils/coords');

async function handleParseMapCoords(req, res) {
  try {
    const url = String(req.body?.url || req.body?.mapsUrl || '').trim();
    if (!url) {
      return res.status(400).json({ success: false, message: 'الرابط مطلوب' });
    }

    if (!looksLikeMapsUrl(url)) {
      return res.status(400).json({ success: false, message: 'رابط Google Maps غير صالح' });
    }

    const normalized = normalizeMapsUrl(url);
    const direct = normalizeCoordsPair(parseCoordsFromMapsUrl(normalized));
    if (direct) {
      return res.json({ success: true, ...direct, source: 'direct' });
    }

    const resolved = await parseCoordsFromMapsUrlResolved(normalized);
    if (!resolved) {
      return res.json({
        success: false,
        message: 'تعذر استخراج الإحداثيات — انسخ رابط «مشاركة» من Google Maps (مشاركة ← نسخ الرابط)',
      });
    }

    res.json({
      success: true,
      lat: resolved.lat,
      lng: resolved.lng,
      resolvedUrl: resolved.resolvedUrl || null,
      source: resolved.resolvedUrl ? 'resolved' : 'direct',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { handleParseMapCoords };
