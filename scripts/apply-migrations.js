#!/usr/bin/env node
/**
 * تطبيق هجرات Supabase (004 + 005)
 * يتطلب SUPABASE_DB_PASSWORD في .env
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const tls = require('tls');
const crypto = require('crypto');

const MIGRATIONS = ['APPLY_NOW.sql'];

function readPassword() {
  const url = process.env.DATABASE_URL || '';
  if (String(url).startsWith('postgres')) return { connectionString: url.trim() };
  const password = (
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD ||
    process.env.ADMIN_PASSWORD ||
    ''
  ).trim();
  return { password };
}

function projectRef() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : null;
}

function hi(str) {
  return crypto.createHash('sha256').update(str).digest();
}

function hmac(key, str) {
  return crypto.createHmac('sha256', key).update(str).digest();
}

function xor(a, b) {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] ^ b[i];
  return out;
}

function scramCredentials(password, salt, iterations) {
  return crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

class PgClient {
  constructor({ host, port, user, password, database, connectionString }) {
    this.connectionString = connectionString || null;
    this.host = host;
    this.port = port || 5432;
    this.user = user || 'postgres';
    this.password = password;
    this.database = database || 'postgres';
    this.socket = null;
    this.buf = Buffer.alloc(0);
    this.queue = [];
  }

  _resolveWait(msg) {
    const w = this.queue.shift();
    if (w) w.resolve(msg);
  }

  _rejectWait(err) {
    const w = this.queue.shift();
    if (w) w.reject(err);
  }

  _wait() {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this._pump();
    });
  }

  _pump() {
    while (this.queue.length && this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < 1 + len) return;
      const packet = this.buf.subarray(0, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      const type = String.fromCharCode(packet[0]);
      const body = packet.subarray(5);

      if (type === 'R') {
        const authType = body.readInt32BE(0);
        if (authType === 0) this._resolveWait({ t: 'auth_ok' });
        else if (authType === 10) this._resolveWait({ t: 'sasl', mechs: body.subarray(4).toString('utf8').split('\0').filter(Boolean) });
        else if (authType === 11) this._resolveWait({ t: 'sasl_cont', data: body.subarray(4).toString('utf8') });
        else if (authType === 12) this._resolveWait({ t: 'sasl_fin', data: body.subarray(4).toString('utf8') });
        else this._rejectWait(new Error(`مصادقة غير مدعومة (${authType})`));
      } else if (type === 'Z') {
        this._resolveWait({ t: 'ready' });
      } else if (type === 'C') {
        this._resolveWait({ t: 'done', tag: body.toString('utf8').replace(/\0/g, '') });
      } else if (type === 'E') {
        const parts = body.toString('utf8').split('\0').filter(Boolean);
        this._rejectWait(new Error(parts.join(' — ')));
      } else if (type === 'N' || type === 'S') {
        // notice
      } else {
        this._resolveWait({ t: type });
      }
    }
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    this._pump();
  }

  _send(type, payload) {
    const body = payload || Buffer.alloc(0);
    const packet = Buffer.alloc(1 + 4 + body.length);
    packet[0] = type.charCodeAt(0);
    packet.writeInt32BE(4 + body.length, 1);
    body.copy(packet, 5);
    this.socket.write(packet);
  }

  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('انتهت مهلة الاتصال')), 20000);

      if (this.connectionString) {
        try {
          const u = new URL(this.connectionString);
          this.host = u.hostname;
          this.port = Number(u.port || 5432);
          this.user = decodeURIComponent(u.username);
          this.password = decodeURIComponent(u.password);
          this.database = u.pathname.replace(/^\//, '') || 'postgres';
        } catch (e) {
          clearTimeout(timer);
          reject(e);
          return;
        }
      }

      const tlsOpts = {
        host: this.host,
        port: this.port,
        servername: this.host,
        rejectUnauthorized: process.env.SUPABASE_TLS_INSECURE !== '1',
      };
      this.socket = tls.connect(tlsOpts);
      this.socket.on('data', (c) => this._onData(c));
      this.socket.once('error', reject);
      this.socket.once('secureConnect', async () => {
        try {
          const params = `user\0${this.user}\0database\0${this.database}\0client_encoding\0UTF8\0`;
          const paramBuf = Buffer.from(params, 'utf8');
          const startup = Buffer.alloc(8 + paramBuf.length);
          startup.writeInt32BE(4 + 4 + paramBuf.length, 0);
          startup.writeInt32BE(196608, 4);
          paramBuf.copy(startup, 8);
          this.socket.write(startup);

          const auth = await this._wait();
          if (auth.t === 'sasl') {
            const nonce = crypto.randomBytes(18).toString('base64');
            const clientFirst = `n,,n=*,r=${nonce}`;
            const mech = 'SCRAM-SHA-256';
            const init = Buffer.concat([
              Buffer.from([0, 0, 0, 0]),
              Buffer.from(`${mech}\0`),
              Buffer.from([0, 0, 0, clientFirst.length]),
              Buffer.from(clientFirst),
            ]);
            init.writeInt32BE(init.length, 0);
            this._send('p', init.subarray(4));

            const cont = await this._wait();
            const serverFirst = cont.data;
            const r = /r=([^,]+),s=([^,]+),i=(\d+)/.exec(serverFirst);
            if (!r) throw new Error('فشل SCRAM');
            const [, serverNonce, saltB64, iterStr] = r;
            const salt = Buffer.from(saltB64, 'base64');
            const iterations = parseInt(iterStr, 10);
            const salted = scramCredentials(this.password, salt, iterations);
            const clientKey = hmac(salted, 'Client Key');
            const storedKey = hi(clientKey);
            const clientFinalWithoutProof = `c=biws,r=${serverNonce}`;
            const authMessage = `n=*,r=${nonce},${serverFirst},${clientFinalWithoutProof}`;
            const clientSig = hmac(storedKey, authMessage);
            const proof = xor(clientKey, clientSig).toString('base64');
            const clientFinal = `${clientFinalWithoutProof},p=${proof}`;
            const resp = Buffer.from(clientFinal, 'utf8');
            const saslResp = Buffer.alloc(4 + resp.length);
            saslResp.writeInt32BE(resp.length, 0);
            resp.copy(saslResp, 4);
            this._send('p', saslResp);

            const fin = await this._wait();
            if (fin.t !== 'sasl_fin') throw new Error('فشل إتمام SCRAM');
            await this._wait();
          }
          clearTimeout(timer);
          resolve();
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
      this.socket.once('error', (e) => { clearTimeout(timer); reject(e); });
    });
  }

  async query(sql) {
    const payload = Buffer.from(`${sql}\0`, 'utf8');
    this._send('Q', payload);
    for (;;) {
      const msg = await this._wait();
      if (msg.t === 'done' || msg.t === 'ready') return msg;
    }
  }

  end() {
    try { this._send('X'); this.socket.end(); } catch { /* */ }
  }
}

