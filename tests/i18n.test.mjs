import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { sourceStrings, sourceHash, validateTranslation, validateUI, validateUISource, localizePerson, formatMessage } from '../scripts/i18n-core.mjs';

// These checks exercise static markup and DOM behavior. They do not certify
// browser layout, Arabic typography, image appearance, or printed PDF output.
const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const json = async file => JSON.parse(await read(file));
const config = await json('data/i18n/locales.json');
const locales = config.locales.filter(locale => locale.enabled);
const sourceLocale = config.source ?? config.default;
const profiles = await Promise.all((await readdir(new URL('data/people/', root)))
  .filter(file => file.endsWith('.json')).map(file => json(`data/people/${file}`)));
const baseUI = await json(`data/i18n/${sourceLocale}/ui.json`);
const prefix = id => id === config.default ? '' : `${id}/`;
const route = (id, page = 'index.html') => `${prefix(id)}${page}`;
const baseURL = 'https://archive.example/catalog/';

async function translatedProfile(person, id) {
  return id === sourceLocale ? localizePerson(person, null)
    : localizePerson(person, await json(`data/i18n/${id}/people/${person.id}.json`));
}

function assertLanguageNavigation(document, locale, page) {
  const links = [...document.querySelectorAll('.language-options [data-language]')];
  assert.equal(links.length, locales.length, `${locale.id}/${page}: language count`);
  assert.equal(links.filter(link => link.getAttribute('aria-current') === 'true').length, 1);
  for (const target of locales) {
    const link = links.find(link => link.dataset.language === target.id);
    assert.ok(link, `Missing language ${target.id}`);
    assert.equal(link.href, `${baseURL}${route(target.id, page)}`);
    assert.equal(link.getAttribute('hreflang'), target.lang);
    assert.equal(link.getAttribute('lang'), target.lang);
    assert.equal(link.getAttribute('dir'), target.dir);
    assert.equal(link.getAttribute('aria-current') === 'true', target.id === locale.id);
  }
  const alternatives = [...document.querySelectorAll('link[rel="alternate"]')];
  assert.equal(alternatives.length, locales.length + 1);
  for (const target of locales) assert.ok(alternatives.some(link => link.hreflang === target.lang));
  assert.ok(alternatives.some(link => link.hreflang === 'x-default'));
}

