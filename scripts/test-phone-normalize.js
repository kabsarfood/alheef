/**
 * اختبار توحيد أرقام الجوال (هوية الحساب).
 * node scripts/test-phone-normalize.js
 */
const {
  normalizeAccountPhone,
  normalizePhone,
  normalizeSaudiMobile,
  isValidSaudiMobile,
  toWhatsAppNumber,
  toE164,
  phonesEqual,
  maskPhone,
} = require('../server/utils/phone');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const sameAccount = [
  '0530792754',
  '530792754',
  '966530792754',
  '+966530792754',
  '+966 53 079 2754',
  '966 530 792 754',
];

for (const sample of sameAccount) {
  assert(normalizeAccountPhone(sample) === '0530792754', `normalizeAccountPhone(${sample})`);
  assert(toWhatsAppNumber(sample) === '966530792754', `toWhatsApp(${sample})`);
  assert(toE164(sample) === '+966530792754', `toE164(${sample})`);
  assert(isValidSaudiMobile(sample), `valid(${sample})`);
}

assert(phonesEqual('0530792754', '+966530792754'), 'phonesEqual local vs e164');
assert(phonesEqual('966530792754', '530792754'), 'phonesEqual intl vs short');
assert(!phonesEqual('0530792754', '0500000000'), 'phonesEqual مختلفين');

assert(normalizeAccountPhone('123') === '', 'invalid → empty account');
assert(normalizePhone('not-a-phone') === 'not-a-phone', 'normalizePhone fallback');
assert(normalizeSaudiMobile('12345') === '12345', 'normalizeSaudiMobile digits fallback');
assert(!isValidSaudiMobile('12345'), 'invalid saudi');
assert(toWhatsAppNumber('bad') === '', 'whatsapp invalid');
assert(maskPhone('0530792754').includes('****'), 'mask');

const zones = require('../server/utils/marketerZones');
assert(zones.normalizePhone('+966530792754') === '0530792754', 'marketerZones delegates');

const ejar = require('../server/utils/ejarContract');
assert(ejar.normalizeSaudiMobile('966530792754') === '0530792754', 'ejarContract delegates');
assert(ejar.isValidSaudiMobile('+966530792754'), 'ejar isValid delegates');

const evo = require('../server/services/evolutionWhatsApp');
assert(evo.toWhatsAppNumber('05 3079 2754') === '966530792754', 'evolutionWhatsApp delegates');

const evoOtp = require('../server/services/evolutionWhatsAppOtp');
assert(evoOtp.toWhatsAppNumber('+966530792754') === '966530792754', 'evolutionWhatsAppOtp delegates');

console.log('✓ توحيد أرقام الجوال — كل الصيغ تُعامل كحساب واحد');
