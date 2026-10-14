var RTL_LANGS = ['ar', 'he'];

/* Translate a key, falling back to English when the language lacks the key. */
function t(key) {
  var all = window.translations || {};
  var current = document.getElementById('lang-select');
  var lang = (current && current.value) || 'en';
  var dict = all[lang] || {};
  return dict[key] || (all.en && all.en[key]) || '';
}

function applyTranslations(lang) {
  var all = window.translations || {};
  var dict = all[lang];
  if (!dict) return;

  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (dict[key] || (all.en && all.en[key])) {
      el.textContent = dict[key] || all.en[key];
    }
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

  var refreshForm = function () {};

  var form = document.querySelector('.contact-form');
  if (form) {
    var status = document.getElementById('form-status');
    var button = form.querySelector('button[type="submit"]');
    var lastStatus = null;

    function showStatus() {
      if (!status || !lastStatus) return;
      status.textContent = t(lastStatus.key) || lastStatus.fallback || '';
      status.className = 'form-status form-status--' + lastStatus.kind;
      status.hidden = false;
    }

    function setStatus(kind, key, fallback) {
      lastStatus = { kind: kind, key: key, fallback: fallback };
      showStatus();
    }

    /* Server-side error keys map back to the inputs they describe. */
    var FIELD_IDS = { name: '#fullname', email: '#email', reason: '#reason', message: '#message' };

    function clearInvalid() {
      Object.keys(FIELD_IDS).forEach(function (key) {
        var input = form.querySelector(FIELD_IDS[key]);
        if (input) input.removeAttribute('aria-invalid');
      });
    }

    function unlock() {
      if (button) {
        button.disabled = false;
        button.textContent = t('submitBtn') || 'Submit Request';
      }
    }

    /* Re-render the status line and the submit label after a language switch. */
    refreshForm = function () {
      if (button && !button.disabled) button.textContent = t('submitBtn') || 'Submit Request';
      showStatus();
    };

    /* A no-JS submission is answered with a redirect back to /?application=… */
    var outcome = new URLSearchParams(window.location.search).get('application');
    if (outcome === 'received') {
      setStatus('success', 'formSuccess', 'Thank you — your application has been received.');
      if (button) {
        button.disabled = true;
        button.removeAttribute('data-i18n');
        button.textContent = t('formReceived') || 'Request Received';
      }
    } else if (outcome === 'invalid') {
      setStatus('error', 'formInvalid', 'Please check the highlighted fields and try again.');
    } else if (outcome === 'rate_limited') {
      setStatus('error', 'formRateLimit', 'Too many requests. Please try again later.');
    } else if (outcome === 'failed') {
      setStatus('error', 'formError', 'We could not send your application. Please try again.');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (status) status.hidden = true;
      clearInvalid();
      if (button) {
        button.disabled = true;
        button.textContent = t('formSending') || 'Sending…';
      }

      var payload = {
        name: (form.querySelector('#fullname') || {}).value || '',
        email: (form.querySelector('#email') || {}).value || '',
        reason: (form.querySelector('#reason') || {}).value || 'akbar-application',
        message: (form.querySelector('#message') || {}).value || '',
        company: (form.querySelector('#company') || {}).value || ''
      };

      fetch('/api/application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () { return {}; })
            .then(function (data) { return { response: response, data: data }; });
        })
        .then(function (result) {
          if (result.response.status === 429) {
            setStatus('error', 'formRateLimit', 'Too many requests. Please try again later.');
            unlock();
            return;
          }
          if (result.response.ok && result.data && result.data.ok) {
            form.reset();
            setStatus('success', 'formSuccess', 'Thank you — your application has been received.');
            if (button) {
              button.disabled = true;
              button.removeAttribute('data-i18n');
              button.textContent = t('formReceived') || 'Request Received';
            }
            return;
          }
          /* Field errors are translated here and focused; delivery faults get
             the generic message so provider details never reach the visitor. */
          var errors = result.data && result.data.errors;
          var field = errors && Object.keys(errors).length ? Object.keys(errors)[0] : null;
          if (field && FIELD_IDS[field]) {
            setStatus('error', 'formInvalid', 'Please check the highlighted fields and try again.');
            var input = form.querySelector(FIELD_IDS[field]);
            if (input) {
              input.setAttribute('aria-invalid', 'true');
              input.focus();
            }
          } else {
            setStatus('error', 'formError', 'We could not send your application. Please try again.');
          }
          unlock();
        })
        .catch(function () {
          setStatus('error', 'formError', 'We could not send your application. Please try again.');
          unlock();
        });
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
      refreshForm();
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
