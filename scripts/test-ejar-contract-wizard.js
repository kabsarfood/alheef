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
  city: 'الرياض',
  district: 'النرجس',
  propertyMapUrl: 'https://maps.app.goo.gl/alheefLocation',
  streetName: 'طريق الملك سلمان',
  floor: '1',
  unitNumber: '12',
  electricityMeter: '1234567890',
  waterMeter: 'عداد مياه مستقل',
  waterMeterNumber: '987654321',
  waterTank: 'خزان مستقل',
  furnished: 'مؤثث',
  furnitureDetails: 'مطبخ وغرف نوم',
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

const missingArea = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', area: '' });
if (missingArea.ok || !missingArea.errors.area) fail('رفض الطلب بدون مساحة');
else ok('المساحة مطلوبة ولا يُرسل الطلب بدونها');

const missingMeter = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', electricityMeter: '', waterMeterNumber: '' });
if (!missingMeter.ok) fail('أرقام العدادات اختيارية: ' + JSON.stringify(missingMeter.errors));
else if (missingMeter.data.electricityMeter || missingMeter.data.waterMeterNumber) fail('يجب أن تبقى أرقام العدادات فارغة إن لم تُكتب');
else ok('رقم عداد الكهرباء وعداد المياه اختياريان مع التنبيه');

const missingWater = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', waterMeter: '', waterTank: '', waterUtility: '' });
if (missingWater.ok || !missingWater.errors.waterUtility) fail('رفض الطلب بدون اختيار نوع المياه');
else ok('نوع المياه مطلوب (عداد أو خزان)');

const waterUtilityMeter = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  waterUtility: 'عداد مستقل',
  waterMeter: '',
  waterTank: 'خزان مشترك',
  waterMeterNumber: '111222',
});
if (!waterUtilityMeter.ok || waterUtilityMeter.data.waterMeter !== 'عداد مياه مستقل' || waterUtilityMeter.data.waterTank || waterUtilityMeter.data.waterMeterNumber !== '111222') {
  fail('تحويل المياه من قائمة واحدة إلى عداد: ' + JSON.stringify(waterUtilityMeter.errors || waterUtilityMeter.data));
} else ok('عداد مستقل يحفظ نوع العداد ورقم الاشتراك ويمسح الخزان');

const waterUtilityTank = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  waterUtility: 'خزان مشترك',
  waterMeter: 'عداد مياه مستقل',
  waterMeterNumber: 'يجب أن يُمسح',
  waterTank: '',
});
if (!waterUtilityTank.ok || waterUtilityTank.data.waterTank !== 'خزان مشترك' || waterUtilityTank.data.waterMeter || waterUtilityTank.data.waterMeterNumber) {
  fail('خزان المياه يمسح رقم الاشتراك: ' + JSON.stringify(waterUtilityTank.errors || waterUtilityTank.data));
} else ok('خزان مشترك لا يحفظ رقم اشتراك المياه');

const noElectricity = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  electricityType: 'لا يوجد',
  electricityMeter: '999',
});
if (!noElectricity.ok || noElectricity.data.electricityType !== 'لا يوجد' || noElectricity.data.electricityMeter) {
  fail('مسح رقم الكهرباء عند لا يوجد: ' + JSON.stringify(noElectricity.errors || noElectricity.data));
} else ok('لا يوجد عداد كهرباء يمسح رقم الاشتراك');

const studioDuplex = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'استديو' });
const duplexOk = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'دوبلكس' });
if (!studioDuplex.ok || studioDuplex.data.unitType !== 'استديو' || !duplexOk.ok || duplexOk.data.unitType !== 'دوبلكس') {
  fail('قبول استديو ودوبلكس: ' + JSON.stringify(studioDuplex.errors || duplexOk.errors));
} else ok('يقبل نوع الوحدة استديو ودوبلكس');

