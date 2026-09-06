(function () {
  'use strict';

  var DRAFT_KEY = 'ejar_wizard_draft';
  var PAYMENT_METHODS = ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'];
  var GROUPED_PAYMENT_METHODS = ['شهري', 'كل 3 أشهر', 'نصف سنوي', 'سنوي'];
  var PROPERTY_TYPES = ['شقة', 'فيلا', 'عمارة', 'دور'];
  var RESIDENTIAL_PROPERTY_TYPES = ['شقة', 'فيلا', 'دور', 'عمارة', 'ملحق', 'استوديو', 'أخرى'];
  var COMMERCIAL_PROPERTY_TYPES = ['محل', 'مكتب', 'معرض', 'مستودع', 'ورشة', 'عمارة تجارية', 'مجمع تجاري', 'أخرى'];
  var FURNISHED_OPTIONS = ['مؤثث', 'غير مؤثث'];
  var DURATIONS = ['3 أشهر', '6 أشهر', 'سنة', 'سنتان', 'مدة أخرى'];
  var YES_NO = ['لا', 'نعم'];
  var SUBMITTER_RELATIONS = ['المستأجر', 'المؤجر', 'ابن/ابنة أحد الأطراف', 'وكيل'];
  var TRUST = '🔒 لا نطلب كلمة مرور منصة إيجار أو رمز نفاذ.';
  var DECLARATION = 'أقر بصحة البيانات المدخلة وأطلب من مكتب الهيف للخدمات العقارية إعداد عقد الإيجار عبر منصة إيجار وإرساله للأطراف للتوثيق.';
  var DISCLAIMER = 'مكتب الهيف للخدمات العقارية وسيط عقاري مرخص، وهذه الخدمة ليست الموقع الرسمي لمنصة إيجار.';
  var SECTIONS = [
    { id: 'ownership', title: 'بيانات الملكية', short: 'الملكية' },
    { id: 'sublease', title: 'عقد بالباطن', short: 'الباطن' },
    { id: 'subtenant', title: 'المستأجر من الباطن', short: 'من الباطن' },
    { id: 'owner', title: 'بيانات المؤجر', short: 'المؤجر' },
    { id: 'tenant', title: 'بيانات المستأجر', short: 'المستأجر' },
    { id: 'unit', title: 'بيانات العقار', short: 'العقار' },
    { id: 'finance', title: 'تفاصيل العقد', short: 'العقد' },
    { id: 'submitter', title: 'معبئ النموذج', short: 'المعبئ' },
    { id: 'review', title: 'مراجعة الطلب', short: 'المراجعة' },
  ];

  var root = null;
  var kind = 'residential';
  var dateMode = '';
  var dateModes = {};
  var stepIndex = 0;
  var screenIndex = 0;
  var answers = {};
  var submitting = false;
  var deedFile = null;
  var deedPreviewUrl = '';
  var DEED_MAX_MB = 32;
  var DEED_MAX_BYTES = DEED_MAX_MB * 1024 * 1024;
  var DEED_ACCEPT = 'image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,.avif';
  var openedFromHome = false;
  var resumePendingKind = 'residential';
  var viewportBound = false;
  var onViewportChange = null;

  function prices() {
    return {
      residential: window.EJAR_PRICE_RESIDENTIAL || 229,
      commercial: window.EJAR_PRICE_COMMERCIAL || 329,
    };
  }

  function normalizeKind(k) {
    if (k === 'commercial') return 'commercial';
    if (k === 'sublease') return 'sublease';
    return 'residential';
  }

  function titleFor(k) {
    if (k === 'sublease') return 'إنشاء عقد بالباطن';
    return k === 'commercial' ? 'إنشاء عقد إيجار تجاري' : 'إنشاء عقد إيجار سكني';
  }

  function shortTitleFor(k) {
    if (k === 'sublease') return 'عقد بالباطن';
    return k === 'commercial' ? 'إنشاء عقد تجاري' : 'إنشاء عقد سكني';
  }

  function priceText(k) {
    var p = prices();
    var n = k === 'commercial' ? p.commercial : p.residential;
    return n + ' ريال شامل الرسوم';
  }

  function rangeOptions(from, to) {
    var out = [];
    for (var i = from; i <= to; i += 1) out.push(String(i));
    return out;
  }

  function propertySteps() {
    return [
      { key: 'propertyLocation', section: 'unit', label: 'ما موقع العقار؟', type: 'text', inputmode: 'text' },
      { key: 'propertyMapUrl', section: 'unit', label: 'رابط موقع العقار (اختياري)', type: 'url' },
      { key: 'streetName', section: 'unit', label: 'ما اسم الشارع؟', type: 'text', inputmode: 'text' },
      { key: 'floor', section: 'unit', label: 'ما رقم الدور؟', type: 'select', options: rangeOptions(0, 10) },
      { key: 'unitNumber', section: 'unit', label: 'ما رقم الوحدة؟', type: 'text', inputmode: 'text' },
      { key: 'furnished', section: 'unit', label: 'هل العقار مؤثث؟', type: 'select', ui: 'cards', options: FURNISHED_OPTIONS },
      { key: 'rooms', section: 'unit', label: 'كم عدد الغرف؟', type: 'select', options: rangeOptions(1, 10) },
      { key: 'bathrooms', section: 'unit', label: 'كم عدد دورات المياه؟', type: 'select', options: rangeOptions(1, 5) },
      { key: 'acs', section: 'unit', label: 'كم عدد المكيفات؟', type: 'select', options: rangeOptions(0, 10) },
      { key: 'majlis', section: 'unit', label: 'كم عدد المجالس؟', type: 'select', options: rangeOptions(0, 10) },
      { key: 'kitchens', section: 'unit', label: 'كم عدد المطابخ؟', type: 'select', options: rangeOptions(0, 10) },
      { key: 'unitType', section: 'unit', label: 'ما نوع العقار؟', type: 'select', ui: 'cards', options: PROPERTY_TYPES },
      { key: 'area', section: 'unit', label: 'ما مساحة الوحدة؟', type: 'number', suffix: 'م²', min: 0 },
    ];
  }

  function getSteps(k) {
    var steps = [
      { key: 'deedNumber', section: 'ownership', label: 'ما رقم الصك؟', type: 'text', inputmode: 'numeric', autocomplete: 'off' },
      { key: 'deedDate', section: 'ownership', label: 'ما تاريخ الصك؟', type: 'date' },
    ];
    if (k === 'sublease') {
      steps.push(
        { key: 'subleaseTenantName', section: 'sublease', label: 'ما اسم المستأجر؟', type: 'text', inputmode: 'text' },
        { key: 'subleaseIdOrCr', section: 'sublease', label: 'ما رقم البطاقة أو المنشأة؟', type: 'text', inputmode: 'numeric' },
        { key: 'subleaseIdOrCrDate', section: 'sublease', label: 'ما تاريخ السجل أو البطاقة؟', type: 'date' },
        { key: 'subleaseUnifiedNumber', section: 'sublease', label: 'ما الرقم الموحد؟', type: 'text', inputmode: 'numeric' },
        { key: 'subleaseRepName', section: 'sublease', label: 'ما اسم الممثل؟', type: 'text', inputmode: 'text' },
        { key: 'subleaseRepId', section: 'sublease', label: 'ما رقم بطاقة الممثل؟', type: 'nid' },
        { key: 'subleaseRepDob', section: 'sublease', label: 'ما تاريخ ميلاد الممثل؟', type: 'date' },
        { key: 'subleaseRepPhone', section: 'sublease', label: 'ما رقم جوال الممثل؟', type: 'phone' },
        { key: 'subleasePoaNumber', section: 'sublease', label: 'ما رقم الوكالة؟', type: 'text', inputmode: 'text' },
        { key: 'subtenantName', section: 'subtenant', label: 'ما اسم المستأجر من الباطن؟', type: 'text', inputmode: 'text' },
        { key: 'subtenantId', section: 'subtenant', label: 'ما رقم بطاقة المستأجر من الباطن؟', type: 'nid' },
        { key: 'subtenantDob', section: 'subtenant', label: 'ما تاريخ ميلاد المستأجر من الباطن؟', type: 'date' },
        { key: 'subtenantPhone', section: 'subtenant', label: 'ما رقم جوال المستأجر من الباطن؟', type: 'phone' }
      );
    }
    steps.push(
      { key: 'ownerId', section: 'owner', label: 'ما رقم هوية المالك؟', type: 'nid' },
      { key: 'ownerDob', section: 'owner', label: 'ما تاريخ ميلاد المالك؟', type: 'date' },
      { key: 'ownerPhone', section: 'owner', label: 'ما رقم جوال المالك؟', type: 'phone' }
    );
    if (k !== 'sublease') {
      steps.push(
        { key: 'tenantId', section: 'tenant', label: 'ما رقم هوية المستأجر؟', type: 'nid' },
        { key: 'tenantDob', section: 'tenant', label: 'ما تاريخ ميلاد المستأجر؟', type: 'date' },
        { key: 'tenantPhone', section: 'tenant', label: 'ما رقم جوال المستأجر؟', type: 'phone' }
      );
    }
    steps.push.apply(steps, propertySteps());
    steps.push(
      { key: 'rentAmount', section: 'finance', label: 'ما قيمة الإيجار؟', type: 'number', suffix: 'ريال', min: 0 },
      { key: 'paymentMethod', section: 'finance', label: 'طريقة الدفع', type: 'select', ui: 'cards', options: PAYMENT_METHODS },
      {
        key: 'contractDuration',
        section: 'finance',
        label: 'ما مدة العقد؟',
        type: 'select',
        options: DURATIONS,
        otherKey: 'contractDurationOther',
        otherValue: 'مدة أخرى',
        otherLabel: 'حدد المدة',
      },
      { key: 'startDate', section: 'finance', label: 'ما تاريخ بداية العقد؟', type: 'date' },
      {
        key: 'hasDeposit',
        section: 'finance',
        label: 'هل يوجد مبلغ ضمان/تأمين؟',
        type: 'select',
        ui: 'cards',
        options: YES_NO,
        extraKey: 'depositAmount',
        extraValue: 'نعم',
        extraLabel: 'ما قيمة مبلغ الضمان؟',
        extraSuffix: 'ريال',
      },
      { key: 'submitterName', section: 'submitter', label: 'ما اسم معبئ النموذج التعاقدي؟', type: 'text', inputmode: 'text' },
      { key: 'submitterPhone', section: 'submitter', label: 'ما رقم جوال معبئ النموذج؟', type: 'phone' },
      {
        key: 'submitterRelation',
        section: 'submitter',
        label: 'ما صفتك بالنسبة لهذا العقد؟',
        type: 'select',
        ui: 'cards',
        options: SUBMITTER_RELATIONS,
      },
      { key: 'review', section: 'review', type: 'review' }
    );
    return steps;
  }

  function isGroupedKind() {
    return kind !== 'sublease';
  }

  function propertyTypesFor(k) {
    return k === 'commercial' ? COMMERCIAL_PROPERTY_TYPES : RESIDENTIAL_PROPERTY_TYPES;
  }

  function getScreens(k) {
    var unitTypes = propertyTypesFor(k);
    return [
      {
        id: 'ownership',
        title: 'بيانات الملكية',
        short: 'الملكية',
        fields: [
          { key: 'deedNumber', label: 'رقم الصك', type: 'text', inputmode: 'numeric', autocomplete: 'off' },
          { key: 'deedDate', label: 'تاريخ الصك', type: 'date' },
        ],
      },
      {
        id: 'owner',
        title: 'بيانات المؤجر',
        short: 'المؤجر',
        fields: [
          { key: 'ownerId', label: 'رقم الهوية / الإقامة', type: 'nid' },
          { key: 'ownerDob', label: 'تاريخ الميلاد', type: 'date' },
          { key: 'ownerPhone', label: 'رقم الجوال', type: 'phone' },
        ],
      },
      {
        id: 'tenant',
        title: 'بيانات المستأجر',
        short: 'المستأجر',
        fields: [
          { key: 'tenantId', label: 'رقم الهوية / الإقامة', type: 'nid' },
          { key: 'tenantDob', label: 'تاريخ الميلاد', type: 'date' },
          { key: 'tenantPhone', label: 'رقم الجوال', type: 'phone' },
        ],
      },
      {
        id: 'unit',
        title: 'العقار والوحدة',
        short: 'العقار',
        fields: [
          { key: 'unitType', label: 'نوع العقار', type: 'select', ui: 'cards', options: unitTypes },
          { key: 'unitNumber', label: 'رقم الوحدة / العقار', type: 'text', inputmode: 'text' },
          { key: 'floor', label: 'الدور', type: 'select', options: rangeOptions(0, 10) },
          { key: 'propertyMapUrl', label: 'رابط الموقع (اختياري)', type: 'url' },
          { key: 'rooms', label: 'عدد الغرف', type: 'stepper', min: 1, max: 10 },
          { key: 'bathrooms', label: 'عدد دورات المياه', type: 'stepper', min: 1, max: 5 },
          { key: 'acs', label: 'عدد المكيفات', type: 'stepper', min: 0, max: 10 },
          { key: 'kitchens', label: 'مطبخ', type: 'yesno' },
          { key: 'majlis', label: 'مجلس', type: 'yesno' },
        ],
      },
      {
        id: 'finance',
        title: 'تفاصيل العقد',
        short: 'العقد',
        fields: [
          { key: 'rentAmount', label: 'قيمة الإيجار', type: 'number', suffix: 'ريال', min: 0 },
          { key: 'startDate', label: 'تاريخ بداية العقد', type: 'date' },
          {
            key: 'contractDuration',
            label: 'مدة العقد',
            type: 'select',
            ui: 'cards',
            options: DURATIONS,
            otherKey: 'contractDurationOther',
            otherValue: 'مدة أخرى',
            otherLabel: 'حدد المدة',
          },
          { key: 'paymentMethod', label: 'طريقة الدفع', type: 'select', ui: 'cards', options: GROUPED_PAYMENT_METHODS },
          {
            key: 'hasDeposit',
            label: 'هل يوجد ضمان؟',
            type: 'select',
            ui: 'cards',
            options: YES_NO,
            extraKey: 'depositAmount',
            extraValue: 'نعم',
            extraLabel: 'مبلغ الضمان',
            extraSuffix: 'ريال',
          },
        ],
      },
      { id: 'review', title: 'مراجعة الطلب', short: 'المراجعة', type: 'review' },
    ];
  }

  function currentScreen() {
    return getScreens(kind)[screenIndex] || getScreens(kind)[0];
  }

  function sectionMeta(id) {
    for (var i = 0; i < SECTIONS.length; i += 1) {
      if (SECTIONS[i].id === id) return SECTIONS[i];
    }
    return { id: id, title: id, short: id };
  }

  function sectionOrder(steps) {
    var order = [];
    steps.forEach(function (step) {
      if (order.indexOf(step.section) === -1) order.push(step.section);
    });
    return order;
  }

  function sectionQuestionIndexes(steps, sectionId) {
    var indexes = [];
    steps.forEach(function (step, i) {
      if (step.section === sectionId && step.type !== 'review') indexes.push(i);
    });
    return indexes;
  }

  function sectionProgress(steps, index) {
    var step = steps[index] || {};
    var indexes = sectionQuestionIndexes(steps, step.section);
    var current = indexes.indexOf(index) + 1;
    var meta = sectionMeta(step.section);
    return {
      id: step.section,
      title: meta.title,
      short: meta.short,
      current: current > 0 ? current : 0,
      total: indexes.length,
      isReview: step.type === 'review',
    };
  }

  function stagesHtml(steps, index) {
    var currentSection = (steps[index] || {}).section;
    var order = sectionOrder(steps);
    var currentPos = order.indexOf(currentSection);
    return '<ol class="ejar-wizard__stages" aria-label="مراحل الطلب">'
      + order.map(function (id, i) {
        var meta = sectionMeta(id);
        var cls = 'ejar-wizard__stage';
        if (i < currentPos) cls += ' is-done';
        if (i === currentPos) cls += ' is-current';
        var mark = i <= currentPos ? '●' : '○';
        return '<li class="' + cls + '"' + (i === currentPos ? ' aria-current="step"' : '') + '>'
          + '<span class="ejar-wizard__stage-label">' + escapeHtml(meta.short) + '</span>'
          + '<span class="ejar-wizard__stage-mark" aria-hidden="true">' + mark + '</span>'
          + '</li>';
      }).join('')
      + '</ol>';
  }

  function groupedProgressHtml() {
    var screens = getScreens(kind);
    var screen = screens[screenIndex] || {};
    var inputTotal = screens.filter(function (s) { return s.type !== 'review'; }).length;
    var isReview = screen.type === 'review';
    var current = isReview ? inputTotal : screenIndex + 1;
    var pct = isReview ? 100 : Math.round((current / inputTotal) * 100);
    var stages = '<ol class="ejar-wizard__stages" aria-label="مراحل الطلب">'
      + screens.map(function (s, i) {
        var cls = 'ejar-wizard__stage';
        if (i < screenIndex) cls += ' is-done';
        if (i === screenIndex) cls += ' is-current';
        return '<li class="' + cls + '"' + (i === screenIndex ? ' aria-current="step"' : '') + '>'
          + '<span class="ejar-wizard__stage-label">' + escapeHtml(s.short) + '</span>'
          + '<span class="ejar-wizard__stage-mark" aria-hidden="true">' + (i <= screenIndex ? '●' : '○') + '</span>'
          + '</li>';
      }).join('')
      + '</ol>';
    var mobileText = isReview
      ? escapeHtml(screen.title)
      : escapeHtml(screen.title) + ' — ' + current + ' من ' + inputTotal;
    var desktopText = isReview
      ? ''
      : '<strong>' + escapeHtml(screen.title) + '</strong><span> ' + current + ' من ' + inputTotal + '</span>';
    return '<div class="ejar-wizard__progress">'
      + stages
      + '<p class="ejar-wizard__progress-text ejar-wizard__progress-text--mobile" aria-live="polite">' + mobileText + '</p>'
      + (isReview ? '' : '<div class="ejar-wizard__bar" aria-hidden="true"><div class="ejar-wizard__bar-fill" style="width:' + pct + '%"></div></div>')
      + '</div>'
      + (isReview ? '' : '<p class="ejar-wizard__progress-text ejar-wizard__progress-text--desktop" aria-live="polite">' + desktopText + '</p>');
  }

  function progressHtml(steps, index) {
    if (isGroupedKind()) return groupedProgressHtml();
    var stats = sectionProgress(steps, index);
    var pct = stats.isReview || !stats.total ? 100 : Math.round((stats.current / stats.total) * 100);
    var mobileText = stats.isReview
      ? escapeHtml(stats.title)
      : escapeHtml(stats.title) + ' — ' + stats.current + ' من ' + stats.total;
    var desktopText = stats.isReview
      ? ''
      : '<strong>' + escapeHtml(stats.title) + '</strong><span> السؤال ' + stats.current + ' من ' + stats.total + '</span>';
    return '<div class="ejar-wizard__progress">'
      + stagesHtml(steps, index)
      + '<p class="ejar-wizard__progress-text ejar-wizard__progress-text--mobile" aria-live="polite">' + mobileText + '</p>'
      + (stats.isReview ? '' : '<div class="ejar-wizard__bar" aria-hidden="true"><div class="ejar-wizard__bar-fill" style="width:' + pct + '%"></div></div>')
      + '</div>'
      + (stats.isReview ? '' : '<p class="ejar-wizard__progress-text ejar-wizard__progress-text--desktop" aria-live="polite">' + desktopText + '</p>');
  }

  function normalizeSaudiMobile(input) {
    var digits = String(input || '').replace(/\D/g, '');
    if (/^9665\d{8}$/.test(digits)) return '0' + digits.slice(3);
    if (/^05\d{8}$/.test(digits)) return digits;
    if (/^5\d{8}$/.test(digits)) return '0' + digits;
    return digits;
  }

  function isValidSaudiMobile(input) {
    return /^05\d{8}$/.test(normalizeSaudiMobile(input));
  }

  function isValidSaudiId(input) {
    var s = String(input || '').replace(/\D/g, '');
    if (!/^[12]\d{9}$/.test(s)) return false;
    var sum = 0;
    for (var i = 0; i < 10; i += 1) {
      var n = parseInt(s[i], 10);
      if (i % 2 === 0) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
    }
    return sum % 10 === 0;
  }

  function isValidIdOrEstablishment(input) {
    var s = String(input || '').replace(/\D/g, '');
    if (isValidSaudiId(s)) return true;
    return /^\d{7,15}$/.test(s);
  }

  function isValidUnifiedNumber(input) {
    var s = String(input || '').replace(/\D/g, '');
    return /^\d{7,15}$/.test(s);
  }

  function normalizeMapUrl(input) {
    var s = String(input || '').trim();
    if (!s) return '';
    if (/^(maps\.|goo\.gl\/|www\.)/i.test(s)) s = 'https://' + s;
    return s;
  }

  function isValidMapUrl(input) {
    var s = normalizeMapUrl(input);
    if (s.length < 12 || s.length > 800) return false;
    return /^https?:\/\/[^\s]+$/i.test(s);
  }

  function isDobField(key) {
    return key === 'ownerDob' || key === 'tenantDob' || key === 'subleaseRepDob' || key === 'subtenantDob';
  }

  function isPastLimitedDate(key) {
    return isDobField(key) || key === 'subleaseIdOrCrDate';
  }

  function isSublease() {
    return kind === 'sublease';
  }

  function clearSubleaseAnswers() {
    answers.subleaseTenantName = '';
    answers.subleaseIdOrCr = '';
    answers.subleaseIdOrCrDate = '';
    answers.subleaseUnifiedNumber = '';
    answers.subleaseRepName = '';
    answers.subleaseRepId = '';
    answers.subleaseRepDob = '';
    answers.subleaseRepPhone = '';
    answers.subleasePoaNumber = '';
    answers.subtenantName = '';
    answers.subtenantId = '';
    answers.subtenantDob = '';
    answers.subtenantPhone = '';
    delete dateModes.subleaseRepDob;
    delete dateModes.subleaseIdOrCrDate;
    delete dateModes.subtenantDob;
  }

  function syncSubleaseAnswers() {
    if (!isSublease()) clearSubleaseAnswers();
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    var parts = String(value).split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function positiveNumber(value) {
    var n = Number(String(value || '').replace(/,/g, '').trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function maskId(value) {
    var s = String(value || '').replace(/\D/g, '');
    if (s.length < 6) return value || '—';
    return s.charAt(0) + '******' + s.slice(-2);
  }

  function hasAnswers() {
    return Object.keys(answers).some(function (k) {
      return answers[k] !== '' && answers[k] != null && answers[k] !== false;
    });
  }

  function unitDataStarted() {
    return !!(answers.unitType || answers.floor || answers.unitNumber || answers.area
      || answers.propertyLocation || answers.propertyMapUrl || answers.streetName || answers.furnished
      || answers.rooms || answers.bathrooms || answers.acs || answers.majlis || answers.kitchens
      || answers.rentAmount || answers.paymentMethod || answers.contractDuration
      || answers.startDate || answers.hasDeposit);
  }

  function firstUnitStepIndex() {
    var steps = getSteps(kind);
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].section === 'unit') return i;
    }
    return 8;
  }

  function saveDraft() {
    if (!hasAnswers()) return;
    try {
      var payload = {
        v: 2,
        kind: kind,
        stepIndex: stepIndex,
        screenIndex: screenIndex,
        answers: answers,
        dateModes: dateModes,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (_) { /* noop */ }
  }

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY) || sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || (data.v !== 1 && data.v !== 2) || !data.answers || typeof data.answers !== 'object') return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function draftHasAnswers(data) {
    if (!data || !data.answers) return false;
    return Object.keys(data.answers).some(function (k) {
      return data.answers[k] !== '' && data.answers[k] != null && data.answers[k] !== false;
    });
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* noop */ }
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) { /* noop */ }
  }

  function screenIndexFromLegacyStep(k, idx) {
    var steps = getSteps(k);
    var step = steps[Math.max(0, Number(idx) || 0)] || {};
    var map = { ownership: 0, owner: 1, tenant: 2, unit: 3, finance: 4, submitter: 5, review: 5 };
    return map[step.section] != null ? map[step.section] : 0;
  }

  function applyDraft(data) {
    kind = normalizeKind(data.kind);
    answers = data.answers || {};
    dateModes = data.dateModes && typeof data.dateModes === 'object' ? data.dateModes : {};
    var maxStep = getSteps(kind).length - 1;
    stepIndex = Math.max(0, Math.min(Number(data.stepIndex) || 0, maxStep));
    var maxScreen = getScreens(kind).length - 1;
    if (isGroupedKind()) {
      if (data.v === 2 && data.screenIndex != null) {
        screenIndex = Math.max(0, Math.min(Number(data.screenIndex) || 0, maxScreen));
      } else {
        screenIndex = Math.max(0, Math.min(screenIndexFromLegacyStep(kind, data.stepIndex), maxScreen));
      }
    } else {
      screenIndex = 0;
    }
  }

  function resetMemory() {
    answers = {};
    stepIndex = 0;
    screenIndex = 0;
    dateMode = '';
    dateModes = {};
    submitting = false;
    clearDeedFile();
  }

  function resetForm() {
    resetMemory();
    clearDraft();
  }

  function syncVisualViewport() {
    if (!root || root.hidden) return;
    var mobile = window.matchMedia('(max-width: 767px)').matches;
    if (!mobile) {
      root.style.removeProperty('--ejar-vv-top');
      root.style.removeProperty('--ejar-vv-height');
      root.classList.remove('is-keyboard');
      return;
    }
    var vv = window.visualViewport;
    var top = 0;
    var height = window.innerHeight;
    if (vv) {
      top = Math.max(0, vv.offsetTop || 0);
      height = Math.max(240, Math.round(vv.height));
    }
    root.style.setProperty('--ejar-vv-top', top + 'px');
    root.style.setProperty('--ejar-vv-height', height + 'px');
    var layoutH = window.innerHeight || height;
    root.classList.toggle('is-keyboard', layoutH - height > 80);
  }

  function bindViewport() {
    if (viewportBound) {
      syncVisualViewport();
      return;
    }
    onViewportChange = syncVisualViewport;
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }
    viewportBound = true;
    syncVisualViewport();
  }

  function unbindViewport() {
    if (!viewportBound) return;
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);
    if (window.visualViewport && onViewportChange) {
      window.visualViewport.removeEventListener('resize', onViewportChange);
      window.visualViewport.removeEventListener('scroll', onViewportChange);
    }
    viewportBound = false;
    onViewportChange = null;
  }

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'ejar-wizard';
    root.className = 'ejar-wizard';
    root.hidden = true;
    root.setAttribute('dir', 'rtl');
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      if (e.target.closest('.ejar-wizard__close')) {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.target.classList && e.target.classList.contains('ejar-wizard__backdrop')) {
        requestClose();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !root.hidden) requestClose();
    });
    return root;
  }

  function requestClose() {
    if (submitting) return;
    if (root.querySelector('.ejar-wizard__success')) {
      close();
      return;
    }
    collectCurrent();
    if (hasAnswers()) {
      saveDraft();
      if (!window.confirm('هل تريد إغلاق النموذج؟ يمكنك متابعة الطلب لاحقًا.')) return;
    }
    close();
  }

  function clearDeedFile() {
    deedFile = null;
    if (deedPreviewUrl) {
      try { URL.revokeObjectURL(deedPreviewUrl); } catch (_) { /* noop */ }
    }
    deedPreviewUrl = '';
  }

  function showShell() {
    document.body.classList.add('ejar-wizard-open');
    var el = ensureRoot();
    el.hidden = false;
    el.classList.add('is-open');
    bindViewport();
    window.setTimeout(focusCurrent, 40);
  }

  function open(nextKind, options) {
    resetMemory();
    openedFromHome = !!(options && options.fromHome);
    resumePendingKind = normalizeKind(nextKind);
    var draft = readDraft();
    if (draftHasAnswers(draft) && normalizeKind(draft.kind) === resumePendingKind) {
      renderResume(draft);
      showShell();
      return;
    }
    kind = resumePendingKind;
    render();
    showShell();
  }

  function continueDraft(draft) {
    applyDraft(draft);
    render();
    showShell();
  }

  function startFresh() {
    clearDraft();
    resetMemory();
    kind = resumePendingKind;
    render();
    window.setTimeout(focusCurrent, 40);
  }

  function sanitizeUnitForKind() {
    var options = isGroupedKind() ? propertyTypesFor(kind) : PROPERTY_TYPES;
    if (answers.unitType && options.indexOf(answers.unitType) === -1) {
      answers.unitType = '';
      answers.unitTypeOther = '';
    }
  }

  function switchKind(nextKind) {
    if (kind === 'sublease') return;
    if (nextKind !== 'residential' && nextKind !== 'commercial') return;
    if (nextKind === kind) return;
    collectCurrent();
    var pastUnit = isGroupedKind() ? screenIndex >= 3 : stepIndex >= firstUnitStepIndex();
    if (unitDataStarted() || pastUnit) {
      if (!window.confirm('تغيير نوع العقد قد يمسح بيانات الوحدة غير المتوافقة. هل تريد المتابعة؟')) return;
    }
    kind = nextKind;
    sanitizeUnitForKind();
    saveDraft();
    render();
    focusCurrent();
  }

  function close() {
    if (hasAnswers() && !root.querySelector('.ejar-wizard__success')) saveDraft();
    resetMemory();
    unbindViewport();
    if (!root) return;
    root.hidden = true;
    root.classList.remove('is-open');
    document.body.classList.remove('ejar-wizard-open');
    if (openedFromHome) {
      openedFromHome = false;
      if (window.history.length > 1) window.history.back();
      else window.location.href = '/';
    }
  }

  function currentStep() {
    return getSteps(kind)[stepIndex];
  }

  function readFieldValue(key) {
    if (!root || !key) return answers[key];
    var input = root.querySelector('[data-wizard-field="' + key + '"]');
    return input ? input.value : answers[key];
  }

  function collectField(step) {
    if (!step || !step.key) return;
    var input = root.querySelector('[data-wizard-field="' + step.key + '"]');
    if (input) answers[step.key] = input.value;
    if (step.otherKey) {
      var other = root.querySelector('[data-wizard-field="' + step.otherKey + '"]');
      answers[step.otherKey] = other ? other.value.trim() : '';
    }
    if (step.extraKey) {
      var extra = root.querySelector('[data-wizard-field="' + step.extraKey + '"]');
      answers[step.extraKey] = extra ? extra.value.trim() : '';
    }
  }

  function collectReviewExtras() {
    var box = root.querySelector('#ejar-wizard-declaration');
    answers.declarationAccepted = !!(box && box.checked);
    if (!isGroupedKind()) return;
    var rel = root.querySelector('[data-wizard-field="submitterRelation"]');
    if (rel) answers.submitterRelation = rel.value;
    var name = root.querySelector('[data-wizard-field="submitterName"]');
    if (name) answers.submitterName = name.value.trim();
    var phone = root.querySelector('[data-wizard-field="submitterPhone"]');
    if (phone) answers.submitterPhone = phone.value.trim();
    syncSubmitterFromRelation();
  }

  function syncSubmitterFromRelation() {
    if (answers.submitterRelation === 'المؤجر') {
      answers.submitterPhone = answers.ownerPhone || answers.submitterPhone;
    } else if (answers.submitterRelation === 'المستأجر') {
      answers.submitterPhone = answers.tenantPhone || answers.submitterPhone;
    }
  }

  function needsSubmitterDetails() {
    return answers.submitterRelation === 'وكيل' || answers.submitterRelation === 'ابن/ابنة أحد الأطراف';
  }

  function collectCurrent() {
    if (!root) return;
    if (isGroupedKind()) {
      var screen = currentScreen();
      if (!screen) return;
      if (screen.type === 'review') {
        collectReviewExtras();
        return;
      }
      (screen.fields || []).forEach(collectField);
      return;
    }
    var step = currentStep();
    if (!step) return;
    if (step.type === 'review') {
      collectReviewExtras();
      return;
    }
    collectField(step);
  }

  function validateStep(step) {
    var value = String(answers[step.key] || '').trim();
    if (step.type === 'review') {
      if (!answers.declarationAccepted) return 'يلزم الإقرار بصحة البيانات قبل الإرسال';
      return '';
    }
    if (step.type === 'nid') {
      if (!isValidSaudiId(value)) return 'يرجى إدخال رقم هوية سعودي صحيح (10 أرقام يبدأ بـ 1 أو 2)';
      return '';
    }
    if (step.type === 'phone') {
      if (!isValidSaudiMobile(value)) return 'يرجى إدخال رقم جوال سعودي صحيح (مثال: 05xxxxxxxx)';
      return '';
    }
    if (step.type === 'url') {
      if (!value) return '';
      if (!isValidMapUrl(value)) return 'يرجى لصق رابط موقع العقار بشكل صحيح';
      return '';
    }
    if (step.type === 'date') {
      var mode = dateModes[step.key] || dateMode;
      if (!mode) return 'يرجى اختيار نوع التقويم أولاً (هجري أو ميلادي)';
      if (!isIsoDate(value)) return 'يرجى اختيار التاريخ';
      if (isPastLimitedDate(step.key) && value > todayIso()) {
        return isDobField(step.key) ? 'تاريخ الميلاد يجب أن يكون في الماضي' : 'يرجى اختيار تاريخ صحيح في الماضي';
      }
      return '';
    }
    if (step.type === 'number') {
      if (positiveNumber(value) == null) return step.key === 'area' ? 'المساحة يجب أن تكون رقمًا موجبًا' : 'القيمة يجب أن تكون أكبر من صفر';
      return '';
    }
    if (step.type === 'stepper') {
      var n = parseInt(value, 10);
      if (!Number.isInteger(n) || n < step.min || n > step.max) {
        return 'يرجى تحديد ' + (step.label || 'القيمة');
      }
      return '';
    }
    if (step.type === 'yesno') {
      if (value !== '0' && value !== '1') return 'يرجى اختيار نعم أو لا';
      return '';
    }
    if (step.type === 'select') {
      if (!step.options.includes(value)) return 'يرجى اختيار قيمة';
      if (step.otherValue && value === step.otherValue && !String(answers[step.otherKey] || '').trim()) {
        return step.otherLabel || 'يرجى تعبئة الحقل الإضافي';
      }
      if (step.extraValue && value === step.extraValue && positiveNumber(answers[step.extraKey]) == null) {
        return 'يرجى إدخال قيمة مبلغ الضمان';
      }
      return '';
    }
    if (!value) return 'هذا الحقل مطلوب';
    if (step.key === 'deedNumber' && value.length < 4) return 'يرجى إدخال رقم الصك';
    if (step.key === 'submitterName' && value.length < 2) return 'يرجى إدخال اسم معبئ النموذج';
    if ((step.key === 'propertyLocation' || step.key === 'streetName') && value.length < 2) {
      return step.key === 'streetName' ? 'يرجى إدخال اسم الشارع' : 'يرجى إدخال موقع العقار';
    }
    if (step.key === 'subleaseTenantName' && value.length < 2) return 'يرجى إدخال اسم المستأجر';
    if (step.key === 'subleaseIdOrCr' && !isValidIdOrEstablishment(value)) {
      return 'يرجى إدخال رقم بطاقة أو منشأة صحيح';
    }
    if (step.key === 'subleaseUnifiedNumber' && !isValidUnifiedNumber(value)) {
      return 'يرجى إدخال الرقم الموحد بشكل صحيح';
    }
    if (step.key === 'subleaseRepName' && value.length < 2) return 'يرجى إدخال اسم الممثل';
    if (step.key === 'subleasePoaNumber' && value.length < 2) return 'يرجى إدخال رقم الوكالة';
    if (step.key === 'subtenantName' && value.length < 2) return 'يرجى إدخال اسم المستأجر من الباطن';
    return '';
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function restoreDateModeForStep(step) {
    if (!step || step.type !== 'date') {
      dateMode = '';
      return;
    }
    dateMode = dateModes[step.key] === 'hijri' || dateModes[step.key] === 'gregorian'
      ? dateModes[step.key]
      : '';
  }

  function restoreDateModeForScreen(screen) {
    var dateField = (screen && screen.fields || []).filter(function (f) { return f.type === 'date'; })[0];
    restoreDateModeForStep(dateField);
  }

  function normalizeAnswer(step) {
    if (!step || !step.key) return;
    if (step.type === 'nid') answers[step.key] = String(answers[step.key] || '').replace(/\D/g, '');
    if (step.type === 'url') answers[step.key] = normalizeMapUrl(answers[step.key]);
    if (step.type === 'phone') answers[step.key] = normalizeSaudiMobile(answers[step.key]);
    if (step.key === 'subleaseIdOrCr' || step.key === 'subleaseUnifiedNumber') {
      answers[step.key] = String(answers[step.key] || '').replace(/\D/g, '');
    }
  }

  function enterStep(index) {
    var steps = getSteps(kind);
    stepIndex = Math.max(0, Math.min(index, steps.length - 1));
    restoreDateModeForStep(currentStep());
    render();
    focusCurrent();
  }

  function enterScreen(index) {
    var screens = getScreens(kind);
    screenIndex = Math.max(0, Math.min(index, screens.length - 1));
    restoreDateModeForScreen(screens[screenIndex]);
    render();
    focusCurrent();
  }

  function goTo(index) {
    collectCurrent();
    saveDraft();
    if (isGroupedKind()) enterScreen(index);
    else enterStep(index);
  }

  function validateReviewGrouped() {
    var errors = [];
    if (!SUBMITTER_RELATIONS.includes(answers.submitterRelation)) {
      errors.push({ key: 'submitterRelation', message: 'يرجى تحديد من يقوم بتعبئة الطلب' });
    } else if (needsSubmitterDetails()) {
      if (String(answers.submitterName || '').trim().length < 2) {
        errors.push({ key: 'submitterName', message: 'يرجى إدخال اسم معبئ النموذج' });
      }
      if (!isValidSaudiMobile(answers.submitterPhone)) {
        errors.push({ key: 'submitterPhone', message: 'يرجى إدخال رقم جوال سعودي صحيح' });
      }
    }
    if (!answers.declarationAccepted) {
      errors.push({ key: 'declarationAccepted', message: 'يلزم الإقرار بصحة البيانات قبل الإرسال' });
    }
    return errors;
  }

  function next() {
    collectCurrent();
    if (isGroupedKind()) {
      var screen = currentScreen();
      var errors = [];
      if (screen.type === 'review') {
        errors = validateReviewGrouped();
      } else {
        (screen.fields || []).forEach(function (field) {
          var err = validateStep(field);
          if (err) errors.push({ key: field.key, message: err });
        });
      }
      if (errors.length) {
        showFieldErrors(errors);
        return;
      }
      (screen.fields || []).forEach(normalizeAnswer);
      saveDraft();
      var screens = getScreens(kind);
      if (screenIndex >= screens.length - 1) {
        submit();
        return;
      }
      enterScreen(screenIndex + 1);
      return;
    }
    var step = currentStep();
    var err = validateStep(step);
    if (err) {
      showError(err);
      return;
    }
    normalizeAnswer(step);
    saveDraft();
    var steps = getSteps(kind);
    if (stepIndex >= steps.length - 1) {
      submit();
      return;
    }
    enterStep(stepIndex + 1);
  }

  function prev() {
    collectCurrent();
    saveDraft();
    if (isGroupedKind()) {
      if (screenIndex <= 0) return;
      enterScreen(screenIndex - 1);
      return;
    }
    if (stepIndex <= 0) return;
    enterStep(stepIndex - 1);
  }

  function clearFieldErrors() {
    if (!root) return;
    root.querySelectorAll('.ejar-field__error').forEach(function (el) {
      el.textContent = '';
      el.hidden = true;
    });
    root.querySelectorAll('[aria-invalid="true"]').forEach(function (el) {
      el.removeAttribute('aria-invalid');
    });
    root.querySelectorAll('.ejar-field.is-invalid').forEach(function (el) {
      el.classList.remove('is-invalid');
    });
  }

  function showFieldErrors(errors) {
    clearFieldErrors();
    var first = errors[0];
    if (first) showError(first.message);
    errors.forEach(function (item) {
      var wrap = root.querySelector('.ejar-field[data-field="' + item.key + '"]');
      if (!wrap) return;
      wrap.classList.add('is-invalid');
      var msg = wrap.querySelector('.ejar-field__error');
      if (msg) {
        msg.textContent = item.message;
        msg.hidden = false;
      }
      var field = wrap.querySelector('[data-wizard-field]:not([type="hidden"]), [data-wizard-field]');
      if (field) field.setAttribute('aria-invalid', 'true');
    });
    var firstWrap = first && root.querySelector('.ejar-field[data-field="' + first.key + '"]');
    var firstField = firstWrap && firstWrap.querySelector('input:not([type="hidden"]), select, button.ejar-choice__card, .ejar-stepper__btn');
    if (firstField && typeof firstField.focus === 'function' && first && first.key && !isDateField(first.key)) {
      try { firstField.focus({ preventScroll: true }); } catch (_) { firstField.focus(); }
    }
    if (firstWrap && firstWrap.scrollIntoView) {
      firstWrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function showError(text) {
    var el = root.querySelector('.ejar-wizard__error');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    if (isGroupedKind()) return;
    var step = currentStep();
    if (step && step.type === 'date') return;
    var field = root.querySelector('[data-wizard-field]:not([type="hidden"])');
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function hideError() {
    var el = root.querySelector('.ejar-wizard__error');
    if (el) {
      el.textContent = '';
      el.hidden = true;
    }
    clearFieldErrors();
  }

  function refreshDatePreview(iso, picker) {
    var preview = (picker || root) && (picker || root).querySelector('.ejar-date-preview, #ejar-date-preview');
    if (!preview) return;
    preview.innerHTML = dualDateHtml(iso);
  }

  function pickerFieldKey(picker) {
    return (picker && (picker.getAttribute('data-field-key') || (picker.querySelector('[data-wizard-field]') || {}).getAttribute && picker.querySelector('[data-wizard-field]').getAttribute('data-wizard-field'))) || '';
  }

  function clearDateValue(picker) {
    picker = picker || (root && root.querySelector('.ejar-date-picker'));
    if (!picker) return;
    var hidden = picker.querySelector('[data-wizard-field]');
    var gregorian = picker.querySelector('[data-date-gregorian], #ejar-date-gregorian');
    var yearEl = picker.querySelector('[data-hijri="year"]');
    var monthEl = picker.querySelector('[data-hijri="month"]');
    var dayEl = picker.querySelector('[data-hijri="day"]');
    if (hidden) {
      hidden.value = '';
      var key = hidden.getAttribute('data-wizard-field');
      if (key) answers[key] = '';
    }
    if (gregorian) gregorian.value = '';
    if (yearEl) yearEl.value = '';
    if (monthEl) monthEl.value = '';
    if (dayEl) dayEl.value = '';
    refreshDatePreview('', picker);
  }

  function applyDateMode(mode, picker) {
    picker = picker || (root && root.querySelector('.ejar-date-picker'));
    if (!picker) return;
    var key = pickerFieldKey(picker);
    var nextMode = mode === 'hijri' || mode === 'gregorian' ? mode : '';
    var stored = key ? dateModes[key] : '';
    if (nextMode && stored && stored !== nextMode) {
      clearDateValue(picker);
    }
    dateMode = nextMode;
    if (key && dateMode) {
      dateModes[key] = dateMode;
      saveDraft();
    } else if (key) {
      saveDraft();
    }
    picker.setAttribute('data-date-mode', dateMode);
    var hijri = picker.querySelector('[data-date-panel="hijri"]');
    var gregorian = picker.querySelector('[data-date-panel="gregorian"]');
    var hint = picker.querySelector('.ejar-date-chooser__hint');
    var changeBtn = picker.querySelector('.ejar-date-chooser__change');
    var radios = picker.querySelector('.ejar-date-radios');
    picker.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.checked = !!(dateMode && input.value === dateMode);
    });
    if (radios) radios.hidden = !!dateMode;
    if (hijri) hijri.hidden = dateMode !== 'hijri';
    if (gregorian) gregorian.hidden = dateMode !== 'gregorian';
    if (changeBtn) changeBtn.hidden = !dateMode;
    if (hint) {
      hint.textContent = !dateMode
        ? 'اختر نوع التاريخ'
        : (dateMode === 'hijri' ? 'التاريخ الهجري' : 'التاريخ الميلادي');
    }
  }

  function revealDateTypeChooser(picker) {
    picker = picker || (root && root.querySelector('.ejar-date-picker'));
    if (!picker) return;
    var key = pickerFieldKey(picker);
    if (key) dateModes[key] = '';
    dateMode = '';
    var hijri = picker.querySelector('[data-date-panel="hijri"]');
    var gregorian = picker.querySelector('[data-date-panel="gregorian"]');
    var hint = picker.querySelector('.ejar-date-chooser__hint');
    var changeBtn = picker.querySelector('.ejar-date-chooser__change');
    var radios = picker.querySelector('.ejar-date-radios');
    picker.setAttribute('data-date-mode', '');
    picker.querySelectorAll('input[type="radio"]').forEach(function (input) {
      input.checked = false;
    });
    if (radios) radios.hidden = false;
    if (hijri) hijri.hidden = true;
    if (gregorian) gregorian.hidden = true;
    if (changeBtn) changeBtn.hidden = true;
    if (hint) hint.textContent = 'اختر نوع التاريخ';
  }

  function bindDateChooser() {
    if (!root) return;
    root.querySelectorAll('.ejar-date-picker').forEach(function (picker) {
      picker.querySelectorAll('input[type="radio"]').forEach(function (input) {
        function choose() {
          if (!input.checked) return;
          applyDateMode(input.value, picker);
          hideError();
        }
        input.addEventListener('change', choose);
        input.addEventListener('click', choose);
      });
      var changeBtn = picker.querySelector('.ejar-date-chooser__change');
      if (changeBtn) {
        changeBtn.addEventListener('click', function () {
          revealDateTypeChooser(picker);
        });
      }
      var key = pickerFieldKey(picker);
      var mode = (key && dateModes[key]) || dateMode;
      applyDateMode(mode, picker);
    });
  }

  function bindDatePicker() {
    var Dates = window.EjarDates;
    if (!root || !Dates) return;
    root.querySelectorAll('.ejar-date-picker').forEach(function (picker) {
    var maxIso = picker.getAttribute('data-max-iso') || '';
    var hidden = picker.querySelector('[data-wizard-field]');
    var yearEl = picker.querySelector('[data-hijri="year"]');
    var monthEl = picker.querySelector('[data-hijri="month"]');
    var dayEl = picker.querySelector('[data-hijri="day"]');
    var gregorian = picker.querySelector('[data-date-gregorian], #ejar-date-gregorian');

    function setIso(iso) {
      if (maxIso && iso && iso > maxIso) iso = maxIso;
      if (hidden) {
        hidden.value = iso || '';
        answers[hidden.getAttribute('data-wizard-field')] = hidden.value;
      }
      if (gregorian && gregorian.value !== (iso || '')) gregorian.value = iso || '';
      refreshDatePreview(iso || '', picker);
      saveDraft();
      hideError();
    }

    function applyHijri() {
      if (!yearEl || !monthEl || !dayEl) return;
      if (!yearEl.value || !monthEl.value || !dayEl.value) {
        setIso('');
        return;
      }
      var date = Dates.hijriToDate(yearEl.value, monthEl.value, dayEl.value);
      setIso(date ? Dates.toIso(date) : '');
    }

    function refreshHijriDays() {
      if (!dayEl) return;
      var selected = dayEl.value;
      dayEl.innerHTML = Dates.dayOptions(yearEl && yearEl.value, monthEl && monthEl.value, selected);
      if (yearEl.value && monthEl.value && dayEl.value) applyHijri();
    }

    if (yearEl) yearEl.addEventListener('change', refreshHijriDays);
    if (monthEl) monthEl.addEventListener('change', refreshHijriDays);
    if (dayEl) dayEl.addEventListener('change', applyHijri);
    if (gregorian) {
      gregorian.addEventListener('input', function () {
        setIso(gregorian.value);
        Dates.fillHijriSelects(picker, gregorian.value);
      });
      gregorian.addEventListener('change', function () {
        setIso(gregorian.value);
        Dates.fillHijriSelects(picker, gregorian.value);
      });
    }
    });
  }

  function deedExt(file) {
    return String(file && file.name || '').split('.').pop().toLowerCase();
  }

  function isDeedPdf(file) {
    if (!file) return false;
    if (/^application\/pdf$/i.test(file.type || '')) return true;
    return deedExt(file) === 'pdf';
  }

  function isDeedImage(file) {
    if (!file) return false;
    if (/^image\//i.test(file.type || '') && !/svg/i.test(file.type || '')) return true;
    return /^(jpe?g|png|webp|gif|bmp|tif|tiff|heic|heif|avif)$/i.test(deedExt(file));
  }

  function isAllowedDeedFile(file) {
    if (!file) return false;
    if (isDeedPdf(file) || isDeedImage(file)) return true;
    return !file.type && !deedExt(file);
  }

  function canPreviewDeedImage(file) {
    if (!file || isDeedPdf(file)) return false;
    return /^(image\/(jpeg|jpg|pjpeg|png|webp|gif|bmp|avif)|)$/i.test(file.type || '') && !/^(heic|heif)$/i.test(deedExt(file));
  }

  function bindDeedUpload() {
    var input = root.querySelector('#ejar-deed-file');
    if (!input) return;
    var preview = root.querySelector('.ejar-deed-upload__preview');
    var img = preview && preview.querySelector('img');
    var fileBadge = preview && preview.querySelector('.ejar-deed-upload__file');
    var nameEl = root.querySelector('.ejar-deed-upload__name');
    var removeBtn = root.querySelector('#ejar-deed-remove');

    function showPreview() {
      if (!preview) return;
      if (!deedFile) {
        preview.hidden = true;
        if (img) img.removeAttribute('src');
        if (fileBadge) fileBadge.hidden = true;
        if (nameEl) nameEl.textContent = '';
        return;
      }
      preview.hidden = false;
      if (nameEl) nameEl.textContent = deedFile.name || '';
      if (canPreviewDeedImage(deedFile) && deedPreviewUrl && img) {
        img.hidden = false;
        img.src = deedPreviewUrl;
        if (fileBadge) fileBadge.hidden = true;
      } else {
        if (img) {
          img.hidden = true;
          img.removeAttribute('src');
        }
        if (fileBadge) {
          fileBadge.hidden = false;
          fileBadge.textContent = isDeedPdf(deedFile) ? 'ملف PDF جاهز للرفع' : 'المرفق جاهز للرفع';
        }
      }
    }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > DEED_MAX_BYTES) {
        showError('حجم المرفق كبير. الحد الأقصى ' + DEED_MAX_MB + ' ميجا.');
        input.value = '';
        return;
      }
      if (!isAllowedDeedFile(file)) {
        showError('صيغة المرفق غير مدعومة. ارفع صورة أو ملف PDF.');
        input.value = '';
        return;
      }
      if (deedPreviewUrl) {
        try { URL.revokeObjectURL(deedPreviewUrl); } catch (_) { /* noop */ }
      }
      deedFile = file;
      deedPreviewUrl = URL.createObjectURL(file);
      hideError();
      showPreview();
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        clearDeedFile();
        input.value = '';
        showPreview();
      });
    }
  }

  function focusCurrent() {
    if (isGroupedKind()) {
      var screen = currentScreen();
      if (screen && screen.type === 'review') return;
      var firstDate = screen && (screen.fields || []).some(function (f) { return f.type === 'date'; });
      if (firstDate) return;
    } else {
      var step = currentStep();
      if (step && step.type === 'date') return;
    }
    var field = root && root.querySelector('[data-wizard-field]:not([type="hidden"]), #ejar-wizard-declaration, .ejar-wizard__next');
    if (field && typeof field.focus === 'function') {
      try { field.focus({ preventScroll: true }); } catch (_) { field.focus(); }
    }
  }

  function optionHtml(options, selected) {
    return '<option value="">اختر</option>' + options.map(function (opt) {
      return '<option value="' + escapeHtml(opt) + '"' + (selected === opt ? ' selected' : '') + '>' + escapeHtml(opt) + '</option>';
    }).join('');
  }

  function cardOptions(step) {
    if (step.key === 'hasDeposit') return ['نعم', 'لا'];
    return step.options || [];
  }

  function fieldId(step) {
    return 'ejar-field-' + step.key;
  }

  function followHtml(step, value) {
    var extra = '';
    if (step.otherKey) {
      extra += '<div class="ejar-wizard__follow"' + (value === step.otherValue ? '' : ' hidden') + ' data-follow="' + step.otherKey + '">'
        + '<label for="ejar-follow-' + step.otherKey + '">' + escapeHtml(step.otherLabel) + '</label>'
        + '<input class="ejar-wizard__control" id="ejar-follow-' + step.otherKey + '" data-wizard-field="' + step.otherKey + '" type="text" value="' + escapeHtml(answers[step.otherKey] || '') + '">'
        + '</div>';
    }
    if (step.extraKey) {
      extra += '<div class="ejar-wizard__follow"' + (value === step.extraValue ? '' : ' hidden') + ' data-follow="' + step.extraKey + '">'
        + '<label for="ejar-follow-' + step.extraKey + '">' + escapeHtml(step.extraLabel) + '</label>'
        + '<div class="ejar-wizard__affix"><input class="ejar-wizard__control" id="ejar-follow-' + step.extraKey + '" data-wizard-field="' + step.extraKey + '" type="number" inputmode="decimal" min="1" step="any" value="' + escapeHtml(answers[step.extraKey] || '') + '"><span>' + escapeHtml(step.extraSuffix || '') + '</span></div>'
        + '</div>';
    }
    return extra;
  }

  function cardsHtml(step) {
    var value = answers[step.key] || '';
    var options = cardOptions(step);
    var countClass = options.length <= 2 ? 'ejar-choice--2' : (options.length <= 4 ? 'ejar-choice--4' : 'ejar-choice--grid');
    return '<div class="ejar-choice ' + countClass + '" data-choice-group="' + step.key + '" role="group" aria-label="' + escapeHtml(step.label) + '">'
      + '<input type="hidden" id="' + fieldId(step) + '" data-wizard-field="' + step.key + '" value="' + escapeHtml(value) + '">'
      + options.map(function (opt) {
        var selected = value === opt;
        return '<button type="button" class="ejar-choice__card' + (selected ? ' is-selected' : '') + '" data-choice="' + escapeHtml(opt) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">'
          + escapeHtml(opt)
          + '</button>';
      }).join('')
      + '</div>'
      + followHtml(step, value);
  }

  function stepperHtml(step) {
    var min = step.min;
    var max = step.max;
    var raw = answers[step.key];
    var value = raw === '' || raw == null ? String(min) : String(raw);
    if (answers[step.key] == null || answers[step.key] === '') answers[step.key] = value;
    return '<div class="ejar-stepper" data-stepper="' + step.key + '">'
      + '<button type="button" class="ejar-stepper__btn" data-stepper-dir="-1" aria-label="إنقاص">−</button>'
      + '<input class="ejar-wizard__control ejar-stepper__value" id="' + fieldId(step) + '" data-wizard-field="' + step.key + '" type="text" inputmode="numeric" readonly value="' + escapeHtml(value) + '">'
      + '<button type="button" class="ejar-stepper__btn" data-stepper-dir="1" aria-label="زيادة">+</button>'
      + '</div>';
  }

  function yesNoHtml(step) {
    var value = String(answers[step.key] == null ? '' : answers[step.key]);
    return '<div class="ejar-choice ejar-choice--2" data-choice-group="' + step.key + '" role="group" aria-label="' + escapeHtml(step.label) + '">'
      + '<input type="hidden" id="' + fieldId(step) + '" data-wizard-field="' + step.key + '" value="' + escapeHtml(value) + '">'
      + '<button type="button" class="ejar-choice__card' + (value === '1' ? ' is-selected' : '') + '" data-choice="1" aria-pressed="' + (value === '1' ? 'true' : 'false') + '">نعم</button>'
      + '<button type="button" class="ejar-choice__card' + (value === '0' ? ' is-selected' : '') + '" data-choice="0" aria-pressed="' + (value === '0' ? 'true' : 'false') + '">لا</button>'
      + '</div>';
  }

  function inputHtml(step) {
    var value = answers[step.key] || '';
    var id = fieldId(step);
    if (step.type === 'stepper') return stepperHtml(step);
    if (step.type === 'yesno') return yesNoHtml(step);
    if (step.type === 'select' && step.ui === 'cards') return cardsHtml(step);
    if (step.type === 'select') {
      return '<select class="ejar-wizard__control" id="' + id + '" data-wizard-field="' + step.key + '" required>'
        + optionHtml(step.options, value) + '</select>'
        + followHtml(step, value);
    }
    if (step.type === 'date') {
      var max = isPastLimitedDate(step.key) ? todayIso() : '';
      var mode = dateModes[step.key] || dateMode;
      if (window.EjarDates && typeof window.EjarDates.pickerHtml === 'function') {
        return window.EjarDates.pickerHtml({
          iso: value,
          maxIso: max,
          fieldKey: step.key,
          mode: mode,
        });
      }
      return '<input class="ejar-wizard__control ejar-wizard__control--date" id="' + id + '" data-wizard-field="' + step.key + '" type="date" dir="ltr" value="' + escapeHtml(value) + '"' + (max ? ' max="' + max + '"' : '') + ' required>'
        + '<div class="ejar-date-preview">' + dualDateHtml(value) + '</div>';
    }
    if (step.type === 'url') {
      return '<input class="ejar-wizard__control" id="' + id + '" data-wizard-field="' + step.key + '" type="url" dir="ltr" inputmode="url" maxlength="800" placeholder="https://maps.app.goo.gl/..." autocomplete="off" value="' + escapeHtml(value) + '">';
    }
    if (step.type === 'phone') {
      return '<input class="ejar-wizard__control" id="' + id + '" data-wizard-field="' + step.key + '" type="tel" dir="ltr" inputmode="tel" maxlength="14" placeholder="05xxxxxxxx" autocomplete="tel" value="' + escapeHtml(value) + '" required>';
    }
    if (step.type === 'nid') {
      return '<input class="ejar-wizard__control" id="' + id + '" data-wizard-field="' + step.key + '" type="text" dir="ltr" inputmode="numeric" maxlength="10" placeholder="1xxxxxxxxx" autocomplete="off" value="' + escapeHtml(value) + '" required>';
    }
    if (step.type === 'number') {
      return '<div class="ejar-wizard__affix"><input class="ejar-wizard__control" id="' + id + '" data-wizard-field="' + step.key + '" type="number" inputmode="decimal" min="1" step="any" value="' + escapeHtml(value) + '" required><span>' + escapeHtml(step.suffix || '') + '</span></div>';
    }
    return '<input class="ejar-wizard__control" id="' + id + '" data-wizard-field="' + step.key + '" type="text" inputmode="' + (step.inputmode || 'text') + '" autocomplete="' + (step.autocomplete || 'off') + '" value="' + escapeHtml(value) + '" required>';
  }

  function fieldBlockHtml(step) {
    var wide = step.type === 'date' || step.type === 'url' || step.ui === 'cards' || step.key === 'unitType';
    return '<div class="ejar-field' + (wide ? ' ejar-field--wide' : '') + '" data-field="' + step.key + '">'
      + '<label' + (step.type === 'date' ? '' : ' for="' + fieldId(step) + '"') + '>' + escapeHtml(step.label) + '</label>'
      + inputHtml(step)
      + '<p class="ejar-field__error" hidden></p>'
      + '</div>';
  }

  function displayValue(key) {
    if (key === 'unitType') return answers.unitType || '—';
    if (key === 'floor') return answers.floor === '' || answers.floor == null ? '—' : String(answers.floor);
    if (key === 'furnished') return answers.furnished || '—';
    if (key === 'contractDuration') {
      if (answers.contractDuration === 'مدة أخرى' && answers.contractDurationOther) return answers.contractDurationOther;
      return answers.contractDuration || '—';
    }
    if (key === 'hasDeposit') {
      if (answers.hasDeposit === 'نعم') return answers.depositAmount ? answers.depositAmount + ' ريال' : 'نعم';
      return answers.hasDeposit || 'لا';
    }
    if (key === 'area') return answers.area ? answers.area + ' م²' : '—';
    if (key === 'rentAmount') return answers.rentAmount ? answers.rentAmount + ' ريال' : '—';
    if ((key === 'kitchens' || key === 'majlis') && isGroupedKind()) {
      if (String(answers[key]) === '1') return 'نعم';
      if (String(answers[key]) === '0') return 'لا';
    }
    return answers[key] || '—';
  }

  function dualDateHtml(iso) {
    if (window.EjarDates && typeof window.EjarDates.html === 'function') {
      return window.EjarDates.html(iso);
    }
    return iso ? '<span>' + escapeHtml(iso) + '</span>' : '—';
  }

  function isDateField(key) {
    return key === 'deedDate' || key === 'ownerDob' || key === 'tenantDob' || key === 'startDate'
      || key === 'subleaseRepDob' || key === 'subleaseIdOrCrDate' || key === 'subtenantDob';
  }

  function firstStepOf(section) {
    if (isGroupedKind()) {
      var screens = getScreens(kind);
      for (var s = 0; s < screens.length; s += 1) {
        if (screens[s].id === section) return s;
      }
      return 0;
    }
    var steps = getSteps(kind);
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].section === section) return i;
    }
    return 0;
  }

  function reviewSection(title, section, rows) {
    return '<section class="ejar-wizard-review">'
      + '<header>'
      + '<button type="button" class="ejar-wizard-review__toggle" aria-expanded="false">'
      + '<span class="ejar-wizard-review__check" aria-hidden="true">✓</span>'
      + '<h3>' + escapeHtml(title) + '</h3>'
      + '</button>'
      + '<button type="button" class="ejar-wizard__edit" data-goto="' + firstStepOf(section) + '">تعديل</button></header>'
      + '<dl>' + rows.map(function (row) {
        var value = row.html ? row.value : escapeHtml(row.value);
        return '<div><dt>' + escapeHtml(row.label) + '</dt><dd>' + value + '</dd></div>';
      }).join('') + '</dl></section>';
  }

  function reviewText(label, key) {
    if (key === 'ownerId' || key === 'tenantId' || key === 'subleaseRepId' || key === 'subtenantId') {
      return {
        label: label,
        html: true,
        value: answers[key] ? '<span dir="ltr">' + escapeHtml(maskId(answers[key])) + '</span>' : '—',
      };
    }
    if (key === 'propertyMapUrl') {
      return {
        label: label,
        html: true,
        value: answers[key] ? '<span dir="ltr">' + escapeHtml(answers[key]) + '</span>' : '—',
      };
    }
    if (key === 'subleaseIdOrCr' || key === 'subleasePoaNumber' || key === 'subleaseUnifiedNumber') {
      return {
        label: label,
        html: true,
        value: answers[key] ? '<span dir="ltr">' + escapeHtml(answers[key]) + '</span>' : '—',
      };
    }
    if (key === 'ownerPhone' || key === 'tenantPhone' || key === 'submitterPhone' || key === 'subleaseRepPhone' || key === 'subtenantPhone') {
      return {
        label: label,
        html: true,
        value: answers[key] ? '<span dir="ltr">' + escapeHtml(answers[key]) + '</span>' : '—',
      };
    }
    if (isDateField(key)) {
      var text = '';
      if (window.EjarDates && typeof window.EjarDates.plain === 'function') {
        text = window.EjarDates.plain(answers[key]);
      }
      return { label: label, value: text || answers[key] || '—' };
    }
    return { label: label, value: displayValue(key) };
  }

  function reviewHtml() {
    return reviewSection('الملكية', 'ownership', [
      reviewText('رقم الصك', 'deedNumber'),
      reviewText('تاريخ الصك', 'deedDate'),
    ])
    + (isSublease() ? reviewSection('عقد بالباطن', 'sublease', [
      reviewText('اسم المستأجر', 'subleaseTenantName'),
      reviewText('رقم البطاقة أو المنشأة', 'subleaseIdOrCr'),
      reviewText('تاريخ السجل أو البطاقة', 'subleaseIdOrCrDate'),
      reviewText('الرقم الموحد', 'subleaseUnifiedNumber'),
      reviewText('اسم الممثل', 'subleaseRepName'),
      reviewText('رقم بطاقة الممثل', 'subleaseRepId'),
      reviewText('تاريخ ميلاد الممثل', 'subleaseRepDob'),
      reviewText('جوال الممثل', 'subleaseRepPhone'),
      reviewText('رقم الوكالة', 'subleasePoaNumber'),
    ]) + reviewSection('المستأجر من الباطن', 'subtenant', [
      reviewText('الاسم', 'subtenantName'),
      reviewText('رقم البطاقة', 'subtenantId'),
      reviewText('تاريخ الميلاد', 'subtenantDob'),
      reviewText('الجوال', 'subtenantPhone'),
    ]) : '')
    + reviewSection('المؤجر', 'owner', [
      reviewText('رقم الهوية', 'ownerId'),
      reviewText('تاريخ الميلاد', 'ownerDob'),
      reviewText('الجوال', 'ownerPhone'),
    ])
    + (isSublease() ? '' : reviewSection('المستأجر', 'tenant', [
      reviewText('رقم الهوية', 'tenantId'),
      reviewText('تاريخ الميلاد', 'tenantDob'),
      reviewText('الجوال', 'tenantPhone'),
    ]))
    + reviewSection('العقار', 'unit', isGroupedKind() ? [
      reviewText('نوع العقار', 'unitType'),
      reviewText('رقم الوحدة', 'unitNumber'),
      reviewText('الدور', 'floor'),
      reviewText('رابط الموقع', 'propertyMapUrl'),
      reviewText('الغرف', 'rooms'),
      reviewText('دورات المياه', 'bathrooms'),
      reviewText('المكيفات', 'acs'),
      reviewText('مطبخ', 'kitchens'),
      reviewText('مجلس', 'majlis'),
    ] : [
      reviewText('الموقع', 'propertyLocation'),
      reviewText('رابط الموقع (اللكيشن)', 'propertyMapUrl'),
      reviewText('الشارع', 'streetName'),
      reviewText('الدور', 'floor'),
      reviewText('رقم الوحدة', 'unitNumber'),
      reviewText('التأثيث', 'furnished'),
      reviewText('الغرف', 'rooms'),
      reviewText('دورات المياه', 'bathrooms'),
      reviewText('المكيفات', 'acs'),
      reviewText('المجالس', 'majlis'),
      reviewText('المطابخ', 'kitchens'),
      reviewText('نوع العقار', 'unitType'),
      reviewText('المساحة', 'area'),
    ])
    + reviewSection('تفاصيل العقد', 'finance', [
      reviewText('قيمة الإيجار', 'rentAmount'),
      reviewText('طريقة الدفع', 'paymentMethod'),
      reviewText('مدة العقد', 'contractDuration'),
      reviewText('تاريخ البداية', 'startDate'),
      reviewText('مبلغ الضمان', 'hasDeposit'),
    ])
    + (isGroupedKind() ? submitterOnReviewHtml() : reviewSection('معبئ النموذج', 'submitter', [
      reviewText('الاسم', 'submitterName'),
      reviewText('الجوال', 'submitterPhone'),
      reviewText('الصفة', 'submitterRelation'),
    ]))
    + deedUploadHtml()
    + '<div class="ejar-field" data-field="declarationAccepted">'
    + '<label class="ejar-wizard__check">'
    + '<input type="checkbox" id="ejar-wizard-declaration"' + (answers.declarationAccepted ? ' checked' : '') + '>'
    + '<span>' + DECLARATION + '</span></label>'
    + '<p class="ejar-field__error" hidden></p>'
    + '</div>'
    + '<p class="ejar-wizard__disclaimer">' + DISCLAIMER + '</p>';
  }

  function submitterOnReviewHtml() {
    var rel = answers.submitterRelation || '';
    var details = rel === 'وكيل' || rel === 'ابن/ابنة أحد الأطراف';
    return '<section class="ejar-wizard-review is-open ejar-submitter-block">'
      + '<h3>من يقوم بتعبئة الطلب؟</h3>'
      + '<div class="ejar-field" data-field="submitterRelation">'
      + cardsHtml({
        key: 'submitterRelation',
        label: 'من يقوم بتعبئة الطلب؟',
        type: 'select',
        ui: 'cards',
        options: ['المؤجر', 'المستأجر', 'وكيل', 'ابن/ابنة أحد الأطراف'],
      })
      + '<p class="ejar-field__error" hidden></p>'
      + '</div>'
      + '<div class="ejar-submitter-details"' + (details ? '' : ' hidden') + '>'
      + '<div class="ejar-field" data-field="submitterName">'
      + '<label for="ejar-field-submitterName">اسم المعبئ</label>'
      + '<input class="ejar-wizard__control" id="ejar-field-submitterName" data-wizard-field="submitterName" type="text" value="' + escapeHtml(answers.submitterName || '') + '">'
      + '<p class="ejar-field__error" hidden></p>'
      + '</div>'
      + '<div class="ejar-field" data-field="submitterPhone">'
      + '<label for="ejar-field-submitterPhone">رقم الجوال</label>'
      + '<input class="ejar-wizard__control" id="ejar-field-submitterPhone" data-wizard-field="submitterPhone" type="tel" dir="ltr" inputmode="tel" maxlength="14" placeholder="05xxxxxxxx" value="' + escapeHtml(answers.submitterPhone || '') + '">'
      + '<p class="ejar-field__error" hidden></p>'
      + '</div>'
      + '</div></section>';
  }

  function deedUploadHtml() {
    var hasFile = !!deedFile;
    var showImage = hasFile && canPreviewDeedImage(deedFile) && deedPreviewUrl;
    return '<section class="ejar-deed-upload">'
      + '<h3>إرفاق صورة الصك <small>اختياري</small></h3>'
      + '<p>أرفق صورة أو ملف PDF للصك إن توفر، لتسهيل مراجعة الطلب وإنشاء العقد عبر منصة إيجار.</p>'
      + '<label class="ejar-deed-upload__drop">'
      + '<input type="file" id="ejar-deed-file" accept="' + DEED_ACCEPT + '">'
      + '<span class="ejar-deed-upload__cta">اضغط لاختيار صورة أو PDF أو التقاطها من الكاميرا</span>'
      + '<span class="ejar-deed-upload__hint">صور أو PDF — حتى ' + DEED_MAX_MB + ' ميجا</span>'
      + '</label>'
      + '<div class="ejar-deed-upload__preview"' + (hasFile ? '' : ' hidden') + '>'
      + '<img alt="معاينة صورة الصك"' + (showImage ? ' src="' + escapeHtml(deedPreviewUrl) + '"' : ' hidden') + '>'
      + '<p class="ejar-deed-upload__file"' + (hasFile && !showImage ? '' : ' hidden') + '>' + (hasFile && isDeedPdf(deedFile) ? 'ملف PDF جاهز للرفع' : 'المرفق جاهز للرفع') + '</p>'
      + '<p class="ejar-deed-upload__name">' + escapeHtml(deedFile && deedFile.name ? deedFile.name : '') + '</p>'
      + '<button type="button" class="btn btn-outline ejar-deed-upload__remove" id="ejar-deed-remove">إزالة المرفق</button>'
      + '</div></section>';
  }

  function successHtml(referenceNo, note) {
    return '<div class="ejar-wizard__success">'
      + '<div class="ejar-wizard__success-icon" aria-hidden="true">✓</div>'
      + '<h2>تم استلام طلبك بنجاح</h2>'
      + '<p class="ejar-wizard__ref">رقم الطلب: <strong dir="ltr">' + escapeHtml(referenceNo) + '</strong></p>'
      + '<p>سيقوم فريق مكتب الهيف للخدمات العقارية بمراجعة البيانات وإنشاء العقد عبر منصة إيجار، ثم استكمال إجراءات التوثيق مع الأطراف.</p>'
      + (note ? '<p class="ejar-wizard__deed-note">' + escapeHtml(note) + '</p>' : '')
      + '<button type="button" class="btn btn-primary ejar-wizard__done">إغلاق</button>'
      + '</div>';
  }

  function kindsHtml() {
    if (kind === 'sublease') {
      return '<div class="ejar-wizard__kinds" aria-label="نوع العقد">'
        + '<span class="ejar-wizard__kind is-active" data-kind="sublease">عقد بالباطن</span>'
        + '</div>';
    }
    return '<div class="ejar-wizard__kinds" role="tablist" aria-label="نوع العقد">'
      + '<button type="button" class="ejar-wizard__kind' + (kind === 'residential' ? ' is-active' : '') + '" data-kind="residential" role="tab" aria-selected="' + (kind === 'residential' ? 'true' : 'false') + '">عقد سكني</button>'
      + '<button type="button" class="ejar-wizard__kind' + (kind === 'commercial' ? ' is-active' : '') + '" data-kind="commercial" role="tab" aria-selected="' + (kind === 'commercial' ? 'true' : 'false') + '">عقد تجاري</button>'
      + '</div>';
  }

  function renderResume(draft) {
    ensureRoot().innerHTML = ''
      + '<div class="ejar-wizard__backdrop" tabindex="-1"></div>'
      + '<div class="ejar-wizard__panel ejar-wizard__panel--resume" role="dialog" aria-modal="true" aria-labelledby="ejar-wizard-title">'
      + '<button type="button" class="ejar-wizard__close" aria-label="إغلاق">×</button>'
      + '<div class="ejar-wizard__resume">'
      + '<h2 id="ejar-wizard-title">لديك طلب غير مكتمل</h2>'
      + '<p>هل تريد متابعة تعبئته؟</p>'
      + '<div class="ejar-wizard__resume-actions">'
      + '<button type="button" class="btn btn-primary" data-draft="continue">متابعة</button>'
      + '<button type="button" class="btn btn-outline" data-draft="restart">بدء طلب جديد</button>'
      + '</div></div></div>';
    root.querySelector('[data-draft="continue"]').addEventListener('click', function () {
      continueDraft(draft);
    });
    root.querySelector('[data-draft="restart"]').addEventListener('click', startFresh);
    var closeBtn = root.querySelector('.ejar-wizard__close');
    if (closeBtn) closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      close();
    });
  }

  function groupedScreenHtml(screen) {
    if (screen.type === 'review') return reviewHtml();
    return '<div class="ejar-wizard__screen">'
      + '<h3 class="ejar-wizard__screen-title">' + escapeHtml(screen.title) + '</h3>'
      + '<div class="ejar-wizard__grid">'
      + (screen.fields || []).map(fieldBlockHtml).join('')
      + '</div></div>';
  }

  function render() {
    var steps = getSteps(kind);
    var step = steps[stepIndex] || { type: 'review' };
    var screen = isGroupedKind() ? currentScreen() : null;
    var isReview = isGroupedKind() ? screen.type === 'review' : step.type === 'review';
    var isFirst = isGroupedKind() ? screenIndex === 0 : stepIndex === 0;
    var body = isGroupedKind()
      ? groupedScreenHtml(screen)
      : (isReview
        ? reviewHtml()
        : '<div class="ejar-wizard__question">'
          + '<label' + (step.type === 'date' ? '' : ' for="ejar-field-' + step.key + '"') + '>' + escapeHtml(step.label) + '</label>'
          + inputHtml(step) + '</div>');

    ensureRoot().innerHTML = ''
      + '<div class="ejar-wizard__backdrop" tabindex="-1"></div>'
      + '<div class="ejar-wizard__panel" role="dialog" aria-modal="true" aria-labelledby="ejar-wizard-title">'
      + '<button type="button" class="ejar-wizard__close" aria-label="إغلاق">×</button>'
      + '<header class="ejar-wizard__head">'
      + kindsHtml()
      + '<h2 id="ejar-wizard-title">'
      + '<span class="ejar-wizard__title-full">' + escapeHtml(titleFor(kind)) + '</span>'
      + '<span class="ejar-wizard__title-short">' + escapeHtml(shortTitleFor(kind)) + '</span>'
      + '</h2>'
      + '<p class="ejar-wizard__price">' + escapeHtml(priceText(kind)) + '</p>'
      + (isFirst ? '<p class="ejar-wizard__trust">' + TRUST + '</p>' : '')
      + '</header>'
      + progressHtml(steps, stepIndex)
      + '<form class="ejar-wizard__form" novalidate>'
      + '<input type="hidden" name="contractKind" value="' + (kind === 'sublease' ? 'sublease' : (kind === 'commercial' ? 'commercial' : 'residential')) + '">'
      + '<input type="hidden" name="contractType" value="' + (kind === 'sublease' ? 'عقد بالباطن' : (kind === 'commercial' ? 'تجاري' : 'سكني')) + '">'
      + '<input type="text" name="website" class="ejar-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<p class="ejar-wizard__error" role="alert" hidden></p>'
      + '<div class="ejar-wizard__body">' + body + '</div>'
      + '<div class="ejar-wizard__nav">'
      + '<button type="button" class="btn btn-outline ejar-wizard__prev"' + (isFirst ? ' disabled hidden' : '') + '>السابق</button>'
      + '<button type="button" class="btn btn-primary ejar-wizard__next">' + (isReview ? 'إرسال طلب إنشاء العقد' : 'التالي') + '</button>'
      + '</div>'
      + '</form></div>';

    bindRendered();
    syncVisualViewport();
  }

  function bindChoiceCards() {
    root.querySelectorAll('.ejar-choice').forEach(function (group) {
      var hidden = group.querySelector('input[data-wizard-field][type="hidden"]');
      if (!hidden) return;
      group.querySelectorAll('.ejar-choice__card').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var value = btn.getAttribute('data-choice') || '';
          hidden.value = value;
          var key = hidden.getAttribute('data-wizard-field');
          answers[key] = value;
          group.querySelectorAll('.ejar-choice__card').forEach(function (other) {
            var on = other === btn;
            other.classList.toggle('is-selected', on);
            other.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          var wrap = group.closest('.ejar-field') || group.parentElement;
          if (wrap) {
            var otherBox = wrap.querySelector('[data-follow]');
            if (otherBox) {
              var followKey = otherBox.getAttribute('data-follow');
              var field = (isGroupedKind() ? (currentScreen().fields || []) : [currentStep()]).filter(function (f) {
                return f && (f.otherKey === followKey || f.extraKey === followKey);
              })[0];
              if (field && field.otherKey === followKey) otherBox.hidden = value !== field.otherValue;
              if (field && field.extraKey === followKey) otherBox.hidden = value !== field.extraValue;
            }
            wrap.querySelectorAll('[data-follow]').forEach(function (box) {
              var fk = box.getAttribute('data-follow');
              var conf = (isGroupedKind() ? (currentScreen().fields || []) : [currentStep()]).filter(function (f) {
                return f && (f.otherKey === fk || f.extraKey === fk);
              })[0];
              if (!conf) return;
              if (conf.otherKey === fk) box.hidden = value !== conf.otherValue;
              if (conf.extraKey === fk) box.hidden = value !== conf.extraValue;
            });
          }
          if (key === 'submitterRelation') {
            var details = root.querySelector('.ejar-submitter-details');
            if (details) details.hidden = !(value === 'وكيل' || value === 'ابن/ابنة أحد الأطراف');
            syncSubmitterFromRelation();
          }
          hideError();
          saveDraft();
        });
      });
    });
  }

  function bindSteppers() {
    root.querySelectorAll('.ejar-stepper').forEach(function (el) {
      var input = el.querySelector('[data-wizard-field]');
      var key = input && input.getAttribute('data-wizard-field');
      var field = ((currentScreen() && currentScreen().fields) || []).filter(function (f) { return f.key === key; })[0];
      var min = field ? field.min : 0;
      var max = field ? field.max : 10;
      el.querySelectorAll('[data-stepper-dir]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var dir = parseInt(btn.getAttribute('data-stepper-dir'), 10) || 0;
          var current = parseInt(input.value, 10);
          if (!Number.isInteger(current)) current = min;
          var nextVal = Math.max(min, Math.min(max, current + dir));
          input.value = String(nextVal);
          answers[key] = String(nextVal);
          hideError();
          saveDraft();
        });
      });
    });
  }

  function bindReviewAccordion() {
    root.querySelectorAll('.ejar-wizard-review__toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var section = btn.closest('.ejar-wizard-review');
        if (!section) return;
        var open = !section.classList.contains('is-open');
        section.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  function bindRendered() {
    root.querySelectorAll('.ejar-wizard__kind').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchKind(btn.getAttribute('data-kind'));
      });
    });
    var prevBtn = root.querySelector('.ejar-wizard__prev');
    if (prevBtn) prevBtn.addEventListener('click', prev);
    var nextBtn = root.querySelector('.ejar-wizard__next');
    if (nextBtn) nextBtn.addEventListener('click', next);
    var form = root.querySelector('.ejar-wizard__form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        next();
      });
    }
    root.querySelectorAll('[data-wizard-field]').forEach(function (field) {
      if (field.type === 'hidden') return;
      field.addEventListener('input', function () {
        answers[field.getAttribute('data-wizard-field')] = field.value;
        hideError();
        saveDraft();
      });
      field.addEventListener('change', function () {
        answers[field.getAttribute('data-wizard-field')] = field.value;
        saveDraft();
      });
    });
    var followInputs = root.querySelectorAll('[data-follow] [data-wizard-field]');
    followInputs.forEach(function (input) {
      input.addEventListener('input', function () {
        answers[input.getAttribute('data-wizard-field')] = input.value;
        hideError();
        saveDraft();
      });
    });
    bindChoiceCards();
    bindSteppers();
    bindDateChooser();
    bindDatePicker();
    bindDeedUpload();
    bindReviewAccordion();
    var closeBtn = root.querySelector('.ejar-wizard__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
      });
    }
    root.querySelectorAll('.ejar-wizard__edit').forEach(function (btn) {
      btn.addEventListener('click', function () {
        collectCurrent();
        goTo(parseInt(btn.getAttribute('data-goto'), 10) || 0);
      });
    });
    var done = root.querySelector('.ejar-wizard__done');
    if (done) done.addEventListener('click', close);
  }

  function payload() {
    var k = normalizeKind(kind);
    var sublease = k === 'sublease';
    return {
      contractKind: k,
      contractType: k === 'sublease' ? 'عقد بالباطن' : (k === 'commercial' ? 'تجاري' : 'سكني'),
      kind: k,
      deedNumber: answers.deedNumber,
      deedDate: answers.deedDate,
      contractingStatus: sublease ? 'عقد بالباطن' : '',
      subleaseTenantName: sublease ? answers.subleaseTenantName : '',
      subleaseIdOrCr: sublease ? answers.subleaseIdOrCr : '',
      subleaseIdOrCrDate: sublease ? answers.subleaseIdOrCrDate : '',
      subleaseUnifiedNumber: sublease ? answers.subleaseUnifiedNumber : '',
      subleaseRepName: sublease ? answers.subleaseRepName : '',
      subleaseRepId: sublease ? answers.subleaseRepId : '',
      subleaseRepDob: sublease ? answers.subleaseRepDob : '',
      subleaseRepPhone: sublease ? answers.subleaseRepPhone : '',
      subleasePoaNumber: sublease ? answers.subleasePoaNumber : '',
      subtenantName: sublease ? answers.subtenantName : '',
      subtenantId: sublease ? answers.subtenantId : '',
      subtenantDob: sublease ? answers.subtenantDob : '',
      subtenantPhone: sublease ? answers.subtenantPhone : '',
      ownerId: answers.ownerId,
      ownerDob: answers.ownerDob,
      ownerPhone: answers.ownerPhone,
      tenantId: sublease ? answers.subtenantId : answers.tenantId,
      tenantDob: sublease ? answers.subtenantDob : answers.tenantDob,
      tenantPhone: sublease ? answers.subtenantPhone : answers.tenantPhone,
      propertyLocation: answers.propertyLocation,
      propertyMapUrl: answers.propertyMapUrl,
      streetName: answers.streetName,
      floor: answers.floor,
      unitNumber: answers.unitNumber,
      furnished: answers.furnished,
      rooms: answers.rooms,
      bathrooms: answers.bathrooms,
      acs: answers.acs,
      majlis: answers.majlis,
      kitchens: answers.kitchens,
      unitType: answers.unitType,
      area: answers.area,
      rentAmount: answers.rentAmount,
      paymentMethod: answers.paymentMethod,
      contractDuration: answers.contractDuration,
      contractDurationOther: answers.contractDurationOther,
      startDate: answers.startDate,
      hasDeposit: answers.hasDeposit,
      depositAmount: answers.depositAmount,
      submitterName: answers.submitterName,
      submitterPhone: (function () {
        if (answers.submitterRelation === 'المؤجر') return answers.ownerPhone;
        if (answers.submitterRelation === 'المستأجر') return answers.tenantPhone;
        return answers.submitterPhone;
      }()),
      submitterRelation: answers.submitterRelation,
      declarationAccepted: true,
      website: (root.querySelector('.ejar-hp') && root.querySelector('.ejar-hp').value) || '',
    };
  }

  function networkErrorMessage(err, fallback) {
    var msg = err && err.message ? String(err.message) : '';
    if (/failed to fetch|networkerror|load failed|internet connection|aborted|timeout/i.test(msg)) {
      return fallback || 'تعذر الاتصال أثناء رفع الملف. أُرسل الطلب بدون المرفق إن أمكن.';
    }
    return msg || fallback || 'تعذر إرسال الطلب';
  }

  function fetchJson(url, options, timeoutMs) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeoutMs || 45000);
    var opts = options || {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts)
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        }).catch(function () {
          throw new Error('تعذر قراءة رد الخادم');
        });
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function prepareDeedFile(file) {
    return new Promise(function (resolve) {
      if (!file || isDeedPdf(file) || file.size < 900 * 1024 || !canPreviewDeedImage(file)) {
        resolve(file);
        return;
      }
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 2000;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var scale = Math.min(1, max / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          var name = String(file.name || 'deed').replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function uploadDeedSigned(file) {
    return fetchJson('/api/ejar/deed/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name || (isDeedPdf(file) ? 'deed.pdf' : 'deed.jpg'),
        type: file.type || '',
        size: file.size || 0,
      }),
    }, 20000).then(function (prepared) {
      if (!prepared.ok || !prepared.data || !prepared.data.signedUrl) {
        throw new Error((prepared.data && prepared.data.message) || 'تعذر تجهيز رفع الملف');
      }
      var headers = { 'Content-Type': file.type || 'application/octet-stream' };
      if (prepared.data.token) headers.Authorization = 'Bearer ' + prepared.data.token;
      return fetch(prepared.data.signedUrl, {
        method: 'PUT',
        headers: headers,
        body: file,
      }).then(function (res) {
        if (!res.ok) throw new Error('تعذر رفع الملف مباشرة');
        return { path: prepared.data.path || '', url: '' };
      });
    });
  }

  function uploadDeedViaServer(file) {
    var fd = new FormData();
    fd.append('deedImage', file, file.name || (isDeedPdf(file) ? 'deed.pdf' : 'deed.jpg'));
    return fetchJson('/api/ejar/deed', { method: 'POST', body: fd }, 60000).then(function (result) {
      if (!result.ok || !result.data || !result.data.success) {
        throw new Error((result.data && result.data.message) || 'تعذر رفع المرفق');
      }
      return { path: result.data.path || '', url: result.data.url || '' };
    });
  }

  function uploadDeed(file) {
    return prepareDeedFile(file).then(function (ready) {
      return uploadDeedSigned(ready).catch(function () {
        return uploadDeedViaServer(ready);
      });
    });
  }

  function submit() {
    if (submitting) return;
    submitting = true;
    var btn = root.querySelector('.ejar-wizard__next');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'جاري الإرسال...';
    hideError();
    var data = payload();
    var deedNote = '';
    var start = Promise.resolve();
    if (deedFile) {
      btn.textContent = 'جاري رفع المستند...';
      start = uploadDeed(deedFile).then(function (uploaded) {
        if (uploaded && uploaded.path) data.deedObjectPath = uploaded.path;
      }).catch(function () {
        deedNote = 'تم حفظ الطلب. تعذر رفع مستند الصك الآن، ويمكن إرساله لاحقًا عبر واتساب.';
      });
    }
    start.then(function () {
      btn.textContent = 'جاري الإرسال...';
      return fetchJson('/api/ejar/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }, 30000);
    }).then(function (result) {
      if (result.data && result.data.success) {
        resetForm();
        showSuccess(result.data.referenceNo || result.data.requestId, deedNote);
        return;
      }
      throw new Error((result.data && result.data.message) || 'تعذر إرسال الطلب');
    }).catch(function (err) {
      submitting = false;
      btn.disabled = false;
      btn.textContent = original;
      showError(networkErrorMessage(err, 'تعذر إرسال الطلب. تحقق من الاتصال وأعد المحاولة.'));
    });
  }

  function showSuccess(referenceNo, note) {
    submitting = false;
    ensureRoot().innerHTML = ''
      + '<div class="ejar-wizard__backdrop"></div>'
      + '<div class="ejar-wizard__panel ejar-wizard__panel--success" role="dialog" aria-modal="true" aria-labelledby="ejar-wizard-title">'
      + '<button type="button" class="ejar-wizard__close" aria-label="إغلاق">×</button>'
      + successHtml(referenceNo, note)
      + '</div>';
    root.querySelector('.ejar-wizard__done').addEventListener('click', function () {
      close();
    });
    root.querySelector('.ejar-wizard__backdrop').addEventListener('click', close);
  }

  window.EjarWizard = { open: open, close: close };
})();
