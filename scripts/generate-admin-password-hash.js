/**
 * توليد ADMIN_PASSWORD_HASH (scrypt) بدون تعديل .env تلقائياً.
 * الاستخدام: node scripts/generate-admin-password-hash.js
 * أو: node scripts/generate-admin-password-hash.js "your-password"
 */
const crypto = require('crypto');
const readline = require('readline');
const { hashPassword } = require('../server/utils/password');

function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

async function readPassword() {
  const arg = process.argv[2];
  if (arg) return arg;
  if (!process.stdin.isTTY) {
    throw new Error('مرّر كلمة المرور كوسيط أو شغّل من طرفية تفاعلية');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await new Promise((resolve) => {
    rl.question('كلمة مرور الأدمن: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
  return password;
}

async function main() {
  const password = String(await readPassword() || '').trim();
  if (password.length < 8) {
    console.error('كلمة المرور قصيرة جداً (8 أحرف على الأقل)');
    process.exit(1);
  }
  const hash = hashPassword(password);
  const secret = randomSecret();
  console.log('');
  console.log('أضف إلى .env / Railway (بدون مسافات زائدة):');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`ADMIN_SECRET=${secret}`);
  console.log('');
  console.log('بعد ضبط ADMIN_PASSWORD_HASH يمكنك حذف ADMIN_PASSWORD من المتغيرات.');
  console.log('لا تشارك هذه القيم ولا ترفعها إلى Git.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
