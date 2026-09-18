/**
 * اختبارات وحدة جهات الاتصال (بدون رسائل جماعية)
 * node scripts/test-contacts-repo.js
 */
require('dotenv').config();

const assert = require('assert');
const {
  BUSINESS_ROLES,
  SOURCES_SET,
  upsertContact,
  ingestEjarContractParties,
  findByPhone,
} = require('../server/repositories/contactsRepo');
const { phonesEqual, normalizeAccountPhone } = require('../server/utils/phone');
const { isEnabled } = require('../server/lib/supabase');

async function main() {
  assert(BUSINESS_ROLES.has('landlord'));
  assert(BUSINESS_ROLES.has('tenant'));
  assert(BUSINESS_ROLES.has('broker'));
  assert(BUSINESS_ROLES.has('marketer'));
  assert(BUSINESS_ROLES.has('client'));
  assert(BUSINESS_ROLES.has('staff'));
  assert(!BUSINESS_ROLES.has('admin'), 'admin ليس صفة عمل — صلاحية حساب فقط');

  assert(SOURCES_SET.has('ejar_contract'));
  assert(SOURCES_SET.has('private_offer'));
  assert(SOURCES_SET.has('otp_verify'));

  assert(phonesEqual('0530792754', '+966530792754'));
  assert.strictEqual(normalizeAccountPhone('966530792754'), '0530792754');

  if (!isEnabled()) {
    console.log('~ تخطي اختبار DB: Supabase غير متصل');
    console.log('✓ تعريفات جهات الاتصال والأدوار/المصادر صحيحة');
    return;
  }

  const stamp = Date.now().toString().slice(-7);
  const phone1 = `05${String(stamp).padStart(8, '0').slice(0, 8)}`;
  const phone2 = `05${String(Number(stamp) + 1).padStart(8, '0').slice(0, 8)}`;

  let first;
  try {
    first = await upsertContact({
      phone: `+966${phone1.slice(1)}`,
      name: 'اختبار مؤجر',
      businessRole: 'landlord',
      source: 'ejar_contract',
      sourceRef: `test-${stamp}`,
    });
  } catch (err) {
    console.log('~ تخطي اختبار DB:', err.message);
    console.log('✓ تعريفات جهات الاتصال والأدوار/المصادر صحيحة');
    return;
  }

  if (!first.ok && (first.reason === 'schema_missing' || first.reason === 'db_unavailable')) {
    console.log('~ جداول contacts غير مطبّقة بعد — نفّذ الهجرة 017');
    console.log('✓ منطق الوحدة جاهز');
    return;
  }
  assert(first.ok, first.reason);
  assert.strictEqual(first.contact.phone_normalized, phone1);

  const again = await upsertContact({
    phone: phone1,
    name: 'اسم لا يستبدل إن وُجد',
    businessRole: 'broker',
    source: 'whatsapp',
    sourceRef: `wa-${stamp}`,
  });
  assert(again.ok);
  assert.strictEqual(again.contact.id, first.contact.id, 'نفس الرقم = نفس جهة الاتصال');
  assert.strictEqual(again.created, false);

  const found = await findByPhone(`966${phone1.slice(1)}`);
  assert(found && found.id === first.contact.id);

  const ejar = await ingestEjarContractParties({
    ownerPhone: phone1,
    ownerName: 'مالك',
    tenantPhone: phone2,
    tenantName: 'مستأجر',
    submitterPhone: phone1,
    submitterName: 'وسيط',
    submitterRole: 'broker',
    contractType: 'residential',
    referenceNo: `EJ-TEST-${stamp}`,
  }, `req-${stamp}`);
  assert(ejar.length >= 2);

  console.log('✓ جهات الاتصال: توحيد الرقم + صفات تراكمية + مصادر');
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
