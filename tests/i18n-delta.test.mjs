import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceHash, sourceStrings } from '../scripts/i18n-core.mjs';
import { createSnapshot, buildDeltaEntry, createPacket, reviewPacket, writeTransaction } from '../scripts/i18n-delta-core.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
function person() {
  return { id: 'sample-person', name: '示例', role: '研究者', country: '国家', summary: '概要', coverageNote: '覆盖', tags: ['科技'],
    birth: '1970-01-01', death: null, aliases: ['Sample'], verifiedAt: '2026-11-13',
    facts: [{ id: 'fact-01', label: '出生', value: '1970' }], highlights: [{ id: 'highlight-01', title: '成就', text: '关键成就', sourceIds: ['s1'] }],
    timeline: [{ id: 'event-01', date: '2000', title: '事件', text: '事件描述', sourceIds: ['s1'] }],
    sources: [{ id: 's1', url: 'https://example.org/fact' }], influence: { stars: 4, rationale: '有影响力' } };
}
function translation(source) { return { sourceHash: sourceHash(source), strings: Object.fromEntries(Object.entries(sourceStrings(source)).map(([key, value]) => [key, `EN ${value}`])) }; }
function delta(before, after, target = translation(before), kind = 'person') {
  const state = { kind, source: after, target, bindings: { 'target.json': sourceHash(target) } };
  const entry = buildDeltaEntry({ ...state, locale: 'en', snapshot: createSnapshot(kind, before) });
  const packet = createPacket('en', { person: kind === 'person' ? after.id : null, ui: kind === 'ui' }, [entry]);
  return { state, packet };
}
function reviewed(packet) {
  const result = structuredClone(packet);
  result.reviewer = { kind: 'ai', name: 'test reviewer' };
  for (const entry of result.entries) for (const unit of entry.units) { unit.reviewed = true; if (unit.operation !== 'delete') unit.target = `Translated ${unit.source}`; }
  return result;
}

test('unchanged source creates zero delta jobs without refreshing target metadata', () => {
  const base = person(); const { state, packet } = delta(base, base);
  assert.deepEqual(packet.entries, []);
  assert.deepEqual(reviewPacket(packet, packet, [state]), []);
});

test('one event title changes one unit; other translations remain exact', () => {
  const base = person(); const changed = structuredClone(base); changed.timeline[0].title = '新事件';
  const { state, packet } = delta(base, changed);
  assert.equal(packet.entries[0].units.length, 1);
  assert.equal(packet.entries[0].units[0].key, 'timeline.event-01.title');
  assert.equal(packet.entries[0].sharedFacts.required, false);
  const [result] = reviewPacket(reviewed(packet), packet, [state]);
  assert.equal(result.next.sourceHash, sourceHash(changed));
  for (const [key, value] of Object.entries(state.target.strings)) if (key !== 'timeline.event-01.title') assert.equal(result.next.strings[key], value);
  assert.equal(result.next.deltaReview.reviewer.kind, 'ai');
});


test('influence rationale uses the same one-field delta as biography text', () => {
  const base = person(); const changed = structuredClone(base); changed.influence.rationale = '更新影响力理由';
  const { state, packet } = delta(base, changed);
  assert.deepEqual(packet.entries[0].units.map(unit => unit.key), ['influence.rationale']);
  assert.equal(packet.entries[0].sharedFacts.required, false);
  const [result] = reviewPacket(reviewed(packet), packet, [state]);
  assert.equal(result.next.strings['influence.rationale'], 'Translated 更新影响力理由');
  assert.equal(result.next.strings.summary, state.target.strings.summary);
});

test('obsolete keys require review before pruning, new fields remain required', () => {
  const base = person(); base.timeline[0].dateLabel = '二〇〇〇年';
  const changed = structuredClone(base); delete changed.timeline[0].dateLabel;
  changed.highlights.push({ id: 'highlight-02', title: '新增', text: '新增描述' });
  const { state, packet } = delta(base, changed);
  const obsolete = packet.entries[0].units.find(unit => unit.operation === 'delete');
  assert.equal(obsolete.key, 'timeline.event-01.dateLabel');
  const approved = reviewed(packet); approved.entries[0].sharedFacts.reviewed = true;
  approved.entries[0].units.find(unit => unit.operation === 'delete').reviewed = false;
  assert.throws(() => reviewPacket(approved, packet, [state]), /must be reviewed/);
  approved.entries[0].units.forEach(unit => unit.reviewed = true);
  const [result] = reviewPacket(approved, packet, [state]);
  assert.equal(Object.hasOwn(result.next.strings, obsolete.key), false);
  assert.equal(result.next.strings['highlights.highlight-02.title'], 'Translated 新增');
});

