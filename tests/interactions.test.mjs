import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// These tests exercise generated pages and their real enhancement script in a DOM.
// They do not assess browser rendering, layout, image display, or PDF output.
const dist = new URL('../dist/', import.meta.url);
const [indexHtml, candidatesHtml, profileHtml, indexScript, siteScript, localeScript] = await Promise.all([
  readFile(new URL('index.html', dist), 'utf8'),
  readFile(new URL('candidates.html', dist), 'utf8'),
  readFile(new URL('people/elon-musk/index.html', dist), 'utf8'),
  readFile(new URL('assets/people-index.js', dist), 'utf8'),
  readFile(new URL('assets/site.js', dist), 'utf8'),
  readFile(new URL('assets/locales/zh.js', dist), 'utf8')
]);

function openPage(t, { kind = 'index', query = '', clipboard } = {}) {
  const pathname = kind === 'profile' ? 'people/elon-musk/index.html' : `${kind === 'candidates' ? 'candidates' : 'index'}.html`;
  const dom = new JSDOM(kind === 'profile' ? profileHtml : kind === 'candidates' ? candidatesHtml : indexHtml, {
    url: `https://archive.example/catalog/${pathname}${query}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const calls = { print: 0, scroll: 0 };
  window.matchMedia = query => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
  window.Element.prototype.scrollIntoView = function () { calls.scroll++; };
  window.print = () => { calls.print++; };
  if (clipboard !== undefined) Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
  window.eval(localeScript);
  if (kind === 'index') window.eval(indexScript);
  window.eval(siteScript);
  return { window, document: window.document, calls };
}

const visiblePeople = document => [...document.querySelectorAll('#people-grid .person-card')].filter(card => !card.hidden).map(card => card.dataset.id);
const visibleCandidates = document => [...document.querySelectorAll('[data-candidate]')].filter(row => !row.hidden);
const nextTask = () => new Promise(resolve => setImmediate(resolve));

function select(window, id, value) {
  const control = window.document.getElementById(id);
  assert.ok(control, `Missing control #${id}`);
  control.value = value;
  assert.equal(control.value, value, `Missing option ${value} in #${id}`);
  control.dispatchEvent(new window.Event('change', { bubbles: true }));
}

async function search(window, value) {
  const input = window.document.getElementById('search');
  input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 160));
}

test('the generated index paginates complete biographies and keeps navigation under a path prefix', t => {
  const { document, window, calls } = openPage(t);
  assert.equal(document.querySelectorAll('#people-grid .person-card').length, 24);
  assert.equal(visiblePeople(document).length, 12);
  assert.equal(visiblePeople(document)[0], 'elon-musk');
  assert.match(document.getElementById('result-count').textContent, /24/);
  assert.equal(document.querySelector('[data-id="elon-musk"] a').href, 'https://archive.example/catalog/people/elon-musk/index.html');
  document.querySelector('#pagination [data-page="2"]').click();
  assert.equal(visiblePeople(document).length, 12);
  assert.ok(visiblePeople(document).includes('nelson-mandela'));
  assert.ok(!visiblePeople(document).includes('elon-musk'));
  assert.equal(new URL(window.location.href).searchParams.get('page'), '2');
  assert.equal(document.querySelector('#pagination [aria-current="page"]').textContent, '2');
  assert.equal(document.querySelector('#pagination [aria-label="下一页"]').disabled, true);
  assert.equal(calls.scroll, 1);
  document.querySelector('#pagination [aria-label="上一页"]').click();
  assert.equal(visiblePeople(document)[0], 'elon-musk');
  assert.equal(new URL(window.location.href).searchParams.has('page'), false);
});

test('search finds Chinese aliases, case-insensitive English names and multiple tokens', async t => {
  const { document, window } = openPage(t);
  await search(window, '马斯克');
  assert.deepEqual(visiblePeople(document), ['elon-musk']);
  await search(window, '  ELON   MUSK  ');
  assert.deepEqual(visiblePeople(document), ['elon-musk']);
  await search(window, '马克 扎克伯格');
  assert.deepEqual(visiblePeople(document), ['mark-zuckerberg']);
  assert.equal(document.getElementById('pagination').hidden, true);
  assert.match(document.getElementById('active-filters').textContent, /马克 扎克伯格/);
});

