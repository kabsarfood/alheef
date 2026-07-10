/**
 * اختبار تكامل — إنشاء عروض ومسار العميل
 * node --use-system-ca scripts/test-private-offers-integration.js
 */
require('dotenv').config();

const BASE = `http://127.0.0.1:${process.env.TEST_PORT || 8091}`;
const ADMIN_PASS = process.env.ADMIN_PASSWORD;

const IMG = [
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6162a9a2c9?w=600&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80',
];

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASS }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) throw new Error(data.message || 'فشل دخول الأدمن');
  return data.token;
}

async function main() {
  if (!ADMIN_PASS) {
    console.log('تخطي تكامل DB: ADMIN_PASSWORD غير معرّف');
    process.exit(0);
  }

  const token = await login();
  const headers = { Authorization: `Bearer ${token}` };

  const accessRes = await fetch(`${BASE}/api/admin/private-offers/access/regenerate-code`, {
    method: 'POST', headers,
  });
  const accessData = await accessRes.json();
  if (!accessRes.ok) throw new Error(accessData.message || 'فشل رمز الدخول');
  const code = accessData.accessCode;

  const slugRes = await fetch(`${BASE}/api/admin/private-offers/access`, { headers });
  const slugData = await slugRes.json();
  const slug = slugData.access?.pageSlug;
  const shareUrl = slugData.access?.shareUrl;
  if (!slug || !shareUrl) throw new Error('لا يوجد رابط مشاركة');

  const FormData = globalThis.FormData;
  const Blob = globalThis.Blob;

  async function createOffer(body, withImages = true) {
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => fd.append(k, String(v)));
    if (withImages) {
      for (let i = 0; i < 3; i++) {
        const imgRes = await fetch(IMG[i]);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        fd.append('images', new Blob([buf], { type: 'image/jpeg' }), `test-${i}.jpg`);
      }
    }
    const res = await fetch(`${BASE}/api/admin/private-offers`, {
      method: 'POST', headers, body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'فشل إنشاء العرض');
    return data.offer;
  }

  const full = await createOffer({
    propertyType: 'villa',
    area: 520,
    street: 'شارع الأمير سلطان',
    plotNumber: '1420',
    planNumber: '887',
    price: 2850000,
    location: 'حي النرجس — الرياض',
    showLocation: 'true',
    shortDescription: 'فيلا سكنية فاخرة بمساحة واسعة وتشطيب راقٍ — عرض خاص للعميل المهتم',
    status: 'available',
    internalNotes: 'ملاحظة سرية: جوال المالك 0501112233',
    visible: 'true',
    active: 'true',
    sortOrder: 0,
  }, true);

  const noLoc = await createOffer({
    propertyType: 'apartment',
    area: 140,
    street: 'شارع التحلية',
    plotNumber: '9',
    planNumber: '12',
    price: 950000,
    location: 'لا يجب أن يظهر',
    showLocation: 'false',
    shortDescription: 'شقة بدون إظهار الموقع في PDF',
    status: 'available',
    internalNotes: 'سري',
    visible: 'true',
    active: 'true',
    sortOrder: 1,
  }, true);

  const verifyRes = await fetch(`${BASE}/api/private-offers/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, code }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(verifyData.message || 'فشل التحقق من الرمز');

  const listRes = await fetch(`${BASE}/api/private-offers`, {
    headers: { Authorization: `Bearer ${verifyData.token}` },
  });
  const listData = await listRes.json();
  const offers = listData.offers || [];
  const found = offers.find((o) => o.id === full.id);
  const foundNoLoc = offers.find((o) => o.id === noLoc.id);

  const checks = [
    ['رقم عرض تلقائي', /^ALH-PRIVATE-\d+/.test(full.offerNumber)],
    ['3 صور', (found?.gallery?.length || 0) >= 3],
    ['وصف عربي', (found?.shortDescription || '').includes('فاخرة')],
    ['موقع مفعّل', !!found?.location && found.showLocation],
    ['بدون ملاحظات داخلية', !JSON.stringify(found).includes('ملاحظة سرية')],
    ['بدون جوال', !JSON.stringify(found).includes('0501112233')],
    ['موقع معطّل', !foundNoLoc?.location && foundNoLoc?.showLocation === false],
    ['رابط /v/', shareUrl.includes('/v/')],
    ['صفحة العميل', (await fetch(shareUrl.replace('https://www.alheef.website', BASE))).ok],
  ];

  console.log('\n=== اختبار تكامل العروض الخاصة ===\n');
  console.log('رابط المشاركة:', shareUrl);
  console.log('رمز الدخول (اختبار):', code);
  console.log('رقم العرض الكامل:', full.offerNumber);
  checks.forEach(([label, ok]) => console.log(`${ok ? '✓' : '✗'} ${label}`));

  if (checks.some(([, ok]) => !ok)) process.exit(1);
  console.log('\nالتكامل: ناجح');
}

main().catch((err) => {
  console.error('فشل التكامل:', err.message);
  process.exit(1);
});