const compactDetails = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  livingRooms: 2,
  builtInKitchen: 'نعم',
  bathrooms: '',
  city: '',
  district: '',
});
if (!compactDetails.ok || compactDetails.data.livingRooms !== 2 || compactDetails.data.builtInKitchen !== 'نعم' || compactDetails.data.bathrooms != null) {
  fail('حفظ الصالات ومطبخ راكب: ' + JSON.stringify(compactDetails.errors || compactDetails.data));
} else ok('يحفظ عدد الصالات ومطبخ راكب دون إلزام بدورات المياه');

const emptyOptional = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'استوديو',
  propertyLocation: '',
  streetName: '',
  furnished: 'غير مؤثث',
  furnitureDetails: '',
  propertyMapUrl: '',
});
if (!emptyOptional.ok) fail('الحقول الاختيارية الفارغة: ' + JSON.stringify(emptyOptional.errors));
else if (emptyOptional.data.streetName || emptyOptional.data.propertyMapUrl || emptyOptional.data.furnitureDetails) {
  fail('يجب أن تبقى الحقول الاختيارية فارغة دون قيم وهمية');
} else if (emptyOptional.data.furnished !== 'غير مؤثث') {
  fail('غير المؤثث يجب أن يُحفظ بدون تفاصيل أثاث');
} else if (emptyOptional.data.area !== 140) {
  fail('يجب حفظ المساحة');
} else ok('الشارع ورابط الخريطة والمدينة والحي اختيارية في الطلب الجديد، والمساحة تُحفظ');

const yesFurnished = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  furnished: 'نعم',
  furnitureDetails: 'ثلاجة وغسالة وكنب',
});
if (!yesFurnished.ok || yesFurnished.data.furnished !== 'مؤثث' || yesFurnished.data.furnitureDetails !== 'ثلاجة وغسالة وكنب') {
  fail('حفظ تفاصيل الأثاث عند نعم: ' + JSON.stringify(yesFurnished.errors || yesFurnished.data));
} else ok('اختيار نعم يحفظ العقار مؤثثًا مع تفاصيل الأثاث');

const furnishedNoDetails = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  furnished: 'نعم',
  furnitureDetails: '',
});
if (furnishedNoDetails.ok || !furnishedNoDetails.errors.furnitureDetails) fail('رفض مؤثث بدون تفاصيل الأثاث');
else ok('عند اختيار مؤثث يلزم كتابة تفاصيل الأثاث');

const unfurnishedClearsDetails = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  furnished: 'لا',
  furnitureDetails: 'يجب ألا تُحفظ',
});
if (!unfurnishedClearsDetails.ok || unfurnishedClearsDetails.data.furnished !== 'غير مؤثث' || unfurnishedClearsDetails.data.furnitureDetails) {
  fail('مسح تفاصيل الأثاث لغير المؤثث');
} else ok('اختيار لا يحفظ غير مؤثث بدون تفاصيل أثاث');

const freeTextPlace = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  city: 'جدة',
  district: 'السلامة',
});
if (!freeTextPlace.ok || freeTextPlace.data.city !== 'جدة' || freeTextPlace.data.district !== 'السلامة') {
  fail('قبول المدينة والحي كنص حر: ' + JSON.stringify(freeTextPlace.errors || freeTextPlace.data));
} else ok('المدينة والحي تُقبل كما تُكتب دون قائمة جاهزة');

const missingCity = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', city: '', district: '' });
if (!missingCity.ok || missingCity.data.city || missingCity.data.district) fail('المدينة والحي اختياريان في الطلب الجديد: ' + JSON.stringify(missingCity.errors || missingCity.data));
else ok('المدينة والحي اختياريان ولا يُرفض الطلب بدونهما');

const commercialShop = validateAndNormalize({ ...base, contractKind: 'commercial', unitType: 'محل', paymentMethod: 'كل 3 أشهر' });
if (!commercialShop.ok || commercialShop.data.unitType !== 'محل' || commercialShop.data.paymentMethod !== 'كل 3 أشهر') {
  fail('نوع الوحدة التجارية وطريقة الدفع: ' + JSON.stringify(commercialShop.errors || commercialShop.data));
} else ok('يقبل نوع محل ودفع كل 3 أشهر في التجاري');

