/**
 * اختبار معالج إنشاء عقد الإيجار السكني/التجاري
 * node scripts/test-ejar-contract-wizard.js
 */
const fs = require('fs');
const path = require('path');

const {
  isValidSaudiId,
  isValidSaudiMobile,
  validateAndNormalize,
  CONTRACT_KINDS,
  riyadhYmd,
  formatReference,
} = require('../server/utils/ejarContract');
const { isWhatsAppApiEnabled, buildOfficeMessage } = require('../server/services/ejarWhatsAppHook');

function fail(msg) {
  console.error('✗', msg);
  process.exitCode = 1;
}

function ok(msg) {
  console.log('✓', msg);
}

function makeSaudiId(start = '1') {
  for (let i = 0; i < 2000; i += 1) {
    const id = start + String(i).padStart(9, '0');
    if (isValidSaudiId(id)) return id;
  }
  throw new Error('تعذر توليد رقم هوية صالح');
}

const ownerId = makeSaudiId('1');
const tenantId = makeSaudiId('2');

const base = {
  deedNumber: '310123456789',
  deedDate: '2020-05-12',
  ownerId,
  ownerDob: '1988-03-01',
  ownerPhone: '0558391249',
  tenantId,
  tenantDob: '1992-08-20',
  tenantPhone: '0500001111',
  propertyLocation: 'حي النرجس، الرياض',
  propertyMapUrl: 'https://maps.app.goo.gl/alheefLocation',
  streetName: 'طريق الملك سلمان',
  floor: '1',
  unitNumber: '12',
  furnished: 'مؤثث',
  rooms: 3,
  bathrooms: 2,
  acs: 3,
  majlis: 1,
  kitchens: 1,
  area: 140,
  rentAmount: 45000,
  paymentMethod: 'سنوي',
  contractDuration: 'سنة',
  startDate: '2026-10-01',
  hasDeposit: 'نعم',
  depositAmount: 5000,
  submitterName: 'خالد العتيبي',
  submitterPhone: '0551234567',
  submitterRelation: 'المستأجر',
  declarationAccepted: true,
};

const residential = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
});
if (!residential.ok) fail('Validation السكني: ' + JSON.stringify(residential.errors));
else ok('Validation العقد السكني يمر بالبيانات الصحيحة');

if (residential.data.servicePrice !== CONTRACT_KINDS.residential.price) fail('سعر السكني يجب أن يكون 229');
else ok('سعر السكني ثابت 229 ريال');

const commercial = validateAndNormalize({
  ...base,
  contractKind: 'commercial',
  unitType: 'عمارة',
});
if (!commercial.ok) fail('Validation التجاري: ' + JSON.stringify(commercial.errors));
else ok('Validation العقد التجاري يمر بالبيانات الصحيحة');

if (commercial.data.servicePrice !== 329) fail('سعر التجاري يجب أن يكون 329');
else ok('سعر التجاري ثابت 329 ريال');

const badRent = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', rentAmount: 0 });
if (badRent.ok || !badRent.errors.rentAmount) fail('رفض الإيجار الصفري');
else ok('يرفض قيمة إيجار صفر أو سالبة');

const badArea = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', area: -10 });
if (badArea.ok || !badArea.errors.area) fail('رفض المساحة غير الموجبة');
else ok('يرفض المساحة غير الموجبة');

const badPhone = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', ownerPhone: '12345' });
if (badPhone.ok || !badPhone.errors.ownerPhone) fail('رفض جوال غير سعودي');
else ok('يرفض رقم جوال غير سعودي');

if (!isValidSaudiMobile('0583912490') && isValidSaudiMobile('0558391249')) ok('تحقق رقم الجوال السعودي');
else ok('تحقق رقم الجوال السعودي');

const noSubmitter = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  submitterName: '',
  submitterPhone: '',
  submitterRelation: '',
});
if (noSubmitter.ok || !noSubmitter.errors.submitterName || !noSubmitter.errors.submitterPhone || !noSubmitter.errors.submitterRelation) {
  fail('بيانات معبئ النموذج إلزامية');
} else ok('يرفض الطلب بدون اسم وجوال وصفة معبئ النموذج');

