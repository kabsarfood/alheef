/**
 * فحص قراءة فقط على الخادم المحلي.
 * لا ينشئ إعلانًا ولا يغيّر قاعدة البيانات.
 */
require('dotenv').config();
const { getAdmin } = require('../server/lib/supabase');

const BASE = process.env.LIVE_BASE || 'http://127.0.0.1:8080';
const PHONE = /(?:\+|00)?9665\d{8}|05\d{8}|[٠-٩]{10}/;

function fail(message) {
  console.error('FAIL', message);
  process.exitCode = 1;
}

async function snapshot() {
  const { data, error, count } = await getAdmin()
    .from('properties')
    .select('id,status,updated_at,slug', { count: 'exact' });
  if (error) throw new Error(error.message);
  return { count: count == null ? data.length : count, ids: (data || []).map((row) => row.id).sort().join(',') };
}

async function main() {
  const before = await snapshot();
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) fail('health');

  for (const path of ['/api/admin/map-ads/preview', '/api/admin/map-ads/draft', '/api/admin/map-ads/x/verify']) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status !== 401) fail(`${path} status ${res.status}`);
    const body = await res.json().catch(() => ({}));
    if (body.code) fail(`${path} أعاد رمز تحقق`);
  }

  const offersRes = await fetch(`${BASE}/api/offers`);
  const offers = await offersRes.json();
  const list = Array.isArray(offers) ? offers : (offers.items || []);
  if (!list.length) fail('لا توجد عروض للفحص');
  let images = 0;
  let shares = 0;
  for (const offer of list) {
    const packed = JSON.stringify(offer);
    if (PHONE.test(packed)) fail(`رقم داخل قائمة العروض: ${offer.slug || offer.id}`);
    PHONE.lastIndex = 0;
    if (!offer.slug) continue;
    const slug = encodeURIComponent(offer.slug);
    const [propRes, shareRes, pageRes] = await Promise.all([
      fetch(`${BASE}/api/properties/slug/${slug}`),
      fetch(`${BASE}/api/properties/slug/${slug}/share`),
      fetch(`${BASE}/property.html?slug=${slug}`),
    ]);
    const propText = await propRes.text();
    const share = await shareRes.json();
    const page = await pageRes.text();
    if (propRes.status !== 200) fail(`عقار ${offer.slug} غير متاح`);
    if (PHONE.test(propText) || PHONE.test(JSON.stringify(share)) || PHONE.test(page)) {
      fail(`تسريب رقم في ${offer.slug}`);
    }
    PHONE.lastIndex = 0;
    if (!share.text || !share.text.includes('الهيف العقارية') || !share.url.includes('/property.html?slug=')) {
      fail(`نص المشاركة ناقص: ${offer.slug}`);
    }
    if (share.image) {
      const img = await fetch(share.image, { method: 'GET' });
      const type = img.headers.get('content-type') || '';
      if (!img.ok || !type.startsWith('image/')) fail(`صورة غير متاحة: ${offer.slug}`);
      else images += 1;
      await img.arrayBuffer();
    }
    const og = page.match(/property="og:image" content="([^"]*)"/);
    const title = page.match(/property="og:title" content="([^"]*)"/);
    if (!og || og[1] !== share.image) fail(`og:image لا يطابق المشاركة: ${offer.slug}`);
    if (!title || !title[1]) fail(`og:title فارغ: ${offer.slug}`);
    shares += 1;
  }

  const missing = await fetch(`${BASE}/api/properties/slug/${encodeURIComponent('draft-not-public')}/share`);
  if (missing.status !== 404) fail('رابط مشاركة لإعلان غير موجود لم يُرفض');

  const after = await snapshot();
  if (after.count !== before.count || after.ids !== before.ids) fail('قاعدة البيانات تغيّرت أثناء الفحص');
  if (process.exitCode) return;
  console.log(JSON.stringify({ ok: true, offers: list.length, shares, images, properties: before.count }));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
