const crypto = require('crypto');
const { getAuthSecret } = require('../lib/authConfig');
const { normalizeAccountPhone } = require('./phone');

function key() {
  const secret = getAuthSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(`alheef-phone:${secret}`).digest();
}

function sealPhone(phone) {
  const local = normalizeAccountPhone(phone);
  if (!local) return null;
  const secretKey = key();
  if (!secretKey) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(local, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function openPhone(payload) {
  const secretKey = key();
  if (!secretKey || !payload || !String(payload).startsWith('v1:')) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 4) return '';
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const data = Buffer.from(parts[3], 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function phoneHash(phone) {
  const local = normalizeAccountPhone(phone);
  if (!local) return null;
  return crypto.createHash('sha256').update(`alheef-phone-hash:${local}`).digest('hex');
}

module.exports = { sealPhone, openPhone, phoneHash };
