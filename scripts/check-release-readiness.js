/**
 * فحص جاهزية النشر للقراءة فقط، ثم حفظ نسخة محلية من العقارات.
 * لا يغيّر صفوف القاعدة ولا يرسل واتساب.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeAccountPhone } = require('../server/utils/phone');
const { getConnectionState, isConfigured } = require('../server/services/evolutionWhatsApp');
const { getSchemaStatus } = require('../server/lib/sqlMigrations');
const { getConnectionConfig } = require('../server/lib/sqlMigrations');

const EXPECTED = '0530792754';

function phoneMatches() {
  return normalizeAccountPhone(process.env.ADMIN_PHONE) === EXPECTED;
}

async function main() {
  const report = {
    adminPhoneMatches: phoneMatches(),
    adminPhoneSet: Boolean(String(process.env.ADMIN_PHONE || '').trim()),
    whatsAppConfigured: isConfigured(),
    whatsAppState: null,
    schemaReady: null,
    properties: null,
    columns: null,
    sourceConstraint: null,
    backup: null,
  };

  try {
    const state = await getConnectionState();
    report.whatsAppState = state.ok ? (state.state || 'unknown') : `http-${state.status}`;
  } catch (err) {
    report.whatsAppState = 'unavailable';
  }

  try {
    const status = await getSchemaStatus();
    report.schemaReady = Boolean(status.allReady);
  } catch (err) {
    report.schemaReady = false;
  }

  const cfg = getConnectionConfig();
  if (!cfg) {
    report.backup = { created: false, reason: 'no-db-password' };
    console.log(JSON.stringify(report));
    return;
  }

  const { Client } = require('pg');
  const client = new Client(cfg);
  await client.connect();
  try {
    const counts = await client.query(`
      SELECT status, count(*)::int AS n
      FROM properties
      GROUP BY status
      ORDER BY status
    `);
    const total = counts.rows.reduce((sum, row) => sum + row.n, 0);
    report.properties = { total, byStatus: Object.fromEntries(counts.rows.map((row) => [row.status, row.n])) };

    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'properties'
        AND column_name = ANY($1)
    `, [[
      'advertiser_phone_encrypted',
      'advertiser_phone_hash',
      'source_listing_id',
      'source',
      'show_on_map',
      'show_on_private_offers',
      'homepage_published',
      'status',
      'latitude',
      'longitude',
    ]]);
    report.columns = columns.rows.map((row) => row.column_name).sort();

    const constraint = await client.query(`
      SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname = 'properties_source_check'
    `);
    const def = constraint.rows[0]?.def || '';
    report.sourceConstraint = {
      present: Boolean(def),
      allowsAdminMap: def.includes('admin_map'),
    };

    const properties = await client.query('SELECT * FROM properties ORDER BY id');
    const images = await client.query('SELECT * FROM property_images ORDER BY id');
    const manifestRows = properties.rows.map((row) => [row.id, row.status, row.updated_at, row.slug].join(':'));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(__dirname, '..', 'data', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `properties-${stamp}.json`);
    const payload = {
      createdAt: new Date().toISOString(),
      properties: properties.rows,
      propertyImages: images.rows,
    };
    fs.writeFileSync(file, JSON.stringify(payload));
    const hash = crypto.createHash('sha256').update(manifestRows.sort().join('\n')).digest('hex');
    report.backup = {
      created: true,
      file: path.relative(path.join(__dirname, '..'), file),
      properties: properties.rows.length,
      images: images.rows.length,
      bytes: fs.statSync(file).size,
      manifestHash: hash,
    };
  } finally {
    await client.end();
  }

  console.log(JSON.stringify(report));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
