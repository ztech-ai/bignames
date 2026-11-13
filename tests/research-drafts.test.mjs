import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDraft, generateDrafts, LOCALES, normalizeDate } from '../scripts/research-drafts.mjs';

const cutoffDate = '2026-11-13';
const selection = { id: 'test-person', name: '测试人物', enName: 'Test Person' };
const entity = id => ({ type: 'wikibase-entityid', value: { id } });
const time = (raw, precision = 11, extra = {}) => ({ type: 'time', value: { time: `+${raw}T00:00:00Z`, precision, calendarmodel: 'http://www.wikidata.org/entity/Q1985727', before: 0, after: 0, ...extra } });
const claim = (id, value, qualifiers = {}, extra = {}) => ({ id: `Q123$${id}`, rank: 'normal', value, qualifiers, references: [{ P854: [{ type: 'string', value: 'https://example.test/source' }] }], ...extra });
const evidence = (claims = {}, extra = {}) => ({
  schemaVersion: 2, id: selection.id, fetchedAt: '2026-11-13T12:00:00Z', status: 'needs-review',
  identity: { wikidataId: 'Q123', humanEntityConfirmed: true, editorialIdentityReviewRequired: true },
  labels: { en: 'Test Person' }, sources: [{ id: 'wikidata', url: 'https://www.wikidata.org/wiki/Q123' }],
  intro: { language: 'en', text: 'THIS ENGLISH INTRO MUST NOT BE COPIED INTO TRANSLATIONS.' },
  claims: { P31: [claim('human', entity('Q5'))], ...claims },
  relatedEntities: { Q100: { labels: { en: 'Example University', zh: '示例大学' } }, Q101: { labels: { en: 'Example Position' } }, Q102: { labels: { en: 'Example Award' } } }, ...extra,
});
const draft = source => createDraft(selection, source, { cutoffDate });

test('human instance claims are necessary, but never waive editorial identity review', () => {
  for (const source of [null, evidence({ P31: [] }), evidence({ P31: [claim('company', entity('Q4830453'))] }), evidence({}, { status: 'blocked' }), evidence({}, { identity: { wikidataId: 'Q123', humanEntityConfirmed: true, disambiguation: true } }), evidence({}, { id: 'another-person' })]) {
    const result = draft(source);
    assert.equal(result.stage, 'research-draft');
    assert.equal(result.reviewStatus, 'blocked');
    assert.equal(result.publicationReady, false);
    assert.deepEqual(result.facts, []);
    assert.deepEqual(result.timeline, []);
    assert.equal(Object.keys(result.localized).length, 8);
    assert.ok(result.identity.blockedReasons.length);
  }
  const valid = draft(evidence());
  assert.equal(valid.reviewStatus, 'needs-editorial-review');
  assert.equal(valid.identity.editorialIdentityReviewRequired, true);
  const mismatch = createDraft({ ...selection, wikidataId: 'Q999' }, evidence(), { cutoffDate });
  assert.ok(mismatch.identity.blockedReasons.includes('selected-entity-mismatch'));
});

test('date normalization preserves precision, rejects invented dates and distinguishes cutoff overlap', () => {
  assert.equal(normalizeDate(time('1980-00-00', 9), cutoffDate).date, '1980');
  assert.equal(normalizeDate(time('2000-02-00', 10), cutoffDate).date, '2000-02');
  assert.equal(normalizeDate(time('2000-02-29'), cutoffDate).date, '2000-02-29');
  assert.equal(normalizeDate(time('2001-02-29'), cutoffDate).date, null);
  assert.equal(normalizeDate(time('1900-00-00', 7), cutoffDate).date, null);
  assert.equal(normalizeDate(time('1980-00-00', 8), cutoffDate).date, null);
  assert.equal(normalizeDate(time('1980-01-01', 11, { calendarmodel: 'http://www.wikidata.org/entity/Q1985786' }), cutoffDate).date, null);
  assert.equal(normalizeDate(time('2027-00-00', 9), cutoffDate).cutoffRelation, 'after-cutoff');
  assert.equal(normalizeDate(time('2026-00-00', 9), cutoffDate).cutoffRelation, 'overlaps-cutoff');
  assert.equal(normalizeDate(time('2026-11-00', 10), cutoffDate).cutoffRelation, 'overlaps-cutoff');
  assert.equal(normalizeDate(time('2026-11-13'), cutoffDate).cutoffRelation, 'within-cutoff');
});

