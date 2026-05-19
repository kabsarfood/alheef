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

module.exports = { parseCoord, isValidCoord };
