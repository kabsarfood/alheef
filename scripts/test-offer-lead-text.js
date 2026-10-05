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
  description: 'أرض على شارعين. رابط الإعلان https://www.alheef.website/property.html?id=1 ورقم المالك 0558391249',
  mapsUrl: 'https://maps.google.com/?q=24.6,46.5',
  latitude: 24.6,
  longitude: 46.5,
  city: 'الرياض',
  street: 'الشارع الشمالي',
  internalRef: 'H-MHD-000010',
});

const checks = [
  ['heading', text.startsWith('تمت مشاركتك تفاصيل العقار')],
  ['type', text.includes('نوع العقار: أرض')],
  ['city', text.includes('المدينة: الرياض')],
  ['district', text.includes('الحي: المهدية')],
  ['price', text.includes('السعر:')],
  ['area', text.includes('المساحة: 450 م²')],
  ['direction', text.includes('الاتجاه: شمال')],
  ['street', text.includes('عرض الشارع: 20')],
  ['plan', text.includes('رقم المخطط: 3214')],
  ['plot', text.includes('رقم القطعة: 88')],
  ['details', text.includes('التفاصيل:')],
  ['platform-phone', text.includes('0530792754')],
  ['no-ad-link', !/https?:\/\//i.test(text)],
  ['no-owner-phone', !text.includes('0558391249')],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('failed', failed.join(','));
  process.exit(1);
}
console.log('share text ok');
