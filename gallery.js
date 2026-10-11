(function () {
  'use strict';

  var PAGE_SIZE = 4;

  document.addEventListener('DOMContentLoaded', function () {
    initNavToggle();
    initTheme();
    initFontSize();
    initGallery();
    initLightbox();
    initCardSlideshow();
  });

  var slideshowPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function syncPlayback() {
    ['gSlideshowToggle', 'gLbPlay'].forEach(function(id) {
      var button = document.getElementById(id);
      button.textContent = slideshowPaused ? 'Play slideshow' : 'Pause slideshow';
      button.setAttribute('aria-pressed', String(slideshowPaused));
    });
  }
  function initCardSlideshow() {
    syncPlayback();
    ['gSlideshowToggle', 'gLbPlay'].forEach(function(id) {
      document.getElementById(id).addEventListener('click', function() {
        slideshowPaused = !slideshowPaused;
        syncPlayback();
      });
    });
    document.querySelectorAll('[data-images]').forEach(function(card) {
      var images = card.getAttribute('data-images').split('|');
      var index = 0;
      images.forEach(function(src) { var preload = new Image(); preload.src = src; });
      var badge = document.createElement('span');
      badge.className = 'album-badge';
      badge.textContent = images.length + ' photos';
      card.querySelector('.gcard-media').appendChild(badge);
      window.setInterval(function() {
        if (slideshowPaused || document.hidden || card.hidden || document.getElementById('gLightbox').classList.contains('open')) return;
        index = (index + 1) % images.length;
        card.querySelector('img').src = images[index];
      }, 2000);
    });
    var header = document.querySelector('.site-header');
    new ResizeObserver(function() {
      document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
    }).observe(header);
    document.getElementById('gUtilSearch').addEventListener('input', function(e) {
      var input = document.getElementById('gSearch');
      input.value = e.target.value;
      input.dispatchEvent(new Event('input'));
    });
  }

  /* ---------- Mobile nav ---------- */
  function initNavToggle() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.querySelector('.main-nav');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(nav.classList.contains('open')));
    });
  }

  /* ---------- Dark mode ---------- */
  function initTheme() {
    var btn = document.getElementById('gThemeBtn');
    if (!btn) return;
    var body = document.body;
    var icon = btn.querySelector('use');

    var saved = null;
    try { saved = localStorage.getItem('gallery-theme'); } catch (e) {}
    if (saved === 'dark') applyTheme(true);

    btn.addEventListener('click', function () {
      var isDark = body.classList.toggle('gdark');
      btn.setAttribute('aria-pressed', String(isDark));
      if (icon) icon.setAttribute('href', isDark ? '#i-sun' : '#i-moon');
      try { localStorage.setItem('gallery-theme', isDark ? 'dark' : 'light'); } catch (e) {}
    });

    function applyTheme(isDark) {
      body.classList.toggle('gdark', isDark);
      btn.setAttribute('aria-pressed', String(isDark));
      if (icon) icon.setAttribute('href', isDark ? '#i-sun' : '#i-moon');
    }
  }

  /* ---------- Text size ---------- */
  function initFontSize() {
    var buttons = document.querySelectorAll('.gutil-fontsize button');
    if (!buttons.length) return;
    var body = document.body;

    var saved = null;
    try { saved = localStorage.getItem('gallery-textsize'); } catch (e) {}
    setSize(saved || 'md', false);

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSize(btn.getAttribute('data-size'), true);
      });
    });

    function setSize(size, persist) {
      body.classList.remove('text-sm', 'text-md', 'text-lg');
      body.classList.add('text-' + size);
      buttons.forEach(function (b) {
        var active = b.getAttribute('data-size') === size;
        b.classList.toggle('active', active);
      });
      if (persist) {
        try { localStorage.setItem('gallery-textsize', size); } catch (e) {}
      }
    }
  }

  /* ---------- Gallery: filter / search / sort / paginate ---------- */
  var galleryState = { category: 'all', search: '', sort: 'newest', page: 1 };
  var allCards = [];

  function initGallery() {
    allCards = Array.prototype.slice.call(document.querySelectorAll('.gcard'));

    var filterButtons = document.querySelectorAll('.gfilter');
    filterButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterButtons.forEach(function (b) {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        galleryState.category = btn.getAttribute('data-filter');
        galleryState.page = 1;
        renderGallery();
      });
    });

    var searchInput = document.getElementById('gSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        galleryState.search = searchInput.value.trim().toLowerCase();
        galleryState.page = 1;
        renderGallery();
      });
    }

    var sortSelect = document.getElementById('gSort');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        galleryState.sort = sortSelect.value;
        renderGallery();
      });
    }

    var prevBtn = document.getElementById('gPrev');
    var nextBtn = document.getElementById('gNext');
    if (prevBtn) prevBtn.addEventListener('click', function () {
      if (galleryState.page > 1) { galleryState.page--; renderGallery(); }
    });
    if (nextBtn) nextBtn.addEventListener('click', function () {
      var totalPages = Math.ceil(getFiltered().length / PAGE_SIZE) || 1;
      if (galleryState.page < totalPages) { galleryState.page++; renderGallery(); }
    });

    renderGallery();
  }

  function getFiltered() {
    var list = allCards.filter(function (card) {
      var cat = card.getAttribute('data-category');
      var title = (card.getAttribute('data-title') || '').toLowerCase();
      var matchesCategory = galleryState.category === 'all' || cat === galleryState.category;
      var matchesSearch = !galleryState.search || title.indexOf(galleryState.search) !== -1;
      return matchesCategory && matchesSearch;
    });

    list.sort(function (a, b) {
      if (galleryState.sort === 'az') {
        return (a.getAttribute('data-title') || '').localeCompare(b.getAttribute('data-title') || '');
      }
      var dateA = new Date(a.getAttribute('data-date'));
      var dateB = new Date(b.getAttribute('data-date'));
      return galleryState.sort === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    return list;
  }

  function renderGallery() {
    var filtered = getFiltered();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (galleryState.page > totalPages) galleryState.page = totalPages;

    var start = (galleryState.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    allCards.forEach(function (card) { card.hidden = true; });
    var grid = document.getElementById('gGrid');
    pageItems.forEach(function (card) {
      card.hidden = false;
      grid.appendChild(card);
    });

    var emptyMsg = document.getElementById('gEmpty');
    if (emptyMsg) emptyMsg.hidden = filtered.length > 0;

    renderPagination(totalPages);
    updateLightboxSet(filtered);
  }

  function renderPagination(totalPages) {
    var wrap = document.getElementById('gPagination');
    var numbersEl = document.getElementById('gPageNumbers');
    var prevBtn = document.getElementById('gPrev');
    var nextBtn = document.getElementById('gNext');
    if (!numbersEl) return;

    if (wrap) wrap.style.display = totalPages <= 1 ? 'none' : 'flex';

    numbersEl.innerHTML = '';
    for (var i = 1; i <= totalPages; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(i);
      if (i === galleryState.page) btn.classList.add('active');
      btn.setAttribute('aria-label', 'Page ' + i);
      (function (page) {
        btn.addEventListener('click', function () {
          galleryState.page = page;
          renderGallery();
        });
      })(i);
      numbersEl.appendChild(btn);
    }

    if (prevBtn) prevBtn.disabled = galleryState.page <= 1;
    if (nextBtn) nextBtn.disabled = galleryState.page >= totalPages;
  }

  /* ---------- Lightbox ---------- */
  var lightboxSet = [];
  var lightboxIndex = 0;

  function updateLightboxSet(filtered) {
    lightboxSet = filtered;
  }

  function initLightbox() {
    var overlay = document.getElementById('gLightbox');
    if (!overlay) return;
    var imgEl = document.getElementById('gLbImage');
    var catEl = document.getElementById('gLbCat');
    var titleEl = document.getElementById('gLbTitle');
    var descEl = document.getElementById('gLbDesc');
    var counterEl = document.getElementById('gLbCounter');

    document.addEventListener('click', function (e) {
      var mediaBtn = e.target.closest ? e.target.closest('.gcard-media, .gcard-arrow') : null;
      if (!mediaBtn) return;
      var card = mediaBtn.closest('.gcard');
      if (!card) return;
      var idx = lightboxSet.indexOf(card);
      if (idx === -1) idx = 0;
      openLightbox(idx);
    });

    document.getElementById('gLbClose').addEventListener('click', closeLightbox);
    document.getElementById('gLbBackdrop').addEventListener('click', closeLightbox);
    document.getElementById('gLbPrev').addEventListener('click', function () { step(-1); });
    document.getElementById('gLbNext').addEventListener('click', function () { step(1); });

    document.addEventListener('keydown', function (e) {
      if (!overlay.classList.contains('open')) return;
      if (e.key === 'Tab') {
        var buttons = Array.from(overlay.querySelectorAll('button')).filter(function(b) { return !b.hidden; });
        var first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });

    var albumImages = [];
    var albumIndex = 0;

    var returnFocus;
    var albumTimer;
    function openLightbox(index) {
      returnFocus = document.activeElement;
      lightboxIndex = index;
      var selectedCard = lightboxSet[index];
      var images = selectedCard ? selectedCard.getAttribute('data-images') : '';
      albumImages = images ? images.split('|') : [];
      albumIndex = 0;
      renderLightbox();
      overlay.inert = false;
      overlay.classList.add('open');
      document.getElementById('gLbPlay').hidden = !albumImages.length;
      clearInterval(albumTimer);
      albumTimer = setInterval(function() {
        if (!slideshowPaused && !document.hidden && albumImages.length) step(1);
      }, 2000);
      document.getElementById('gLbClose').focus();
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      clearInterval(albumTimer);
      overlay.classList.remove('open');
      overlay.inert = true;
      if (returnFocus) returnFocus.focus();
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function step(delta) {
      if (!lightboxSet.length) return;
      if (albumImages.length) {
        albumIndex = (albumIndex + delta + albumImages.length) % albumImages.length;
      } else {
        lightboxIndex = (lightboxIndex + delta + lightboxSet.length) % lightboxSet.length;
      }
      renderLightbox();
    }

    function renderLightbox() {
      var card = lightboxSet[lightboxIndex];
      if (!card) return;
      var img = card.querySelector('img');
      imgEl.src = albumImages.length ? albumImages[albumIndex] : (img ? img.src : '');
      imgEl.alt = img ? img.alt : '';
      catEl.textContent = card.getAttribute('data-category');
      titleEl.textContent = card.getAttribute('data-title');
      descEl.textContent = card.getAttribute('data-desc') || '';
      counterEl.textContent = albumImages.length ? (albumIndex + 1) + ' / ' + albumImages.length : (lightboxIndex + 1) + ' / ' + lightboxSet.length;
    }
  }
})();
