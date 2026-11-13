import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPlan, createBrief, createDetail, sampleTimeline, sampleFacts, writePacket, run } from '../scripts/content.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const cutoffDate = '2026-11-13';
const candidate = (id, stars, domain = 'technology') => ({ id, name: `人物 ${id}`, enName: id, domain, domains: [domain], priority: 1, influence: { stars, reviewStatus: 'provisional' }, lifeReviewStatus: 'pending' });

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'editorial-content-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['data/people', 'data/collections', 'data/research/drafts', 'data/research/evidence']) await mkdir(path.join(root, directory), { recursive: true });
  const people = [candidate('existing-person', 5), candidate('test-person', 5), candidate('business-person', 5, 'business'), candidate('lower-person', 3)];
  await writeFile(path.join(root, 'data/people/existing-person.json'), '{}\n');
  await writeFile(path.join(root, 'data/collections/contemporary-1000.json'), json({ cutoffDate, people }));
  const facts = Array.from({ length: 20 }, (_, i) => ({ id: `fact-${i}`, property: i === 18 ? 'P570' : i === 19 ? 'P569' : i % 2 ? 'P39' : 'P166', claimId: `Q1$claim-${i}`, value: { type: 'string', value: `source ${i}` }, dates: [{ date: `${2000 + i}`, precision: 9, cutoffRelation: 'within-cutoff' }], referenceHasExternalUrl: true, referenceUrls: [`https://example.test/source/${i}`], references: [{ raw: `reference ${i}` }], reviewStatus: 'unverified-source-claim' }));
  const timeline = facts.map((fact, i) => ({ id: `event-${i}`, factId: fact.id, property: fact.property, date: `${2000 + i}`, precision: 9, kind: 'point', reviewStatus: 'unverified-source-claim', sourceUrls: fact.referenceUrls }));
  const evidence = { id: 'test-person', cutoffDate, status: 'needs-review', fetchedAt: '2026-11-13T00:00:00Z', sources: [{ url: 'https://example.test/source', license: 'CC0' }], claims: {} };
  for (const fact of facts) { evidence.claims[fact.property] ??= []; evidence.claims[fact.property].push({ id: fact.claimId, value: fact.value, fullOnlyField: 'kept here' }); }
  const evidenceText = json(evidence);
  const draft = { id: 'test-person', cutoffDate, publicationReady: false, reviewStatus: 'needs-editorial-review', evidenceSource: { sha256: sha256(evidenceText) }, identity: { editorialIdentityReviewRequired: true }, lifeStatus: { status: 'unverified', absenceOfDeathClaimIsNotEvidenceOfLife: true }, missingChecks: ['identity', 'sources', 'all-eight-languages'], facts, timeline, quality: { missingLabels: [{ locale: 'ar' }] }, localized: {} };
  for (const locale of ['zh', 'en', 'fr', 'ar', 'de', 'ja', 'es', 'ko']) draft.localized[locale] = { facts: facts.map(fact => ({ id: fact.id, label: `${locale} label`, value: `${locale} value`, notes: [] })), timeline: timeline.map(event => ({ id: event.id, title: `${locale} title`, text: `${locale} text`, notes: [] })) };
  await writeFile(path.join(root, 'data/research/evidence/test-person.json'), evidenceText);
  await writeFile(path.join(root, 'data/research/drafts/test-person.json'), json(draft));
  return { root, draft, evidence, facts, timeline };
}

test('plan excludes complete profiles, ranks influence and supports multiple domains', async t => {
  const { root } = await fixture(t);
  const plan = await createPlan(root, { maximum: 2 });
  assert.deepEqual(plan.people.map(person => person.id), ['test-person', 'business-person']);
  assert.deepEqual(plan.counts, { selectedCandidates: 4, completeProfilesInCollection: 1, remainingCandidates: 3, matchingCandidates: 3, shown: 2 });
  assert.deepEqual((await createPlan(root, { domain: 'business' })).people.map(person => person.id), ['business-person']);
  await assert.rejects(createPlan(root, { maximum: 1000 }), /from 1 to 100/);
  await assert.rejects(createPlan(root, { domain: '../../data' }), /Unknown domain/);
});

test('chronology sampling retains endpoints and spans the full life; source arrays stay unchanged', () => {
  const events = Array.from({ length: 101 }, (_, i) => ({ id: `event-${i}`, date: `${1900 + i}` }));
  const before = structuredClone(events);
  const sampled = sampleTimeline(events, 3);
  assert.deepEqual(sampled.map(event => event.date), ['2000', '1950', '1900']);
  assert.deepEqual(events, before);
  assert.throws(() => sampleTimeline(events, 1), /at least 2/);
  assert.deepEqual(sampleTimeline([], 12), []);
});

test('fact sampling retains life-status claims and property diversity', () => {
  const facts = [{ id: 'a', property: 'P166' }, { id: 'b', property: 'P166' }, { id: 'c', property: 'P108' }, { id: 'd', property: 'P569' }, { id: 'e', property: 'P570' }];
  assert.deepEqual(sampleFacts(facts, 4).map(fact => fact.id), ['e', 'd', 'a', 'c']);
});

