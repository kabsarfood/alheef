(function () {
  'use strict';

  var root = document.getElementById('ejar-proof');
  if (!root) return;

  var REFRESH_MS = 75000;
  var animated = false;
  var latest = null;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function formatInt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  function formatDecimal(n, decimals) {
    return Number(n).toFixed(decimals);
  }

  function reviewsLabel(count) {
    var n = Number(count) || 0;
    if (n === 0) return 'لا توجد تقييمات معتمدة بعد';
    if (n === 1) return 'من تقييم واحد معتمد';
    if (n === 2) return 'من تقييمين معتمدين';
    if (n >= 3 && n <= 10) return 'من ' + n + ' تقييمات معتمدة';
    return 'من ' + n + ' تقييمًا معتمدًا';
  }

  function setElText(el, text) {
    if (el) el.textContent = text;
  }

  function renderValue(el, value) {
    if (!el) return;
    var decimals = parseInt(el.getAttribute('data-proof-decimals') || '0', 10);
    var suffix = el.getAttribute('data-proof-suffix') || '';
    var text = decimals > 0 ? formatDecimal(value, decimals) : formatInt(value);
    el.textContent = text + suffix;
  }

  function applyStats(stats, withMotion) {
    latest = stats;
    var label = root.querySelector('[data-proof-reviews-label]');
    setElText(label, reviewsLabel(stats.reviewsCount));

    var nodes = root.querySelectorAll('[data-proof-value]');
    if (!withMotion || prefersReducedMotion()) {
      nodes.forEach(function (el) {
        var key = el.getAttribute('data-proof-value');
        renderValue(el, Number(stats[key]) || 0);
      });
      return;
    }

    var duration = 720;
    var start = null;

    function tick(ts) {
      if (start == null) start = ts;
      var p = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      nodes.forEach(function (el) {
        var key = el.getAttribute('data-proof-value');
        var target = Number(stats[key]) || 0;
        renderValue(el, target * eased);
      });
      if (p < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  function fetchStats() {
    return fetch('/api/ejar/trust-stats', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || !data.success) return null;
        return {
          visitors: Number(data.visitors) || 0,
          contracts: Number(data.contracts) || 0,
          reviewsAverage: Number(data.reviewsAverage) || 0,
          reviewsCount: Number(data.reviewsCount) || 0,
        };
      })
      .catch(function () { return null; });
  }

  function startWhenVisible() {
    fetchStats().then(function (stats) {
      if (!stats) return;

      var play = function () {
        if (animated) {
          applyStats(stats, false);
          return;
        }
        animated = true;
        applyStats(stats, true);
      };

      if (!('IntersectionObserver' in window)) {
        play();
        return;
      }

      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          play();
          io.disconnect();
        }
      }, { threshold: 0.35 });
      io.observe(root);
    });
  }

  var reviewsLink = document.getElementById('ejar-proof-reviews');
  if (reviewsLink) {
    reviewsLink.addEventListener('click', function (e) {
      var target = document.getElementById('ejar-reviews');
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    });
  }

  startWhenVisible();
  setInterval(function () {
    fetchStats().then(function (stats) {
      if (!stats) return;
      applyStats(stats, false);
    });
  }, REFRESH_MS);
})();
