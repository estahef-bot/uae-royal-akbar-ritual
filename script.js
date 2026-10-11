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
    yearEl.textContent = '1999–' + new Date().getFullYear();
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

/* Homepage photo carousel. Navigation occurs only through the final slide link. */
document.addEventListener('DOMContentLoaded', function () {
  var carousel = document.querySelector('.home-slideshow');
  if (!carousel) return;
  var slides = Array.from(carousel.querySelectorAll('.home-slide'));
  var index = 0;
  var paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var timer;
  var play = document.getElementById('homeSlidePlay');
  function render() {
    slides.forEach(function(slide, i) { slide.hidden = i !== index; });
    document.getElementById('homeSlideCount').textContent = (index + 1) + ' / ' + slides.length;
    play.textContent = paused ? 'Play slideshow' : 'Pause slideshow';
    play.setAttribute('aria-pressed', String(paused));
  }
  function step(delta) { index = (index + delta + slides.length) % slides.length; render(); }
  function restart() {
    clearInterval(timer);
    timer = setInterval(function() {
      if (!paused && !document.hidden && !carousel.matches(':hover') && !carousel.contains(document.activeElement)) step(1);
    }, 2000);
  }
  document.getElementById('homeSlidePrev').addEventListener('click', function() { step(-1); restart(); });
  document.getElementById('homeSlideNext').addEventListener('click', function() { step(1); restart(); });
  play.addEventListener('click', function() { paused = !paused; render(); restart(); });
  carousel.querySelectorAll('img').forEach(function(img) { img.loading = 'eager'; });
  render(); restart();
});
