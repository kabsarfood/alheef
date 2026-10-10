/**
 * معرّف تحديث التطبيق.
 * لا يتغيّر مع إعادة التشغيل ولا مع نشر الملفات.
 * يتغيّر فقط عندما يشغّل الأدمن: node scripts/publish-app-update.js
 */
const fs = require('fs');
const path = require('path');

const RELEASE_FILE = path.join(__dirname, '..', 'app-release.json');

function readPublishedRelease() {
  try {
    const data = JSON.parse(fs.readFileSync(RELEASE_FILE, 'utf8'));
    return String(data.id || '').trim();
  } catch {
    return '';
  }
}

function getAppBuild() {
  return readPublishedRelease() || 'alheef-base';
}

function isUpdatePublished() {
  return Boolean(readPublishedRelease());
}

module.exports = { getAppBuild, isUpdatePublished };