async function verifySchema() {
  const { createClient } = require('@supabase/supabase-js');
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const checks = await Promise.all([
    c.from('properties').select('marketer_id').limit(1),
    c.from('marketers').select('id').limit(1),
    c.from('admin_notifications').select('id').limit(1),
  ]);
  return checks.every((r) => !r.error);
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  الهيف — تطبيق هجرات قاعدة البيانات');
  console.log('═══════════════════════════════════════\n');

  if (await verifySchema()) {
    console.log('✓ الهجرة مُطبَّقة مسبقاً');
    return;
  }

  const creds = readPassword();
  const ref = projectRef();
  if (!ref && !creds.connectionString) {
    console.error('✗ أضف SUPABASE_DB_PASSWORD في ملف .env');
    console.log('  Supabase → Settings → Database → Database password');
    process.exit(1);
  }
  if (!creds.connectionString && !creds.password) {
    console.error('✗ كلمة مرور قاعدة البيانات غير متوفرة');
    process.exit(1);
  }

  const regions = ['me-south-1', 'eu-central-1', 'eu-west-1', 'ap-south-1', 'us-east-1'];
  const hosts = creds.connectionString
    ? [{ connectionString: creds.connectionString }]
    : [
      { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres', password: creds.password },
      ...regions.flatMap((r) => ([
        { host: `aws-0-${r}.pooler.supabase.com`, port: 5432, user: `postgres.${ref}`, password: creds.password },
        { host: `aws-0-${r}.pooler.supabase.com`, port: 6543, user: `postgres.${ref}`, password: creds.password },
      ])),
    ];

  let client;
  let lastErr;
  for (const h of hosts) {
    client = new PgClient(h);
    try {
      console.log(`جاري الاتصال (${h.connectionString ? 'DATABASE_URL' : `${h.host}:${h.port}`})…`);
      await client.connect();
      console.log('✓ متصل\n');
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      client.end();
      console.log(`  ✗ ${e.message}`);
    }
  }
  if (lastErr) {
    console.error('\n✗ فشل الاتصال بقاعدة البيانات — تحقق من SUPABASE_DB_PASSWORD');
    process.exit(1);
  }

  try {

    for (const file of MIGRATIONS) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', file), 'utf8');
      const stmts = sql.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean);
      console.log(`── ${file} ──`);
      for (const stmt of stmts) {
        const label = stmt.split('\n').find((l) => l.trim())?.trim().slice(0, 55) || 'SQL';
        process.stdout.write(`  ${label}… `);
        try {
          await client.query(stmt);
          console.log('✓');
        } catch (e) {
          if (/already exists|duplicate key/i.test(e.message)) console.log('⊘');
          else throw e;
        }
      }
    }
    client.end();
    await new Promise((r) => setTimeout(r, 1500));
    if (await verifySchema()) {
      console.log('\n✓ اكتملت الهجرة بنجاح — النظام جاهز 100%');
    } else {
      console.log('\n⚠ نُفّذت الأوامر — أعد تحميل schema cache في Supabase (دقيقة)');
    }
  } catch (e) {
    client.end();
    console.error('\n✗', e.message);
    process.exit(1);
  }
}

main();
