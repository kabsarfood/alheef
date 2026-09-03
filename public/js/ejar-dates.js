/**
 * تواريخ عقود إيجار — ميلادي + هجري أم القرى
 * معبئ البيانات يختار نوع التقويم أولاً، ثم يظهر حقل ذلك النوع فقط.
 */
(function (global) {
  'use strict';

  var TZ = 'Asia/Riyadh';
  var HIJRI_MONTHS = [
    '',
    'محرم',
    'صفر',
    'ربيع الأول',
    'ربيع الآخر',
    'جمادى الأولى',
    'جمادى الآخرة',
    'رجب',
    'شعبان',
    'رمضان',
    'شوال',
    'ذو القعدة',
    'ذو الحجة',
  ];

  function parseIso(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    var dt = new Date(y, mo - 1, d, 12, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function toIso(date) {
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function fmt(date, options) {
    try {
      return new Intl.DateTimeFormat('ar-SA', Object.assign({ timeZone: TZ, numberingSystem: 'latn' }, options)).format(date);
    } catch (_) {
      return new Intl.DateTimeFormat('ar-SA', Object.assign({ timeZone: TZ }, options)).format(date);
    }
  }

  function hijriParts(date) {
    var parts;
    try {
      parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
        timeZone: TZ,
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }).formatToParts(date);
    } catch (_) {
      parts = new Intl.DateTimeFormat('en-u-ca-islamic-nu-latn', {
        timeZone: TZ,
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }).formatToParts(date);
    }
    var map = {};
    parts.forEach(function (p) {
      if (p.type !== 'literal') map[p.type] = p.value;
    });
    return {
      year: parseInt(map.year, 10) || 0,
      month: parseInt(map.month, 10) || 0,
      day: parseInt(map.day, 10) || 0,
    };
  }

  function compareHijri(a, b) {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  }

  function hijriToDate(hy, hm, hd) {
    hy = parseInt(hy, 10);
    hm = parseInt(hm, 10);
    hd = parseInt(hd, 10);
    if (!hy || !hm || !hd) return null;
    var approxYear = Math.floor(hy * 0.970224 + 621.57);
    var date = new Date(approxYear, Math.max(0, hm - 2), Math.min(hd, 28), 12, 0, 0);
    var target = { year: hy, month: hm, day: hd };
    for (var i = 0; i < 800; i += 1) {
      var cur = hijriParts(date);
      var cmp = compareHijri(cur, target);
      if (cmp === 0) return date;
      date.setDate(date.getDate() + (cmp < 0 ? 1 : -1));
    }
    return null;
  }

  function hijriMonthLength(hy, hm) {
    if (hijriToDate(hy, hm, 30)) return 30;
    if (hijriToDate(hy, hm, 29)) return 29;
    return 0;
  }

  function currentHijriYear() {
    return hijriParts(new Date()).year || 1448;
  }

  function withEra(text, era) {
    var trimmed = String(text || '').replace(/\s+/g, ' ').trim();
    if (trimmed.endsWith('هـ') || trimmed.endsWith('م')) return trimmed;
    return trimmed + ' ' + era;
  }

  function gregorianWords(date) {
    return withEra(fmt(date, {
      calendar: 'gregory',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }), 'م');
  }

  function hijriWords(date) {
    try {
      return withEra(fmt(date, {
        calendar: 'islamic-umalqura',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }), 'هـ');
    } catch (_) {
      return withEra(fmt(date, {
        calendar: 'islamic',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }), 'هـ');
    }
  }

  function gregorianLong(date) {
    return withEra(fmt(date, {
      calendar: 'gregory',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }), 'م');
  }

  function gregorianNum(date) {
    return toIso(date).replace(/-/g, '/');
  }

  function hijriLong(date) {
    try {
      return withEra(fmt(date, {
        calendar: 'islamic-umalqura',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }), 'هـ');
    } catch (_) {
      return withEra(fmt(date, {
        calendar: 'islamic',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }), 'هـ');
    }
  }

  function hijriNum(date) {
    var p = hijriParts(date);
    if (!p.year) return '';
    return p.year + '/' + String(p.month).padStart(2, '0') + '/' + String(p.day).padStart(2, '0');
  }

  function format(iso) {
    var date = parseIso(iso);
    if (!date) return null;
    return {
      gregorianLong: gregorianLong(date),
      gregorianNum: gregorianNum(date),
      hijriLong: hijriLong(date),
      hijriNum: hijriNum(date),
      hijri: hijriParts(date),
    };
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function optionList(from, to, selected, pad) {
    var html = '';
    var step = from <= to ? 1 : -1;
    for (var n = from; step > 0 ? n <= to : n >= to; n += step) {
      var label = pad ? String(n).padStart(2, '0') : String(n);
      html += '<option value="' + n + '"' + (Number(selected) === n ? ' selected' : '') + '>' + label + '</option>';
    }
    return html;
  }

  function monthOptions(selected) {
    var html = '<option value="">الشهر</option>';
    for (var i = 1; i <= 12; i += 1) {
      html += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>' + HIJRI_MONTHS[i] + '</option>';
    }
    return html;
  }

  function dayOptions(hy, hm, selected) {
    var html = '<option value="">اليوم</option>';
    var len = hy && hm ? hijriMonthLength(hy, hm) : 30;
    for (var i = 1; i <= len; i += 1) {
      html += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>' + String(i).padStart(2, '0') + '</option>';
    }
    return html;
  }

  function line(iso) {
    var date = parseIso(iso);
    if (!date) return '';
    return hijriWords(date) + ' الموافق ' + gregorianWords(date);
  }

  function html(iso, emptyText) {
    var text = line(iso);
    if (!text) {
      return '<p class="ejar-date-text ejar-date-text--empty">' + escapeHtml(emptyText || 'سيظهر التاريخ بعد الاختيار') + '</p>';
    }
    return '<p class="ejar-date-text" dir="rtl">' + escapeHtml(text) + '</p>';
  }

  function plain(iso) {
    return line(iso);
  }

  function orbHtml(mode, letter, title, sub) {
    return ''
      + '<button type="button" class="ejar-date-orb" data-date-mode="' + escapeHtml(mode) + '" aria-pressed="false">'
      + '  <span class="ejar-date-orb__circle" aria-hidden="true"><span class="ejar-date-orb__letter">' + letter + '</span></span>'
      + '  <span class="ejar-date-orb__meta">'
      + '    <span class="ejar-date-orb__title">' + title + '</span>'
      + '    <span class="ejar-date-orb__sub">' + sub + '</span>'
      + '  </span>'
      + '</button>';
  }

  function pickerHtml(opts) {
    opts = opts || {};
    var iso = opts.iso || '';
    var maxIso = opts.maxIso || '';
    var fieldKey = opts.fieldKey || 'date';
    var mode = opts.mode === 'hijri' || opts.mode === 'gregorian' ? opts.mode : '';
    var date = parseIso(iso);
    var hijri = date ? hijriParts(date) : { year: '', month: '', day: '' };
    var maxHijri = currentHijriYear() + (maxIso ? 0 : 5);
    var minHijri = 1350;
    var yearSelected = hijri.year || '';
    var hint = !mode ? 'اختر نوع التقويم' : (mode === 'hijri' ? 'أدخل التاريخ الهجري' : 'أدخل التاريخ الميلادي');

    return ''
      + '<div class="ejar-date-picker" data-max-iso="' + escapeHtml(maxIso) + '" data-date-mode="' + escapeHtml(mode) + '">'
      + '  <div class="ejar-date-chooser">'
      + '    <p class="ejar-date-chooser__hint" id="ejar-date-chooser-hint">' + hint + '</p>'
      + '    <div class="ejar-date-orbs" role="group" aria-labelledby="ejar-date-chooser-hint">'
      + orbHtml('hijri', 'هـ', 'هجري', 'تقويم أم القرى')
      + orbHtml('gregorian', 'م', 'ميلادي', 'التقويم الميلادي')
      + '    </div>'
      + '    <button type="button" class="ejar-date-chooser__change"' + (mode ? '' : ' hidden') + '>تغيير نوع التقويم</button>'
      + '  </div>'
      + '  <div class="ejar-date-hijri" data-date-panel="hijri"' + (mode === 'hijri' ? '' : ' hidden') + '>'
      + '    <label class="ejar-date-hijri__item"><span>السنة</span><select class="ejar-wizard__control" data-hijri="year" aria-label="السنة الهجرية"><option value="">السنة</option>' + optionList(maxHijri, minHijri, yearSelected) + '</select></label>'
      + '    <label class="ejar-date-hijri__item"><span>الشهر</span><select class="ejar-wizard__control" data-hijri="month" aria-label="الشهر الهجري">' + monthOptions(hijri.month) + '</select></label>'
      + '    <label class="ejar-date-hijri__item"><span>اليوم</span><select class="ejar-wizard__control" data-hijri="day" aria-label="اليوم الهجري">' + dayOptions(hijri.year, hijri.month, hijri.day) + '</select></label>'
      + '  </div>'
      + '  <label class="ejar-date-gregorian" data-date-panel="gregorian"' + (mode === 'gregorian' ? '' : ' hidden') + ' for="ejar-date-gregorian"><span>التاريخ الميلادي</span>'
      + '    <input class="ejar-wizard__control ejar-wizard__control--date" id="ejar-date-gregorian" type="date" dir="ltr" lang="ar-SA" autocomplete="off" value="' + escapeHtml(iso) + '"' + (maxIso ? ' max="' + escapeHtml(maxIso) + '"' : '') + '>'
      + '  </label>'
      + '  <input type="hidden" id="ejar-wizard-field" data-wizard-field="' + escapeHtml(fieldKey) + '" value="' + escapeHtml(iso) + '" required>'
      + '  <div id="ejar-date-preview">' + html(iso) + '</div>'
      + '</div>';
  }

  function fillHijriSelects(rootEl, iso) {
    if (!rootEl) return;
    var date = parseIso(iso);
    var yearEl = rootEl.querySelector('[data-hijri="year"]');
    var monthEl = rootEl.querySelector('[data-hijri="month"]');
    var dayEl = rootEl.querySelector('[data-hijri="day"]');
    if (!date || !yearEl || !monthEl || !dayEl) return;
    var p = hijriParts(date);
    yearEl.value = String(p.year);
    monthEl.value = String(p.month);
    dayEl.innerHTML = dayOptions(p.year, p.month, p.day);
  }

  global.EjarDates = {
    parseIso: parseIso,
    toIso: toIso,
    format: format,
    line: line,
    html: html,
    plain: plain,
    pickerHtml: pickerHtml,
    hijriParts: hijriParts,
    hijriToDate: hijriToDate,
    hijriMonthLength: hijriMonthLength,
    dayOptions: dayOptions,
    fillHijriSelects: fillHijriSelects,
    months: HIJRI_MONTHS,
  };
})(typeof window !== 'undefined' ? window : global);
