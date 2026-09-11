/**
 * Phase 3 — Push role hardening + marketer join rate limit
 * node --use-system-ca scripts/test-phase3-api-hardening.js
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createToken } = require('../server/middleware/auth');

const BASE = `http://127.0.0.1:${process.env.PORT || 8080}`;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function fakeSub(endpoint) {
  return {
    endpoint,
    keys: { p256dh: 'dGVzdC1wMjU2ZGg', auth: 'dGVzdC1hdXRo' },
  };
}

async function storedRole(db, endpoint) {
  const { data } = await db.from('push_subscriptions').select('role').eq('endpoint', endpoint).maybeSingle();
  return data?.role || null;
}

async function cleanupJoin(db, phone, email) {
  await db.from('marketer_join_requests').delete().eq('phone', phone);
  await db.from('marketer_join_requests').delete().ilike('email', email);
}

async function main() {
  const health = await json('GET', '/health');
  assert(health.status === 200 && health.data.ok, 'الخادم غير يعمل — شغّل npm run dev');

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const visitorEp = `https://example.invalid/phase3-visitor-${stamp}`;
  const adminEp = `https://example.invalid/phase3-admin-${stamp}`;
  const marketerEp = `https://example.invalid/phase3-marketer-${stamp}`;
  const invalidEp = `https://example.invalid/phase3-invalid-${stamp}`;

  console.log('═══ Push ═══');

  const visitor = await json('POST', '/api/push/subscribe', {
    subscription: fakeSub(visitorEp),
    role: 'admin',
  });
  assert(visitor.status === 200 && visitor.data.success, `visitor subscribe فشل: ${visitor.data.message}`);
  assert(visitor.data.role === 'client', `visitor role المتوقع client، الفعلي ${visitor.data.role}`);
  assert(!visitor.data.subscription, 'الاستجابة ما زالت تحتوي subscription');
  assert(!visitor.data.p256dh && !visitor.data.auth && !visitor.data.endpoint, 'الاستجابة تسرب مفاتيح الدفع');
  assert(await storedRole(db, visitorEp) === 'client', 'visitor+role=admin خُزّن كأدمن');
  console.log('✓ visitor subscribe يتجاهل role=admin ويُحفظ كـ client');

  const unsub = await json('POST', '/api/push/unsubscribe', { endpoint: visitorEp });
  assert(unsub.status === 200 && unsub.data.success, 'visitor unsubscribe فشل');
  console.log('✓ visitor unsubscribe');

  const adminToken = createToken({ role: 'admin', userId: 'phase3-admin' });
  const adminSub = await json('POST', '/api/push/subscribe', {
    subscription: fakeSub(adminEp),
    role: 'client',
  }, adminToken);
  assert(adminSub.status === 200 && adminSub.data.role === 'admin', `admin subscribe: ${adminSub.data.role || adminSub.data.message}`);
  assert(await storedRole(db, adminEp) === 'admin', 'توكن الأدمن لم يُحفظ كـ admin');
  console.log('✓ admin subscribe بتوكن صحيح (يتجاهل body.role=client)');

  const { data: marketer } = await db.from('marketers').select('id').limit(1).maybeSingle();
  assert(marketer?.id, 'لا يوجد مسوق لاختبار اشتراك marketer');
  const marketerToken = createToken({ role: 'marketer', marketerId: marketer.id, userId: marketer.id });
  const marketerSub = await json('POST', '/api/push/subscribe', {
    subscription: fakeSub(marketerEp),
    role: 'admin',
  }, marketerToken);
  assert(marketerSub.status === 200 && marketerSub.data.role === 'marketer', `marketer subscribe: ${marketerSub.data.role || marketerSub.data.message}`);
  assert(await storedRole(db, marketerEp) === 'marketer', 'توكن المسوق لم يُحفظ كـ marketer');
  console.log('✓ marketer subscribe بتوكن صحيح (يتجاهل body.role=admin)');

  const invalidSub = await json('POST', '/api/push/subscribe', {
    subscription: fakeSub(invalidEp),
    role: 'admin',
  }, 'not-a-valid-token');
  assert(invalidSub.status === 200 && invalidSub.data.role === 'client', `invalid token: ${invalidSub.data.role || invalidSub.status}`);
  assert(await storedRole(db, invalidEp) === 'client', 'توكن غير صالح رُفع إلى admin');
  console.log('✓ invalid token يُعامل كزائر client');

  await json('POST', '/api/push/unsubscribe', { endpoint: adminEp });
  await json('POST', '/api/push/unsubscribe', { endpoint: marketerEp });
  await json('POST', '/api/push/unsubscribe', { endpoint: invalidEp });

  console.log('\n═══ Marketer Join ═══');

  const suffix = String(stamp).slice(-7);
  const phone = `05${suffix}`.slice(0, 10);
  const email = `phase3.${suffix}@alheef-test.local`;
  await cleanupJoin(db, phone, email);

  const validBody = {
    fullName: 'مسوق اختبار مرحلة 3',
    phone,
    email,
    nationalId: `1${suffix}`.padEnd(10, '0').slice(0, 10),
    falLicense: `FAL${suffix}`,
    marketingZone: 'north_riyadh',
    password: 'TestPass123',
    confirmPassword: 'TestPass123',
    status: 'approved',
    role: 'admin',
    admin_note: 'injected',
    adminNote: 'injected',
    reviewed_by: 'attacker',
    password_hash: 'injected-hash',
    id: '00000000-0000-0000-0000-000000000001',
  };

  const created = await json('POST', '/api/marketer/join', validBody);
  assert(created.status === 200 && created.data.success, `طلب صحيح فشل: ${created.data.message || created.status}`);
  assert(created.data.request?.status === 'pending', `status الفعلي ${created.data.request?.status}`);
  assert(!created.data.request?.password_hash, 'الاستجابة تحتوي password_hash');
  assert(!created.data.request?.adminNote, 'admin_note قُبل من العميل');
  const requestId = created.data.request?.id;
  assert(requestId && requestId !== validBody.id, 'id من العميل قُبل');
  const { data: storedJoin } = await db.from('marketer_join_requests').select('status, admin_note, reviewed_by').eq('id', requestId).maybeSingle();
  assert(storedJoin?.status === 'pending', 'الحالة المخزنة ليست pending');
  assert(!storedJoin?.admin_note, 'admin_note خُزّن من العميل');
  console.log('✓ طلب صحيح مع تجاهل status/role/admin fields');

  const dup = await json('POST', '/api/marketer/join', validBody);
  assert(dup.status === 400, `duplicate المتوقع 400، الفعلي ${dup.status}`);
  console.log('✓ duplicate');

  const missing = await json('POST', '/api/marketer/join', { fullName: 'x' });
  assert(missing.status === 400, `طلب ناقص المتوقع 400، الفعلي ${missing.status}`);
  console.log('✓ طلب ناقص');

  const honeyPhone = `059${suffix}`.slice(0, 10);
  const honey = await json('POST', '/api/marketer/join', {
    ...validBody,
    phone: honeyPhone,
    email: `honey.${suffix}@alheef-test.local`,
    website: 'http://spam.example',
  });
  assert(honey.status === 400, `honeypot المتوقع 400، الفعلي ${honey.status}`);
  const { data: honeyRow } = await db.from('marketer_join_requests').select('id').eq('phone', honeyPhone).maybeSingle();
  assert(!honeyRow, 'honeypot أُدرج في القاعدة');
  console.log('✓ honeypot');

  const extra = await json('POST', '/api/marketer/join', { fullName: 'y' });
  assert(extra.status === 400, `المحاولة 5 المتوقعة 400، الفعلية ${extra.status}`);

  const limited = await json('POST', '/api/marketer/join', { fullName: 'z' });
  assert(limited.status === 429, `تجاوز الحد المتوقع 429، الفعلي ${limited.status}`);
  assert(limited.data.message === 'محاولات كثيرة — حاول لاحقاً', limited.data.message);
  console.log('✓ rate limit 5 / 15 دقيقة');

  await cleanupJoin(db, phone, email);
  console.log('\n✓ اكتمل اختبار Phase 3');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
