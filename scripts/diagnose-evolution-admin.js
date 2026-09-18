/**
 * تشخيص سريع — بدون طباعة أسرار/أرقام كاملة
 * node --use-system-ca scripts/diagnose-evolution-admin.js
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');

function maskPhone(p) {
  const s = String(p || '').trim();
  if (!s) return 'MISSING';
  return `SET len=${s.length} prefix=${s.slice(0, 2)}****`;
}

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  let phoneLine = null;
  lines.forEach((l, i) => {
    if (/^\s*#?\s*ADMIN_PHONE\s*=/.test(l) || /^\s*ADMIN_PHONE\s*=/.test(l)) {
      phoneLine = { i: i + 1, commented: l.trim().startsWith('#'), text: l };
    }
  });
  if (!phoneLine) {
    // broader search
    lines.forEach((l, i) => {
      if (/ADMIN_PHONE/i.test(l)) phoneLine = { i: i + 1, commented: l.trim().startsWith('#'), text: l };
    });
  }

  console.log('--- 1) ADMIN_PHONE ---');
  if (!phoneLine) {
    console.log('env_file_line: NOT_FOUND');
  } else {
    const eq = phoneLine.text.indexOf('=');
    const val = eq >= 0 ? phoneLine.text.slice(eq + 1).trim() : '';
    console.log('env_file_line:', phoneLine.i, 'commented=', phoneLine.commented, 'valueLen=', val.length);
  }
  const phone = (process.env.ADMIN_PHONE || '').trim();
  console.log('node_reads:', maskPhone(phone));

  console.log('--- 2/3) Evolution ---');
  const base = (process.env.EVOLUTION_API_URL || process.env.EVOLUTION_API_DOMAIN || '').trim().replace(/\/$/, '');
  const key = (process.env.EVOLUTION_API_KEY || '').trim();
  const inst = (process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_API_INSTANCE || 'otp').trim();
  console.log('host:', base.replace(/^https?:\/\//, '').split('/')[0] || 'MISSING');
  console.log('instance_present:', !!inst, 'len=', inst.length);
  console.log('api_key_present:', !!key, 'len=', key.length);

  const evo = require('../server/services/evolutionWhatsApp');
  console.log('configured:', evo.isConfigured());

  try {
    const state = await evo.getConnectionState();
    console.log('connectionState: ok=', state.ok, 'http=', state.status, 'state=', state.state || null);
  } catch (err) {
    console.log('connectionState: FAIL');
    console.log('error_message:', err.message);
    if (err.cause) console.log('error_cause:', err.cause.code || err.cause.message);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