test('domain, era, region and query compose; removing a chip preserves the other dimensions', async t => {
  const { document, window } = openPage(t);
  document.querySelector('[data-domain="technology"]').click();
  select(window, 'era-filter', 'contemporary');
  select(window, 'region-filter', 'north-america');
  assert.deepEqual(visiblePeople(document), ['elon-musk', 'jensen-huang', 'mark-zuckerberg', 'larry-page']);
  assert.equal(document.querySelector('[data-domain="technology"]').getAttribute('aria-pressed'), 'true');
  await search(window, '黄仁勋');
  assert.deepEqual(visiblePeople(document), ['jensen-huang']);
  const queryChip = [...document.querySelectorAll('#active-filters button')].find(button => button.textContent.includes('搜索：'));
  queryChip.click();
  assert.deepEqual(visiblePeople(document), ['elon-musk', 'jensen-huang', 'mark-zuckerberg', 'larry-page']);
  assert.equal(document.getElementById('region-filter').value, 'north-america');
  assert.equal(document.getElementById('era-filter').value, 'contemporary');
  const params = new URL(window.location.href).searchParams;
  assert.equal(params.get('domain'), 'technology');
  assert.equal(params.get('region'), 'north-america');
  assert.equal(params.has('q'), false);
});

test('a non-matching combination shows a recoverable empty state and resets all controls', t => {
  const { document, window } = openPage(t);
  document.querySelector('[data-domain="technology"]').click();
  select(window, 'era-filter', 'ancient');
  select(window, 'region-filter', 'north-america');
  assert.equal(visiblePeople(document).length, 0);
  assert.equal(document.getElementById('empty-state').hidden, false);
  assert.equal(document.getElementById('people-grid').hidden, true);
  document.getElementById('reset-empty').click();
  assert.equal(visiblePeople(document).length, 12);
  assert.equal(document.getElementById('empty-state').hidden, true);
  assert.equal(document.getElementById('people-grid').hidden, false);
  assert.equal(document.getElementById('era-filter').value, 'all');
  assert.equal(document.getElementById('region-filter').value, 'all');
  assert.equal(document.getElementById('active-filters').children.length, 0);
  assert.equal(window.location.search, '');
});

test('URL deep links restore a tag and filters, while impossible pages are bounded', t => {
  const { document, window } = openPage(t, { query: '?domain=technology&region=north-america&tag=%E4%BA%92%E8%81%94%E7%BD%91&q=%E9%A9%AC%E6%96%AF%E5%85%8B&page=999' });
  assert.deepEqual(visiblePeople(document), ['elon-musk']);
  assert.equal(document.getElementById('search').value, '马斯克');
  assert.equal(document.getElementById('region-filter').value, 'north-america');
  assert.equal(document.querySelector('[data-domain="technology"]').getAttribute('aria-pressed'), 'true');
  assert.ok([...document.querySelectorAll('#active-filters button')].some(button => button.textContent.includes('标签：互联网')));
  assert.equal(new URL(window.location.href).searchParams.has('page'), false);
});