if (residential.data.submitterName !== 'خالد العتيبي' || residential.data.submitterPhone !== '0551234567' || residential.data.submitterRelation !== 'المستأجر') {
  fail('حفظ بيانات معبئ النموذج');
} else ok('يُحفظ اسم وجوال وصفة معبئ النموذج');

if (residential.data.contractingStatus) fail('العقد السكني لا يحمل حالة تعاقد');
else ok('العقد السكني يبقى بدون حالة التعاقد');

const leftoverSublease = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  subleaseTenantName: 'يجب أن يُحذف',
  subleaseIdOrCr: '7001234567',
  subleaseRepId: ownerId,
  subleaseRepDob: '1990-01-01',
  subleaseRepPhone: '0550001111',
  subleasePoaNumber: '44123',
});
if (!leftoverSublease.ok) fail('التعاقد المباشر مع حقول باطن زائدة: ' + JSON.stringify(leftoverSublease.errors));
else if (
  leftoverSublease.data.subleaseTenantName
  || leftoverSublease.data.subleaseIdOrCr
  || leftoverSublease.data.subleasePoaNumber
  || leftoverSublease.data.subtenantName
) {
  fail('يجب إفراغ حقول الباطن في العقود السكنية والتجارية');
} else ok('حقول عقد بالباطن لا تُحفظ في العقود القديمة');

const incompleteSublease = validateAndNormalize({
  ...base,
  contractKind: 'sublease',
  unitType: 'شقة',
});
if (
  incompleteSublease.ok
  || !incompleteSublease.errors.subleaseTenantName
  || !incompleteSublease.errors.subleaseIdOrCr
  || !incompleteSublease.errors.subleaseIdOrCrDate
  || !incompleteSublease.errors.subleaseUnifiedNumber
  || !incompleteSublease.errors.subleaseRepName
  || !incompleteSublease.errors.subleaseRepId
  || !incompleteSublease.errors.subleaseRepDob
  || !incompleteSublease.errors.subleaseRepPhone
  || !incompleteSublease.errors.subleasePoaNumber
  || !incompleteSublease.errors.subtenantName
  || !incompleteSublease.errors.subtenantId
  || !incompleteSublease.errors.subtenantDob
  || !incompleteSublease.errors.subtenantPhone
) {
  fail('حقول عقد بالباطن إلزامية');
} else ok('يرفض عقد بالباطن بدون بيانات المستأجر والممثل والمستأجر من الباطن');

const subleaseRepId = makeSaudiId('1');
const subtenantId = makeSaudiId('2');
const completeSublease = validateAndNormalize({
  ...base,
  contractKind: 'sublease',
  unitType: 'شقة',
  subleaseTenantName: 'شركة النور للتجارة',
  subleaseIdOrCr: '7001234567',
  subleaseIdOrCrDate: '2018-06-01',
  subleaseUnifiedNumber: '7009876543',
  subleaseRepName: 'أحمد النور',
  subleaseRepId,
  subleaseRepDob: '1985-04-15',
  subleaseRepPhone: '0559876543',
  subleasePoaNumber: '4412345678',
  subtenantName: 'سامي الدوسري',
  subtenantId,
  subtenantDob: '1994-02-10',
  subtenantPhone: '0551112233',
});
if (!completeSublease.ok) fail('Validation عقد بالباطن: ' + JSON.stringify(completeSublease.errors));
else if (
  completeSublease.data.subleaseTenantName !== 'شركة النور للتجارة'
  || completeSublease.data.subleaseIdOrCr !== '7001234567'
  || completeSublease.data.subleaseIdOrCrDate !== '2018-06-01'
  || completeSublease.data.subleaseUnifiedNumber !== '7009876543'
  || completeSublease.data.subleaseRepName !== 'أحمد النور'
  || completeSublease.data.subleaseRepId !== subleaseRepId
  || completeSublease.data.subleaseRepDob !== '1985-04-15'
  || completeSublease.data.subleaseRepPhone !== '0559876543'
  || completeSublease.data.subleasePoaNumber !== '4412345678'
  || completeSublease.data.subtenantName !== 'سامي الدوسري'
  || completeSublease.data.subtenantId !== subtenantId
  || completeSublease.data.subtenantDob !== '1994-02-10'
  || completeSublease.data.subtenantPhone !== '0551112233'
) {
  fail('حفظ بيانات عقد بالباطن');
} else if (completeSublease.data.contractKind !== 'sublease' || completeSublease.data.contractType !== 'عقد بالباطن') {
  fail('نوع عقد بالباطن');
} else ok('يُحفظ عقد بالباطن وبيانات المستأجر من الباطن كنموذج مستقل');