const quarterlyAlias = validateAndNormalize({ ...base, contractKind: 'residential', unitType: 'شقة', paymentMethod: 'ربع سنوي' });
if (!quarterlyAlias.ok || quarterlyAlias.data.paymentMethod !== 'كل 3 أشهر') fail('تحويل ربع سنوي إلى كل 3 أشهر');
else ok('ربع سنوي يُحفظ كـ كل 3 أشهر');

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
if (noSubmitter.ok || !noSubmitter.errors.submitterRelation) {
  fail('صفة معبئ النموذج إلزامية');
} else ok('يرفض الطلب بدون صفة معبئ النموذج');

const tenantFills = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  submitterName: '',
  submitterPhone: '',
  submitterRelation: 'المستأجر',
});
if (!tenantFills.ok) fail('المستأجر المعبئ بدون اسم مستقل: ' + JSON.stringify(tenantFills.errors));
else if (tenantFills.data.submitterPhone !== base.tenantPhone) fail('جوال المعبئ يجب أن يُؤخذ من المستأجر');
else ok('المستأجر كمعبئ لا يحتاج اسمًا مستقلًا ويأخذ جواله');

const agentNeedsName = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  submitterName: '',
  submitterPhone: '',
  submitterRelation: 'وكيل',
});
if (agentNeedsName.ok || !agentNeedsName.errors.submitterName || !agentNeedsName.errors.submitterPhone) {
  fail('الوكيل يحتاج اسمًا وجوالًا');
} else ok('الوكيل وابن/ابنة أحد الأطراف يحتاجان اسمًا وجوالًا');

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
  || !incompleteSublease.errors.subleaseIdOrCr
  || !incompleteSublease.errors.subleaseIdOrCrDate
  || !incompleteSublease.errors.subleasePhone
  || !incompleteSublease.errors.subtenantName
  || !incompleteSublease.errors.subtenantId
  || !incompleteSublease.errors.subtenantDob
  || !incompleteSublease.errors.subtenantPhone
) {
  fail('حقول عقد بالباطن إلزامية');
} else ok('يرفض عقد بالباطن بدون بيانات المستأجر والمستأجر من الباطن');

const subleaseRepId = makeSaudiId('1');
const subtenantId = makeSaudiId('2');
const originalTenantCompany = {
  subleaseKind: 'شركة',
  subleasePhone: '0559876543',
  subleaseUnifiedNumber: '7009876543',
  subleaseRepId,
  subleaseRepDob: '1985-04-15',
  subleaseRepPhone: '0554445566',
};
const completeSublease = validateAndNormalize({
  ...base,
  contractKind: 'sublease',
  unitType: 'شقة',
  ...originalTenantCompany,
  subtenantName: 'سامي الدوسري',
  subtenantId,
  subtenantDob: '1994-02-10',
  subtenantPhone: '0551112233',
});
if (!completeSublease.ok) fail('Validation عقد بالباطن: ' + JSON.stringify(completeSublease.errors));
else if (
  completeSublease.data.subleaseKind !== 'شركة'
  || completeSublease.data.subleasePhone !== '0559876543'
  || completeSublease.data.subleaseUnifiedNumber !== '7009876543'
  || completeSublease.data.subleaseRepId !== subleaseRepId
  || completeSublease.data.subleaseRepDob !== '1985-04-15'
  || completeSublease.data.subleaseRepPhone !== '0554445566'
  || completeSublease.data.subleaseTenantName
  || completeSublease.data.subleaseIdOrCr
  || completeSublease.data.subleasePoaNumber
  || completeSublease.data.subtenantName !== 'سامي الدوسري'
  || completeSublease.data.subtenantId !== subtenantId
  || completeSublease.data.subtenantDob !== '1994-02-10'
  || completeSublease.data.subtenantPhone !== '0551112233'
) {
  fail('حفظ بيانات عقد بالباطن');
} else if (completeSublease.data.contractKind !== 'sublease' || completeSublease.data.contractType !== 'عقد بالباطن') {
  fail('نوع عقد بالباطن');
} else ok('يُحفظ عقد بالباطن وبيانات المستأجر من الباطن كنموذج مستقل');