test('date, death and source URL changes cannot blindly refresh a hash', () => {
  for (const mutate of [p => p.timeline[0].date = '2001', p => p.death = '2026-11-01', p => p.sources[0].url = 'https://example.org/new']) {
    const base = person(); const changed = structuredClone(base); mutate(changed);
    const { state, packet } = delta(base, changed);
    assert.equal(packet.entries[0].units.length, 0);
    assert.equal(packet.entries[0].sharedFacts.required, true);
    const approved = reviewed(packet);
    assert.throws(() => reviewPacket(approved, packet, [state]), /shared facts require explicit review/);
    approved.entries[0].sharedFacts.reviewed = true;
    assert.equal(reviewPacket(approved, packet, [state])[0].next.sourceHash, sourceHash(changed));
  }
});

test('source, baseline, target, scope and packet tampering fail closed', () => {
  const base = person(); const changed = structuredClone(base); changed.summary = '更新';
  const { state, packet } = delta(base, changed);
  for (const mutate of [p => p.entries[0].units[0].source = 'fake', p => p.entries[0].id = '../escape', p => p.scope.person = 'wrong', p => p.entries[0].units.push({ key: '__proto__', source: 'x' }), p => p.entries[0].bindings['target.json'] = 'tampered']) {
    const malicious = reviewed(packet); mutate(malicious);
    assert.throws(() => reviewPacket(malicious, packet, [state]), /Stale or tampered/);
  }
  const staleSource = structuredClone(changed); staleSource.summary = '再次更新';
  assert.throws(() => reviewPacket(reviewed(packet), delta(base, staleSource).packet, [state]), /Stale or tampered/);
  const editedTarget = translation(base); editedTarget.strings.role = 'Concurrent change';
  assert.throws(() => reviewPacket(reviewed(packet), delta(base, changed, editedTarget).packet, [state]), /Stale or tampered/);
  const corruptSnapshot = createSnapshot('person', base); corruptSnapshot.source.name = 'tampered';
  assert.throws(() => buildDeltaEntry({ ...state, locale: 'en', snapshot: corruptSnapshot }), /Invalid or tampered/);
});

test('UI is incremental and invalid placeholders are rejected before writes', () => {
  const before = { title: '标题', count: '{count}个人' }; const after = { ...before, count: '共{count}个人' };
  const target = { strings: { title: 'Title', count: '{count} people' }, metadata: { sourceHash: sourceHash(before), retained: 'metadata' } };
  const { state, packet } = delta(before, after, target, 'ui');
  assert.equal(packet.entries[0].units.length, 1);
  const approved = reviewed(packet); approved.entries[0].units[0].target = 'People';
  assert.throws(() => reviewPacket(approved, packet, [state]), /inconsistent placeholders/);
  approved.entries[0].units[0].target = 'Total {count} people';
  const [result] = reviewPacket(approved, packet, [state]);
  assert.equal(result.next.strings.title, 'Title');
  assert.equal(result.next.metadata.retained, 'metadata');
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'big-names-delta-'));
  t.after(async () => { const { rm } = await import('node:fs/promises'); await rm(root, { recursive: true, force: true }); });
  await mkdir(path.join(root, 'scripts'));
  for (const file of ['i18n-core.mjs', 'i18n-delta-core.mjs', 'i18n-delta.mjs']) await cp(path.join(repo, 'scripts', file), path.join(root, 'scripts', file));
  const write = async (relative, value) => { const file = path.join(root, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + '\n'); };
  const read = async relative => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
  const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts/i18n-delta.mjs'), ...args], { cwd: os.tmpdir(), encoding: 'utf8', timeout: 20000 });
  const base = person();
  await write('data/i18n/locales.json', { source: 'zh', default: 'zh', locales: [{ id: 'zh', enabled: true }, { id: 'en', enabled: true }] });
  await write('data/people/sample-person.json', base);
  await write('data/i18n/en/people/sample-person.json', translation(base));
  await write('data/i18n/zh/ui.json', { count: '{count}个人' });
  await write('data/i18n/en/ui.json', { count: '{count} people' });
  await write('data/i18n/en/ui-source.json', { sourceHash: sourceHash({ count: '{count}个人' }) });
  return { root, write, read, run, base };
}
const assertPass = result => assert.equal(result.status, 0, result.stderr);