for (const locale of locales) {
  test(`${locale.id}: the index and every biography are complete static documents with matching data and language routes`, async () => {
    const ui = await json(`data/i18n/${locale.id}/ui.json`);
    validateUI(baseUI, ui, locale.id);
    const home = new JSDOM(await read(`dist/${route(locale.id)}`), { url: `${baseURL}${route(locale.id)}` });
    try {
      const { document } = home.window;
      assert.equal(document.documentElement.lang, locale.lang);
      assert.equal(document.documentElement.dir, locale.dir);
      assert.equal(document.querySelectorAll('#people-grid .person-card').length, profiles.length);
      assert.equal(document.querySelectorAll('#people-grid .person-card[hidden]').length, 0,
        'Without JavaScript every card must remain readable');
      assert.equal(document.getElementById('search').placeholder, ui['search.placeholder']);
      assertLanguageNavigation(document, locale, 'index.html');
      assert.equal(document.querySelector('link[rel="stylesheet"]').href, `${baseURL}assets/site.css`);
      for (const img of document.querySelectorAll('img.person-portrait')) {
        assert.ok(new URL(img.src).pathname.startsWith('/catalog/assets/portraits/'), img.src);
        assert.ok(!img.getAttribute('src').startsWith('/'), 'Images must work under a deployment prefix');
      }
    } finally { home.window.close(); }

    for (const person of profiles) {
      const p = await translatedProfile(person, locale.id);
      const page = `people/${person.id}/index.html`;
      const html = await read(`dist/${route(locale.id, page)}`);
      const dom = new JSDOM(html, { url: `${baseURL}${route(locale.id, page)}` });
      try {
        const { document } = dom.window;
        assert.equal(document.documentElement.lang, locale.lang);
        assert.equal(document.documentElement.dir, locale.dir);
        assert.equal(document.querySelector('h1').textContent, p.name);
        assert.equal(document.querySelector('.profile-summary').textContent, p.summary);
        assert.equal(document.querySelector('.profile-note p:nth-child(2)').textContent, p.coverageNote);
        const events = [...document.querySelectorAll('.timeline-item')];
        assert.equal(events.length, person.timeline.length, `${locale.id}/${person.id}: missing timeline`);
        events.forEach((event, index) => {
          assert.equal(event.querySelector('h3').textContent, p.timeline[index].title);
          assert.ok(event.querySelector('.timeline-content p').textContent.startsWith(p.timeline[index].text));
          if (p.timeline[index].dateLabel) assert.equal(event.querySelector('.timeline-date').textContent, p.timeline[index].dateLabel);
        });
        assert.equal(document.querySelectorAll('.achievement').length, person.highlights.length);
        const details = [...document.querySelectorAll('.profile-facts dd')].map(node => node.textContent);
        for (const fact of p.facts) assert.ok(details.includes(fact.value));
        const numbers = new Intl.NumberFormat(locale.lang, { useGrouping: false });
        const year = value => {
          const n = Number(value.match(/^-?\d+/)[0]);
          return n < 0 ? formatMessage(ui['date.bce'], { year: numbers.format(-n) }) : numbers.format(n);
        };
        assert.equal(details[0], `${year(person.birth)} — ${person.death === null ? ui['date.present'] : year(person.death)}`);
        const image = document.querySelector('.profile-photo .person-portrait');
        const metadata = await json(`data/images/${person.id}.json`);
        assert.equal(image.src, `${baseURL}${metadata.src}`);
        assert.equal(image.dataset.lifeStatus, person.death === null ? 'living' : 'deceased');
        assert.equal(image.alt, formatMessage(ui[metadata.kind === 'photo' ? 'image.altPhoto' : 'image.altArtwork'], { name: p.name }));
        assert.equal(document.querySelector('link[rel="stylesheet"]').href, `${baseURL}assets/site.css`);
        assertLanguageNavigation(document, locale, page);
        const tagLinks = [...document.querySelectorAll('.profile-tags a')].filter(a => new URL(a.href).searchParams.has('tag'));
        assert.deepEqual(tagLinks.map(a => new URL(a.href).searchParams.get('tag')), person.tags,
          `${locale.id}/${person.id}: tags must retain their canonical identifiers`);
        assert.deepEqual(tagLinks.map(a => a.textContent), p.tags);
        assert.deepEqual([...document.querySelectorAll('.sources-list ol > li > a')].map(a => a.href), person.sources.map(s => new URL(s.url).href));
        assert.ok(!document.querySelector('.sources-list').textContent.includes('<span'), 'Escaped HTML must not leak into references');
        const structured = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
        assert.equal(structured.name, p.name);
        assert.equal(structured.inLanguage, locale.lang);
        if (person.death === null) assert.equal(structured.deathDate, undefined);
        else if (!person.death.startsWith('-')) assert.equal(structured.deathDate, person.death);
      } finally { dom.window.close(); }
    }
  });
}