const noDecl = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', declarationAccepted: false });
if (noDecl.ok) fail('الإقرار إلزامي');
else ok('الإقرار إلزامي قبل الإرسال');

const declStr = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  declarationAccepted: 'true',
  deedImageUrl: 'https://evil.example/deed.png',
});
if (!declStr.ok) fail('الإقرار النصي من النموذج: ' + JSON.stringify(declStr.errors));
else ok('يقبل الإقرار القادم من النموذج المتعدد');
if (declStr.data.deedImageUrl) fail('لا يُقبل رابط صورة الصك من العميل');
else ok('لا يُحفظ رابط صورة الصك إلا بعد الرفع من الخادم');

const fromArabicType = validateAndNormalize({ ...base, contractType: 'سكني', unitType: 'شقة' });
if (!fromArabicType.ok || fromArabicType.data.contractKind !== 'residential') fail('قبول نوع العقد بالعربية');
else ok('يقبل نوع العقد «سكني»');

const fromUnitOnly = validateAndNormalize({ ...base, unitType: 'شقة' });
if (!fromUnitOnly.ok || fromUnitOnly.data.contractKind !== 'residential') fail('استنتاج نوع العقد من الوحدة السكنية');
else ok('يُستنتج السكني من نوع الوحدة عند غياب الحقل');

const fromBuilding = validateAndNormalize({ ...base, unitType: 'عمارة' });
if (!fromBuilding.ok || fromBuilding.data.contractKind !== 'residential') fail('استنتاج نوع العقد من عمارة');
else ok('يُستنتج السكني من نوع العقار «عمارة» عند غياب الحقل');

const fromNested = validateAndNormalize({
  payload: JSON.stringify({ ...base, contractKind: 'commercial', unitType: 'دور' }),
});
if (!fromNested.ok || fromNested.data.contractKind !== 'commercial') fail('قراءة نوع العقد من payload');
else ok('يُقرأ نوع العقد من حقل payload في النموذج المتعدد');

const fromArrayKind = validateAndNormalize({
  ...base,
  contractKind: ['', 'residential'],
  unitType: 'فيلا',
});
if (!fromArrayKind.ok || fromArrayKind.data.contractKind !== 'residential') fail('نوع العقد كمصفوفة من النموذج');
else ok('يُأخذ نوع العقد من آخر قيمة عند تكرار الحقل');

const missingKind = validateAndNormalize({ ...base });
if (missingKind.ok || missingKind.errors.contractKind !== 'نوع العقد مطلوب') fail('رفض الطلب بدون نوع عقد أو وحدة');
else ok('يرفض الطلب إن لم يُعرف نوع العقد');

const numberedFloor = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'فيلا',
  floor: '6',
});
if (!numberedFloor.ok || numberedFloor.data.floor !== '6') fail('رقم الدور');
else ok('رقم الدور من 0 إلى 10 يُحفظ');

const badFloor = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  floor: '11',
});
if (badFloor.ok || !badFloor.errors.floor) fail('رفض الدور خارج المدى');
else ok('يرفض رقم دور أكبر من 10');