test('CLI requires snapshots, works without Git or caller cwd, preserves files after invalid import', async t => {
  const f = await fixture(t); const out = path.join(f.root, 'packet.json');
  assert.match(f.run('export', '--locale', 'en', '--person', f.base.id, '--out', out).stderr, /Missing validated snapshot/);
  assertPass(f.run('snapshot'));
  assert.equal((await readdir(path.join(f.root, 'data/i18n/snapshots'))).length, 2);
  assertPass(f.run('snapshot')); // Idempotent; doesn't manufacture review status.
  const snapshot = await f.read(`data/i18n/snapshots/${sourceHash(f.base)}.json`);
  assert.equal(snapshot.basis, 'validated-existing-translation');
  const changed = structuredClone(f.base); changed.timeline[0].title = '新版';
  await f.write('data/people/sample-person.json', changed);
  assertPass(f.run('export', '--locale', 'en', '--person', f.base.id, '--ui', '--out', out));
  const packet = await f.read('packet.json');
  assert.equal(packet.entries.length, 1);
  const original = await readFile(path.join(f.root, 'data/i18n/en/people/sample-person.json'), 'utf8');
  assert.match(f.run('import', '--locale', 'en', '--person', f.base.id, '--ui', '--file', out).stderr, /reviewer/);
  assert.equal(await readFile(path.join(f.root, 'data/i18n/en/people/sample-person.json'), 'utf8'), original);
  await f.write('packet.json', reviewed(packet));
  assertPass(f.run('import', '--locale', 'en', '--person', f.base.id, '--ui', '--file', out));
  const result = await f.read('data/i18n/en/people/sample-person.json');
  assert.equal(result.strings['timeline.event-01.title'], 'Translated 新版');
  assert.equal(result.strings.summary, translation(f.base).strings.summary);
  assert.deepEqual(await f.read('data/people/sample-person.json'), changed);
  assert.equal((await readdir(path.join(f.root, 'data/i18n/snapshots'))).length, 3);
  assertPass(f.run('export', '--locale', 'en', '--person', f.base.id, '--out', out));
  assert.deepEqual((await f.read('packet.json')).entries, []);
});

test('CLI validates mixed person/UI packet entirely before mutation; stale target is rejected', async t => {
  const f = await fixture(t); assertPass(f.run('snapshot'));
  const changed = structuredClone(f.base); changed.summary = '变更'; await f.write('data/people/sample-person.json', changed);
  await f.write('data/i18n/zh/ui.json', { count: '合计{count}个人' });
  const out = path.join(f.root, 'packet.json');
  assertPass(f.run('export', '--locale', 'en', '--person', f.base.id, '--ui', '--out', out));
  const packet = reviewed(await f.read('packet.json'));
  packet.entries.find(entry => entry.kind === 'ui').units[0].target = 'Broken';
  await f.write('packet.json', packet);
  const originals = await Promise.all(['people/sample-person.json', 'ui.json', 'ui-source.json'].map(file => readFile(path.join(f.root, 'data/i18n/en', file), 'utf8')));
  assert.match(f.run('import', '--locale', 'en', '--person', f.base.id, '--ui', '--file', out).stderr, /inconsistent placeholders/);
  assert.deepEqual(await Promise.all(['people/sample-person.json', 'ui.json', 'ui-source.json'].map(file => readFile(path.join(f.root, 'data/i18n/en', file), 'utf8'))), originals);
  const target = await f.read('data/i18n/en/people/sample-person.json'); target.strings.role = 'Other editor'; await f.write('data/i18n/en/people/sample-person.json', target);
  assert.match(f.run('import', '--locale', 'en', '--person', f.base.id, '--ui', '--file', out).stderr, /Stale or tampered/);
});


test('snapshot refuses stale or incomplete translations without writing baselines', async t => {
  const f = await fixture(t);
  const target = await f.read('data/i18n/en/people/sample-person.json');
  delete target.strings.summary;
  await f.write('data/i18n/en/people/sample-person.json', target);
  assert.match(f.run('snapshot').stderr, /missing translated string summary/);
  await assert.rejects(readdir(path.join(f.root, 'data/i18n/snapshots')), { code: 'ENOENT' });
  target.strings.summary = 'Summary'; target.sourceHash = '0'.repeat(64);
  await f.write('data/i18n/en/people/sample-person.json', target);
  assert.match(f.run('snapshot').stderr, /stale sourceHash/);
  await assert.rejects(readdir(path.join(f.root, 'data/i18n/snapshots')), { code: 'ENOENT' });
});

test('transaction source guards reject concurrent canonical changes before writes', async t => {
  const f = await fixture(t); const relative = 'data/i18n/en/ui.json';
  const original = await readFile(path.join(f.root, relative), 'utf8');
  await assert.rejects(writeTransaction(f.root, [{ path: relative, content: 'changed', expectedHash: sourceHash(original) }], {
    guards: { 'data/people/sample-person.json': 'stale-hash' }
  }), /Concurrent edit detected/);
  assert.equal(await readFile(path.join(f.root, relative), 'utf8'), original);
});

test('transaction rolls back already committed files on I/O failure', async t => {
  const f = await fixture(t); const paths = ['data/i18n/en/ui.json', 'data/i18n/en/ui-source.json'];
  const originals = await Promise.all(paths.map(relative => readFile(path.join(f.root, relative), 'utf8')));
  let calls = 0;
  await assert.rejects(writeTransaction(f.root, paths.map((relative, index) => ({ path: relative, content: 'changed', expectedHash: sourceHash(originals[index]) })), {
    renameFile: async (...args) => { if (++calls === 2) throw new Error('simulated disk failure'); await rename(...args); }
  }), /simulated disk failure/);
  assert.deepEqual(await Promise.all(paths.map(relative => readFile(path.join(f.root, relative), 'utf8'))), originals);
  assert.equal((await readdir(path.join(f.root, 'data/i18n'))).includes('.delta.lock'), false);
});