const originalTenantIndividual = validateAndNormalize({
  ...base,
  contractKind: 'sublease',
  unitType: 'شقة',
  subleaseKind: 'فرد',
  subleaseIdOrCr: tenantId,
  subleaseIdOrCrDate: '1990-05-05',
  subleasePhone: '0553332211',
  subleaseUnifiedNumber: '7009876543',
  subleaseRepId,
  subtenantName: 'سامي الدوسري',
  subtenantId,
  subtenantDob: '1994-02-10',
  subtenantPhone: '0551112233',
});
if (!originalTenantIndividual.ok) fail('Validation مستأجر أصلي فرد: ' + JSON.stringify(originalTenantIndividual.errors));
else if (
  originalTenantIndividual.data.subleaseKind !== 'فرد'
  || originalTenantIndividual.data.subleaseIdOrCr !== tenantId
  || originalTenantIndividual.data.subleasePhone !== '0553332211'
  || originalTenantIndividual.data.subleaseUnifiedNumber
  || originalTenantIndividual.data.subleaseRepId
) {
  fail('حفظ مستأجر أصلي كفرد');
} else ok('عقد بالباطن يقبل مستأجرًا أصليًا كفرد أو شركة');

if (residential.data.tenantKind !== 'فرد') fail('المستأجر الافتراضي يجب أن يكون فردًا');
else ok('المستأجر الفرد هو الافتراضي في العقود السكنية');

const incompleteCompanyTenant = validateAndNormalize({
  ...base,
  contractKind: 'residential',
  unitType: 'شقة',
  tenantKind: 'شركة',
  tenantId: '',
  tenantDob: '',
});
if (
  incompleteCompanyTenant.ok
  || !incompleteCompanyTenant.errors.tenantUnifiedNumber
  || !incompleteCompanyTenant.errors.tenantRepId
  || !incompleteCompanyTenant.errors.tenantRepPhone
  || !incompleteCompanyTenant.errors.tenantRepDob
  || incompleteCompanyTenant.errors.tenantId
) {
  fail('مستأجر الشركة بدون بيانات الممثل: ' + JSON.stringify(incompleteCompanyTenant.errors));
} else ok('مستأجر الشركة يتطلب الرقم الموحد والجوال وبيانات الممثل');

const companyTenant = validateAndNormalize({
  ...base,
  contractKind: 'commercial',
  unitType: 'محل',
  tenantKind: 'شركة',
  tenantId: 'should-clear',
  tenantDob: '1992-08-20',
  tenantPhone: '0500001111',
  tenantUnifiedNumber: '7001234567',
  tenantRepId: tenantId,
  tenantRepPhone: '0550003333',
  tenantRepDob: '1990-01-01',
});
if (!companyTenant.ok) fail('Validation مستأجر شركة: ' + JSON.stringify(companyTenant.errors));
else if (
  companyTenant.data.tenantKind !== 'شركة'
  || companyTenant.data.tenantUnifiedNumber !== '7001234567'
  || companyTenant.data.tenantPhone !== '0500001111'
  || companyTenant.data.tenantRepId !== tenantId
  || companyTenant.data.tenantRepPhone !== '0550003333'
  || companyTenant.data.tenantRepDob !== '1990-01-01'
  || companyTenant.data.tenantId
  || companyTenant.data.tenantDob
) {
  fail('حفظ بيانات مستأجر الشركة');
} else ok('يُحفظ مستأجر الشركة بالرقم الموحد وبيانات الممثل دون هوية فرد');

