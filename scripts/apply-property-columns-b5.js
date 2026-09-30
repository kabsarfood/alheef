/**
 * يطبّق 018_property_core_columns.sql على قاعدة الإنتاج.
 * node --use-system-ca scripts/apply-property-columns-b5.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConnectionConfig } = require('../server/lib/sqlMigrations');

async function main() {
  const cfg = getConnectionConfig();
  if (!cfg) {
    console.error('✗ لا يوجد DATABASE_URL أو SUPABASE_DB_PASSWORD');
    process.exit(1);
  }
  const pg = require('pg');
  const client = new pg.Client(cfg);
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '018_property_core_columns.sql');
  await client.connect();
  try {
    await client.query(fs.readFileSync(file, 'utf8'));
    await client.query("NOTIFY pgrst, 'reload schema'");
    const cols = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'properties'
        AND column_name = ANY($1)
      ORDER BY column_name
    `, [[
      'plot_number', 'plan_number', 'direction', 'street_width', 'price_type', 'internal_ref',
    ]]);
    console.log('الأعمدة:', cols.rows.map((row) => row.column_name).join(', '));
    const refs = await client.query(`
      SELECT internal_ref, district
      FROM properties
      WHERE internal_ref IS NOT NULL
      ORDER BY internal_ref
    `);
    console.log('أرقام المهدية الممنوحة:', refs.rowCount);
    refs.rows.forEach((row) => {
      console.log(`  ${row.internal_ref}  ${row.district || ''}`);
    });
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
