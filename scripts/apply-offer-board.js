require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConnectionConfig } = require('../server/lib/sqlMigrations');

async function main() {
  const cfg = getConnectionConfig();
  if (!cfg) throw new Error('لا يوجد اتصال بقاعدة البيانات');
  const pg = require('pg');
  const client = new pg.Client(cfg);
  await client.connect();
  try {
    const file = path.join(__dirname, '..', 'supabase', 'migrations', '023_offer_board.sql');
    await client.query(fs.readFileSync(file, 'utf8'));
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log('migration ok');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
