const { buildShareText } = require('../server/services/offerLeads');

const text = buildShareText({
  propertyType: 'أرض',
  district: 'المهدية',
  price: 2500000,
  area: 450,
  direction: 'شمال',
  streetWidth: '20',
  planNumber: '3214',
  plotNumber: '88',
  description: 'أرض على شارعين. رقم المالك 0530792754 واتساب +966530792754',
  mapsUrl: 'https://maps.google.com/?q=24.6,46.5',
  latitude: 24.6,
  longitude: 46.5,
});

const checks = [
  ['heading', text.startsWith('تمت مشاركتك تفاصيل الإعلان')],
  ['type', text.includes('نوع العقار: أرض')],
  ['district', text.includes('الحي: المهدية')],
  ['price', text.includes('السعر:')],
  ['area', text.includes('المساحة: 450 م²')],
  ['direction', text.includes('الاتجاه: شمال')],
  ['street', text.includes('عرض الشارع: 20')],
  ['plan', text.includes('رقم المخطط: 3214')],
  ['plot', text.includes('رقم القطعة: 88')],
  ['details', text.includes('التفاصيل:')],
  ['maps', text.includes('https://maps.google.com/?q=24.6,46.5')],
  ['no-owner-phone', !/05\d{8}|9665\d{8}/.test(text)],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('failed', failed.join(','));
  process.exit(1);
}
console.log('share text ok');
