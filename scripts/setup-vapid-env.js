#!/usr/bin/env node
/**
 * يكتب مفاتيح VAPID في .env دون طباعة المفتاح الخاص
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const envPath = path.join(__dirname, '..', '.env');
const subject = process.env.VAPID_SUBJECT || 'mailto:info@alheef.com';

let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey) {
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
}

let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const lines = content.split(/\r?\n/).filter((line) => !/^VAPID_/.test(line.trim()));
lines.push(`VAPID_PUBLIC_KEY=${publicKey}`);
lines.push(`VAPID_PRIVATE_KEY=${privateKey}`);
lines.push(`VAPID_SUBJECT=${subject}`);
fs.writeFileSync(envPath, `${lines.filter(Boolean).join('\n')}\n`, 'utf8');

console.log('[vapid] تم حفظ المفاتيح في .env');
console.log(`[vapid] VAPID_PUBLIC_KEY=${publicKey.slice(0, 12)}…`);
console.log(`[vapid] VAPID_SUBJECT=${subject}`);
