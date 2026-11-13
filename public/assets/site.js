/* Progressive enhancement: every biography and card exists in the HTML. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const cleanFilter = value => value === 'all' ? '' : (value || '');
  const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
  const messages = window.SITE_MESSAGES || {};
  const m = (key, params = {}) => String(messages[key] ?? key).replace(/\{([a-zA-Z]+)\}/g, (full, name) => name in params ? String(params[name]) : full);
  const locale = window.SITE_LOCALE || document.documentElement.lang || 'zh-CN';
  const number = new Intl.NumberFormat(locale, { useGrouping: false });
  const languageLinks = $$('[data-language]');
  function syncLanguageLinks() {
    languageLinks.forEach(link => {
      const target = new URL(link.getAttribute('href'), window.location.href);
      target.search = window.location.search;
      target.hash = window.location.hash;
      link.href = target.href;
    });
  }
  syncLanguageLinks();
  window.addEventListener('hashchange', syncLanguageLinks);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') $$('.language-switcher[open]').forEach(menu => { menu.open = false; $('summary', menu)?.focus(); });
  });
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  $('#print-profile')?.addEventListener('click', () => window.print());
  $('#copy-link')?.addEventListener('click', async () => {
    const status = $('#copy-status');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(window.location.href);
      if (status) status.textContent = m('profile.copied');
    } catch {
      if (status) status.textContent = m('profile.copyFailed');
    }
  });

  const grid = $('#people-grid');
  if (grid && Array.isArray(window.PEOPLE_INDEX)) {
    const records = window.PEOPLE_INDEX;
    const cards = new Map($$('.person-card', grid).map(card => [card.dataset.id, card]));
    const search = $('#search');
    const domainButtons = $$('[data-domain]', $('#domain-filters') || document);
    const eraSelect = $('#era-filter');
    const regionSelect = $('#region-filter');
    const sortSelect = $('#sort');
    const pagination = $('#pagination');
    const activeFilters = $('#active-filters');
    const pageSize = 12;
    const collator = new Intl.Collator(locale, { sensitivity: 'base' });
    const domainLabels = new Map(domainButtons.map(button => [cleanFilter(button.dataset.domain), ($('.filter-label', button)?.textContent || button.textContent).trim()]));
    const optionLabels = select => new Map(select ? [...select.options].map(option => [cleanFilter(option.value), option.textContent.trim()]) : []);
    const eraLabels = optionLabels(eraSelect);
    const regionLabels = optionLabels(regionSelect);
    const sortValues = new Set(sortSelect ? [...sortSelect.options].map(option => option.value) : ['featured', 'name', 'birth']);
    const validOrEmpty = (value, labels) => labels.has(value) ? value : '';
    const recordSearch = new Map(records.map(person => [person.id, normalize([
      person.name, person.enName, ...asArray(person.aliases), person.summary, person.role,
      person.country, ...asArray(person.tags), ...asArray(person.tagIds), ...asArray(person.domains).map(id => domainLabels.get(id) || id)
    ].join(' '))]));
    const tagLabels = new Map(records.flatMap(person => asArray(person.tagIds || person.tags).map((id, i) => [id, person.tags[i]])));
    let state;
    let queryTimer;

    function readURL() {
      const params = new URLSearchParams(window.location.search);
      const page = Number(params.get('page'));
      return {
        q: (params.get('q') || '').slice(0, 200),
        domain: validOrEmpty(cleanFilter(params.get('domain')), domainLabels),
        era: validOrEmpty(cleanFilter(params.get('era')), eraLabels),
        region: validOrEmpty(cleanFilter(params.get('region')), regionLabels),
        tag: (params.get('tag') || '').slice(0, 100),
        sort: sortValues.has(params.get('sort')) ? params.get('sort') : 'featured',
        page: Number.isSafeInteger(page) && page > 0 ? page : 1
      };
    }

    function writeURL(replace = false) {
      const url = new URL(window.location.href);
      for (const key of ['q', 'domain', 'era', 'region', 'tag', 'sort', 'page']) url.searchParams.delete(key);
      for (const key of ['q', 'domain', 'era', 'region', 'tag']) if (state[key]) url.searchParams.set(key, state[key]);
      if (state.sort !== 'featured') url.searchParams.set('sort', state.sort);
      if (state.page > 1) url.searchParams.set('page', String(state.page));
      if (url.href !== window.location.href) {
        try { window.history[replace ? 'replaceState' : 'pushState']({}, '', url); }
        catch { /* file:// previews may disallow history mutation; filtering still works. */ }
      }
      syncLanguageLinks();
    }

    function selectValue(select, value) {
      if (!select) return;
      const option = [...select.options].find(item => cleanFilter(item.value) === value);
      if (option) select.value = option.value;
    }

    function matches(person, includeDomain = true) {
      if (includeDomain && state.domain && !asArray(person.domains).includes(state.domain)) return false;
      if (state.era && !asArray(person.eras).includes(state.era)) return false;
      if (state.region && !asArray(person.regions).includes(state.region)) return false;
      if (state.tag && !asArray(person.tagIds || person.tags).some(tag => normalize(tag) === normalize(state.tag))) return false;
      const tokens = normalize(state.q).split(' ').filter(Boolean);
      const text = recordSearch.get(person.id) || '';
      return tokens.every(token => text.includes(token));
    }

    function birthYear(person) {
      const match = String(person.birth || '').match(/^-?\d+/);
      return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
    }

    function addChip(key, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-filter';
      button.setAttribute('aria-label', m('filter.remove', { label }));
      const text = document.createElement('span');
      text.textContent = label;
      const close = document.createElement('span');
      close.textContent = '×';
      close.setAttribute('aria-hidden', 'true');
      button.append(text, close);
      button.addEventListener('click', () => update({ [key]: '', page: 1 }));
      activeFilters.append(button);
    }

    function renderPagination(totalPages, total) {
      if (!pagination) return;
      pagination.replaceChildren();
      pagination.hidden = totalPages < 2;
      if (totalPages < 2) return;
      pagination.setAttribute('aria-label', m('pagination.label'));
      const addButton = (label, page, { current = false, disabled = false, arrow = false } = {}) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.page = String(page);
        button.disabled = disabled;
        button.className = arrow ? 'page-arrow' : '';
        button.setAttribute('aria-label', arrow ? label : m('pagination.page', { page: number.format(page) }));
        if (current) { button.classList.add('active'); button.setAttribute('aria-current', 'page'); }
        button.addEventListener('click', () => {
          update({ page });
          $('#explore')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        });
        pagination.append(button);
      };
      addButton(document.documentElement.dir === 'rtl' ? '→' : '←', state.page - 1, { disabled: state.page === 1, arrow: true });
      pagination.lastElementChild.setAttribute('aria-label', m('pagination.previous'));
      for (let page = 1; page <= totalPages; page++) addButton(String(page), page, { current: page === state.page });
      addButton(document.documentElement.dir === 'rtl' ? '←' : '→', state.page + 1, { disabled: state.page === totalPages, arrow: true });
      pagination.lastElementChild.setAttribute('aria-label', m('pagination.next'));
      const info = document.createElement('span');
      info.className = 'page-info';
      info.textContent = m('pagination.info', { page: number.format(state.page), pages: number.format(totalPages), total: number.format(total) });
      pagination.append(info);
    }

    function render() {
      if (search && search.value !== state.q) search.value = state.q;
      selectValue(eraSelect, state.era);
      selectValue(regionSelect, state.region);
      if (sortSelect) sortSelect.value = state.sort;
      const otherMatches = records.filter(person => matches(person, false));
      domainButtons.forEach(button => {
        const domain = cleanFilter(button.dataset.domain);
        const active = state.domain === domain;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        const count = $('.filter-count', button);
        if (count) count.textContent = String(domain ? otherMatches.filter(person => asArray(person.domains).includes(domain)).length : otherMatches.length).padStart(2, '0');
      });
      let results = records.filter(person => matches(person));
      if (state.sort === 'name') results.sort((a, b) => collator.compare(a.name, b.name));
      if (state.sort === 'birth') results.sort((a, b) => birthYear(a) - birthYear(b));
      const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      const visible = results.slice((state.page - 1) * pageSize, state.page * pageSize);
      cards.forEach(card => { card.hidden = true; });
      for (const person of visible) {
        const card = cards.get(person.id);
        if (card) { card.hidden = false; grid.append(card); }
      }
      grid.hidden = results.length === 0;
      const count = $('#result-count');
      if (count) {
        count.textContent = m('results.found', { count: number.format(results.length) });
      }
      const empty = $('#empty-state');
      if (empty) empty.hidden = results.length > 0;
      const summary = $('#results-summary');
      if (summary) summary.textContent = results.length ? m('results.showing', { start: number.format(((state.page - 1) * pageSize) + 1), end: number.format(Math.min(state.page * pageSize, results.length)), total: number.format(results.length) }) : '';
      if (activeFilters) {
        activeFilters.replaceChildren();
        if (state.q) addChip('q', m('filter.searchChip', { query: state.q }));
        if (state.domain) addChip('domain', domainLabels.get(state.domain));
        if (state.era) addChip('era', eraLabels.get(state.era));
        if (state.region) addChip('region', regionLabels.get(state.region));
        if (state.tag) addChip('tag', m('filter.tagChip', { tag: tagLabels.get(state.tag) || state.tag }));
      }
      renderPagination(totalPages, results.length);
      const searchClear = $('#search-clear');
      if (searchClear) searchClear.hidden = !state.q;
    }

    function update(patch, replace = false) {
      clearTimeout(queryTimer);
      state = { ...state, ...patch };
      render();
      writeURL(replace);
    }

    function reset() {
      update({ q: '', domain: '', era: '', region: '', tag: '', sort: 'featured', page: 1 });
    }

    domainButtons.forEach(button => button.addEventListener('click', () => update({ domain: cleanFilter(button.dataset.domain), page: 1 })));
    eraSelect?.addEventListener('change', () => update({ era: cleanFilter(eraSelect.value), page: 1 }));
    regionSelect?.addEventListener('change', () => update({ region: cleanFilter(regionSelect.value), page: 1 }));
    sortSelect?.addEventListener('change', () => update({ sort: sortSelect.value, page: 1 }));
    search?.addEventListener('input', event => {
      if (event.isComposing) return;
      clearTimeout(queryTimer);
      queryTimer = setTimeout(() => update({ q: search.value.slice(0, 200), page: 1 }, true), 120);
    });
    search?.addEventListener('compositionend', () => update({ q: search.value.slice(0, 200), page: 1 }, true));
    search?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); update({ q: search.value.slice(0, 200), page: 1 }, true); }
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); update({ q: '', page: 1 }, true); }
    });
    $('#search-clear')?.addEventListener('click', () => { update({ q: '', page: 1 }); search?.focus(); });
    $('#clear-filters')?.addEventListener('click', reset);
    $('#reset-empty')?.addEventListener('click', reset);
    document.addEventListener('keydown', event => {
      const target = event.target;
      const editing = target instanceof Element && (target.matches('input,textarea,select') || target.closest('[contenteditable="true"]'));
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !editing) { event.preventDefault(); search?.focus(); }
    });
    window.addEventListener('popstate', () => { clearTimeout(queryTimer); state = readURL(); render(); syncLanguageLinks(); });
    state = readURL();
    render();
    writeURL(true);
  }

  const candidateSearch = $('#candidate-search');
  if (candidateSearch) {
    const domain = $('#candidate-domain');
    const batch = $('#candidate-batch');
    const rows = $$('[data-candidate]');
    const filterCandidates = () => {
      const tokens = normalize(candidateSearch.value).split(' ').filter(Boolean);
      const selectedDomain = cleanFilter(domain?.value);
      const selectedBatch = cleanFilter(batch?.value);
      let visible = 0;
      for (const row of rows) {
        const text = normalize(row.dataset.search || row.textContent);
        const domains = (row.dataset.domain || row.dataset.domains || '').split(/[\s,|]+/);
        const match = tokens.every(token => text.includes(token)) && (!selectedDomain || domains.includes(selectedDomain)) && (!selectedBatch || row.dataset.batch === selectedBatch);
        row.hidden = !match;
        if (match) visible++;
      }
      const count = $('#candidate-count');
      if (count) count.textContent = m('candidates.count', { count: number.format(visible), total: number.format(rows.length) });
      const empty = $('#candidate-empty');
      if (empty) empty.hidden = visible > 0;
    };
    candidateSearch.addEventListener('input', filterCandidates);
    domain?.addEventListener('change', filterCandidates);
    batch?.addEventListener('change', filterCandidates);
    filterCandidates();
  }
})();
