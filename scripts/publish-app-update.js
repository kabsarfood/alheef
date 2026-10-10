/**
 * يرفع تحديث التطبيق للزوار.
 * لا يظهر زر «تحديث» إلا بعد تشغيل هذا الأمر:
 *   node scripts/publish-app-update.js
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'server', 'app-release.json');
const id = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

fs.writeFileSync(file, JSON.stringify({
  id,
  publishedAt: new Date().toISOString(),
}, null, 2) + '\n');

console.log('تم رفع التحديث. سيظهر زر «تحديث» للزوار.');
console.log(id);
