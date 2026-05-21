/**
 * قائمة الجوال — مشترك بين الصفحات
 */
(function () {
  'use strict';

  function setMenuOpen(open) {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');
    const overlay = document.getElementById('nav-overlay');
    if (!toggle || !nav) return;

    toggle.classList.toggle('active', open);
    nav.classList.toggle('open', open);
    overlay?.classList.toggle('active', open);
    document.documentElement.classList.toggle('nav-open', open);
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    overlay?.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function init() {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('nav');
    const overlay = document.getElementById('nav-overlay');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(!nav.classList.contains('open'));
    });

    overlay?.addEventListener('click', () => setMenuOpen(false));

    nav.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => setMenuOpen(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) setMenuOpen(false);
    });
  }

  window.AlheefNav = {
    open: () => setMenuOpen(true),
    close: () => setMenuOpen(false),
    toggle: () => {
      const nav = document.getElementById('nav');
      setMenuOpen(!nav?.classList.contains('open'));
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
