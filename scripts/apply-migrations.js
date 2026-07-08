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

const MIGRATIONS = ['004_marketer_system.sql', '005_property_review_notifications.sql', '006_push_subscriptions.sql'];

function readPassword() {
  return (
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD ||
    ''
  ).trim();
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
  const salted = hi(password + salt);
  let prev = salted;
  for (let i = 1; i < iterations; i += 1) {
    prev = hi(prev);
    for (let j = 0; j < prev.length; j += 1) salted[j] ^= prev[j];
  }
  return salted;
}

class PgClient {
  constructor({ host, port, user, password, database }) {
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
      this.socket = tls.connect({ host: this.host, port: this.port, servername: this.host });
      this.socket.on('data', (c) => this._onData(c));
      this.socket.once('error', reject);
      this.socket.once('secureConnect', async () => {
        try {
          const params = `user\0${this.user}\0database\0${this.database}\0client_encoding\0UTF8\0`;
          const startup = Buffer.alloc(8 + Buffer.byteLength(params));
          startup.writeInt32BE(startup.length, 0);
          startup.writeInt32BE(196608, 4);
          startup.write(params, 8, 'utf8');
          this.socket.write(Buffer.concat([Buffer.from([0]), startup]));

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
          resolve();
        } catch (e) {
          reject(e);
        }
      });
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

async function verifyColumn() {
  const { createClient } = require('@supabase/supabase-js');
  const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await c.from('properties').select('marketer_id').limit(1);
  return !error;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  الهيف — تطبيق هجرات قاعدة البيانات');
  console.log('═══════════════════════════════════════\n');

  if (await verifyColumn()) {
    console.log('✓ الهجرة مُطبَّقة مسبقاً');
    return;
  }

  const password = readPassword();
  const ref = projectRef();
  if (!ref || !password) {
    console.error('✗ أضف SUPABASE_DB_PASSWORD في ملف .env');
    console.log('  Supabase → Settings → Database → Database password');
    process.exit(1);
  }

  const client = new PgClient({
    host: `db.${ref}.supabase.co`,
    password,
  });

  try {
    console.log('جاري الاتصال…');
    await client.connect();
    console.log('✓ متصل\n');

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
    if (await verifyColumn()) {
      console.log('\n✓ اكتملت الهجرة بنجاح');
    } else {
      console.log('\n⚠ نفّذت الأوامر — انتظر دقيقة ثم أعد التحقق');
    }
  } catch (e) {
    client.end();
    console.error('\n✗', e.message);
    process.exit(1);
  }
}

main();