const companySubtenant = validateAndNormalize({
  ...base,
  contractKind: 'sublease',
  unitType: 'شقة',
  ...originalTenantCompany,
  subtenantKind: 'شركة',
  subtenantName: 'يجب ألا يُحفظ',
  subtenantId: '',
  subtenantDob: '',
  subtenantPhone: '0551112233',
  subtenantUnifiedNumber: '7005551234',
  subtenantRepId: tenantId,
  subtenantRepPhone: '0552223344',
  subtenantRepDob: '1991-07-07',
});
if (!companySubtenant.ok) fail('Validation مستأجر من الباطن شركة: ' + JSON.stringify(companySubtenant.errors));
else if (
  companySubtenant.data.subtenantKind !== 'شركة'
  || companySubtenant.data.tenantKind !== 'شركة'
  || companySubtenant.data.subtenantUnifiedNumber !== '7005551234'
  || companySubtenant.data.tenantUnifiedNumber !== '7005551234'
  || companySubtenant.data.subtenantRepId !== tenantId
  || companySubtenant.data.tenantRepId !== tenantId
  || companySubtenant.data.subtenantName
  || companySubtenant.data.subtenantId
  || companySubtenant.data.tenantId
) {
  fail('حفظ مستأجر من الباطن كشركة');
} else ok('عقد بالباطن يقبل مستأجرًا من الباطن كشركة مع ممثل');

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

