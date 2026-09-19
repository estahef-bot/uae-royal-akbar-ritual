var RTL_LANGS = ['ar', 'he'];

function applyTranslations(lang) {
  var dict = window.translations && window.translations[lang];
  if (!dict) return;

  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    var key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) el.setAttribute('placeholder', dict[key]);
  });

  var isRtl = RTL_LANGS.indexOf(lang) !== -1;
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.body.classList.toggle('rtl', isRtl);

  try { localStorage.setItem('uae-akbar-lang', lang); } catch (e) {}
}

document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
      var expanded = nav.classList.contains('open');
      toggle.setAttribute('aria-expanded', String(expanded));
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  var form = document.querySelector('.contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('button[type="submit"]');
      if (button) {
        button.textContent = 'Request Received';
        button.disabled = true;
      }
    });
  }

  var langSelect = document.getElementById('lang-select');
  if (langSelect) {
    var saved = null;
    try { saved = localStorage.getItem('uae-akbar-lang'); } catch (e) {}
    var initial = saved && window.translations && window.translations[saved] ? saved : 'en';
    langSelect.value = initial;
    applyTranslations(initial);

    langSelect.addEventListener('change', function () {
      applyTranslations(langSelect.value);
    });
  }
});
