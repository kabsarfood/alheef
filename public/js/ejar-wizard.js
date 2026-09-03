(function () {
  'use strict';

  var DRAFT_KEY = 'ejar_wizard_draft';
  var PAYMENT_METHODS = ['شهري', 'ربع سنوي', 'نصف سنوي', 'سنوي'];
  var RESIDENTIAL_UNITS = ['شقة', 'فيلا'];
  var COMMERCIAL_UNITS = ['محل', 'مكتب', 'معرض', 'مستودع', 'وحدة تجارية أخرى'];
  var FLOORS = ['أرضي', 'أول', 'ثاني', 'ثالث', 'رابع', 'خامس', 'أعلى', 'أخرى'];
  var DURATIONS = ['3 أشهر', '6 أشهر', 'سنة', 'سنتان', 'مدة أخرى'];
  var YES_NO = ['لا', 'نعم'];
  var LEAD = 'أدخل بيانات العقد وسيتولى فريق مكتب الهيف للخدمات العقارية مراجعتها وإنشاء العقد عبر منصة إيجار وإرساله للأطراف للتوثيق.';
  var TRUST = '🔒 تُستخدم بياناتك فقط لإعداد طلب العقد، ولا نطلب كلمة مرور منصة إيجار أو رمز نفاذ.';
  var DECLARATION = 'أقر بصحة البيانات المدخلة وأطلب من مكتب الهيف للخدمات العقارية إعداد عقد الإيجار عبر منصة إيجار وإرساله للأطراف للتوثيق.';
  var DISCLAIMER = 'مكتب الهيف للخدمات العقارية وسيط عقاري مرخص، وهذه الخدمة ليست الموقع الرسمي لمنصة إيجار.';
  var SECTIONS = [
    { id: 'ownership', title: 'بيانات الملكية', short: 'الملكية' },
    { id: 'owner', title: 'بيانات المؤجر', short: 'المؤجر' },
    { id: 'tenant', title: 'بيانات المستأجر', short: 'المستأجر' },
    { id: 'unit', title: 'بيانات الوحدة الإيجارية', short: 'الوحدة' },
    { id: 'finance', title: 'البيانات المالية', short: 'تفاصيل العقد' },
    { id: 'review', title: 'مراجعة الطلب', short: 'المراجعة' },
  ];

  var root = null;
  var kind = 'residential';
  var dateMode = '';
  var stepIndex = 0;
  var answers = {};
  var submitting = false;
  var deedFile = null;
  var deedPreviewUrl = '';
  var DEED_MAX_BYTES = 8 * 1024 * 1024;
  var openedFromHome = false;

  function prices() {
    return {
      residential: window.EJAR_PRICE_RESIDENTIAL || 229,
      commercial: window.EJAR_PRICE_COMMERCIAL || 329,
    };
  }

  function titleFor(k) {
    return k === 'commercial' ? 'إنشاء عقد إيجار تجاري' : 'إنشاء عقد إيجار سكني';
  }

  function priceText(k) {
    var p = prices();
    var n = k === 'commercial' ? p.commercial : p.residential;
    return n + ' ريال شامل الرسوم';
  }

  function getSteps(k) {
    var unitOptions = k === 'commercial' ? COMMERCIAL_UNITS : RESIDENTIAL_UNITS;
    var unitTitle = k === 'commercial' ? 'ما نوع الوحدة التجارية؟' : 'ما نوع الوحدة؟';
    return [
      { key: 'deedNumber', section: 'ownership', label: 'رقم الصك', type: 'text', inputmode: 'numeric', autocomplete: 'off' },
      { key: 'deedDate', section: 'ownership', label: 'تاريخ الصك', type: 'date' },
      { key: 'ownerId', section: 'owner', label: 'رقم هوية المالك', type: 'nid' },
      { key: 'ownerDob', section: 'owner', label: 'تاريخ ميلاد المالك', type: 'date' },
      { key: 'ownerPhone', section: 'owner', label: 'رقم جوال المالك', type: 'phone' },
      { key: 'tenantId', section: 'tenant', label: 'رقم هوية المستأجر', type: 'nid' },
      { key: 'tenantDob', section: 'tenant', label: 'تاريخ ميلاد المستأجر', type: 'date' },
      { key: 'tenantPhone', section: 'tenant', label: 'رقم جوال المستأجر', type: 'phone' },
      {
        key: 'unitType',
        section: 'unit',
        label: unitTitle,
        type: 'select',
        options: unitOptions,
        otherKey: 'unitTypeOther',
        otherValue: 'وحدة تجارية أخرى',
        otherLabel: 'حدد نوع الوحدة',
      },
      {
        key: 'floor',
        section: 'unit',
        label: 'رقم الدور',
        type: 'select',
        options: FLOORS,
        otherKey: 'floorOther',
        otherValue: 'أخرى',
        otherLabel: 'حدد الدور',
      },
      { key: 'unitNumber', section: 'unit', label: 'رقم الوحدة', type: 'text', inputmode: 'text' },
      { key: 'area', section: 'unit', label: 'مساحة الوحدة', type: 'number', suffix: 'م²', min: 0 },
      { key: 'rentAmount', section: 'finance', label: 'قيمة الإيجار', type: 'number', suffix: 'ريال', min: 0 },
      { key: 'paymentMethod', section: 'finance', label: 'طريقة الدفع', type: 'select', options: PAYMENT_METHODS },
      {
        key: 'contractDuration',
        section: 'finance',
        label: 'مدة العقد',
        type: 'select',
        options: DURATIONS,
        otherKey: 'contractDurationOther',
        otherValue: 'مدة أخرى',
        otherLabel: 'حدد المدة',
      },
      { key: 'startDate', section: 'finance', label: 'تاريخ بداية العقد', type: 'date' },
      {
        key: 'hasDeposit',
        section: 'finance',
        label: 'هل يوجد مبلغ ضمان/تأمين؟',
        type: 'select',
        options: YES_NO,
        extraKey: 'depositAmount',
        extraValue: 'نعم',
        extraLabel: 'ما قيمة مبلغ الضمان؟',
        extraSuffix: 'ريال',
      },
      { key: 'review', section: 'review', type: 'review' },
    ];
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
        var mark = i < currentPos ? '✓' : String(i + 1);
        return '<li class="' + cls + '"' + (i === currentPos ? ' aria-current="step"' : '') + '>'
          + '<span class="ejar-wizard__stage-mark" aria-hidden="true">' + mark + '</span>'
          + '<span class="ejar-wizard__stage-label">' + escapeHtml(meta.short) + '</span>'
          + '</li>';
      }).join('')
      + '</ol>';
  }

  function progressHtml(steps, index) {
    var stats = sectionProgress(steps, index);
    var pct = stats.isReview || !stats.total ? 100 : Math.round((stats.current / stats.total) * 100);
    var text = stats.isReview
      ? escapeHtml(stats.title)
      : '<strong>' + escapeHtml(stats.title) + '</strong><span> السؤال ' + stats.current + ' من ' + stats.total + '</span>';
    return '<div class="ejar-wizard__progress">'
      + stagesHtml(steps, index)
      + '<p class="ejar-wizard__progress-text" aria-live="polite">' + text + '</p>'
      + (stats.isReview ? '' : '<div class="ejar-wizard__bar" aria-hidden="true"><div class="ejar-wizard__bar-fill" style="width:' + pct + '%"></div></div>')
      + '</div>';
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

  function saveDraft() {
    /* تُحفظ البيانات في الذاكرة فقط أثناء فتح النموذج */
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) { /* noop */ }
  }

  function hasAnswers() {
    return Object.keys(answers).some(function (k) {
      return answers[k] !== '' && answers[k] != null && answers[k] !== false;
    });
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
    if (hasAnswers() && !root.querySelector('.ejar-wizard__success')) {
      if (!window.confirm('هل تريد إغلاق النموذج؟ لن تُحفظ البيانات المدخلة.')) return;
    }
    close();
  }

  function resetForm() {
    answers = {};
    stepIndex = 0;
    dateMode = '';
    submitting = false;
    clearDeedFile();
    clearDraft();
  }

  function clearDeedFile() {
    deedFile = null;
    if (deedPreviewUrl) {
      try { URL.revokeObjectURL(deedPreviewUrl); } catch (_) { /* noop */ }
    }
    deedPreviewUrl = '';
  }

  function open(nextKind, options) {
    resetForm();
    openedFromHome = !!(options && options.fromHome);
    kind = nextKind === 'commercial' ? 'commercial' : 'residential';
    render();
    document.body.classList.add('ejar-wizard-open');
    var el = ensureRoot();
    el.hidden = false;
    el.classList.add('is-open');
    window.setTimeout(focusCurrent, 40);
  }

  function sanitizeUnitForKind() {
    var options = kind === 'commercial' ? COMMERCIAL_UNITS : RESIDENTIAL_UNITS;
    if (answers.unitType && options.indexOf(answers.unitType) === -1) {
      answers.unitType = '';
      answers.unitTypeOther = '';
    }
  }

  function switchKind(nextKind) {
    if (nextKind !== 'residential' && nextKind !== 'commercial') return;
    if (nextKind === kind) return;
    collectCurrent();
    kind = nextKind;
    sanitizeUnitForKind();
    saveDraft();
    render();
    focusCurrent();
  }

  function close() {
    resetForm();
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

  function collectCurrent() {
    var step = currentStep();
    if (!step) return;
    if (step.type === 'review') {
      var box = root.querySelector('#ejar-wizard-declaration');
      answers.declarationAccepted = !!(box && box.checked);
      return;
    }
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
    if (step.type === 'date') {
      if (!dateMode) return 'يرجى اختيار نوع التقويم أولاً (هجري أو ميلادي)';
      if (!isIsoDate(value)) return 'يرجى اختيار التاريخ';
      if ((step.key === 'ownerDob' || step.key === 'tenantDob') && value > todayIso()) {
        return 'تاريخ الميلاد يجب أن يكون في الماضي';
      }
      return '';
    }
    if (step.type === 'number') {
      if (positiveNumber(value) == null) return step.key === 'area' ? 'المساحة يجب أن تكون رقمًا موجبًا' : 'القيمة يجب أن تكون أكبر من صفر';
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
    return '';
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function enterStep(index) {
    var steps = getSteps(kind);
    stepIndex = Math.max(0, Math.min(index, steps.length - 1));
    if (currentStep() && currentStep().type === 'date') dateMode = '';
    render();
    focusCurrent();
  }

  function goTo(index) {
    collectCurrent();
    saveDraft();
    enterStep(index);
  }

  function next() {
    collectCurrent();
    var step = currentStep();
    var err = validateStep(step);
    if (err) {
      showError(err);
      return;
    }
    if (step.type === 'nid') answers[step.key] = String(answers[step.key] || '').replace(/\D/g, '');
    if (step.type === 'phone') answers[step.key] = normalizeSaudiMobile(answers[step.key]);
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
    if (stepIndex <= 0) return;
    enterStep(stepIndex - 1);
  }

  function showError(text) {
    var el = root.querySelector('.ejar-wizard__error');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
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
  }

  function refreshDatePreview(iso) {
    var preview = root && root.querySelector('#ejar-date-preview');
    if (!preview) return;
    preview.innerHTML = dualDateHtml(iso);
  }

  function applyDateMode(mode) {
    dateMode = mode === 'hijri' || mode === 'gregorian' ? mode : '';
    var picker = root && root.querySelector('.ejar-date-picker');
    if (!picker) return;
    picker.setAttribute('data-date-mode', dateMode);
    var hijri = picker.querySelector('[data-date-panel="hijri"]');
    var gregorian = picker.querySelector('[data-date-panel="gregorian"]');
    var hint = picker.querySelector('.ejar-date-chooser__hint');
    var changeBtn = picker.querySelector('.ejar-date-chooser__change');
    picker.querySelectorAll('.ejar-date-orb').forEach(function (btn) {
      var selected = dateMode && btn.getAttribute('data-date-mode') === dateMode;
      btn.classList.toggle('is-selected', !!selected);
      btn.hidden = !!(dateMode && !selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    if (hijri) hijri.hidden = dateMode !== 'hijri';
    if (gregorian) gregorian.hidden = dateMode !== 'gregorian';
    if (changeBtn) changeBtn.hidden = !dateMode;
    if (hint) {
      hint.textContent = !dateMode
        ? 'اختر نوع التقويم'
        : (dateMode === 'hijri' ? 'أدخل التاريخ الهجري' : 'أدخل التاريخ الميلادي');
    }
  }

  function bindDateChooser() {
    var picker = root && root.querySelector('.ejar-date-picker');
    if (!picker) return;
    picker.querySelectorAll('.ejar-date-orb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyDateMode(btn.getAttribute('data-date-mode'));
        hideError();
      });
    });
    var changeBtn = picker.querySelector('.ejar-date-chooser__change');
    if (changeBtn) {
      changeBtn.addEventListener('click', function () {
        applyDateMode('');
      });
    }
    applyDateMode(dateMode);
  }

  function bindDatePicker() {
    var picker = root.querySelector('.ejar-date-picker');
    var Dates = window.EjarDates;
    if (!picker || !Dates) return;
    var maxIso = picker.getAttribute('data-max-iso') || '';
    var hidden = picker.querySelector('#ejar-wizard-field');
    var yearEl = picker.querySelector('[data-hijri="year"]');
    var monthEl = picker.querySelector('[data-hijri="month"]');
    var dayEl = picker.querySelector('[data-hijri="day"]');
    var gregorian = picker.querySelector('#ejar-date-gregorian');

    function setIso(iso) {
      if (maxIso && iso && iso > maxIso) iso = maxIso;
      if (hidden) {
        hidden.value = iso || '';
        answers[hidden.getAttribute('data-wizard-field')] = hidden.value;
      }
      if (gregorian && gregorian.value !== (iso || '')) gregorian.value = iso || '';
      refreshDatePreview(iso || '');
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
  }

  function bindDeedUpload() {
    var input = root.querySelector('#ejar-deed-file');
    if (!input) return;
    var preview = root.querySelector('.ejar-deed-upload__preview');
    var img = preview && preview.querySelector('img');
    var nameEl = root.querySelector('.ejar-deed-upload__name');
    var removeBtn = root.querySelector('#ejar-deed-remove');

    function showPreview() {
      if (!preview || !img) return;
      if (deedPreviewUrl) {
        img.src = deedPreviewUrl;
        preview.hidden = false;
        if (nameEl) nameEl.textContent = deedFile && deedFile.name ? deedFile.name : '';
      } else {
        preview.hidden = true;
        img.removeAttribute('src');
        if (nameEl) nameEl.textContent = '';
      }
    }

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > DEED_MAX_BYTES) {
        showError('حجم صورة الصك كبير. الحد الأقصى 8 ميجا.');
        input.value = '';
        return;
      }
      if (file.type && !/^image\/(jpeg|jpg|pjpeg|png|webp)$/i.test(file.type)) {
        showError('صيغة صورة الصك غير مدعومة. استخدم JPG أو PNG.');
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
    var step = currentStep();
    if (step && step.type === 'date') return;
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

  function inputHtml(step) {
    var value = answers[step.key] || '';
    var extra = '';
    if (step.type === 'select') {
      extra = '<select class="ejar-wizard__control" id="ejar-wizard-field" data-wizard-field="' + step.key + '" required>'
        + optionHtml(step.options, value) + '</select>';
      if (step.otherKey) {
        extra += '<div class="ejar-wizard__follow"' + (value === step.otherValue ? '' : ' hidden') + ' data-follow="' + step.otherKey + '">'
          + '<label for="ejar-wizard-other">' + escapeHtml(step.otherLabel) + '</label>'
          + '<input class="ejar-wizard__control" id="ejar-wizard-other" data-wizard-field="' + step.otherKey + '" type="text" value="' + escapeHtml(answers[step.otherKey] || '') + '">'
          + '</div>';
      }
      if (step.extraKey) {
        extra += '<div class="ejar-wizard__follow"' + (value === step.extraValue ? '' : ' hidden') + ' data-follow="' + step.extraKey + '">'
          + '<label for="ejar-wizard-extra">' + escapeHtml(step.extraLabel) + '</label>'
          + '<div class="ejar-wizard__affix"><input class="ejar-wizard__control" id="ejar-wizard-extra" data-wizard-field="' + step.extraKey + '" type="number" inputmode="decimal" min="1" step="any" value="' + escapeHtml(answers[step.extraKey] || '') + '"><span>' + escapeHtml(step.extraSuffix || '') + '</span></div>'
          + '</div>';
      }
      return extra;
    }
    if (step.type === 'date') {
      var max = (step.key === 'ownerDob' || step.key === 'tenantDob') ? todayIso() : '';
      if (window.EjarDates && typeof window.EjarDates.pickerHtml === 'function') {
        return window.EjarDates.pickerHtml({
          iso: value,
          maxIso: max,
          fieldKey: step.key,
          mode: dateMode,
        });
      }
      return '<input class="ejar-wizard__control ejar-wizard__control--date" id="ejar-wizard-field" data-wizard-field="' + step.key + '" type="date" dir="ltr" value="' + escapeHtml(value) + '"' + (max ? ' max="' + max + '"' : '') + ' required>'
        + '<div id="ejar-date-preview">' + dualDateHtml(value) + '</div>';
    }
    if (step.type === 'phone') {
      return '<input class="ejar-wizard__control" id="ejar-wizard-field" data-wizard-field="' + step.key + '" type="tel" dir="ltr" inputmode="tel" maxlength="14" placeholder="05xxxxxxxx" autocomplete="tel" value="' + escapeHtml(value) + '" required>';
    }
    if (step.type === 'nid') {
      return '<input class="ejar-wizard__control" id="ejar-wizard-field" data-wizard-field="' + step.key + '" type="text" dir="ltr" inputmode="numeric" maxlength="10" placeholder="1xxxxxxxxx" autocomplete="off" value="' + escapeHtml(value) + '" required>';
    }
    if (step.type === 'number') {
      return '<div class="ejar-wizard__affix"><input class="ejar-wizard__control" id="ejar-wizard-field" data-wizard-field="' + step.key + '" type="number" inputmode="decimal" min="1" step="any" value="' + escapeHtml(value) + '" required><span>' + escapeHtml(step.suffix || '') + '</span></div>';
    }
    return '<input class="ejar-wizard__control" id="ejar-wizard-field" data-wizard-field="' + step.key + '" type="text" inputmode="' + (step.inputmode || 'text') + '" autocomplete="off" value="' + escapeHtml(value) + '" required>';
  }

  function displayValue(key) {
    if (key === 'unitType') {
      if (answers.unitType === 'وحدة تجارية أخرى' && answers.unitTypeOther) return answers.unitTypeOther;
      return answers.unitType || '—';
    }
    if (key === 'floor') {
      if (answers.floor === 'أخرى' && answers.floorOther) return answers.floorOther;
      return answers.floor || '—';
    }
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
    return answers[key] || '—';
  }

  function dualDateHtml(iso) {
    if (window.EjarDates && typeof window.EjarDates.html === 'function') {
      return window.EjarDates.html(iso);
    }
    return iso ? '<span>' + escapeHtml(iso) + '</span>' : '—';
  }

  function isDateField(key) {
    return key === 'deedDate' || key === 'ownerDob' || key === 'tenantDob' || key === 'startDate';
  }

  function firstStepOf(section) {
    var steps = getSteps(kind);
    for (var i = 0; i < steps.length; i += 1) {
      if (steps[i].section === section) return i;
    }
    return 0;
  }

  function reviewSection(title, section, rows) {
    return '<section class="ejar-wizard-review">'
      + '<header><h3>' + escapeHtml(title) + '</h3>'
      + '<button type="button" class="ejar-wizard__edit" data-goto="' + firstStepOf(section) + '">تعديل</button></header>'
      + '<dl>' + rows.map(function (row) {
        var value = row.html ? row.value : escapeHtml(row.value);
        return '<div><dt>' + escapeHtml(row.label) + '</dt><dd>' + value + '</dd></div>';
      }).join('') + '</dl></section>';
  }

  function reviewText(label, key) {
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
    return reviewSection('بيانات الملكية', 'ownership', [
      reviewText('رقم الصك', 'deedNumber'),
      reviewText('تاريخ الصك', 'deedDate'),
    ])
    + reviewSection('بيانات المؤجر', 'owner', [
      reviewText('رقم الهوية', 'ownerId'),
      reviewText('تاريخ الميلاد', 'ownerDob'),
      reviewText('الجوال', 'ownerPhone'),
    ])
    + reviewSection('بيانات المستأجر', 'tenant', [
      reviewText('رقم الهوية', 'tenantId'),
      reviewText('تاريخ الميلاد', 'tenantDob'),
      reviewText('الجوال', 'tenantPhone'),
    ])
    + reviewSection('بيانات الوحدة الإيجارية', 'unit', [
      reviewText('النوع', 'unitType'),
      reviewText('الدور', 'floor'),
      reviewText('رقم الوحدة', 'unitNumber'),
      reviewText('المساحة', 'area'),
    ])
    + reviewSection('البيانات المالية', 'finance', [
      reviewText('قيمة الإيجار', 'rentAmount'),
      reviewText('طريقة الدفع', 'paymentMethod'),
      reviewText('مدة العقد', 'contractDuration'),
      reviewText('تاريخ البداية', 'startDate'),
      reviewText('مبلغ الضمان', 'hasDeposit'),
    ])
    + deedUploadHtml()
    + '<label class="ejar-wizard__check">'
    + '<input type="checkbox" id="ejar-wizard-declaration"' + (answers.declarationAccepted ? ' checked' : '') + '>'
    + '<span>' + DECLARATION + '</span></label>'
    + '<p class="ejar-wizard__disclaimer">' + DISCLAIMER + '</p>';
  }

  function deedUploadHtml() {
    var hasFile = !!(deedFile && deedPreviewUrl);
    return '<section class="ejar-deed-upload">'
      + '<h3>صورة الصك <small>اختياري عند الحاجة</small></h3>'
      + '<p>أرفق صورة واضحة للصك إن توفرت، لتسهيل مراجعة الطلب وإنشاء العقد عبر منصة إيجار.</p>'
      + '<label class="ejar-deed-upload__drop">'
      + '<input type="file" id="ejar-deed-file" accept="image/jpeg,image/png,image/webp,image/*">'
      + '<span class="ejar-deed-upload__cta">اضغط لاختيار صورة أو التقاطها من الكاميرا</span>'
      + '<span class="ejar-deed-upload__hint">JPG أو PNG — بحد أقصى 8 ميجا</span>'
      + '</label>'
      + '<div class="ejar-deed-upload__preview"' + (hasFile ? '' : ' hidden') + '>'
      + (hasFile ? '<img src="' + escapeHtml(deedPreviewUrl) + '" alt="معاينة صورة الصك">' : '<img alt="معاينة صورة الصك">')
      + '<p class="ejar-deed-upload__name">' + escapeHtml(deedFile && deedFile.name ? deedFile.name : '') + '</p>'
      + '<button type="button" class="btn btn-outline ejar-deed-upload__remove" id="ejar-deed-remove">إزالة الصورة</button>'
      + '</div></section>';
  }

  function successHtml(referenceNo) {
    return '<div class="ejar-wizard__success">'
      + '<div class="ejar-wizard__success-icon" aria-hidden="true">✓</div>'
      + '<h2>تم استلام طلبك بنجاح</h2>'
      + '<p class="ejar-wizard__ref">رقم الطلب: <strong dir="ltr">' + escapeHtml(referenceNo) + '</strong></p>'
      + '<p>سيقوم فريق مكتب الهيف للخدمات العقارية بمراجعة البيانات وإنشاء العقد عبر منصة إيجار، ثم استكمال إجراءات التوثيق مع الأطراف.</p>'
      + '<button type="button" class="btn btn-primary ejar-wizard__done">إغلاق</button>'
      + '</div>';
  }

  function render() {
    var steps = getSteps(kind);
    var step = steps[stepIndex];
    var isReview = step.type === 'review';
    var isFirst = stepIndex === 0;
    var body = isReview
      ? reviewHtml()
      : '<div class="ejar-wizard__question"><label' + (step.type === 'date' ? '' : ' for="ejar-wizard-field"') + '>' + escapeHtml(step.label) + '</label>'
        + inputHtml(step) + '</div>';

    ensureRoot().innerHTML = ''
      + '<div class="ejar-wizard__backdrop" tabindex="-1"></div>'
      + '<div class="ejar-wizard__panel" role="dialog" aria-modal="true" aria-labelledby="ejar-wizard-title">'
      + '<button type="button" class="ejar-wizard__close" aria-label="إغلاق">×</button>'
      + '<header class="ejar-wizard__head">'
      + '<div class="ejar-wizard__kinds" role="tablist" aria-label="نوع العقد">'
      + '<button type="button" class="ejar-wizard__kind' + (kind === 'residential' ? ' is-active' : '') + '" data-kind="residential" role="tab" aria-selected="' + (kind === 'residential' ? 'true' : 'false') + '">عقد سكني</button>'
      + '<button type="button" class="ejar-wizard__kind' + (kind === 'commercial' ? ' is-active' : '') + '" data-kind="commercial" role="tab" aria-selected="' + (kind === 'commercial' ? 'true' : 'false') + '">عقد تجاري</button>'
      + '</div>'
      + '<h2 id="ejar-wizard-title">' + escapeHtml(titleFor(kind)) + '</h2>'
      + '<p class="ejar-wizard__price">' + escapeHtml(priceText(kind)) + '</p>'
      + '<p class="ejar-wizard__lead">' + LEAD + '</p>'
      + '<p class="ejar-wizard__trust">' + TRUST + '</p>'
      + '</header>'
      + progressHtml(steps, stepIndex)
      + '<form class="ejar-wizard__form" novalidate>'
      + '<input type="hidden" name="contractKind" value="' + (kind === 'commercial' ? 'commercial' : 'residential') + '">'
      + '<input type="hidden" name="contractType" value="' + (kind === 'commercial' ? 'تجاري' : 'سكني') + '">'
      + '<input type="text" name="website" class="ejar-hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
      + '<p class="ejar-wizard__error" role="alert" hidden></p>'
      + '<div class="ejar-wizard__body">' + body + '</div>'
      + '<div class="ejar-wizard__nav">'
      + '<button type="button" class="btn btn-outline ejar-wizard__prev"' + (isFirst ? ' disabled hidden' : '') + '>السابق</button>'
      + '<button type="button" class="btn btn-primary ejar-wizard__next">' + (isReview ? 'إرسال طلب إنشاء العقد' : 'التالي') + '</button>'
      + '</div>'
      + '</form></div>';

    bindRendered();
  }

  function bindRendered() {
    root.querySelectorAll('.ejar-wizard__kind').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchKind(btn.getAttribute('data-kind'));
      });
    });
    root.querySelector('.ejar-wizard__prev').addEventListener('click', prev);
    root.querySelector('.ejar-wizard__next').addEventListener('click', next);
    var form = root.querySelector('.ejar-wizard__form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      next();
    });
    var field = root.querySelector('#ejar-wizard-field');
    if (field) {
      field.addEventListener('input', hideError);
      field.addEventListener('change', function () {
        answers[field.getAttribute('data-wizard-field')] = field.value;
        var step = currentStep();
        if (step.otherKey) {
          var box = root.querySelector('[data-follow="' + step.otherKey + '"]');
          if (box) box.hidden = field.value !== step.otherValue;
        }
        if (step.extraKey) {
          var extraBox = root.querySelector('[data-follow="' + step.extraKey + '"]');
          if (extraBox) extraBox.hidden = field.value !== step.extraValue;
        }
        saveDraft();
      });
    }
    bindDateChooser();
    bindDatePicker();
    bindDeedUpload();
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
    var k = kind === 'commercial' ? 'commercial' : 'residential';
    return {
      contractKind: k,
      contractType: k === 'commercial' ? 'تجاري' : 'سكني',
      kind: k,
      deedNumber: answers.deedNumber,
      deedDate: answers.deedDate,
      ownerId: answers.ownerId,
      ownerDob: answers.ownerDob,
      ownerPhone: answers.ownerPhone,
      tenantId: answers.tenantId,
      tenantDob: answers.tenantDob,
      tenantPhone: answers.tenantPhone,
      unitType: answers.unitType,
      unitTypeOther: answers.unitTypeOther,
      floor: answers.floor,
      floorOther: answers.floorOther,
      unitNumber: answers.unitNumber,
      area: answers.area,
      rentAmount: answers.rentAmount,
      paymentMethod: answers.paymentMethod,
      contractDuration: answers.contractDuration,
      contractDurationOther: answers.contractDurationOther,
      startDate: answers.startDate,
      hasDeposit: answers.hasDeposit,
      depositAmount: answers.depositAmount,
      declarationAccepted: true,
      website: (root.querySelector('.ejar-hp') && root.querySelector('.ejar-hp').value) || '',
    };
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
    var headers = {};
    var body;
    if (deedFile) {
      var fd = new FormData();
      fd.append('payload', JSON.stringify(data));
      Object.keys(data).forEach(function (key) {
        var val = data[key];
        if (val == null || val === false) return;
        fd.append(key, val === true ? 'true' : String(val));
      });
      fd.append('deedImage', deedFile, deedFile.name || 'deed.jpg');
      body = fd;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }
    fetch('/api/ejar/contracts', {
      method: 'POST',
      headers: headers,
      body: body,
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (result.data && result.data.success) {
          resetForm();
          showSuccess(result.data.referenceNo || result.data.requestId);
          return;
        }
        throw new Error((result.data && result.data.message) || 'تعذر إرسال الطلب');
      })
      .catch(function (err) {
        submitting = false;
        btn.disabled = false;
        btn.textContent = original;
        showError(err.message || 'تعذر إرسال الطلب');
      });
  }

  function showSuccess(referenceNo) {
    submitting = false;
    ensureRoot().innerHTML = ''
      + '<div class="ejar-wizard__backdrop"></div>'
      + '<div class="ejar-wizard__panel ejar-wizard__panel--success" role="dialog" aria-modal="true" aria-labelledby="ejar-wizard-title">'
      + '<button type="button" class="ejar-wizard__close" aria-label="إغلاق">×</button>'
      + successHtml(referenceNo)
      + '</div>';
    root.querySelector('.ejar-wizard__done').addEventListener('click', function () {
      close();
    });
    root.querySelector('.ejar-wizard__backdrop').addEventListener('click', close);
  }

  window.EjarWizard = { open: open, close: close };
})();