test('brief preserves omitted IDs, original fingerprints and uncertainty; no source file is changed', async t => {
  const { root } = await fixture(t);
  const sourcePaths = ['data/research/drafts/test-person.json', 'data/research/evidence/test-person.json', 'data/collections/contemporary-1000.json'];
  const original = await Promise.all(sourcePaths.map(file => readFile(path.join(root, file), 'utf8')));
  const brief = await createBrief(root, 'test-person', { maxFacts: 4, maxEvents: 3 });
  assert.equal(brief.publicationReady, false);
  assert.equal(brief.lifeStatus.status, 'unverified');
  assert.equal(brief.identity.editorialIdentityReviewRequired, true);
  assert.deepEqual(brief.coverage.facts.omittedIds.length, 16);
  assert.equal(brief.coverage.events.omittedIds.length, 17);
  assert.deepEqual(brief.timeline.map(event => event.date), ['2019', '2009', '2000']);
  assert.deepEqual(Object.keys(brief.facts[0].labels), ['zh', 'en']);
  assert.equal(brief.coverage.translations.omitted.length, 6);
  assert.match(brief.retrieve.fact, /--fact FACT_ID/);
  for (const file of brief.originalFiles) {
    const content = await readFile(path.join(root, file.path));
    assert.equal(file.sha256, sha256(content));
    assert.equal(file.bytes, content.length);
  }
  assert.deepEqual(await Promise.all(sourcePaths.map(file => readFile(path.join(root, file), 'utf8'))), original);
  assert.equal(json(brief), json(await createBrief(root, 'test-person', { maxFacts: 4, maxEvents: 3 })));
});

test('omitted fact and event remain available in full, including references and original source claim', async t => {
  const { root, facts } = await fixture(t);
  const brief = await createBrief(root, 'test-person', { maxFacts: 4, maxEvents: 3 });
  const factId = brief.coverage.facts.omittedIds[0];
  const detail = await createDetail(root, 'test-person', { factId });
  assert.deepEqual(detail.fact, facts.find(fact => fact.id === factId));
  assert.equal(detail.sourceClaim.fullOnlyField, 'kept here');
  const eventId = brief.coverage.events.omittedIds[0];
  const eventDetail = await createDetail(root, 'test-person', { eventId });
  assert.equal(eventDetail.event.id, eventId);
  assert.equal(eventDetail.event.factId, eventDetail.fact.id);
  await assert.rejects(createDetail(root, 'test-person', { factId: 'unknown-fact' }), /Unknown fact/);
  await assert.rejects(createDetail(root, 'test-person', { factId, eventId }), /exactly one/);
});

test('stale evidence and cutoff mismatches block packets rather than hiding source changes', async t => {
  const { root, evidence, draft } = await fixture(t);
  await writeFile(path.join(root, 'data/research/evidence/test-person.json'), json({ ...evidence, status: 'changed' }));
  await assert.rejects(createBrief(root, 'test-person'), /Stale draft evidence hash/);
  await writeFile(path.join(root, 'data/research/evidence/test-person.json'), json(evidence));
  await writeFile(path.join(root, 'data/research/drafts/test-person.json'), json({ ...draft, cutoffDate: '2026-11-12' }));
  await assert.rejects(createBrief(root, 'test-person'), /Cutoff mismatch/);
});

test('IDs reject traversal and packet writes protect source directories, including symlink paths', async t => {
  const { root } = await fixture(t);
  await assert.rejects(createBrief(root, '../../secret'), /Invalid person id/);
  await assert.rejects(createDetail(root, 'test-person', { factId: '../secret' }), /Invalid fact id/);
  await assert.rejects(writePacket(root, path.join(root, 'data/people/test-person.json'), {}), /source files are protected/);
  await mkdir(path.join(root, '.qa'));
  await symlink(path.join(root, 'data'), path.join(root, '.qa/link'));
  await assert.rejects(writePacket(root, path.join(root, '.qa/link/new-folder/file.json'), {}), /protected source directory/);
  assert.ok(!(await readdir(path.join(root, 'data'))).includes('new-folder'));
  const packet = { unicode: '李😀' };
  const target = path.join(root, '.qa/packets/result.json');
  const result = await writePacket(root, target, packet);
  const text = await readFile(target, 'utf8');
  assert.equal(result.bytes, Buffer.byteLength(text));
  assert.equal(result.characters, [...text].length);
  assert.equal(result.sha256, sha256(text));
  assert.deepEqual(await readdir(path.dirname(target)), ['result.json']);
});

test('CLI rejects unknown, repeated and irrelevant flags before producing output', async t => {
  const { root } = await fixture(t);
  await assert.rejects(run(['brief', '--person', 'test-person', '--person', 'lower-person'], root), /repeated argument/);
  await assert.rejects(run(['plan', '--fact', 'fact-1'], root), /Unknown or repeated argument/);
  await assert.rejects(run(['detail', '--person'], root), /Missing value/);
});
