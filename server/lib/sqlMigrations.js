/**
 * تطبيق هجرة SQL على Supabase عند توفر كلمة مرور القاعدة
 */
const fs = require('fs');
const path = require('path');

const MIGRATION_FILE = path.join(__dirname, '..', '..', 'supabase', 'migrations', 'APPLY_NOW.sql');
const PUSH_MIGRATION = path.join(__dirname, '..', '..', 'supabase', 'migrations', '006_push_subscriptions.sql');
const EMAIL_MIGRATION = path.join(__dirname, '..', '..', 'supabase', 'migrations', '007_marketer_email_password.sql');

function projectRef() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

function getConnectionConfig() {
  const connectionString = (process.env.DATABASE_URL || '').trim();
  if (connectionString.startsWith('postgres')) {
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
  const password = (
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD ||
    process.env.ADMIN_PASSWORD ||
    ''
  ).trim();
  const ref = projectRef();
  if (!password || !ref) return null;
  return {
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  };
}

async function isMarketerSchemaReady() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const c = createClient(url, key);
  const { error } = await c.from('marketer_join_requests').select('id').limit(1);
  return !error;
}

function splitSql(sql) {
  return sql
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(Boolean);
}

async function runSqlFile(client, filePath, label) {
  if (!fs.existsSync(filePath)) return;
  const sql = fs.readFileSync(filePath, 'utf8');
  const stmts = splitSql(sql);
  for (const stmt of stmts) {
    try {
      await client.query(stmt);
    } catch (e) {
      if (/already exists|duplicate key|does not exist.*constraint/i.test(e.message)) continue;
      throw new Error(`${label}: ${e.message}`);
    }
  }
}

async function applyMigrationsIfNeeded({ silent = false } = {}) {
  if (await isMarketerSchemaReady()) {
    return { ok: true, already: true };
  }

  const cfg = getConnectionConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: 'no_password',
      message: 'أضف SUPABASE_DB_PASSWORD في .env أو Railway Variables',
    };
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    return { ok: false, skipped: 'no_pg', message: 'حزمة pg غير مثبتة — نفّذ npm install' };
  }

  const client = new pg.Client(cfg);
  try {
    await client.connect();
    if (!silent) console.log('[Schema] متصل بقاعدة البيانات — تطبيق الهجرة…');
    await runSqlFile(client, MIGRATION_FILE, 'APPLY_NOW');
    await runSqlFile(client, PUSH_MIGRATION, '006_push');
    await runSqlFile(client, EMAIL_MIGRATION, '007_email');
    await client.end();

    await new Promise((r) => setTimeout(r, 1200));
    const ready = await isMarketerSchemaReady();
    return ready
      ? { ok: true, applied: true }
      : { ok: true, applied: true, warning: 'schema_cache' };
  } catch (err) {
    try { await client.end(); } catch { /* */ }
    throw err;
  }
}

module.exports = {
  applyMigrationsIfNeeded,
  isMarketerSchemaReady,
  getConnectionConfig,
};
