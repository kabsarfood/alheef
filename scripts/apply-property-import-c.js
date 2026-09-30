/**
 * يطبّق 019_property_import.sql
 * node --use-system-ca scripts/apply-property-import-c.js
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
    const file = path.join(__dirname, '..', 'supabase', 'migrations', '019_property_import.sql');
    await client.query(fs.readFileSync(file, 'utf8'));
    await client.query("NOTIFY pgrst, 'reload schema'");
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'properties' AND column_name LIKE 'source%'
      ORDER BY 1
    `);
    console.log('أعمدة المصدر:', cols.rows.map((row) => row.column_name).join(', '));
    const table = await client.query("SELECT to_regclass('public.property_import_logs') AS name");
    console.log('السجل:', table.rows[0].name);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
