/* ==========================================================================
   UAE Ministry of Culture — Gallery Page
   Filtering, search, sorting, pagination, lightbox, a11y & UI preferences.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     Data — single source of truth for gallery cards.
     Swap `src` values for approved Ministry photography when available.
     ---------------------------------------------------------------------- */
  var ITEMS = [
    {
      src: 'assets/gallery/royal-gathering.jpg',
      category: 'ceremony',
      categoryLabel: 'Ceremony',
      title: 'Royal Gathering',
      date: '2026-04-18',
      description: 'Families and dignitaries assemble in the majlis, where counsel is exchanged and the union receives its formal blessing.'
    },
    {
      src: 'assets/gallery/heritage-attire.jpg',
      category: 'traditions',
      categoryLabel: 'Traditions',
      title: 'Heritage Attire',
      date: '2026-04-11',
      description: 'Hand-embroidered ceremonial textiles, worked in gold thread by Emirati artisans whose techniques pass between generations.'
    },
    {
      src: 'assets/gallery/official-documentation.jpg',
      category: 'documents',
      categoryLabel: 'Documents',
      title: 'Official Documentation',
      date: '2026-03-29',
      description: 'The marriage contract recorded before witnesses — the legal and spiritual cornerstone of the Akbar Ritual.'
    },
    {
      src: 'assets/gallery/traditional-artifacts.jpg',
      category: 'culture',
      categoryLabel: 'Culture',
      title: 'Traditional Artifacts',
      date: '2026-03-14',
      description: 'The dallah, incense burner and khanjar: objects of hospitality and honour central to Emirati ceremonial life.'
    },
    {
      src: 'assets/gallery/community-unity.jpg',
      category: 'people',
      categoryLabel: 'People',
      title: 'Community and Unity',
      date: '2026-02-26',
      description: 'The wider community gathers in support of both families, affirming the social bonds the ritual is built upon.'
    },
    {
      src: 'assets/gallery/generations-together.jpg',
      category: 'people',
      categoryLabel: 'Heritage',
      title: 'Generations Together',
      date: '2026-02-09',
      description: 'An elder shares counsel with a younger member of the family — the living transmission at the heart of the tradition.'
    },
    {
      src: 'assets/gallery/royal-falcon.jpg',
      category: 'traditions',
      categoryLabel: 'Traditions',
      title: 'The Royal Falcon',
      date: '2026-01-22',
      description: 'Falconry remains an enduring emblem of Emirati identity, nobility and the nation\u2019s bond with the desert.'
    },
    {
      src: 'assets/gallery/symbols-nation.jpg',
      category: 'locations',
      categoryLabel: 'Locations',
      title: 'Symbols of the Nation',
      date: '2026-01-08',
      description: 'The flag above a historic fort — heritage architecture standing alongside the modern identity of the Emirates.'
    },
    {
      src: 'assets/family-council.jpg',
      category: 'royal-family',
      categoryLabel: 'Royal Family',
      title: 'Majlis Al Ahl',
      date: '2025-12-19',
      description: 'Elders of both families exchange counsel and consent, opening the first stage of the Royal Akbar Ritual.'
    },
    {
      src: 'assets/marriage-contract.jpg',
      category: 'documents',
      categoryLabel: 'Documents',
      title: 'Al Milcha — The Contract',
      date: '2025-12-02',
      description: 'The contract is formalised before witnesses, accompanied by the presentation of the dowry and traditional vows.'
    },
    {
      src: 'assets/henna-adornment.jpg',
      category: 'traditions',
      categoryLabel: 'Traditions',
      title: 'Henna Adornment',
      date: '2025-11-15',
      description: 'Intricate henna is applied to the bride in a gathering of women, marking celebration, blessing and beauty.'
    },
    {
      src: 'assets/ceremonial-procession.jpg',
      category: 'ceremony',
      categoryLabel: 'Ceremony',
      title: 'Ceremonial Procession',
      date: '2025-10-30',
      description: 'The zaffa carries the couple forward by lantern light, accompanied by traditional music and verse.'
    }
  ];

  var PER_PAGE = 8;

  /* ---------------------------------------------------------------------- */
  var grid = document.getElementById('g-grid');
  var pager = document.getElementById('g-pagination');
  var emptyMsg = document.getElementById('g-empty');
  var resultCount = document.getElementById('g-resultcount');
  var searchInput = document.getElementById('gallery-search');
  var sortSelect = document.getElementById('gallery-sort');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.g-chip'));

  var state = { filter: 'all', query: '', sort: 'newest', page: 1 };
  var visible = [];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function computeVisible() {
    var q = state.query.trim().toLowerCase();

    var list = ITEMS.filter(function (item) {
      var matchesCat = state.filter === 'all' || item.category === state.filter;
      if (!matchesCat) return false;
      if (!q) return true;
      return (item.title + ' ' + item.categoryLabel + ' ' + item.description)
        .toLowerCase().indexOf(q) !== -1;
    });

    list.sort(function (a, b) {
      switch (state.sort) {
        case 'oldest': return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        case 'az': return a.title.localeCompare(b.title);
        case 'za': return b.title.localeCompare(a.title);
        default: return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
      }
    });

    return list;
  }

  function render() {
    visible = computeVisible();

    var totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;

    var start = (state.page - 1) * PER_PAGE;
    var pageItems = visible.slice(start, start + PER_PAGE);

    grid.innerHTML = pageItems.map(function (item, i) {
      var index = start + i;
      return '' +
        '<button type="button" class="g-card" data-index="' + index + '" ' +
        'aria-label="View image: ' + escapeHtml(item.title) + '">' +
          '<span class="g-card-media">' +
            '<img src="' + escapeHtml(item.src) + '" alt="' + escapeHtml(item.title) + ' — ' + escapeHtml(item.description) + '" loading="lazy">' +
          '</span>' +
          '<span class="g-card-body">' +
            '<span>' +
              '<span class="g-card-cat">' + escapeHtml(item.categoryLabel) + '</span>' +
              '<span class="g-card-title">' + escapeHtml(item.title) + '</span>' +
            '</span>' +
            '<span class="g-card-arrow" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M13.2 5.6 19.6 12l-6.4 6.4-1.4-1.42L15.76 13H4v-2h11.76l-4-3.98 1.44-1.42Z"/></svg>' +
            '</span>' +
          '</span>' +
        '</button>';
    }).join('');

    emptyMsg.hidden = visible.length !== 0;
    resultCount.textContent = visible.length
      ? 'Showing ' + (start + 1) + '–' + Math.min(start + PER_PAGE, visible.length) + ' of ' + visible.length + ' images'
      : '';

    renderPager(totalPages);
  }

  function renderPager(totalPages) {
    if (visible.length <= PER_PAGE) { pager.innerHTML = ''; return; }

    var html = '<button type="button" class="g-page" data-page="prev" aria-label="Previous page"' +
      (state.page === 1 ? ' disabled' : '') +
      '><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M15.4 5.6 9 12l6.4 6.4 1.4-1.42L11.83 12l4.97-4.98Z"/></svg></button>';

    for (var p = 1; p <= totalPages; p++) {
      html += '<button type="button" class="g-page' + (p === state.page ? ' is-active' : '') + '" ' +
        'data-page="' + p + '" aria-label="Page ' + p + '"' +
        (p === state.page ? ' aria-current="page"' : '') + '>' + p + '</button>';
    }

    html += '<button type="button" class="g-page" data-page="next" aria-label="Next page"' +
      (state.page === totalPages ? ' disabled' : '') +
      '><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8.6 5.6 15 12l-6.4 6.4-1.4-1.42L12.17 12 7.2 7.02Z"/></svg></button>';

    pager.innerHTML = html;
  }

  /* ---------------- Controls ---------------- */
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) {
        c.classList.remove('is-active');
        c.setAttribute('aria-selected', 'false');
      });
      chip.classList.add('is-active');
      chip.setAttribute('aria-selected', 'true');
      state.filter = chip.getAttribute('data-filter');
      state.page = 1;
      render();
    });
  });

  var searchTimer;
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = searchInput.value;
        state.page = 1;
        render();
      }, 160);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', function () {
      state.sort = sortSelect.value;
      state.page = 1;
      render();
    });
  }

  pager.addEventListener('click', function (e) {
    var btn = e.target.closest('.g-page');
    if (!btn || btn.disabled) return;
    var val = btn.getAttribute('data-page');
    var totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));

    if (val === 'prev') state.page = Math.max(1, state.page - 1);
    else if (val === 'next') state.page = Math.min(totalPages, state.page + 1);
    else state.page = parseInt(val, 10);

    render();
    document.querySelector('.g-grid-inner').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------------- Lightbox ---------------- */
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lb-img');
  var lbCat = document.getElementById('lb-cat');
  var lbTitle = document.getElementById('lb-title');
  var lbDesc = document.getElementById('lb-desc');
  var lbCounter = document.getElementById('lb-counter');
  var lbIndex = 0;
  var lastFocused = null;

  function showLightbox(index) {
    if (!visible.length) return;
    lbIndex = (index + visible.length) % visible.length;
    var item = visible[lbIndex];

    lbImg.src = item.src;
    lbImg.alt = item.title + ' — ' + item.description;
    lbCat.textContent = item.categoryLabel;
    lbTitle.textContent = item.title;
    lbDesc.textContent = item.description;
    lbCounter.textContent = 'Image ' + (lbIndex + 1) + ' of ' + visible.length;
  }

  function openLightbox(index) {
    lastFocused = document.activeElement;
    showLightbox(index);
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    document.querySelector('.lb-close').focus();
  }

  function closeLightbox() {
    lb.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.g-card');
    if (!card) return;
    openLightbox(parseInt(card.getAttribute('data-index'), 10));
  });

  document.getElementById('lb-prev').addEventListener('click', function () { showLightbox(lbIndex - 1); });
  document.getElementById('lb-next').addEventListener('click', function () { showLightbox(lbIndex + 1); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-lb-close]'), function (el) {
    el.addEventListener('click', closeLightbox);
  });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showLightbox(lbIndex - 1);
    else if (e.key === 'ArrowRight') showLightbox(lbIndex + 1);
    else if (e.key === 'Tab') {
      // Simple focus trap within the viewer.
      var focusables = lb.querySelectorAll('button');
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- Header / preferences ---------------- */
  var navToggle = document.getElementById('gov-nav-toggle');
  var nav = document.getElementById('gov-nav');
  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var themeToggle = document.getElementById('theme-toggle');
  function applyTheme(dark) {
    document.body.classList.toggle('is-dark', dark);
    if (themeToggle) themeToggle.setAttribute('aria-pressed', String(dark));
    try { localStorage.setItem('uae-gallery-theme', dark ? 'dark' : 'light'); } catch (err) {}
  }
  if (themeToggle) {
    var savedTheme = null;
    try { savedTheme = localStorage.getItem('uae-gallery-theme'); } catch (err) {}
    if (savedTheme === 'dark') applyTheme(true);
    themeToggle.addEventListener('click', function () {
      applyTheme(!document.body.classList.contains('is-dark'));
    });
  }

  var sizeButtons = Array.prototype.slice.call(document.querySelectorAll('[data-textsize]'));
  function applySize(size) {
    document.body.classList.remove('ts-sm', 'ts-lg');
    if (size === 'sm') document.body.classList.add('ts-sm');
    if (size === 'lg') document.body.classList.add('ts-lg');
    sizeButtons.forEach(function (b) {
      var on = b.getAttribute('data-textsize') === size;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    try { localStorage.setItem('uae-gallery-textsize', size); } catch (err) {}
  }
  sizeButtons.forEach(function (b) {
    b.addEventListener('click', function () { applySize(b.getAttribute('data-textsize')); });
  });
  try {
    var savedSize = localStorage.getItem('uae-gallery-textsize');
    if (savedSize) applySize(savedSize);
  } catch (err) {}

  // Arabic toggle — mirrors layout direction for RTL preview.
  var langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.addEventListener('click', function () {
      var rtl = document.documentElement.getAttribute('dir') !== 'rtl';
      document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      langToggle.textContent = rtl ? 'English' : 'العربية';
      langToggle.setAttribute('lang', rtl ? 'en' : 'ar');
    });
  }

  // Top utility search scrolls to and seeds the gallery search.
  var govSearch = document.getElementById('gov-search-input');
  if (govSearch) {
    govSearch.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      searchInput.value = govSearch.value;
      state.query = govSearch.value;
      state.page = 1;
      render();
      document.querySelector('.g-controls').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  var yearEl = document.getElementById('gyear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  render();
})();
