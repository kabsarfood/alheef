const SCHEMA = 'ejar_contract_v2';

const CONTRACT_KINDS = {
  residential: { label: 'سكني', price: 229 },
  commercial: { label: 'تجاري', price: 329 },
};

const PAYMENT_METHODS = ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'];
const RESIDENTIAL_UNITS = ['شقة', 'فيلا'];
const COMMERCIAL_UNITS = ['محل', 'مكتب', 'معرض', 'مستودع', 'وحدة تجارية أخرى'];
const FLOORS = ['أرضي', 'أول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'أعلى', 'أخرى'];
const DURATIONS = ['3 أشهر', '6 أشهر', 'سنة', 'سنتان', 'مدة أخرى'];
const YES_NO = ['لا', 'نعم'];

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

function contractKindFromPayload(data) {
  const raw = String(data?.contractKind || data?.contractType || '').trim();
  if (raw === 'commercial' || raw === 'تجاري') return 'commercial';
  if (raw === 'residential' || raw === 'سكني') return 'residential';
  return '';
}

function isDeclarationAccepted(value) {
  if (value === true || value === 1) return true;
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === 'on' || s === '1' || s === 'yes';
}

function validateAndNormalize(body) {
  const errors = {};
  const kindRaw = String(body?.contractKind || body?.contractType || '').trim();
  const contractKind = kindRaw === 'commercial' || kindRaw === 'تجاري'
    ? 'commercial'
    : kindRaw === 'residential' || kindRaw === 'سكني'
      ? 'residential'
      : '';
  if (!contractKind) errors.contractKind = 'نوع العقد مطلوب';

  const deedNumber = trimStr(body?.deedNumber, 40);
  if (deedNumber.length < 4) errors.deedNumber = 'يرجى إدخال رقم الصك';

  const deedDate = trimStr(body?.deedDate, 10);
  if (!isIsoDate(deedDate)) errors.deedDate = 'يرجى اختيار تاريخ الصك';

  const ownerId = String(body?.ownerId || '').replace(/\D/g, '');
  if (!isValidSaudiId(ownerId)) errors.ownerId = 'رقم هوية المالك غير صحيح';

  const ownerDob = trimStr(body?.ownerDob, 10);
  if (!isPastDate(ownerDob)) errors.ownerDob = 'يرجى إدخال تاريخ ميلاد المالك';

  const ownerPhone = normalizeSaudiMobile(body?.ownerPhone);
  if (!isValidSaudiMobile(ownerPhone)) errors.ownerPhone = 'رقم جوال المالك غير صحيح';

  const tenantId = String(body?.tenantId || '').replace(/\D/g, '');
  if (!isValidSaudiId(tenantId)) errors.tenantId = 'رقم هوية المستأجر غير صحيح';

  const tenantDob = trimStr(body?.tenantDob, 10);
  if (!isPastDate(tenantDob)) errors.tenantDob = 'يرجى إدخال تاريخ ميلاد المستأجر';

  const tenantPhone = normalizeSaudiMobile(body?.tenantPhone);
  if (!isValidSaudiMobile(tenantPhone)) errors.tenantPhone = 'رقم جوال المستأجر غير صحيح';

  const unitOptions = contractKind === 'commercial' ? COMMERCIAL_UNITS : RESIDENTIAL_UNITS;
  const unitType = trimStr(body?.unitType, 40);
  if (!unitOptions.includes(unitType)) errors.unitType = 'يرجى اختيار نوع الوحدة';
  const unitTypeOther = trimStr(body?.unitTypeOther, 60);
  if (unitType === 'وحدة تجارية أخرى' && unitTypeOther.length < 2) {
    errors.unitTypeOther = 'يرجى تحديد نوع الوحدة التجارية';
  }

  const floor = trimStr(body?.floor, 20);
  if (!FLOORS.includes(floor)) errors.floor = 'يرجى اختيار رقم الدور';
  const floorOther = trimStr(body?.floorOther, 40);
  if (floor === 'أخرى' && floorOther.length < 1) errors.floorOther = 'يرجى تحديد الدور';

  const unitNumber = trimStr(body?.unitNumber, 30);
  if (!unitNumber) errors.unitNumber = 'يرجى إدخال رقم الوحدة';

  const area = parsePositiveNumber(body?.area);
  if (area == null || area > 100000) errors.area = 'المساحة يجب أن تكون رقمًا موجبًا';

  const rentAmount = parsePositiveNumber(body?.rentAmount);
  if (rentAmount == null || rentAmount > 100000000) errors.rentAmount = 'قيمة الإيجار يجب أن تكون أكبر من صفر';

  const paymentMethod = trimStr(body?.paymentMethod, 30);
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

  if (!isDeclarationAccepted(body?.declarationAccepted)) {
    errors.declarationAccepted = 'يلزم الإقرار بصحة البيانات قبل الإرسال';
  }

  const meta = CONTRACT_KINDS[contractKind] || CONTRACT_KINDS.residential;
  const data = {
    schema: SCHEMA,
    contractKind,
    contractType: meta.label,
    servicePrice: meta.price,
    deedNumber,
    deedDate,
    ownerId,
    ownerDob,
    ownerPhone,
    tenantId,
    tenantDob,
    tenantPhone,
    unitType,
    unitTypeOther: unitType === 'وحدة تجارية أخرى' ? unitTypeOther : '',
    floor,
    floorOther: floor === 'أخرى' ? floorOther : '',
    unitNumber,
    area,
    rentAmount,
    paymentMethod,
    contractDuration,
    contractDurationOther: contractDuration === 'مدة أخرى' ? contractDurationOther : '',
    startDate,
    hasDeposit,
    depositAmount: hasDeposit === 'نعم' ? depositAmount : null,
    declarationAccepted: true,
  };

  return { ok: Object.keys(errors).length === 0, errors, data };
}

function displayUnitType(data) {
  if (data.unitType === 'وحدة تجارية أخرى' && data.unitTypeOther) return data.unitTypeOther;
  return data.unitType || '—';
}

function displayFloor(data) {
  if (data.floor === 'أخرى' && data.floorOther) return data.floorOther;
  return data.floor || '—';
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
  FLOORS,
  DURATIONS,
  YES_NO,
  STATUS_LABELS,
  ALLOWED_STATUSES,
  CREATED_CONTRACT_STATUSES,
  normalizeSaudiMobile,
  isValidSaudiMobile,
  isValidSaudiId,
  isIsoDate,
  parsePositiveNumber,
  riyadhYmd,
  formatReference,
  parsePayload,
  isWizardPayload,
  contractKindFromPayload,
  validateAndNormalize,
  displayUnitType,
  displayFloor,
  displayDuration,
  displayDeposit,
  statusLabel,
};
