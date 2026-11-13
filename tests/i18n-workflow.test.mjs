import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceHash, sourceStrings } from '../scripts/i18n-core.mjs';

// Every mutation and CLI subprocess runs in a disposable checkout. English text
// is reused as a test-only target; no additional translated locale is shipped.
const project = fileURLToPath(new URL('../', import.meta.url));
const targetLocale = 'pt-test';
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
};

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'big-names-i18n-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const item of ['scripts', 'data/people', 'data/images', 'data/taxonomy.json', 'data/candidates.json', 'data/i18n/zh']) {
    await mkdir(path.dirname(path.join(root, item)), { recursive: true });
    await cp(path.join(project, item), path.join(root, item), { recursive: true });
  }
  await writeJson(path.join(root, 'data/i18n/locales.json'), {
    default: 'zh',
    locales: [{ id: 'zh', lang: 'zh-CN', name: '简体中文', dir: 'ltr', enabled: true }]
  });
  const cli = (...args) => {
    const result = spawnSync(process.execPath, ['scripts/i18n.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.error, undefined, result.error?.message);
    return { ...result, output: `${result.stdout}${result.stderr}` };
  };
  const success = (...args) => {
    const result = cli(...args);
    assert.equal(result.status, 0, result.output);
    return result;
  };
  const failure = (args, expected) => {
    const result = cli(...args);
    assert.notEqual(result.status, 0, 'Expected the command to reject invalid input');
    assert.match(result.output, expected);
    return result;
  };
  const prepare = () => success('prepare', targetLocale, '--name', 'Test locale', '--lang', 'pt-PT', '--dir', 'ltr');
  const exportPacket = async () => {
    const file = path.join(root, 'translation-packet.json');
    success('export', targetLocale, '--out', file);
    return readJson(file);
  };
  const importPacket = async (packet, expectedError) => {
    const file = path.join(root, 'translation-packet.json');
    await writeJson(file, packet);
    const args = ['import', targetLocale, '--file', file];
    return expectedError ? failure(args, expectedError) : success(...args);
  };
  const completePacket = async () => {
    const packet = await exportPacket();
    const englishUI = await readJson(path.join(project, 'data/i18n/en/ui.json'));
    packet.uiReviewed = true;
    for (const [key, entry] of Object.entries(packet.ui)) entry.target = englishUI[key];
    for (const [id, entry] of Object.entries(packet.people)) {
      const english = await readJson(path.join(project, `data/i18n/en/people/${id}.json`));
      entry.reviewed = true;
      for (const [key, field] of Object.entries(entry.strings)) field.target = english.strings[key];
    }
    return packet;
  };
  const targetSnapshot = async () => {
    const directory = path.join(root, `data/i18n/${targetLocale}`);
    const names = ['ui.json', 'ui-source.json', ...(await readdir(path.join(directory, 'people'))).sort().map(file => `people/${file}`)];
    return Promise.all(names.map(async name => [name, await readFile(path.join(directory, name), 'utf8')]));
  };
  const config = () => readJson(path.join(root, 'data/i18n/locales.json'));
  return { root, cli, success, failure, prepare, exportPacket, completePacket, importPacket, targetSnapshot, config };
}

test('preparing and exporting a new locale creates disabled drafts with source and target fields', async t => {
  const f = await fixture(t);
  f.prepare();
  const config = await f.config();
  assert.deepEqual(config.locales.find(locale => locale.id === targetLocale), {
    id: targetLocale, lang: 'pt-PT', name: 'Test locale', dir: 'ltr', enabled: false
  });
  const packet = await f.exportPacket();
  const sourceUI = await readJson(path.join(f.root, 'data/i18n/zh/ui.json'));
  assert.equal(packet.formatVersion, 1);
  assert.equal(packet.locale, targetLocale);
  assert.equal(packet.uiReviewed, false);
  assert.equal(packet.uiSourceHash, sourceHash(sourceUI));
  assert.equal(Object.keys(packet.ui).length, Object.keys(sourceUI).length);
  for (const [key, entry] of Object.entries(packet.ui)) assert.deepEqual(entry, { source: sourceUI[key], target: '' });
  const files = await readdir(path.join(f.root, 'data/people'));
  assert.equal(Object.keys(packet.people).length, files.length);
  for (const file of files) {
    const person = await readJson(path.join(f.root, 'data/people', file));
    const entry = packet.people[person.id];
    assert.equal(entry.reviewed, false);
    assert.equal(entry.sourceHash, sourceHash(person));
    assert.deepEqual(Object.keys(entry.strings), Object.keys(sourceStrings(person)));
    for (const [key, source] of Object.entries(sourceStrings(person))) assert.deepEqual(entry.strings[key], { source, target: '' });
  }
  f.failure(['enable', targetLocale], /missing UI string|missing translated string/);
  assert.equal((await f.config()).locales.find(locale => locale.id === targetLocale).enabled, false);
});

test('import rejects unreviewed or incomplete packets without partially writing translations', async t => {
  const f = await fixture(t);
  f.prepare();
  const before = await f.targetSnapshot();
  const complete = await f.completePacket();
  const uiUnreviewed = structuredClone(complete);
  uiUnreviewed.uiReviewed = false;
  await f.importPacket(uiUnreviewed, /uiReviewed true/);
  assert.deepEqual(await f.targetSnapshot(), before);
  const personUnreviewed = structuredClone(complete);
  const lastId = Object.keys(personUnreviewed.people).at(-1);
  personUnreviewed.people[lastId].reviewed = false;
  await f.importPacket(personUnreviewed, /mark reviewed true/);
  assert.deepEqual(await f.targetSnapshot(), before);
  const incomplete = structuredClone(complete);
  incomplete.people[lastId].strings.summary.target = '';
  await f.importPacket(incomplete, /missing translated string summary/);
  assert.deepEqual(await f.targetSnapshot(), before);
  const editedSource = structuredClone(complete);
  editedSource.people[lastId].strings.summary.source += ' Altered packet source.';
  await f.importPacket(editedSource, /changed source text in packet/);
  assert.deepEqual(await f.targetSnapshot(), before);
});

test('a fully reviewed import stays disabled until enable and then builds independent static pages', async t => {
  const f = await fixture(t);
  f.prepare();
  const packet = await f.completePacket();
  await f.importPacket(packet);
  assert.equal((await f.config()).locales.find(locale => locale.id === targetLocale).enabled, false);
  f.success('check', targetLocale);
  f.success('enable', targetLocale);
  assert.equal((await f.config()).locales.find(locale => locale.id === targetLocale).enabled, true);
  await cp(path.join(project, 'public'), path.join(f.root, 'public'), { recursive: true });
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: f.root, encoding: 'utf8', timeout: 20_000 });
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`);
  const index = await readFile(path.join(f.root, `dist/${targetLocale}/index.html`), 'utf8');
  const detail = await readFile(path.join(f.root, `dist/${targetLocale}/people/elon-musk/index.html`), 'utf8');
  assert.match(index, /lang="pt-PT"/);
  assert.ok(detail.includes(packet.people['elon-musk'].strings.summary.target.replaceAll('&', '&amp;')));
  assert.match(index, /href="people\/elon-musk\/index\.html"/);
  assert.match(detail, /src="\.\.\/\.\.\/\.\.\/assets\/portraits\/elon-musk\.jpg"/);
});

test('source changes invalidate packets and prepare preserves existing text and old review hashes', async t => {
  const f = await fixture(t);
  f.prepare();
  const packet = await f.completePacket();
  await f.importPacket(packet);
  const personId = Object.keys(packet.people)[0];
  const sourcePath = path.join(f.root, `data/people/${personId}.json`);
  const original = await readJson(sourcePath);
  await writeJson(sourcePath, { ...original, summary: `${original.summary} 测试新增事实。` });
  await f.importPacket(packet, /stale sourceHash/);
  f.prepare();
  const target = await readJson(path.join(f.root, `data/i18n/${targetLocale}/people/${personId}.json`));
  assert.equal(target.sourceHash, packet.people[personId].sourceHash);
  assert.equal(target.strings.summary, packet.people[personId].strings.summary.target);
  f.failure(['check', targetLocale], /stale sourceHash/);
  await writeJson(sourcePath, original);
  const uiPath = path.join(f.root, 'data/i18n/zh/ui.json');
  const originalUI = await readJson(uiPath);
  await writeJson(uiPath, { ...originalUI, 'nav.index': `${originalUI['nav.index']}（更新）` });
  await f.importPacket(packet, /stale UI sourceHash/);
  f.prepare();
  const uiMetadata = await readJson(path.join(f.root, `data/i18n/${targetLocale}/ui-source.json`));
  const targetUI = await readJson(path.join(f.root, `data/i18n/${targetLocale}/ui.json`));
  assert.equal(uiMetadata.sourceHash, packet.uiSourceHash);
  assert.equal(targetUI['nav.index'], packet.ui['nav.index'].target);
  f.failure(['enable', targetLocale], /stale UI sourceHash/);
});

test('a stale enabled translation aborts build before replacing the existing static output', async t => {
  const f = await fixture(t);
  f.prepare();
  await f.importPacket(await f.completePacket());
  f.success('enable', targetLocale);
  const indexFile = path.join(f.root, 'dist/index.html');
  const nestedFile = path.join(f.root, 'dist/assets/keep.txt');
  await mkdir(path.dirname(nestedFile), { recursive: true });
  await writeFile(indexFile, '<h1>Previously verified output</h1>');
  await writeFile(nestedFile, 'Keep this existing asset');
  const sourcePath = path.join(f.root, 'data/people/elon-musk.json');
  const person = await readJson(sourcePath);
  person.summary += ' 测试变更。';
  await writeJson(sourcePath, person);
  const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: f.root, encoding: 'utf8', timeout: 20_000 });
  assert.notEqual(build.status, 0);
  assert.match(`${build.stdout}${build.stderr}`, /stale sourceHash/);
  assert.equal(await readFile(indexFile, 'utf8'), '<h1>Previously verified output</h1>');
  assert.equal(await readFile(nestedFile, 'utf8'), 'Keep this existing asset');
  assert.deepEqual((await readdir(path.join(f.root, 'dist'))).sort(), ['assets', 'index.html']);
});