test('eight locales share exact claim dates and events without inferring employment or graduation', () => {
  const result = draft(evidence({
    P569: [claim('birth', time('1970-00-00', 9))],
    P39: [claim('role', entity('Q101'), { P580: [time('2010-02-00', 10)] })],
    P108: [claim('employer', entity('Q100'), { P580: [time('2012-00-00', 9)], P582: [time('2028-00-00', 9)] })],
    P69: [claim('education', entity('Q100'), { P582: [time('1999-00-00', 9)] })],
    P166: [
      claim('award', entity('Q102'), { P585: [time('2025-06-10')] }),
      claim('future-award', entity('Q102'), { P585: [time('2027-06-10')] }),
      claim('overlap-award', entity('Q102'), { P585: [time('2026-00-00', 9)] }),
      claim('uncertain-award', entity('Q102'), { P585: [time('2020-00-00', 9, { after: 1 })] }),
    ],
  }));
  assert.equal(result.timeline.length, 5);
  assert.deepEqual(result.timeline.map(event => event.date), ['2025-06-10', '2012', '2010-02', '1999', '1970']);
  assert.ok(!result.facts.some(fact => fact.claimId.includes('future-award') || fact.claimId.includes('overlap-award')));
  assert.ok(result.quality.excludedDates.some(date => date.reason === 'uncertain-date'));
  assert.ok(result.quality.excludedDates.some(date => date.reason === 'after-cutoff'));
  const role = result.facts.find(fact => fact.property === 'P39');
  assert.equal(role.endStatus, 'unknown');
  assert.equal(role.currentStatus, 'not-inferred');
  const education = result.facts.find(fact => fact.property === 'P69');
  for (const locale of LOCALES) {
    assert.deepEqual(result.localized[locale].timeline.map(({ id, date, kind, precision }) => ({ id, date, kind, precision })), result.timeline.map(({ id, date, kind, precision }) => ({ id, date, kind, precision })));
    assert.deepEqual(result.localized[locale].facts.map(fact => fact.id), result.facts.map(fact => fact.id));
    assert.ok(result.localized[locale].facts.find(fact => fact.id === role.id).notes.length);
    assert.ok(result.localized[locale].facts.find(fact => fact.id === education.id).notes.length);
    assert.ok(!JSON.stringify(result.localized[locale]).includes('THIS ENGLISH INTRO'));
  }
  assert.match(result.localized.en.facts.find(fact => fact.id === education.id).notes[0], /does not establish graduation/);
  assert.match(result.localized.en.facts.find(fact => fact.id === role.id).notes[0], /does not establish a current position/);
  assert.equal(result.publicationReady, false);
});

test('source-reported death remains unverified and absent death never implies living', () => {
  const withDeath = draft(evidence({ P570: [claim('death', time('2024-03-01'))] }));
  assert.equal(withDeath.lifeStatus.status, 'unverified');
  assert.equal(withDeath.lifeStatus.sourceReportedDeathFacts.length, 1);
  assert.match(withDeath.localized.en.facts[0].label, /unverified/);
  assert.equal(withDeath.timeline.length, 0);
  const noDeath = draft(evidence());
  assert.equal(noDeath.lifeStatus.status, 'unverified');
  assert.equal(noDeath.lifeStatus.absenceOfDeathClaimIsNotEvidenceOfLife, true);
  assert.equal(Object.hasOwn(noDeath, 'death'), false);
});

test('claim provenance, fallback labels and low-precision dates stay visible to editors', () => {
  const source = evidence({
    P69: [claim('education', entity('Q100'), {}, { futureQualifiersOmitted: true, futureQualifierProperties: ['P582'], references: [{ P854: [{ type: 'string', value: 'javascript:alert(1)' }, { type: 'string', value: 'https://example.test/evidence' }], P248: [entity('Q900')] }] })],
    P569: [claim('imprecise-birth', time('1900-00-00', 7))],
    P166: [claim('deprecated', entity('Q102'), {}, { rank: 'deprecated' }), claim('missing-entity', entity('Q404'))],
  });
  const result = draft(source);
  const fact = result.facts.find(item => item.property === 'P69');
  assert.equal(fact.claimId, 'Q123$education');
  assert.equal(fact.futureQualifiersOmitted, true);
  assert.ok(fact.referenceUrls.includes('https://example.test/evidence'));
  assert.ok(fact.referenceUrls.includes('https://www.wikidata.org/wiki/Q900'));
  assert.ok(!fact.sourceUrls.some(url => url.startsWith('javascript:')));
  assert.deepEqual(fact.references, source.claims.P69[0].references, 'Raw references are preserved for review, not rendered as links');
  assert.ok(result.quality.labelFallbacks.some(item => item.locale === 'fr' && item.key === 'Q100' && item.fallbackLocale === 'en'));
  assert.ok(result.quality.labelFallbacks.some(item => item.key === 'Q404' && item.unresolved));
  assert.equal(result.timeline.length, 0);
  assert.equal(result.facts.find(item => item.property === 'P569').sourceDate.date, null);
  assert.ok(result.quality.excludedClaims.some(item => item.reason === 'deprecated'));
  const edited = structuredClone(source);
  edited.claims.P69[0].qualifiers.P580 = [time('2000-00-00', 9)];
  assert.equal(draft(edited).facts.find(item => item.property === 'P69').id, fact.id, 'Claim IDs keep editorial fact keys stable when qualifiers are corrected');
});