test('browser history restores the earlier filter state through popstate', { timeout: 3000 }, async t => {
  const { document, window } = openPage(t, { query: '?domain=science&era=modern' });
  assert.deepEqual(visiblePeople(document), ['albert-einstein', 'marie-curie', 'ada-lovelace']);
  document.querySelector('[data-domain="politics"]').click();
  assert.deepEqual(visiblePeople(document), ['nelson-mandela']);
  const popped = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
  window.history.back();
  await popped;
  assert.deepEqual(visiblePeople(document), ['albert-einstein', 'marie-curie', 'ada-lovelace']);
  assert.equal(document.querySelector('[data-domain="science"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.getElementById('era-filter').value, 'modern');
});

test('untrusted query values remain literal text and invalid URL filters do not break the index', t => {
  const payload = '<img src=x onerror="window.injected=true">';
  const { document, window } = openPage(t, { query: `?q=${encodeURIComponent(payload)}&domain=invalid&era=invalid&region=invalid&sort=invalid&page=-4` });
  assert.equal(window.injected, undefined);
  assert.equal(document.querySelector('#active-filters img'), null);
  assert.equal(document.querySelector('[onerror]'), null);
  assert.ok(document.getElementById('active-filters').textContent.includes(payload));
  assert.equal(document.getElementById('search').value, payload);
  assert.equal(document.getElementById('empty-state').hidden, false);
  document.getElementById('clear-filters').click();
  assert.equal(visiblePeople(document).length, 12);
  assert.equal(document.querySelector('[data-domain="all"]').getAttribute('aria-pressed'), 'true');
});

test('chronological sort handles BCE births and restoring editorial order works', t => {
  const { document, window } = openPage(t);
  select(window, 'sort', 'birth');
  assert.deepEqual(visiblePeople(document).slice(0, 3), ['confucius', 'leonardo-da-vinci', 'ada-lovelace']);
  select(window, 'sort', 'name');
  assert.equal(visiblePeople(document).length, 12);
  assert.notEqual(visiblePeople(document)[0], 'confucius');
  select(window, 'sort', 'featured');
  assert.equal(visiblePeople(document)[0], 'elon-musk');
});

test('keyboard shortcut focuses search and Chinese composition commits only when complete', async t => {
  const { document, window } = openPage(t);
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true }));
  const input = document.getElementById('search');
  assert.equal(document.activeElement, input);
  input.value = '孔';
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true, isComposing: true }));
  await new Promise(resolve => setTimeout(resolve, 160));
  assert.equal(visiblePeople(document).length, 12);
  input.value = '孔子';
  input.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  assert.deepEqual(visiblePeople(document), ['confucius']);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(input.value, '');
  assert.equal(visiblePeople(document).length, 12);
});

test('candidate search combines with domain and batch while preserving profile links', t => {
  const { document, window } = openPage(t, { kind: 'candidates' });
  assert.equal(visibleCandidates(document).length, 120);
  const input = document.getElementById('candidate-search');
  input.value = 'ELON';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(visibleCandidates(document).length, 1);
  assert.match(visibleCandidates(document)[0].textContent, /马斯克/);
  assert.equal(visibleCandidates(document)[0].querySelector('a').href, 'https://archive.example/catalog/people/elon-musk/index.html');
  select(window, 'candidate-batch', '2');
  assert.equal(visibleCandidates(document).length, 0);
  assert.match(document.getElementById('candidate-count').textContent, /0 \/ 120/);
  input.value = '';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  select(window, 'candidate-domain', 'science');
  assert.ok(visibleCandidates(document).length > 0);
  assert.ok(visibleCandidates(document).every(row => row.dataset.domain === 'science' && row.dataset.batch === '2'));
});

test('profile copy reports clipboard success and print invokes the browser action', async t => {
  let copied;
  const { document, window, calls } = openPage(t, { kind: 'profile', clipboard: { writeText: async value => { copied = value; } } });
  document.getElementById('copy-link').click();
  await nextTask();
  assert.equal(copied, window.location.href);
  assert.equal(document.getElementById('copy-status').textContent, '链接已复制');
  document.getElementById('print-profile').click();
  assert.equal(calls.print, 1);
});

test('clipboard rejection explains manual copy without announcing success', async t => {
  const { document } = openPage(t, { kind: 'profile', clipboard: { writeText: async () => { throw new Error('Permission denied'); } } });
  document.getElementById('copy-link').click();
  await nextTask();
  assert.match(document.getElementById('copy-status').textContent, /请从地址栏复制/);
  assert.doesNotMatch(document.getElementById('copy-status').textContent, /已复制/);
});

test('an unavailable Clipboard API has the same useful fallback', async t => {
  const { document } = openPage(t, { kind: 'profile' });
  document.getElementById('copy-link').click();
  await nextTask();
  assert.match(document.getElementById('copy-status').textContent, /请从地址栏复制/);
});
