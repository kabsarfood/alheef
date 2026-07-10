/**
 * تطبيق هجرات SQL على Supabase عند توفر كلمة مرور القاعدة
 */
const fs = require('fs');
const path = require('path');

const MIGRATION_FILE = path.join(__dirname, '..', '..', 'supabase', 'migrations', 'APPLY_NOW.sql');
const PUSH_MIGRATION = path.join(__dirname, '..', '..', 'supabase', 'migrations', '006_push_subscriptions.sql');
const EMAIL_MIGRATION = path.join(__dirname, '..', '..', 'supabase', 'migrations', '007_marketer_email_password.sql');
const PRIVATE_OFFERS_MIGRATION = path.join(__dirname, '..', '..', 'supabase', 'migrations', '008_private_offers.sql');

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
    ''
  ).trim();
  const ref = projectRef();
  if (!password || !ref) return null;
  return {
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  };
}

function getAdminClient() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isMarketerSchemaReady() {
  const c = getAdminClient();
  if (!c) return false;
  const { error } = await c.from('marketer_join_requests').select('id').limit(1);
  return !error;
}

async function isPushSchemaReady() {
  const c = getAdminClient();
  if (!c) return false;
  const { error } = await c.from('push_subscriptions').select('id').limit(1);
  return !error;
}

async function isEmailPasswordSchemaReady() {
  const c = getAdminClient();
  if (!c) return false;
  const { error: joinErr } = await c.from('marketer_join_requests').select('email').limit(1);
  if (joinErr) return false;
  const { error: tokenErr } = await c.from('marketer_password_reset_tokens').select('id').limit(1);
  return !tokenErr;
}

async function isNotificationsSchemaReady() {
  const c = getAdminClient();
  if (!c) return false;
  const { error } = await c.from('admin_notifications').select('id').limit(1);
  return !error;
}

async function isPrivateOffersSchemaReady() {
  const c = getAdminClient();
  if (!c) return false;
  const { error } = await c.from('private_offers').select('id').limit(1);
  return !error;
}

async function getSchemaStatus() {
  const [marketer, notifications, push, emailPassword, privateOffers] = await Promise.all([
    isMarketerSchemaReady(),
    isNotificationsSchemaReady(),
    isPushSchemaReady(),
    isEmailPasswordSchemaReady(),
    isPrivateOffersSchemaReady(),
  ]);
  return {
    marketer,
    notifications,
    push,
    emailPassword,
    privateOffers,
    allReady: marketer && notifications && push && emailPassword && privateOffers,
  };
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
  const status = await getSchemaStatus();
  if (status.allReady) {
    return { ok: true, already: true, status };
  }

  const cfg = getConnectionConfig();
  if (!cfg) {
    return {
      ok: false,
      skipped: 'no_password',
      message: 'أضف SUPABASE_DB_PASSWORD في .env أو Railway Variables',
      status,
    };
  }

  let pg;
  try {
    pg = require('pg');
  } catch {
    return { ok: false, skipped: 'no_pg', message: 'حزمة pg غير مثبتة — نفّذ npm install', status };
  }

  const client = new pg.Client(cfg);
  const applied = [];
  try {
    await client.connect();
    if (!silent) console.log('[Schema] متصل بقاعدة البيانات — تطبيق الهجرات المعلّقة…');

    if (!status.marketer || !status.notifications) {
      await runSqlFile(client, MIGRATION_FILE, 'APPLY_NOW');
      applied.push('004_marketer_system + 005_notifications');
    }
    if (!status.push) {
      await runSqlFile(client, PUSH_MIGRATION, '006_push');
      applied.push('006_push_subscriptions');
    }
    if (!status.emailPassword) {
      await runSqlFile(client, EMAIL_MIGRATION, '007_email');
      applied.push('007_marketer_email_password');
    }
    if (!status.privateOffers) {
      await runSqlFile(client, PRIVATE_OFFERS_MIGRATION, '008_private_offers');
      applied.push('008_private_offers');
    }

    await client.end();

    await new Promise((r) => setTimeout(r, 1200));
    const after = await getSchemaStatus();
    return after.allReady
      ? { ok: true, applied: true, appliedLabels: applied, status: after }
      : { ok: true, applied: true, appliedLabels: applied, warning: 'schema_cache', status: after };
  } catch (err) {
    try { await client.end(); } catch { /* */ }
    throw err;
  }
}

module.exports = {
  applyMigrationsIfNeeded,
  isMarketerSchemaReady,
  isPushSchemaReady,
  isEmailPasswordSchemaReady,
  isNotificationsSchemaReady,
  isPrivateOffersSchemaReady,
  getSchemaStatus,
  getConnectionConfig,
};