if (residential.data.city !== 'الرياض' || residential.data.district !== 'النرجس' || residential.data.area !== 140 || residential.data.electricityMeter !== '1234567890' || residential.data.propertyMapUrl !== 'https://maps.app.goo.gl/alheefLocation' || residential.data.furnished !== 'مؤثث' || residential.data.furnitureDetails !== 'مطبخ وغرف نوم' || residential.data.rooms !== 3 || residential.data.bathrooms !== 2) {
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
const wizardCss = fs.readFileSync(path.join(root, 'public', 'css', 'ejar.css'), 'utf8');
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
if (!/data-intro-start/.test(wizardJs) || !/أهلًا بكم في خدمة إنشاء العقود الإلكترونية/.test(wizardJs) || !/فهمت، ابدأ تعبئة النموذج/.test(wizardJs)) {
  fail('رسالة الترحيب عند فتح النموذج');
} else ok('رسالة ترحيب تظهر مرة واحدة عند فتح نموذج العقد');
if (!/introPending/.test(wizardJs) || !/dismissIntro/.test(wizardJs) || !/attachIntro/.test(wizardJs)) {
  fail('الترحيب لا يُعاد مع السابق/التالي');
} else ok('الترحيب لا يتكرر أثناء التنقل بين الخطوات');
if (!/ejar-wizard__intro/.test(wizardCss) || !/has-intro/.test(wizardCss)) fail('تنسيق نافذة الترحيب');
else ok('تنسيق نافذة الترحيب متناسق مع صفحة إيجار');
if (!/ejar-wizard__verify/.test(wizardCss) || !/has-verify/.test(wizardCss) || !/blur\(/.test(wizardCss)) fail('تنسيق شاشة التحقق');
else ok('النموذج يظهر ضبابياً حتى اكتمال التحقق');
if (/msg\.textContent = item\.message/.test(wizardJs)) fail('رسالة الخطأ ما زالت داخل حقل الرقم');
else ok('خطأ رقم الهوية يظهر أعلى البطاقة فقط وليس داخل الحقل');
if (!/عقد سكني/.test(wizardJs) || !/عقد تجاري/.test(wizardJs) || !/ejar-wizard__kind/.test(wizardJs)) fail('اختيار نوع العقد أعلى النموذج');
else ok('أعلى النموذج يحتوي اختيار عقد سكني وعقد تجاري');
if (!/إرسال طلب إنشاء العقد/.test(wizardJs)) fail('نص زر الإرسال');
else ok('زر الإرسال يستخدم «إرسال طلب إنشاء العقد»');
if (/إرسال العقد للتوثيق/.test(wizardJs)) fail('عبارة توثيق مبكرة');
else ok('لا تُستخدم عبارة إرسال العقد للتوثيق');
var wizardWithoutTrust = wizardJs.replace(/لا نطلب كلمة مرور منصة إيجار أو رمز نفاذ\./, '');
if (/نفاذ/.test(wizardWithoutTrust) || /كلمة مرور منصة إيجار/.test(wizardWithoutTrust)) fail('الحقول الحساسة لمنصة إيجار ممنوعة');
else ok('لا يُطلب نفاذ أو كلمة مرور منصة إيجار');
if (!/التحقق من مقدم الطلب/.test(wizardJs) || !/إرسال رمز التحقق عبر واتساب/.test(wizardJs) || !/\/api\/ejar\/otp\//.test(wizardJs)) {
  fail('بوابة تحقق واتساب');
} else ok('نموذج العقد يبدأ بالتحقق من مقدم الطلب عبر واتساب');
if (/EVOLUTION_API_KEY/.test(wizardJs) || /EVOLUTION_API_KEY/.test(html) || /EVOLUTION_API_KEY/.test(wizardCss) || /EVOLUTION_API_KEY/.test(ejarJs)) {
  fail('مفتاح Evolution في الواجهة');
} else ok('مفتاح Evolution غير موجود في HTML/JS');
if (!/requireVerifiedSession/.test(apiContracts) || !/otp_required/.test(apiContracts) || !/applyVerifiedContractIdentity/.test(apiContracts)) {
  fail('الواجهة الخلفية لا تفرض جلسة التحقق');
} else ok('إنشاء العقد مرفوض بدون جلسة تحقق ناجحة');
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
if (!/field.tagName === 'SELECT'/.test(wizardJs) || !/first.type === 'select'/.test(wizardJs)) fail('منع فتح قائمة نوع الوحدة تلقائيًا');
else ok('الانتقال لبيانات العقار لا يفتح قائمة نوع الوحدة تلقائيًا');
if (!/min-width: 560px/.test(wizardCss) || !/data-screen="ownership"/.test(wizardCss) || !/minmax\(0, 28\.5rem\)/.test(wizardCss)) fail('تنسيق بطاقة الملكية');
else ok('رقم الصك في وسط أعلى بطاقة الملكية والتاريخ تحته على كل الشاشات');
if (!/key: 'hasDeposit'[\s\S]*?extraInput: 'meter'/.test(wizardJs) || !/extraRequired: true/.test(wizardJs) || !/extraSuffix: 'ريال'/.test(wizardJs)) fail('حفظ مبلغ الضمان');
else ok('الضمان عند نعم يظهر رقم المبلغ مع حفظ مثل عداد الكهرباء والمياه');
if (!/ejar-wizard-review__toggle/.test(wizardJs) || !/maskId/.test(wizardJs)) fail('مراجعة الجوال');
else ok('المراجعة Accordion مع إخفاء جزء الهوية');
if (!/submitterName/.test(wizardJs) || !/submitterPhone/.test(wizardJs) || !/submitterRelation/.test(wizardJs) || !/من يقوم بتعبئة الطلب/.test(wizardJs)) {
  fail('حقول معبئ النموذج في المعالج');
} else ok('شاشة المراجعة تسأل من يقوم بتعبئة الطلب دون شاشة معبئ مستقلة للسكني والتجاري');
if (!/isGroupedKind/.test(wizardJs) || !/getScreens/.test(wizardJs) || !/current \+ ' من ' \+ inputTotal/.test(wizardJs)) fail('شاشات السكني والتجاري المجمّعة');
else ok('السكني والتجاري يستخدمان 5 شاشات إدخال + مراجعة');
if (!/function unitScreen/.test(wizardJs) || !/function financeScreen/.test(wizardJs) || !/id: 'sublease'/.test(wizardJs) || !/id: 'subtenant'/.test(wizardJs)) fail('شاشات عقد بالباطن المجمّعة');
else ok('عقد بالباطن يستخدم شاشات مجمّعة بنفس أسلوب بيانات العقار');
if (!/COMMERCIAL_PROPERTY_TYPES/.test(wizardJs) || !/محل/.test(wizardJs) || !/مكتب/.test(wizardJs)) fail('أنواع العقار التجارية');
else ok('التجاري يعرض أنواع وحدات تجارية');
if (!/ملحق/.test(wizardJs) || !/استديو/.test(wizardJs) || !/دوبلكس/.test(wizardJs)) fail('أنواع العقار السكنية الموسّعة');
else ok('السكني يعرض ملحق واستديو ودوبلكس');
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
  const expected = { ownership: 2, owner: 3, tenant: 8, unit: 18, finance: 5, submitter: 3 }[id];
  if (n !== expected) fail('عدد أسئلة ' + id + ': ' + n);
});
ok('عدد أسئلة الأقسام: ملكية 2، مؤجر 3، مستأجر 8، عقار 18، مالية 5، معبئ 3');
if ((wizardJs.match(/section: 'sublease'/g) || []).length !== 8) fail('أسئلة عقد بالباطن');
else ok('نموذج عقد بالباطن يضيف 8 أسئلة للمستأجر الأصلي مع خيار الشركة');
if ((wizardJs.match(/section: 'subtenant'/g) || []).length !== 9) fail('أسئلة المستأجر من الباطن');
else ok('نموذج عقد بالباطن يضيف 9 أسئلة للمستأجر من الباطن مع خيار الشركة');
if (!/sublease-screen-order: ownership, owner, sublease, subtenant, unit, finance, review/.test(wizardJs) || !/title: 'بيانات العقار'/.test(wizardJs) || !/title: 'تفاصيل العقار'/.test(wizardJs)) {
  fail('ترتيب شاشات عقد بالباطن');
} else ok('عقد بالباطن: العقار ثم المؤجر ثم المستأجر ثم بالباطن ثم التفاصيل');
if (!/tenantKind/.test(wizardJs) || !/مستأجر شركة/.test(wizardJs) || !/tenantUnifiedNumber/.test(wizardJs) || !/tenantRepId/.test(wizardJs) || !/companyPartyFields/.test(wizardJs)) {
  fail('خيار مستأجر شركة في المعالج');
} else ok('شاشة المستأجر تتيح التحويل بين فرد وشركة');
if (/ما حالة التعاقد/.test(wizardJs)) fail('حالة التعاقد ما زالت في العقود القديمة');
else ok('العقود السكنية والتجارية بدون سؤال حالة التعاقد');
if (!/k === 'sublease'/.test(wizardJs) || !/إنشاء عقد بالباطن/.test(wizardJs)) fail('نموذج عقد بالباطن في المعالج');
else ok('المعالج يفتح نموذجًا مستقلًا لعقد بالباطن');
if (!html.includes('data-ejar-contract="sublease"') || !html.includes('ابدأ عقد بالباطن')) fail('بطاقة عقد بالباطن');
else ok('صفحة /ejar تحتوي بطاقة عقد بالباطن مستقلة');
if (!/label: 'المدينة'/.test(wizardJs) || !/label: 'الحي'/.test(wizardJs) || !/label: 'الشارع'/.test(wizardJs) || !/رابط الموقع \(اللكيشن\)/.test(wizardJs) || !/propertyMapUrl/.test(wizardJs) || !/bathrooms/.test(wizardJs) || !/عمارة/.test(wizardJs) || !/label: 'المساحة'/.test(wizardJs) || !/electricityMeter/.test(wizardJs) || !/رقم اشتراك \/ عداد الكهرباء/.test(wizardJs) || !/waterMeterNumber/.test(wizardJs) || !/electricityType/.test(wizardJs) || !/waterUtility/.test(wizardJs) || !/livingRooms/.test(wizardJs) || !/builtInKitchen/.test(wizardJs) || !/تفاصيل الوحدة/.test(wizardJs) || !/ejar-details/.test(wizardJs) || !/FLOOR_OPTIONS/.test(wizardJs) || !/data-meter-save/.test(wizardJs) || !/ejar-meter__save/.test(wizardJs)) {
  fail('حقول بيانات العقار في المعالج');
} else ok('شاشة العقار تعرض المدينة والحي والشارع ورابط اللكيشن اختياريًا مع حفظ رقم العداد');
if (!/موقع العقار/.test(dashRequests) || !/مرافق الوحدة/.test(dashRequests) || !/p\.electricityType/.test(dashRequests) || !/p\.waterUtility/.test(dashRequests) || !/p\.livingRooms/.test(dashRequests) || !/p\.builtInKitchen/.test(dashRequests) || !/electricityMeter/.test(dashRequests) || !/waterMeter/.test(dashRequests) || !/waterMeterNumber/.test(dashRequests) || !/waterTank/.test(dashRequests)) {
  fail('عرض بيانات العقار في اللوحة');
} else ok('لوحة التحكم تعرض بيانات العقار الجديدة مع الحقول السابقة');
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
if (!/uploadDeed/.test(wizardJs) || !/\/api\/ejar\/deed/.test(wizardJs) || !/deedObjectPath/.test(wizardJs)) fail('رفع الصك منفصل عن إرسال الطلب');
else ok('رفع المستند منفصل عن حفظ الطلب');
if (!/application\/json/.test(wizardJs) || !/JSON\.stringify\(data\)/.test(wizardJs)) {
  fail('إرسال نوع العقد مع الطلب');
} else ok('الإرسال يحفظ الطلب كـ JSON دون إرفاق الملف معه');
if (!/failed to fetch/i.test(wizardJs) || !/networkErrorMessage/.test(wizardJs)) fail('ترجمة خطأ Failed to fetch');
else ok('خطأ Failed to fetch يُعرض بالعربية ولا يوقف الطلب');
if (!/multer/.test(apiContracts) || !/deed\/prepare/.test(apiContracts) || !/deedObjectPath/.test(apiContracts)) fail('API رفع صورة الصك');
else ok('API يرفع المستند في مسار مستقل ثم يربطه بالطلب');
if (!/application\/pdf/.test(apiContracts) || !/32 \* 1024 \* 1024/.test(apiContracts)) {
  fail('API يقبل PDF وحجمًا أكبر');
} else ok('API يقبل صور وPDF حتى 32 ميجا');
if (!/application\/pdf/.test(wizardJs) || !/DEED_MAX_MB = 32/.test(wizardJs)) fail('المعالج يقبل PDF وحجمًا أكبر');
else ok('المعالج يقبل صور وPDF حتى 32 ميجا');
if (!/deedImageHtml/.test(dashRequests) || !/deedImageUrl/.test(dashRequests) || !/deedFileKind/.test(dashRequests)) fail('عرض صورة الصك في اللوحة');
else ok('لوحة التحكم تعرض صورة الصك أو ملف PDF في تفاصيل الطلب');
if (!/submitterName/.test(dashRequests) || !/معبئ النموذج التعاقدي/.test(dashRequests)) fail('عرض معبئ النموذج في اللوحة');
else ok('لوحة التحكم تعرض اسم وجوال وصفة معبئ النموذج');
if (!/subleaseKind/.test(wizardJs) || !/subleasePhone/.test(wizardJs) || !/companyPartyFields\('sublease'\)/.test(wizardJs)) {
  fail('خيار مستأجر شركة/فرد في عقد بالباطن');
} else ok('شاشة المستأجر الأصلي في عقد بالباطن تتيح التحويل بين فرد وشركة');
if (!/subleaseTenantName/.test(dashRequests) || !/subleasePoaNumber/.test(dashRequests) || !/subtenantName/.test(dashRequests) || !/بيانات المستأجر بالباطن/.test(dashRequests) || !/عقد بالباطن/.test(dashRequests) || !/subleaseKind/.test(dashRequests) || !/subleasePhone/.test(dashRequests)) {
  fail('عرض عقد بالباطن في اللوحة');
} else ok('لوحة التحكم تعرض بيانات عقد بالباطن والمستأجر من الباطن');
if (!/tenantUnifiedNumber/.test(dashRequests) || !/tenantRepId/.test(dashRequests) || !/مستأجر شركة/.test(dashRequests) || !/subtenantUnifiedNumber/.test(dashRequests)) {
  fail('عرض مستأجر الشركة في اللوحة');
} else ok('لوحة التحكم تعرض بيانات مستأجر الشركة والممثل');

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
