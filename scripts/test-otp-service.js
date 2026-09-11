#!/usr/bin/env node
/**
 * اختبار وحدة OTP دون إرسال واتساب
 * node scripts/test-otp-service.js
 */
require('dotenv').config();
const assert = require('assert');
const { toWhatsAppNumber } = require('../server/services/evolutionWhatsApp');
const otp = require('../server/services/otpService');

function codeFromMessage(text) {
  const match = String(text).match(/\n(\d{6})\n/);
  assert(match, 'الرسالة يجب أن تحتوي رمز 6 أرقام');
  return match[1];
}

async function main() {
  otp._resetForTests();
  assert.strictEqual(toWhatsAppNumber('0530792754'), '966530792754');
  assert.strictEqual(toWhatsAppNumber('530792754'), '966530792754');
  assert.strictEqual(toWhatsAppNumber('966530792754'), '966530792754');
  assert.strictEqual(toWhatsAppNumber('123'), '');

  let lastText = '';
  otp._setSender(async (_phone, text) => {
    lastText = text;
  });

  const sent = await otp.sendLoginOtp({
    purpose: 'admin',
    phone: '0530792754',
    userId: '0530792754',
  });
  assert(sent.ok, `إرسال وهمي فشل: ${sent.reason}`);
  assert(sent.challengeId, 'challengeId مطلوب');
  const code = codeFromMessage(lastText);
  assert(!String(sent).includes(code), 'لا يُعاد الرمز في نتيجة الإرسال');

  const bad = otp.verify(sent.challengeId, '000000');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.reason, 'bad_code');

  const ok = otp.verify(sent.challengeId, code);
  assert(ok.ok, 'التحقق بالرمز الصحيح يجب أن ينجح');
  assert.strictEqual(ok.purpose, 'admin');

  const reused = otp.verify(sent.challengeId, code);
  assert.strictEqual(reused.ok, false);

  lastText = '';
  const again = await otp.sendLoginOtp({
    purpose: 'marketer',
    phone: '0500000001',
    marketerId: 'm1',
    userId: 'm1',
  });
  assert(again.ok);
  const resent = await otp.resend(again.challengeId);
  assert.strictEqual(resent.ok, false);
  assert.strictEqual(resent.reason, 'cooldown');

  otp._resetForTests();
  console.log('✓ اختبار OTP (بدون واتساب) نجح');
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