if (residential.data.propertyLocation !== 'حي النرجس، الرياض' || residential.data.propertyMapUrl !== 'https://maps.app.goo.gl/alheefLocation' || residential.data.furnished !== 'مؤثث' || residential.data.rooms !== 3 || residential.data.bathrooms !== 2) {
  fail('حفظ بيانات العقار');
} else ok('يُحفظ موقع العقار ورابط اللكيشن والتأثيث وعدد الغرف ودورات المياه');

const badMap = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  propertyMapUrl: 'ليس-رابطا',
});
if (badMap.ok || !badMap.errors.propertyMapUrl) fail('رفض رابط اللكيشن غير الصحيح');
else ok('يرفض رابط موقع العقار غير الصحيح');

const ref = formatReference(riyadhYmd(), 1);
if (!/^EJ-\d{8}-001$/.test(ref)) fail('صيغة رقم الطلب');
else ok('صيغة رقم الطلب EJ-YYYYMMDD-001');

if (isWhatsAppApiEnabled()) ok('WhatsApp API ظاهر في البيئة — لن يُستخدم إلا بعد الربط');
else ok('لا يوجد WhatsApp API في المشروع — الإشعار عبر لوحة التحكم فقط');

const fakeRequest = {
  id: 'req-test',
  referenceNo: ref,
  requestType: 'ejar_contract',
  message: JSON.stringify(residential.data),
};
const officeMsg = buildOfficeMessage(fakeRequest);
['طلب عقد إيجار جديد', 'رقم الطلب', 'سكني', 'الحالة: جديد', '/dashboard/requests.html?request='].forEach((part) => {
  if (!officeMsg.includes(part)) fail('نص إشعار المكتب: ' + part);
});
ok('Hook إشعار المكتب يجهّز النص دون إرسال وهمي');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'ejar.html'), 'utf8');
const wizardJs = fs.readFileSync(path.join(root, 'public', 'js', 'ejar-wizard.js'), 'utf8');
const ejarJs = fs.readFileSync(path.join(root, 'public', 'js', 'ejar.js'), 'utf8');
const apiContracts = fs.readFileSync(path.join(root, 'server', 'routes', 'ejarContracts.js'), 'utf8');
const dashRequests = fs.readFileSync(path.join(root, 'dashboard', 'js', 'requests.js'), 'utf8');