test('unknown omitted future qualifiers and future starts cannot masquerade as past appointments', () => {
  const result = draft(evidence({ P39: [
    claim('unknown-omission', entity('Q101'), { P585: [time('2025-06-01')] }, { futureQualifiersOmitted: true }),
    claim('omitted-start', entity('Q101'), {}, { futureQualifiersOmitted: true, futureQualifierProperties: ['P580'] }),
    claim('future-start-past-point', entity('Q101'), { P580: [time('2027-01-01')], P585: [time('2025-06-01')] }),
    claim('past-start-future-end', entity('Q101'), { P580: [time('2025-06-01')] }, { futureQualifiersOmitted: true, futureQualifierProperties: ['P582'] }),
  ] }));
  assert.deepEqual(result.facts.map(fact => fact.claimId), ['Q123$past-start-future-end']);
  assert.deepEqual(result.timeline.map(event => event.date), ['2025-06-01']);
  assert.equal(result.facts[0].currentStatus, 'not-inferred');
  assert.equal(result.quality.excludedClaims.length, 3);
  const otherFacts = draft(evidence({
    P463: [claim('future-membership', entity('Q100'), { P580: [time('2027-01-01')] })],
    P27: [claim('future-citizenship', entity('Q100'), { P580: [time('2027-01-01')], P585: [time('2025-06-01')] })],
    P512: [claim('future-degree', entity('Q100'), {}, { futureQualifiersOmitted: true, futureQualifierProperties: ['P585'] })],
  }));
  assert.equal(otherFacts.facts.length, 0, 'Future filters apply to nondated-timeline facts too');
});

test('generation covers every selection, emits blocked stubs, and is byte-idempotent', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'big-names-drafts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const evidenceDir = path.join(root, 'evidence');
  const outputDir = path.join(root, 'drafts');
  const collectionPath = path.join(root, 'collection.json');
  await mkdir(evidenceDir);
  await writeFile(collectionPath, JSON.stringify({ cutoffDate, people: [selection, { id: 'missing-person', name: '待核验人物', enName: 'Missing Person' }] }));
  await writeFile(path.join(evidenceDir, `${selection.id}.json`), JSON.stringify(evidence({ P569: [claim('birth', time('1980-00-00', 9))] })));
  await writeFile(path.join(evidenceDir, 'unselected-person.json'), JSON.stringify(evidence()));
  const first = await generateDrafts({ collectionPath, evidenceDir, outputDir });
  assert.equal(first.drafts, 2);
  assert.equal(first.blocked, 1);
  assert.equal(first.publicationReady, 0);
  assert.equal(first.changed, 2);
  const before = await readFile(path.join(outputDir, `${selection.id}.json`), 'utf8');
  const second = await generateDrafts({ collectionPath, evidenceDir, outputDir });
  assert.equal(second.changed, 0);
  assert.equal(await readFile(path.join(outputDir, `${selection.id}.json`), 'utf8'), before);
  assert.deepEqual((await readdir(outputDir)).sort(), ['missing-person.json', 'test-person.json']);
  const missing = JSON.parse(await readFile(path.join(outputDir, 'missing-person.json'), 'utf8'));
  assert.ok(missing.identity.blockedReasons.includes('missing-evidence'));
  assert.equal(missing.evidenceSource.capturedAt, null);
  await writeFile(collectionPath, JSON.stringify({ cutoffDate, people: [{ id: '../escape' }] }));
  await assert.rejects(generateDrafts({ collectionPath, evidenceDir, outputDir }), /Invalid or duplicate/);
});
