/**
 * يطبّق 021_map_approval_no_expiry.sql
 * node --use-system-ca scripts/apply-map-approval.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConnectionConfig } = require('../server/lib/sqlMigrations');

async function main() {
  const cfg = getConnectionConfig();
  if (!cfg) {
    console.error('✗ لا يوجد اتصال بقاعدة البيانات');
    process.exit(1);
  }
  const pg = require('pg');
  const client = new pg.Client(cfg);
  await client.connect();
  try {
    const file = path.join(__dirname, '..', 'supabase', 'migrations', '021_map_approval_no_expiry.sql');
    await client.query(fs.readFileSync(file, 'utf8'));
    await client.query("NOTIFY pgrst, 'reload schema'");
    const table = await client.query("SELECT to_regclass('public.map_publish_requests') AS name");
    console.log('الجدول:', table.rows[0].name);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