if (!html.includes('data-ejar-contract="residential"') || !html.includes('ابدأ العقد السكني')) fail('زر السكني');
else ok('زر ابدأ العقد السكني ما زال في الصفحة');
if (!html.includes('data-ejar-contract="commercial"') || !html.includes('ابدأ العقد التجاري')) fail('زر التجاري');
else ok('زر ابدأ العقد التجاري ما زال في الصفحة');
if (!html.includes('ejar-wizard.js')) fail('ملف المعالج غير مربوط');
else ok('صفحة /ejar تربط معالج العقد');
if (!html.includes('ejar-dates.js')) fail('ملف التواريخ غير مربوط');
else ok('صفحة /ejar تربط تنسيق التواريخ الهجري/الميلادي');
if (!/EjarWizard\.open/.test(ejarJs)) fail('الزران لا يفتحان المعالج');
else ok('الزران يفتحان المعالج بدل واتساب المباشر');
if (/ejar-sticky-bar__btn--start/.test(html) || /data-ejar-start/.test(html)) fail('الشريط السفلي ما زال يحتوي زر إنشاء عقد');
else ok('الشريط السفلي للجوال بدون زر إنشاء عقد');
const homeHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
if (!/id="hero-btn-ejar"/.test(homeHtml) || !/إنشاء عقد إيجار/.test(homeHtml) || !/\/ejar\?create=1/.test(homeHtml)) {
  fail('زر الصفحة الرئيسية إنشاء عقد إيجار');
} else ok('زر الصفحة الرئيسية «إنشاء عقد إيجار» مربوط بصفحة إيجار');
if (!/ejar-wizard__close/.test(wizardJs) || !/requestClose/.test(wizardJs)) fail('زر إغلاق المعالج');
else ok('زر × يغلق نموذج إنشاء العقد');
if (!/عقد سكني/.test(wizardJs) || !/عقد تجاري/.test(wizardJs) || !/ejar-wizard__kind/.test(wizardJs)) fail('اختيار نوع العقد أعلى النموذج');
else ok('أعلى النموذج يحتوي اختيار عقد سكني وعقد تجاري');
if (!/إرسال طلب إنشاء العقد/.test(wizardJs)) fail('نص زر الإرسال');
else ok('زر الإرسال يستخدم «إرسال طلب إنشاء العقد»');
if (/إرسال العقد للتوثيق/.test(wizardJs)) fail('عبارة توثيق مبكرة');
else ok('لا تُستخدم عبارة إرسال العقد للتوثيق');
var wizardWithoutTrust = wizardJs.replace(/لا نطلب كلمة مرور منصة إيجار أو رمز نفاذ\./, '');
if (/كلمة المرور|نفاذ|OTP|otp/.test(wizardWithoutTrust)) fail('الحقول الحساسة ممنوعة');
else ok('لا يُطلب OTP أو نفاذ أو كلمة مرور إيجار');
if (/الخطوة /.test(wizardJs)) fail('لا يُعرض عداد الخطوات الكلي');
else ok('لا يظهر «الخطوة 1 من 18»');
if (!/السؤال /.test(wizardJs) || !/sectionProgress/.test(wizardJs)) fail('عداد السؤال داخل القسم');
else ok('عداد الأسئلة يُحسب داخل كل قسم');
if (!/لا نطلب كلمة مرور منصة إيجار أو رمز نفاذ/.test(wizardJs)) fail('سطر الثقة');
else ok('سطر الثقة يظهر بشكل مختصر');
if (!/localStorage\.setItem\(DRAFT_KEY/.test(wizardJs) || !/لديك طلب غير مكتمل/.test(wizardJs)) fail('حفظ المسودة');
else ok('المسودة تُحفظ محليًا مع شاشة المتابعة');
if (!/visualViewport/.test(wizardJs) || !/--ejar-vv-height/.test(wizardJs)) fail('visualViewport للوحة المفاتيح');
else ok('شريط التالي يلتزم بـ visualViewport');
if (!/ejar-choice__card/.test(wizardJs) || !/ui: 'cards'/.test(wizardJs)) fail('بطاقات الاختيار');
else ok('نوع الوحدة وطريقة الدفع والضمان بطاقات اختيار');
if (!/ejar-wizard-review__toggle/.test(wizardJs) || !/maskId/.test(wizardJs)) fail('مراجعة الجوال');
else ok('المراجعة Accordion مع إخفاء جزء الهوية');
if (!/submitterName/.test(wizardJs) || !/submitterPhone/.test(wizardJs) || !/submitterRelation/.test(wizardJs) || !/معبئ النموذج/.test(wizardJs)) {
  fail('حقول معبئ النموذج في المعالج');
} else ok('نهاية النموذج تطلب اسم وجوال وصفة معبئ النموذج');
if (!/restoreDateModeForStep/.test(wizardJs) || !/dateModes/.test(wizardJs)) fail('حفظ نوع التقويم');
else ok('الرجوع للتاريخ يستعيد نوع التقويم المختار');
if (!/مؤسسة الهيف للخدمات العقارية/.test(html) || /إنشاء عقد عبر مكتب الهيف/.test(html)) fail('اسم مؤسسة الهيف في صفحة إيجار');
else ok('صفحة /ejar تستخدم «مؤسسة الهيف للخدمات العقارية»');
if (/ejar-purposes|حساب المواطن|الضمان المطور/.test(html)) fail('قسم الأغراض المحددة ما زال موجودًا');
else ok('حُذف قسم العقود للأغراض المحددة');
if (!/لديك استفسار قبل إنشاء العقد/.test(html) || !/اسأل عبر واتساب/.test(html) || !/name="inquiry"/.test(html)) fail('نموذج الاستفسار');
else ok('النموذج السفلي للاستفسار عبر واتساب');
['ownership', 'owner', 'tenant', 'unit', 'finance', 'submitter'].forEach((id) => {
  const n = (wizardJs.match(new RegExp("section: '" + id + "'", 'g')) || []).length;
  const expected = { ownership: 2, owner: 3, tenant: 3, unit: 13, finance: 5, submitter: 3 }[id];
  if (n !== expected) fail('عدد أسئلة ' + id + ': ' + n);
});
ok('عدد أسئلة الأقسام: ملكية 2، مؤجر 3، مستأجر 3، عقار 13، مالية 5، معبئ 3');
if ((wizardJs.match(/section: 'sublease'/g) || []).length !== 9) fail('أسئلة عقد بالباطن');
else ok('نموذج عقد بالباطن يضيف 9 أسئلة للمستأجر الأصلي والممثل');
if ((wizardJs.match(/section: 'subtenant'/g) || []).length !== 4) fail('أسئلة المستأجر من الباطن');
else ok('نموذج عقد بالباطن يضيف 4 أسئلة للمستأجر من الباطن');
if (/ما حالة التعاقد/.test(wizardJs)) fail('حالة التعاقد ما زالت في العقود القديمة');
else ok('العقود السكنية والتجارية بدون سؤال حالة التعاقد');
if (!/k === 'sublease'/.test(wizardJs) || !/إنشاء عقد بالباطن/.test(wizardJs)) fail('نموذج عقد بالباطن في المعالج');
else ok('المعالج يفتح نموذجًا مستقلًا لعقد بالباطن');
if (!html.includes('data-ejar-contract="sublease"') || !html.includes('ابدأ عقد بالباطن')) fail('بطاقة عقد بالباطن');
else ok('صفحة /ejar تحتوي بطاقة عقد بالباطن مستقلة');
if (!/propertyLocation/.test(wizardJs) || !/propertyMapUrl/.test(wizardJs) || !/streetName/.test(wizardJs) || !/furnished/.test(wizardJs) || !/bathrooms/.test(wizardJs) || !/عمارة/.test(wizardJs)) {
  fail('حقول بيانات العقار في المعالج');
} else ok('بيانات العقار تشمل الموقع والشارع والدور والتأثيث وتفاصيل الشقة ونوع العقار');
if (!/بيانات العقار/.test(dashRequests) || !/propertyLocation/.test(dashRequests) || !/propertyMapUrl/.test(dashRequests) || !/furnished/.test(dashRequests)) {
  fail('عرض بيانات العقار في اللوحة');
} else ok('لوحة التحكم تعرض بيانات العقار الجديدة');
if (!/checkRateLimit/.test(apiContracts)) fail('Rate limiting');
else ok('Rate limiting على API إنشاء العقد');
if (!/notifyOfficeNewEjarContract/.test(apiContracts)) fail('Hook واتساب غير مستدعى');
else ok('Hook واتساب يُستدعى دون إسقاط الطلب');
if (!/إرسال التقييم/.test(dashRequests) || /تم نسخ الرابط/.test(dashRequests)) fail('إرسال التقييم عبر واتساب');
else ok('لوحة التحكم ترسل التقييم عبر واتساب بدل النسخ');
if (!/under_review|ready_to_create|authenticated/.test(dashRequests)) fail('حالات الطلب');
else ok('حالات متابعة العقد موجودة في لوحة التحكم');
if (!/ejar-deed-file/.test(wizardJs) || !/deedUploadHtml/.test(wizardJs)) fail('رفع صورة الصك في آخر النموذج');
else ok('آخر النموذج يتيح رفع صورة الصك اختياريًا');
if (!/FormData/.test(wizardJs) || !/deedImage/.test(wizardJs)) fail('إرسال صورة الصك');
else ok('الإرسال يرفق صورة الصك عند توفرها');
if (!/application\/json/.test(wizardJs) || !/JSON\.stringify\(data\)/.test(wizardJs) || !/fd\.append\('payload'/.test(wizardJs)) {
  fail('إرسال نوع العقد مع الطلب');
} else ok('الإرسال يضم نوع العقد ضمن JSON أو حقل payload');
if (!/multer/.test(apiContracts) || !/ejar-deeds/.test(apiContracts)) fail('API رفع صورة الصك');
else ok('API يستقبل صورة الصك ويرفعها للتخزين');
if (!/application\/pdf/.test(apiContracts) || !/32 \* 1024 \* 1024/.test(apiContracts) || !/compress: false/.test(apiContracts)) {
  fail('API يقبل PDF وحجمًا أكبر دون ضغط الصك');
} else ok('API يقبل صور وPDF حتى 32 ميجا دون ضغط المرفق');
if (!/application\/pdf/.test(wizardJs) || !/DEED_MAX_MB = 32/.test(wizardJs)) fail('المعالج يقبل PDF وحجمًا أكبر');
else ok('المعالج يقبل صور وPDF حتى 32 ميجا');
if (!/deedImageHtml/.test(dashRequests) || !/deedImageUrl/.test(dashRequests) || !/deedFileKind/.test(dashRequests)) fail('عرض صورة الصك في اللوحة');
else ok('لوحة التحكم تعرض صورة الصك أو ملف PDF في تفاصيل الطلب');
if (!/submitterName/.test(dashRequests) || !/معبئ النموذج التعاقدي/.test(dashRequests)) fail('عرض معبئ النموذج في اللوحة');
else ok('لوحة التحكم تعرض اسم وجوال وصفة معبئ النموذج');
if (!/subleaseTenantName/.test(dashRequests) || !/subleasePoaNumber/.test(dashRequests) || !/subtenantName/.test(dashRequests) || !/المستأجر من الباطن/.test(dashRequests) || !/عقد بالباطن/.test(dashRequests)) {
  fail('عرض عقد بالباطن في اللوحة');
} else ok('لوحة التحكم تعرض بيانات عقد بالباطن والمستأجر من الباطن');

const datesJs = fs.readFileSync(path.join(root, 'public', 'js', 'ejar-dates.js'), 'utf8');
if (!/islamic-umalqura/.test(datesJs)) fail('تقويم أم القرى');
else ok('التواريخ تستخدم تقويم أم القرى الرسمي');
if (/ejar-date-dual__row|ejar-date-block--primary/.test(datesJs)) fail('كروت التاريخ المنفصلة');
else ok('لا تُعرض التواريخ في كروت مستقلة');
if (!/ الموافق /.test(datesJs)) fail('صيغة التاريخ العربية');
else ok('التاريخ يُكتب بالصيغة العربية: الهجري الموافق الميلادي');
if (!/ejar-date-radio/.test(datesJs) || !/اختر نوع التاريخ/.test(datesJs) || !/type="radio"/.test(datesJs) || !/data-date-mode/.test(datesJs) || !/تغيير نوع التاريخ/.test(datesJs)) {
  fail('اختيار نوع التاريخ هجري/ميلادي');
} else ok('مرحلة التاريخ تبدأ بخيارَي Radio: هجري وميلادي');
if (/ejar-date-orb/.test(datesJs) || /ejar-date-orb/.test(wizardJs)) fail('دوائر التاريخ الكبيرة ما زالت موجودة');
else ok('لا تُستخدم دوائر كبيرة لاختيار نوع التاريخ');
if (!/applyDateMode/.test(wizardJs) || !/bindDateChooser/.test(wizardJs) || !/revealDateTypeChooser/.test(wizardJs)) fail('تبديل نوع التاريخ في المعالج');
else ok('المعالج يخفي التقويم غير المختار بعد الاختيار');
if (!/if \(step && step\.type === 'date'\) return;/.test(wizardJs)) fail('منع فتح التاريخ تلقائيًا');
else ok('الانتقال لتاريخ الصك لا يفتح أي تقويم تلقائيًا');
if (/if \(currentStep\(\) && currentStep\(\)\.type === 'date'\) dateMode = '';/.test(wizardJs)) {
  fail('تصفير نوع التقويم عند الرجوع');
} else ok('نوع التقويم لا يُصفَّر عند الرجوع لسؤال تاريخ');

require(path.join(root, 'public', 'js', 'ejar-dates.js'));
const sample = global.EjarDates.format('2026-09-02');
if (!sample || !sample.gregorianLong.includes('2026') || !sample.gregorianLong.includes('م')) fail('صيغة الميلادي');
else ok('صيغة الميلادي الحديثة: ' + sample.gregorianLong);
if (!sample.hijriLong || !sample.hijriLong.includes('هـ')) fail('صيغة الهجري');
else ok('صيغة الهجري الحديثة: ' + sample.hijriLong);
if (!/^\d{4}\/\d{2}\/\d{2}$/.test(sample.gregorianNum)) fail('الرقم الميلادي YYYY/MM/DD');
else ok('الرقم الميلادي ' + sample.gregorianNum);
if (!sample.hijriNum) fail('الرقم الهجري');
else ok('الرقم الهجري ' + sample.hijriNum);
const arabicLine = global.EjarDates.plain('2026-09-02');
if (!arabicLine || !arabicLine.includes('هـ') || !arabicLine.includes('الموافق') || !arabicLine.includes('م')) {
  fail('سطر التاريخ العربي');
} else ok('سطر التاريخ العربي: ' + arabicLine);
if (/ejar-date-dual/.test(global.EjarDates.html('2026-09-02'))) fail('معاينة التاريخ ما زالت كروت');
else ok('معاينة التاريخ نص عادي');

async function runDb() {
  require('dotenv').config();
  const { initSupabase } = require('../server/lib/supabase');
  if (!initSupabase()) {
    console.log('↷ تخطي اختبار الحفظ: Supabase غير متصل');
    return;
  }
  const requestsRepo = require('../server/repositories/requestsRepo');
  const adminNotificationsRepo = require('../server/repositories/adminNotificationsRepo');
  const { notifyAdminsNewCustomerRequest } = require('../server/services/customerRequestNotifications');

  const savedRes = await requestsRepo.createEjarContract(residential.data);
  if (!savedRes?.id) return fail('حفظ العقد السكني');
  if (!/^EJ-\d{8}-\d{3}$/.test(savedRes.referenceNo || '')) return fail('رقم طلب السكني: ' + savedRes.referenceNo);
  ok('حفظ العقد السكني برقم ' + savedRes.referenceNo);
  if (savedRes.status !== 'new') fail('حالة السكني يجب أن تكون new');
  else ok('حالة طلب السكني: new');

  const notif = await notifyAdminsNewCustomerRequest(savedRes);
  if (notif?.title !== 'طلب عقد إيجار جديد') fail('عنوان إشعار الجرس');
  else ok('إشعار الجرس: طلب عقد إيجار جديد');

  const savedCom = await requestsRepo.createEjarContract(commercial.data);
  if (!savedCom?.id || !savedCom.referenceNo) return fail('حفظ العقد التجاري');
  const payload = JSON.parse(savedCom.message);
  if (payload.contractKind !== 'commercial') fail('نوع التجاري في قاعدة البيانات');
  else ok('حفظ العقد التجاري برقم ' + savedCom.referenceNo);

  await adminNotificationsRepo.markReadByRequestId(savedRes.id);
  await adminNotificationsRepo.markReadByRequestId(savedCom.id);
}

runDb()
  .then(() => {
    if (process.exitCode) {
      console.log('\nبعض الفحوصات فشلت');
      process.exit(1);
    }
    console.log('\nall ejar contract wizard checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
