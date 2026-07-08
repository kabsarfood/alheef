#!/usr/bin/env node
/**
 * مزامنة مفاتيح VAPID مع Railway (بدون طباعة المفتاح الخاص)
 */
require('dotenv').config();
const { execSync } = require('child_process');

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('[railway] نفّذ أولاً: node scripts/setup-vapid-env.js');
  process.exit(1);
}

const subject = VAPID_SUBJECT || 'mailto:info@alheef.com';
const cmd = [
  'railway', 'variables', 'set',
  `VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}`,
  `VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}`,
  `VAPID_SUBJECT=${subject}`,
].join(' ');

try {
  execSync(cmd, { stdio: 'inherit', shell: true });
  console.log('[railway] تم رفع متغيرات VAPID بنجاح');
} catch (err) {
  console.error('[railway] فشل الرفع — تأكد من تسجيل الدخول: railway login && railway link');
  process.exit(1);
}
