/**
 * فحص داخلي لحالة Evolution instance `otp` — ليس مساراً عاماً.
 * node --use-system-ca scripts/check-evolution-otp.js
 * node --use-system-ca scripts/check-evolution-otp.js --send
 *
 * --send يرسل رسالة اختبار إلى ADMIN_PHONE أو EVOLUTION_TEST_PHONE.
 * لا يطبع API Key ولا رموز OTP.
 */
require('dotenv').config();
const adapter = require('../server/services/evolutionWhatsAppOtp');
const { normalizeSaudiMobile, isValidSaudiMobile } = require('../server/utils/ejarContract');

function keyStatus(value) {
  const s = String(value || '').trim();
  if (!s) return 'غير معيّن';
  return 'معيّن';
}

async function main() {
  const configured = adapter.isConfigured();
  console.log('مهيأ:', configured ? 'نعم' : 'لا');
  console.log('Instance:', process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_API_INSTANCE || 'otp');
  console.log('Domain:', (process.env.EVOLUTION_API_DOMAIN || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '') || '(غير معيّن)');
  console.log('API Key:', keyStatus(process.env.EVOLUTION_API_KEY));

  if (!configured) {
    console.error('أضف EVOLUTION_API_DOMAIN و EVOLUTION_INSTANCE و EVOLUTION_API_KEY في .env');
    process.exit(1);
  }

  const state = await adapter.getConnectionState();
  console.log('connectionState:', state.ok ? 'ok' : 'فشل', 'status=', state.status, 'state=', state.state || '—');
  if (!state.ok) process.exit(1);

  if (!process.argv.includes('--send')) {
    console.log('لتجربة إرسال رسالة اختبار: أضف --send (إلى ADMIN_PHONE أو EVOLUTION_TEST_PHONE)');
    return;
  }

  const raw = process.env.EVOLUTION_TEST_PHONE || process.env.ADMIN_PHONE || '';
  const phone = normalizeSaudiMobile(raw);
  if (!isValidSaudiMobile(phone)) {
    console.error('رقم الاختبار غير صالح. عيّن EVOLUTION_TEST_PHONE أو ADMIN_PHONE');
    process.exit(1);
  }

  await adapter.sendTestMessage(phone);
  console.log('أُرسلت رسالة اختبار إلى', adapter.maskPhone(phone));
}

main().catch((err) => {
  console.error('فشل الفحص:', err && err.code ? err.code : 'error');
  process.exit(1);
});