async function openInteractive(t, id, query = '', page = 'index.html') {
  const dom = new JSDOM(await read(`dist/${route(id, page)}`), {
    url: `${baseURL}${route(id, page)}${query}`, runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.matchMedia = query => ({ matches: false, media: query });
  window.Element.prototype.scrollIntoView = () => {};
  window.eval(await read(`dist/assets/locales/${id}.js`));
  if (page === 'index.html') window.eval(await read(`dist/assets/${id === config.default ? 'people-index.js' : `indexes/${id}.js`}`));
  window.eval(await read('dist/assets/site.js'));
  return { window, document: window.document };
}
const visible = document => [...document.querySelectorAll('.person-card')].filter(card => !card.hidden).map(card => card.dataset.id);

test('language changes preserve canonical tag filters, other URL state and the current section', async t => {
  const query = `?tag=${encodeURIComponent('电动汽车')}&region=north-america#explore`;
  const french = await openInteractive(t, 'fr', query);
  assert.deepEqual(visible(french.document), ['elon-musk']);
  const fr = await json('data/i18n/fr/ui.json');
  const frenchMusk = await translatedProfile(profiles.find(p => p.id === 'elon-musk'), 'fr');
  const frenchChip = formatMessage(fr['filter.tagChip'], { tag: frenchMusk.tags[0] });
  assert.ok(french.document.getElementById('active-filters').textContent.includes(frenchChip));
  const link = french.document.querySelector('[data-language="ar"]');
  const destination = new URL(link.href);
  assert.equal(destination.pathname, '/catalog/ar/index.html');
  assert.equal(destination.searchParams.get('tag'), '电动汽车');
  assert.equal(destination.searchParams.get('region'), 'north-america');
  assert.equal(destination.hash, '#explore');
  const arabic = await openInteractive(t, 'ar', destination.search + destination.hash);
  assert.deepEqual(visible(arabic.document), ['elon-musk']);
  const ar = await json('data/i18n/ar/ui.json');
  const arabicMusk = await translatedProfile(profiles.find(p => p.id === 'elon-musk'), 'ar');
  assert.ok(arabic.document.getElementById('active-filters').textContent.includes(formatMessage(ar['filter.tagChip'], { tag: arabicMusk.tags[0] })));
  arabic.document.getElementById('clear-filters').click();
  for (const item of arabic.document.querySelectorAll('[data-language]')) assert.equal(new URL(item.href).search, '');
  const profile = await openInteractive(t, 'fr', '#timeline-title', 'people/elon-musk/index.html');
  assert.equal(profile.document.querySelector('[data-language="ko"]').href,
    `${baseURL}ko/people/elon-musk/index.html#timeline-title`);
});

test('Arabic search and empty-result recovery use Arabic content and localized messages', async t => {
  const { document, window } = await openInteractive(t, 'ar');
  const ar = await json('data/i18n/ar/ui.json');
  const musk = await translatedProfile(profiles.find(p => p.id === 'elon-musk'), 'ar');
  const input = document.getElementById('search');
  input.value = musk.name;
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(visible(document), ['elon-musk']);
  assert.equal(document.getElementById('result-count').textContent,
    formatMessage(ar['results.found'], { count: new Intl.NumberFormat('ar', { useGrouping: false }).format(1) }));
  input.value = 'no-such-person-012345';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(document.getElementById('empty-state').hidden, false);
  assert.equal(document.querySelector('#empty-state h3').textContent, ar['empty.title']);
  document.getElementById('reset-empty').click();
  assert.equal(document.getElementById('empty-state').hidden, true);
  assert.equal(visible(document).length, Math.min(12, profiles.length));
});

test('translation validation rejects missing, obsolete and stale content before publication', async () => {
  const person = profiles.find(p => p.id === 'elon-musk');
  const translated = await json('data/i18n/fr/people/elon-musk.json');
  validateTranslation(person, translated, 'fr');
  const missing = structuredClone(translated);
  delete missing.strings.summary;
  assert.throws(() => validateTranslation(person, missing, 'fr'), /missing translated string summary/);
  const empty = structuredClone(translated);
  empty.strings.summary = '  ';
  assert.throws(() => validateTranslation(person, empty, 'fr'), /missing translated string summary/);
  const obsolete = structuredClone(translated);
  obsolete.strings.removedField = 'Old translation';
  assert.throws(() => validateTranslation(person, obsolete, 'fr'), /obsolete translation key/);
  const changed = structuredClone(person);
  changed.death = '2026-11-13';
  assert.notEqual(sourceHash(changed), translated.sourceHash);
  assert.throws(() => validateTranslation(changed, translated, 'fr'), /stale sourceHash/);
  const eventKey = `timeline.${person.timeline[0].id}.title`;
  assert.ok(eventKey in sourceStrings(person), 'Events use stable identifiers instead of current array positions');
  const reordered = structuredClone(person);
  reordered.timeline.reverse();
  assert.equal(sourceStrings(reordered)[eventKey], sourceStrings(person)[eventKey]);
});

test('UI bundles have exact keys and preserved interpolation arguments', async () => {
  for (const locale of locales) {
    validateUI(baseUI, await json(`data/i18n/${locale.id}/ui.json`), locale.id);
    if (locale.id !== sourceLocale) validateUISource(baseUI, await json(`data/i18n/${locale.id}/ui-source.json`), locale.id);
  }
  const metadata = { sourceHash: sourceHash(baseUI) };
  validateUISource(baseUI, metadata, 'fr');
  assert.throws(() => validateUISource(baseUI, undefined, 'fr'), /stale UI sourceHash/);
  assert.throws(() => validateUISource({ ...baseUI, 'site.title': 'Changed source wording' }, metadata, 'fr'), /stale UI sourceHash/);
  const broken = structuredClone(baseUI);
  broken['results.showing'] = '{start}–{end}';
  assert.throws(() => validateUI(baseUI, broken, 'example'), /inconsistent placeholders/);
  delete broken['results.showing'];
  assert.throws(() => validateUI(baseUI, broken, 'example'), /missing UI string/);
  assert.equal(formatMessage('Results {start}–{end} of {total}', { start: 1, end: 12, total: 24 }), 'Results 1–12 of 24');
});
