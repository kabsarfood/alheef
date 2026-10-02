/**
 * ينسخ agent_phone إلى الحقل المشفر دون مسحه ودون طباعة الأرقام.
 * node --use-system-ca scripts/migrate-advertiser-phones.js
 */
require('dotenv').config();
const { getAdmin } = require('../server/lib/supabase');
const { normalizeAccountPhone } = require('../server/utils/phone');
const { sealPhone, openPhone, phoneHash } = require('../server/utils/phoneSeal');

async function main() {
  if (!sealPhone('0530792754')) throw new Error('تعذر التشفير: سر الخادم غير متاح');
  const admin = getAdmin();
  const { data, error } = await admin.from('properties').select('id, agent_phone, advertiser_phone_encrypted, advertiser_phone_hash');
  if (error) throw new Error(error.message);
  const counts = { migrated: 0, already: 0, missing: 0, conflict: 0 };
  for (const row of data || []) {
    const phone = normalizeAccountPhone(row.agent_phone);
    if (!phone) {
      counts.missing += 1;
      continue;
    }
    const opened = openPhone(row.advertiser_phone_encrypted);
    if (row.advertiser_phone_encrypted && opened && opened !== phone) {
      counts.conflict += 1;
      continue;
    }
    if (opened === phone && row.advertiser_phone_hash) {
      counts.already += 1;
      continue;
    }
    const sealed = sealPhone(phone);
    const hash = phoneHash(phone);
    if (!sealed || openPhone(sealed) !== phone) throw new Error('فشل التحقق من التشفير');
    const { error: updateError } = await admin.from('properties').update({
      advertiser_phone_encrypted: sealed,
      advertiser_phone_hash: hash,
    }).eq('id', row.id);
    if (updateError) throw new Error(updateError.message);
    counts.migrated += 1;
  }
  console.log(JSON.stringify(counts));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
