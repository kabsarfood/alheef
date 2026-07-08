function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function maskEmail(email) {
  const e = normalizeEmail(email);
  const [local, domain] = e.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

module.exports = { normalizeEmail, isValidEmail, maskEmail };
