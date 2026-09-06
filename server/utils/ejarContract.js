const SCHEMA = 'ejar_contract_v2';

const CONTRACT_KINDS = {
  residential: { label: 'سكني', price: 229 },
  commercial: { label: 'تجاري', price: 329 },
  sublease: { label: 'عقد بالباطن', price: 229 },
};

const PAYMENT_METHODS = ['شهري', 'كل 3 أشهر', 'نصف سنوي', 'سنوي'];
const PAYMENT_METHOD_ALIASES = { 'ربع سنوي': 'كل 3 أشهر' };
const RESIDENTIAL_UNITS = ['شقة', 'فيلا'];
const COMMERCIAL_UNITS = ['محل', 'مكتب', 'معرض', 'مستودع', 'ورشة', 'عمارة تجارية', 'مجمع تجاري', 'أخرى', 'وحدة تجارية أخرى'];
const PROPERTY_TYPES = ['شقة', 'فيلا', 'عمارة', 'دور'];
const RESIDENTIAL_PROPERTY_TYPES = ['شقة', 'فيلا', 'دور', 'عمارة', 'ملحق', 'استوديو', 'أخرى'];
const COMMERCIAL_PROPERTY_TYPES = ['محل', 'مكتب', 'معرض', 'مستودع', 'ورشة', 'عمارة تجارية', 'مجمع تجاري', 'أخرى'];
const FLOOR_NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const FURNISHED_OPTIONS = ['مؤثث', 'غير مؤثث'];
const FLOORS = ['أرضي', 'أول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'أعلى', 'أخرى'];
const DURATIONS = ['3 أشهر', '6 أشهر', 'سنة', 'سنتان', 'مدة أخرى'];
const YES_NO = ['لا', 'نعم'];
const SUBMITTER_RELATIONS = ['المستأجر', 'المؤجر', 'ابن/ابنة أحد الأطراف', 'وكيل'];
const CONTRACTING_STATUSES = ['مؤجر ومستأجر', 'عقد بالباطن'];

const STATUS_LABELS = {
  new: 'جديد',
  under_review: 'تحت المراجعة',
  missing_data: 'ناقص بيانات',
  ready_to_create: 'جاهز للإنشاء',
  contract_created: 'تم إنشاء العقد',
  sent_for_auth: 'أرسل للتوثيق',
  authenticated: 'موثق',
  cancelled: 'ملغي',
  in_progress: 'قيد المعالجة',
  done: 'مكتمل',
};

const ALLOWED_STATUSES = Object.keys(STATUS_LABELS);
const CREATED_CONTRACT_STATUSES = ['contract_created', 'sent_for_auth', 'authenticated', 'done'];

function normalizeSaudiMobile(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (/^9665\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  if (/^05\d{8}$/.test(digits)) return digits;
  if (/^5\d{8}$/.test(digits)) return `0${digits}`;
  return digits;
}

function isValidSaudiMobile(input) {
  return /^05\d{8}$/.test(normalizeSaudiMobile(input));
}

function isValidSaudiId(input) {
  const s = String(input || '').replace(/\D/g, '');
  if (!/^[12]\d{9}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    let n = parseInt(s[i], 10);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

function isValidIdOrEstablishment(input) {
  const s = String(input || '').replace(/\D/g, '');
  if (isValidSaudiId(s)) return true;
  return /^\d{7,15}$/.test(s);
}

function isValidUnifiedNumber(input) {
  const s = String(input || '').replace(/\D/g, '');
  return /^\d{7,15}$/.test(s);
}

function normalizeMapUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  if (/^(maps\.|goo\.gl\/|www\.)/i.test(s)) s = `https://${s}`;
  return s.slice(0, 800);
}

function isValidMapUrl(input) {
  const s = normalizeMapUrl(input);
  if (s.length < 12 || s.length > 800) return false;
  return /^https?:\/\/[^\s]+$/i.test(s);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function riyadhIsoDate(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

function isPastDate(value) {
  if (!isIsoDate(value)) return false;
  return value <= riyadhIsoDate();
}

function parseIntInRange(value, min, max) {
  if (value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function parsePositiveNumber(value, { integer = false } = {}) {
  if (value === '' || value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  if (integer && !Number.isInteger(n)) return null;
  return n;
}

function trimStr(value, max) {
  const s = String(value || '').trim();
  return max ? s.slice(0, max) : s;
}

function riyadhYmd(date = new Date()) {
  return riyadhIsoDate(date).replace(/-/g, '');
}

function formatReference(ymd, seq) {
  return `EJ-${ymd}-${String(seq).padStart(3, '0')}`;
}

function parsePayload(message) {
  if (!message) return {};
  try {
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function isWizardPayload(data) {
  return data?.schema === SCHEMA || Boolean(data?.deedNumber && data?.ownerId);
}

function firstScalar(value) {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const inner = firstScalar(value[i]);
      if (inner !== '') return inner;
    }
    return '';
  }
  if (value == null) return '';
  return String(value).trim();
}

function flattenContractBody(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  let fromPayload = {};
  const payloadRaw = src.payload;
  if (typeof payloadRaw === 'string' && payloadRaw.trim()) {
    try {
      const parsed = JSON.parse(payloadRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fromPayload = parsed;
    } catch {
      fromPayload = {};
    }
  } else if (payloadRaw && typeof payloadRaw === 'object' && !Array.isArray(payloadRaw)) {
    fromPayload = payloadRaw;
  }

  const out = { ...fromPayload };
  Object.keys(src).forEach((key) => {
    if (key === 'payload') return;
    const val = Array.isArray(src[key]) ? firstScalar(src[key]) : src[key];
    if (val === '' || val == null) return;
    out[key] = val;
  });
  return out;
}

function resolveContractKind(body) {
  const raw = firstScalar(body?.contractKind || body?.contractType || body?.kind);
  if (raw === 'sublease' || raw === 'عقد بالباطن') return 'sublease';
  if (raw === 'commercial' || raw === 'تجاري') return 'commercial';
  if (raw === 'residential' || raw === 'سكني') return 'residential';
  const unit = firstScalar(body?.unitType);
  if (unit === 'أخرى') return '';
  if (COMMERCIAL_PROPERTY_TYPES.includes(unit) || COMMERCIAL_UNITS.includes(unit)) return 'commercial';
  if (RESIDENTIAL_PROPERTY_TYPES.includes(unit) || PROPERTY_TYPES.includes(unit) || RESIDENTIAL_UNITS.includes(unit)) {
    return 'residential';
  }
  return '';
}

function allowedUnitTypes(contractKind) {
  if (contractKind === 'commercial') {
    return COMMERCIAL_PROPERTY_TYPES.concat(COMMERCIAL_UNITS).concat(PROPERTY_TYPES);
  }
  return RESIDENTIAL_PROPERTY_TYPES.concat(PROPERTY_TYPES);
}

function normalizePaymentMethod(raw) {
  const s = trimStr(raw, 30);
  return PAYMENT_METHOD_ALIASES[s] || s;
}

function contractKindFromPayload(data) {
  return resolveContractKind(data);
}

function isDeclarationAccepted(value) {
  if (value === true || value === 1) return true;
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === 'on' || s === '1' || s === 'yes';
}

function validateAndNormalize(rawBody) {
  const errors = {};
  const body = flattenContractBody(rawBody);
  const contractKind = resolveContractKind(body);
  if (!contractKind) errors.contractKind = 'نوع العقد مطلوب';

  const deedNumber = trimStr(body?.deedNumber, 40);
  if (deedNumber.length < 4) errors.deedNumber = 'يرجى إدخال رقم الصك';

  const deedDate = trimStr(body?.deedDate, 10);
  if (!isIsoDate(deedDate)) errors.deedDate = 'يرجى اختيار تاريخ الصك';

  const isSublease = contractKind === 'sublease';
  const contractingStatus = isSublease ? 'عقد بالباطن' : '';

  let subleaseTenantName = '';
  let subleaseIdOrCr = '';
  let subleaseIdOrCrDate = '';
  let subleaseUnifiedNumber = '';
  let subleaseRepName = '';
  let subleaseRepId = '';
  let subleaseRepDob = '';
  let subleaseRepPhone = '';
  let subleasePoaNumber = '';
  let subtenantName = '';
  let subtenantId = '';
  let subtenantDob = '';
  let subtenantPhone = '';
  if (isSublease) {
    subleaseTenantName = trimStr(body?.subleaseTenantName, 80);
    if (subleaseTenantName.length < 2) errors.subleaseTenantName = 'يرجى إدخال اسم المستأجر';

    subleaseIdOrCr = String(body?.subleaseIdOrCr || '').replace(/\D/g, '');
    if (!isValidIdOrEstablishment(subleaseIdOrCr)) {
      errors.subleaseIdOrCr = 'رقم البطاقة أو المنشأة غير صحيح';
    }

    subleaseIdOrCrDate = trimStr(body?.subleaseIdOrCrDate, 10);
    if (!isPastDate(subleaseIdOrCrDate)) errors.subleaseIdOrCrDate = 'يرجى إدخال تاريخ السجل أو البطاقة';

    subleaseUnifiedNumber = String(body?.subleaseUnifiedNumber || '').replace(/\D/g, '');
    if (!isValidUnifiedNumber(subleaseUnifiedNumber)) {
      errors.subleaseUnifiedNumber = 'الرقم الموحد غير صحيح';
    }

    subleaseRepName = trimStr(body?.subleaseRepName, 80);
    if (subleaseRepName.length < 2) errors.subleaseRepName = 'يرجى إدخال اسم الممثل';

    subleaseRepId = String(body?.subleaseRepId || '').replace(/\D/g, '');
    if (!isValidSaudiId(subleaseRepId)) errors.subleaseRepId = 'رقم بطاقة الممثل غير صحيح';

    subleaseRepDob = trimStr(body?.subleaseRepDob, 10);
    if (!isPastDate(subleaseRepDob)) errors.subleaseRepDob = 'يرجى إدخال تاريخ ميلاد الممثل';

    subleaseRepPhone = normalizeSaudiMobile(body?.subleaseRepPhone);
    if (!isValidSaudiMobile(subleaseRepPhone)) errors.subleaseRepPhone = 'رقم جوال الممثل غير صحيح';

    subleasePoaNumber = trimStr(body?.subleasePoaNumber, 40);
    if (subleasePoaNumber.length < 2) errors.subleasePoaNumber = 'يرجى إدخال رقم الوكالة';

    subtenantName = trimStr(body?.subtenantName, 80);
    if (subtenantName.length < 2) errors.subtenantName = 'يرجى إدخال اسم المستأجر من الباطن';

    subtenantId = String(body?.subtenantId || '').replace(/\D/g, '');
    if (!isValidSaudiId(subtenantId)) errors.subtenantId = 'رقم بطاقة المستأجر من الباطن غير صحيح';

    subtenantDob = trimStr(body?.subtenantDob, 10);
    if (!isPastDate(subtenantDob)) errors.subtenantDob = 'يرجى إدخال تاريخ ميلاد المستأجر من الباطن';

    subtenantPhone = normalizeSaudiMobile(body?.subtenantPhone);
    if (!isValidSaudiMobile(subtenantPhone)) errors.subtenantPhone = 'رقم جوال المستأجر من الباطن غير صحيح';
  }

  const ownerId = String(body?.ownerId || '').replace(/\D/g, '');
  if (!isValidSaudiId(ownerId)) errors.ownerId = 'رقم هوية المالك غير صحيح';

  const ownerDob = trimStr(body?.ownerDob, 10);
  if (!isPastDate(ownerDob)) errors.ownerDob = 'يرجى إدخال تاريخ ميلاد المالك';

  const ownerPhone = normalizeSaudiMobile(body?.ownerPhone);
  if (!isValidSaudiMobile(ownerPhone)) errors.ownerPhone = 'رقم جوال المالك غير صحيح';

  let tenantId = String(body?.tenantId || '').replace(/\D/g, '');
  let tenantDob = trimStr(body?.tenantDob, 10);
  let tenantPhone = normalizeSaudiMobile(body?.tenantPhone);
  if (isSublease) {
    if (!isValidSaudiId(tenantId)) tenantId = subtenantId;
    if (!isPastDate(tenantDob)) tenantDob = subtenantDob;
    if (!isValidSaudiMobile(tenantPhone)) tenantPhone = subtenantPhone;
  }
  if (!isValidSaudiId(tenantId)) errors.tenantId = 'رقم هوية المستأجر غير صحيح';
  if (!isPastDate(tenantDob)) errors.tenantDob = 'يرجى إدخال تاريخ ميلاد المستأجر';
  if (!isValidSaudiMobile(tenantPhone)) errors.tenantPhone = 'رقم جوال المستأجر غير صحيح';

  const propertyLocation = trimStr(body?.propertyLocation, 80);
  const propertyMapUrl = normalizeMapUrl(body?.propertyMapUrl);
  if (propertyMapUrl && !isValidMapUrl(propertyMapUrl)) {
    errors.propertyMapUrl = 'يرجى لصق رابط موقع العقار (اللكيشن)';
  }

  const streetName = trimStr(body?.streetName, 80);

  const floor = String(body?.floor ?? '').trim();
  if (!FLOOR_NUMBERS.includes(floor)) errors.floor = 'يرجى اختيار رقم الدور من 0 إلى 10';

  const unitNumber = trimStr(body?.unitNumber, 30);
  if (!unitNumber) errors.unitNumber = 'يرجى إدخال رقم الوحدة';

  const furnished = trimStr(body?.furnished, 20);
  if (furnished && !FURNISHED_OPTIONS.includes(furnished)) errors.furnished = 'يرجى تحديد إذا كان العقار مؤثثًا';

  const rooms = parseIntInRange(body?.rooms, 1, 10);
  if (rooms == null) errors.rooms = 'عدد الغرف يجب أن يكون من 1 إلى 10';

  const bathrooms = parseIntInRange(body?.bathrooms, 1, 5);
  if (bathrooms == null) errors.bathrooms = 'عدد دورات المياه يجب أن يكون من 1 إلى 5';

  const acs = parseIntInRange(body?.acs, 0, 10);
  if (acs == null) errors.acs = 'عدد المكيفات يجب أن يكون من 0 إلى 10';

  const majlis = parseIntInRange(body?.majlis, 0, 10);
  if (majlis == null) errors.majlis = 'عدد المجالس يجب أن يكون من 0 إلى 10';

  const kitchens = parseIntInRange(body?.kitchens, 0, 10);
  if (kitchens == null) errors.kitchens = 'عدد المطابخ يجب أن يكون من 0 إلى 10';

  const unitType = trimStr(body?.unitType, 40);
  if (!allowedUnitTypes(contractKind).includes(unitType)) errors.unitType = 'يرجى اختيار نوع العقار';

  const areaRaw = body?.area;
  const areaEmpty = areaRaw === '' || areaRaw == null;
  const area = areaEmpty ? null : parsePositiveNumber(areaRaw);
  if (!areaEmpty && (area == null || area > 100000)) errors.area = 'المساحة يجب أن تكون رقمًا موجبًا';

  const rentAmount = parsePositiveNumber(body?.rentAmount);
  if (rentAmount == null || rentAmount > 100000000) errors.rentAmount = 'قيمة الإيجار يجب أن تكون أكبر من صفر';

  const paymentMethod = normalizePaymentMethod(body?.paymentMethod);
  if (!PAYMENT_METHODS.includes(paymentMethod)) errors.paymentMethod = 'يرجى اختيار طريقة الدفع';

  const contractDuration = trimStr(body?.contractDuration, 30);
  if (!DURATIONS.includes(contractDuration)) errors.contractDuration = 'يرجى اختيار مدة العقد';
  const contractDurationOther = trimStr(body?.contractDurationOther, 40);
  if (contractDuration === 'مدة أخرى' && contractDurationOther.length < 1) {
    errors.contractDurationOther = 'يرجى تحديد مدة العقد';
  }

  const startDate = trimStr(body?.startDate, 10);
  if (!isIsoDate(startDate)) errors.startDate = 'يرجى اختيار تاريخ بداية العقد';

  const hasDeposit = trimStr(body?.hasDeposit, 10);
  if (!YES_NO.includes(hasDeposit)) errors.hasDeposit = 'يرجى تحديد وجود مبلغ الضمان';
  let depositAmount = null;
  if (hasDeposit === 'نعم') {
    depositAmount = parsePositiveNumber(body?.depositAmount);
    if (depositAmount == null) errors.depositAmount = 'يرجى إدخال قيمة مبلغ الضمان';
  }

  const submitterRelation = trimStr(body?.submitterRelation, 40);
  if (!SUBMITTER_RELATIONS.includes(submitterRelation)) {
    errors.submitterRelation = 'يرجى تحديد صفة معبئ النموذج';
  }

  const partyFills = submitterRelation === 'المؤجر' || submitterRelation === 'المستأجر';
  let submitterName = trimStr(body?.submitterName, 80);
  let submitterPhone = normalizeSaudiMobile(body?.submitterPhone);
  if (submitterRelation === 'المؤجر' && !isValidSaudiMobile(submitterPhone)) submitterPhone = ownerPhone;
  if (submitterRelation === 'المستأجر' && !isValidSaudiMobile(submitterPhone)) submitterPhone = tenantPhone;
  if (partyFills) {
    if (!isValidSaudiMobile(submitterPhone)) errors.submitterPhone = 'رقم جوال معبئ النموذج غير صحيح';
  } else {
    if (submitterName.length < 2) errors.submitterName = 'يرجى إدخال اسم معبئ النموذج';
    if (!isValidSaudiMobile(submitterPhone)) errors.submitterPhone = 'رقم جوال معبئ النموذج غير صحيح';
  }

  if (!isDeclarationAccepted(body?.declarationAccepted)) {
    errors.declarationAccepted = 'يلزم الإقرار بصحة البيانات قبل الإرسال';
  }

  const meta = CONTRACT_KINDS[contractKind] || CONTRACT_KINDS.residential;
  const servicePrice = meta.price;
  const data = {
    schema: SCHEMA,
    contractKind,
    contractType: meta.label,
    servicePrice,
    deedNumber,
    deedDate,
    contractingStatus,
    subleaseTenantName,
    subleaseIdOrCr,
    subleaseIdOrCrDate,
    subleaseUnifiedNumber,
    subleaseRepName,
    subleaseRepId,
    subleaseRepDob,
    subleaseRepPhone,
    subleasePoaNumber,
    subtenantName,
    subtenantId,
    subtenantDob,
    subtenantPhone,
    ownerId,
    ownerDob,
    ownerPhone,
    tenantId,
    tenantDob,
    tenantPhone,
    propertyLocation,
    propertyMapUrl,
    streetName,
    floor,
    unitNumber,
    furnished,
    rooms,
    bathrooms,
    acs,
    majlis,
    kitchens,
    unitType,
    area,
    rentAmount,
    paymentMethod,
    contractDuration,
    contractDurationOther: contractDuration === 'مدة أخرى' ? contractDurationOther : '',
    startDate,
    hasDeposit,
    depositAmount: hasDeposit === 'نعم' ? depositAmount : null,
    submitterName,
    submitterPhone,
    submitterRelation,
    declarationAccepted: true,
  };

  return { ok: Object.keys(errors).length === 0, errors, data };
}

function displayUnitType(data) {
  return data.unitType || '—';
}

function displayFloor(data) {
  if (data.floor === '' || data.floor == null) return '—';
  return String(data.floor);
}

function displayDuration(data) {
  if (data.contractDuration === 'مدة أخرى' && data.contractDurationOther) return data.contractDurationOther;
  return data.contractDuration || '—';
}

function displayDeposit(data) {
  if (data.hasDeposit === 'نعم') {
    return data.depositAmount != null ? `${data.depositAmount} ريال` : 'نعم';
  }
  return data.hasDeposit || 'لا';
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—';
}

module.exports = {
  SCHEMA,
  CONTRACT_KINDS,
  PAYMENT_METHODS,
  RESIDENTIAL_UNITS,
  COMMERCIAL_UNITS,
  PROPERTY_TYPES,
  RESIDENTIAL_PROPERTY_TYPES,
  COMMERCIAL_PROPERTY_TYPES,
  FLOOR_NUMBERS,
  FURNISHED_OPTIONS,
  FLOORS,
  DURATIONS,
  YES_NO,
  SUBMITTER_RELATIONS,
  CONTRACTING_STATUSES,
  STATUS_LABELS,
  ALLOWED_STATUSES,
  CREATED_CONTRACT_STATUSES,
  normalizeSaudiMobile,
  isValidSaudiMobile,
  isValidSaudiId,
  isValidIdOrEstablishment,
  isValidUnifiedNumber,
  isIsoDate,
  parsePositiveNumber,
  riyadhYmd,
  formatReference,
  parsePayload,
  isWizardPayload,
  flattenContractBody,
  resolveContractKind,
  contractKindFromPayload,
  validateAndNormalize,
  displayUnitType,
  displayFloor,
  displayDuration,
  displayDeposit,
  statusLabel,
};
