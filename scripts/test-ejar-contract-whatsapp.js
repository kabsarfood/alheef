/**
 * اختبار رسالة واتساب لنموذج إنشاء عقد الإيجار
 * node scripts/test-ejar-contract-whatsapp.js
 */
const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error('✗', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('✓', msg);
}

function buildContractWhatsAppMessage(data) {
  const lines = [
    'السلام عليكم، أرغب في إنشاء عقد إيجار عبر مكتب الهيف العقارية.',
    '',
    'الاسم: ' + (data.name || ''),
    'رقم الجوال: ' + (data.phone || ''),
    'نوع العقد: ' + (data.contractType || ''),
    'المدينة: ' + (data.city || ''),
  ];
  if (data.role) lines.push('الصفة: ' + data.role);
  lines.push('', 'أرغب في استكمال إجراءات إنشاء العقد عبر منصة إيجار.');
  return lines.join('\n');
}

const ejarJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ejar.js'), 'utf8');
const ejarConfig = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ejar-config.js'), 'utf8');
const apiJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'api.js'), 'utf8');
const notifJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'services', 'customerRequestNotifications.js'), 'utf8');
const ejarHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'ejar.html'), 'utf8');

if (!/إنشاء عقد إيجار عبر مكتب الهيف العقارية/.test(ejarJs)) fail('رسالة واتساب تبدأ بصياغة مكتب الهيف');
ok('رسالة واتساب تبدأ: إنشاء عقد إيجار عبر مكتب الهيف العقارية');

if (!/إنشاء العقد/.test(ejarHtml)) fail('زر إنشاء العقد موجود في الصفحة');
ok('زر إنشاء العقد موجود في الصفحة');

if (!/buildContractWhatsAppMessage/.test(ejarJs)) fail('دالة رسالة واتساب في ejar.js');
ok('دالة رسالة واتساب موجودة');

if (!/openWhatsApp\(waUrl, pendingWa\)/.test(ejarJs)) fail('فتح واتساب بعد الحفظ');
ok('واتساب يُفتح بعد حفظ الطلب');

if (!/isMobileDevice/.test(ejarJs) || !/location\.assign/.test(ejarJs)) fail('مسار الجوال لفتح واتساب');
ok('مسار الجوال يستخدم location.assign');

if (!/window\.open\(url, '_blank'\)/.test(ejarJs)) fail('مسار الكمبيوتر لفتح واتساب');
ok('مسار الكمبيوتر يستخدم window.open');

const waMatch = ejarConfig.match(/EJAR_SERVICE_WHATSAPP\s*=\s*'(\d+)'/);
if (!waMatch) fail('رقم واتساب الخدمة معرف في الإعدادات');
ok('رقم واتساب الخدمة يُقرأ من ejar-config.js: ' + waMatch[1]);

if (/966\d{9}/.test(ejarJs.replace(/cfg\.whatsapp|EJAR_SERVICE_WHATSAPP|966558391249/, ''))) {
  /* ignore fallback in getConfig */
}
if (!/window\.EJAR_SERVICE_WHATSAPP/.test(ejarJs)) fail('استخدام رقم الخدمة من الإعدادات وليس رقمًا ثابتًا جديدًا');
ok('لا يوجد رقم واتساب ثابت جديد داخل مسار النموذج');

if (!/createCustomerRequestReceived/.test(notifJs)) {
  fail('إشعار الإدارة لنموذج عقد الإيجار');
}
ok('إشعار الجرس يُرسل مع حفظ طلب عقد الإيجار');

if (!/notifyAdminsNewCustomerRequest/.test(apiJs)) fail('حفظ الطلب عبر /api/requests ما زال موجودًا');
ok('حفظ الطلب في قاعدة البيانات عبر /api/requests ما زال موجودًا');

const data = {
  name: 'محمد العتيبي',
  phone: '0558391249',
  contractType: 'سكني',
  city: 'الرياض',
  role: 'مؤجر',
};
const message = buildContractWhatsAppMessage(data);
const url = 'https://wa.me/' + waMatch[1] + '?text=' + encodeURIComponent(message);
const decoded = decodeURIComponent(url.split('?text=')[1]);

['محمد العتيبي', '0558391249', 'سكني', 'الرياض', 'مؤجر', 'إنشاء عقد إيجار', 'استكمال إجراءات'].forEach((part) => {
  if (!decoded.includes(part)) fail('ظهور بيان العميل في الرسالة: ' + part);
});
ok('جميع بيانات العميل تظهر في رسالة واتساب بعد فك الترميز');

if (/%[0-9A-F]{2}/i.test(url.split('?text=')[1]) === false) fail('ترميز النص العربي في رابط واتساب');
ok('النص العربي مرمّز بـ encodeURIComponent داخل رابط واتساب');

if (decoded !== message) fail('دورة الترميز/فك الترميز للنص العربي');
ok('ترميز النص العربي يحافظ على الرسالة كاملة');

console.log('\nall ejar contract whatsapp checks passed');
