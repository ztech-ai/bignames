import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOMAINS = ['technology', 'business', 'politics', 'culture', 'science', 'literature', 'arts', 'sports'];
const hash = text => createHash('sha256').update(text).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const textSize = text => ({ bytes: Buffer.byteLength(text), characters: [...text].length });
const requiredId = (value, label = 'person') => {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`Invalid ${label} id: ${value}`);
  return value;
};
const limit = (value, name, max = 100) => {
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${name} must be an integer from 1 to ${max}`);
  return value;
};
const portable = value => value.split(path.sep).join('/');
const relative = (root, file) => portable(path.relative(root, file));
async function readJSON(file) {
  const text = await readFile(file, 'utf8');
  return { data: JSON.parse(text), text, sha256: hash(text), ...textSize(text) };
}

/** Plan from the small roster and filename inventory, without loading all evidence. */
export async function createPlan(root = ROOT, { maximum = 12, domain } = {}) {
  limit(maximum, 'limit');
  if (domain && !DOMAINS.includes(domain)) throw new Error(`Unknown domain: ${domain}`);
  const { data: collection } = await readJSON(path.join(root, 'data/collections/contemporary-1000.json'));
  const published = new Set((await readdir(path.join(root, 'data/people'))).filter(file => file.endsWith('.json')).map(file => file.slice(0, -5)));
  const complete = collection.people.filter(person => published.has(person.id));
  const remaining = collection.people.filter(person => !published.has(person.id));
  const selected = remaining.filter(person => !domain || (person.domains ?? [person.domain]).includes(domain)).sort((a, b) =>
    (b.influence?.stars ?? 0) - (a.influence?.stars ?? 0) ||
    (a.priority ?? 999) - (b.priority ?? 999) ||
    DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) || a.id.localeCompare(b.id, 'en'));
  return {
    kind: 'editorial-work-plan', cutoffDate: collection.cutoffDate,
    counts: { selectedCandidates: collection.people.length, completeProfilesInCollection: complete.length, remainingCandidates: remaining.length, matchingCandidates: selected.length, shown: Math.min(maximum, selected.length) },
    filter: { domain: domain ?? null, limit: maximum },
    ordering: 'influence stars descending, priority ascending, preferred domains, stable id',
    note: 'Existing complete profiles are excluded. Research and provisional ratings remain unreviewed; this plan never publishes pages.',
    people: selected.slice(0, maximum).map(({ id, name, enName, domain: primaryDomain, domains, priority, influence, lifeReviewStatus, researchStatus }) =>
      ({ id, name, enName, domain: primaryDomain, domains: domains ?? [primaryDomain], priority, stars: influence?.stars ?? null, influenceReviewStatus: influence?.reviewStatus ?? 'unreviewed', lifeReviewStatus, researchStatus })),
  };
}

/** Keep both chronology endpoints and evenly spaced intermediate events. */
export function sampleTimeline(events, maximum) {
  limit(maximum, 'max-events');
  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date, 'en') || a.id.localeCompare(b.id, 'en'));
  if (sorted.length <= maximum) return sorted;
  if (maximum === 1) throw new Error('max-events must be at least 2 when a timeline has multiple events, to retain oldest and newest');
  return Array.from({ length: maximum }, (_, index) => sorted[Math.round(index * (sorted.length - 1) / (maximum - 1))]);
}

/** Include source birth/death claims first, then round-robin across fact properties. */
export function sampleFacts(facts, maximum) {
  limit(maximum, 'max-facts');
  const groups = new Map();
  for (const fact of facts) {
    if (!groups.has(fact.property)) groups.set(fact.property, []);
    groups.get(fact.property).push(fact);
  }
  const properties = [...groups.keys()].sort((a, b) => (['P570', 'P569'].indexOf(a) < 0 ? 2 : ['P570', 'P569'].indexOf(a)) - (['P570', 'P569'].indexOf(b) < 0 ? 2 : ['P570', 'P569'].indexOf(b)));
  const result = [];
  for (let row = 0; result.length < maximum && result.length < facts.length; row++) {
    for (const property of properties) {
      if (groups.get(property)[row]) result.push(groups.get(property)[row]);
      if (result.length === maximum) break;
    }
  }
  return result;
}

async function loadPerson(root, id) {
  requiredId(id);
  const collectionFile = path.join(root, 'data/collections/contemporary-1000.json');
  const collection = await readJSON(collectionFile);
  const person = collection.data.people.find(candidate => candidate.id === id);
  if (!person) throw new Error(`Person not in contemporary collection: ${id}`);
  const draftFile = path.join(root, 'data/research/drafts', `${id}.json`);
  const evidenceFile = path.join(root, 'data/research/evidence', `${id}.json`);
  const [draft, evidence, profiles] = await Promise.all([readJSON(draftFile), readJSON(evidenceFile), readdir(path.join(root, 'data/people'))]);
  if (draft.data.id !== id || evidence.data.id !== id) throw new Error(`Person identity mismatch in research files: ${id}`);
  if (draft.data.evidenceSource?.sha256 !== evidence.sha256) throw new Error(`Stale draft evidence hash for ${id}; regenerate research drafts before preparing a brief`);
  if (draft.data.cutoffDate !== collection.data.cutoffDate || evidence.data.cutoffDate !== collection.data.cutoffDate) throw new Error(`Cutoff mismatch for ${id}`);
  return { person, draft, evidence, completeProfileExists: profiles.includes(`${id}.json`), cutoffDate: collection.data.cutoffDate,
    originalFiles: [
      { kind: 'collection', path: relative(root, collectionFile), sha256: collection.sha256, bytes: collection.bytes },
      { kind: 'complete-research-draft', path: relative(root, draftFile), sha256: draft.sha256, bytes: draft.bytes },
      { kind: 'complete-source-evidence', path: relative(root, evidenceFile), sha256: evidence.sha256, bytes: evidence.bytes },
    ] };
}
const localizedItem = (draft, group, id) => Object.fromEntries(['zh', 'en'].map(locale => [locale, draft.localized?.[locale]?.[group]?.find(item => item.id === id) ?? null]));
const dateSummary = date => Object.fromEntries(['property', 'date', 'precision', 'cutoffRelation', 'uncertain', 'uncertaintyBefore', 'uncertaintyAfter'].filter(key => date[key] !== undefined).map(key => [key, date[key]]));
const boundedUrls = (values = [], maximum = 4) => ({ urls: [...new Set(values)].slice(0, maximum), omittedUrlCount: Math.max(0, new Set(values).size - maximum) });

export async function createBrief(root = ROOT, id, { maxEvents = 12, maxFacts = 20 } = {}) {
  limit(maxEvents, 'max-events'); limit(maxFacts, 'max-facts');
  const loaded = await loadPerson(root, id);
  const { person, draft: sourceDraft, evidence, completeProfileExists, cutoffDate, originalFiles } = loaded;
  const draft = sourceDraft.data;
  const facts = sampleFacts(draft.facts, maxFacts);
  const events = sampleTimeline(draft.timeline, maxEvents);
  const factIds = new Set(facts.map(fact => fact.id));
  const eventIds = new Set(events.map(event => event.id));
  const quality = Object.fromEntries(Object.entries(draft.quality ?? {}).map(([key, value]) => [key, Array.isArray(value) ? { count: value.length, fullDetailsIn: originalFiles[1].path } : value]));
  return {
    formatVersion: 1, kind: 'compact-editorial-brief', id, cutoffDate, publicationReady: false,
    status: 'unreviewed-input-requires-editorial-work', completeProfileExists,
    note: 'Research claims are not verified biography facts. This packet samples the complete files, never replaces them. No absent death claim proves life; no missing end date proves a current role. Check all omitted items before publication.',
    candidate: { name: person.name, enName: person.enName, domain: person.domain, domains: person.domains ?? [person.domain], inclusionReason: person.inclusionReason, influence: person.influence, lifeReviewStatus: person.lifeReviewStatus },
    identity: draft.identity, lifeStatus: draft.lifeStatus,
    sourceStatus: { evidenceStatus: evidence.data.status, draftStatus: draft.reviewStatus, capturedAt: evidence.data.fetchedAt, captureIsNotEditorialReview: true },
    missingChecks: draft.missingChecks, quality,
    originalFiles,
    sourceRecords: (evidence.data.sources ?? []).slice(0, 8),
    omittedSourceRecordCount: Math.max(0, (evidence.data.sources ?? []).length - 8),
    coverage: {
      facts: { total: draft.facts.length, selected: facts.length, omitted: draft.facts.length - facts.length, omittedIds: draft.facts.filter(fact => !factIds.has(fact.id)).map(fact => fact.id), method: 'birth/death first, then round-robin across source properties; not an importance judgment' },
      events: { total: draft.timeline.length, selected: events.length, omitted: draft.timeline.length - events.length, omittedIds: draft.timeline.filter(event => !eventIds.has(event.id)).map(event => event.id), method: 'evenly spaced chronological sample retaining oldest and newest; not an importance judgment' },
      translations: { included: ['zh', 'en'], omitted: Object.keys(draft.localized).filter(locale => !['zh', 'en'].includes(locale)), status: 'template-and-source-labels-unreviewed' },
    },
    facts: facts.map(fact => ({
      id: fact.id, property: fact.property, claimId: fact.claimId, reviewStatus: fact.reviewStatus,
      labels: localizedItem(draft, 'facts', fact.id), dates: fact.dates.map(dateSummary),
      ...(fact.sourceDate ? { sourceDate: dateSummary(fact.sourceDate) } : {}),
      ...(fact.currentStatus ? { currentStatus: fact.currentStatus, endStatus: fact.endStatus } : {}),
      ...(fact.futureQualifiersOmitted ? { futureQualifiersOmitted: true, futureQualifierProperties: fact.futureQualifierProperties } : {}),
      referenceHasExternalUrl: fact.referenceHasExternalUrl, references: boundedUrls(fact.referenceUrls),
    })),
    timeline: events.map(event => ({
      id: event.id, factId: event.factId, property: event.property, date: event.date, precision: event.precision, kind: event.kind, reviewStatus: event.reviewStatus,
      labels: localizedItem(draft, 'timeline', event.id), sources: boundedUrls(event.sourceUrls),
    })),
    retrieve: { fact: `node scripts/content.mjs detail --person ${id} --fact FACT_ID`, event: `node scripts/content.mjs detail --person ${id} --event EVENT_ID`, allDetails: originalFiles[1].path },
    inputSize: { researchDraft: { bytes: sourceDraft.bytes, characters: sourceDraft.characters }, evidence: { bytes: evidence.bytes, characters: evidence.characters }, measurement: 'Actual UTF-8 bytes and Unicode code points; not model token or cost estimates.' },
  };
}

export async function createDetail(root = ROOT, id, { factId, eventId } = {}) {
  if (Boolean(factId) === Boolean(eventId)) throw new Error('Choose exactly one --fact or --event');
  requiredId(factId ?? eventId, factId ? 'fact' : 'event');
  const { draft: sourceDraft, evidence, originalFiles, cutoffDate } = await loadPerson(root, id);
  const draft = sourceDraft.data;
  const event = eventId ? draft.timeline.find(item => item.id === eventId) : null;
  if (eventId && !event) throw new Error(`Unknown event: ${eventId}`);
  const fact = draft.facts.find(item => item.id === (factId ?? event.factId));
  if (!fact) throw new Error(`Unknown fact: ${factId ?? event.factId}`);
  return {
    kind: 'complete-research-detail', id, cutoffDate, publicationReady: false,
    note: 'Complete source claim and unreviewed labels, not an editorially verified fact.', originalFiles,
    fact, labels: localizedItem(draft, 'facts', fact.id),
    sourceClaim: fact.claimId ? (evidence.data.claims?.[fact.property] ?? []).find(claim => claim.id === fact.claimId) ?? null : null,
    ...(event ? { event, eventLabels: localizedItem(draft, 'timeline', event.id) } : {}),
  };
}

/** Generated packets may live in .qa or outside the project, never in source folders. */
export async function writePacket(root, file, packet) {
  const resolvedRoot = await realpath(root);
  const target = path.resolve(file);
  if (path.extname(target) !== '.json') throw new Error('Packet output must use a .json filename');
  const inside = candidate => { const rel = path.relative(resolvedRoot, candidate); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
  const allowed = candidate => !inside(candidate) || relative(resolvedRoot, candidate).startsWith('.qa/');
  if (!allowed(target)) throw new Error('Packet output inside the project must be under .qa/; source files are protected');
  // Resolve the nearest existing ancestor before mkdir, including any symlinks.
  let ancestor = path.dirname(target);
  let remainder = path.basename(target);
  while (true) {
    try { if (!allowed(path.join(await realpath(ancestor), remainder))) throw new Error('Packet output resolves to a protected source directory'); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      remainder = path.join(path.basename(ancestor), remainder);
      ancestor = path.dirname(ancestor);
    }
  }
  await mkdir(path.dirname(target), { recursive: true });
  const actualTarget = path.join(await realpath(path.dirname(target)), path.basename(target));
  if (!allowed(actualTarget)) throw new Error('Packet output resolves to a protected source directory');
  const text = json(packet);
  const temporary = `${actualTarget}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, text, { flag: 'wx' }); await rename(temporary, actualTarget); }
  finally { await rm(temporary, { force: true }); }
  return { path: actualTarget, sha256: hash(text), ...textSize(text) };
}

export async function run(args, root = ROOT) {
  const [command, ...rest] = args;
  if (!command || command === '--help') {
    console.log('Offline editorial tools; no AI calls or publication.\nplan [--limit 12] [--domain technology] [--json]\nbrief --person ID [--max-events 12] [--max-facts 20] [--out FILE.json]\ndetail --person ID (--fact FACT_ID | --event EVENT_ID)'); return;
  }
  if (!['plan', 'brief', 'detail'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const accepted = { plan: ['--limit', '--domain', '--json'], brief: ['--person', '--max-events', '--max-facts', '--out'], detail: ['--person', '--fact', '--event'] }[command];
  const options = {};
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (!accepted.includes(key) || Object.hasOwn(options, key)) throw new Error(`Unknown or repeated argument: ${key}`);
    if (key === '--json') options[key] = true;
    else { if (!rest[index + 1] || rest[index + 1].startsWith('--')) throw new Error(`Missing value for ${key}`); options[key] = rest[++index]; }
  }
  if (command === 'plan') {
    const result = await createPlan(root, { maximum: options['--limit'] === undefined ? 12 : Number(options['--limit']), domain: options['--domain'] });
    console.log(options['--json'] ? json(result).trimEnd() : `${result.counts.remainingCandidates} remaining / ${result.counts.selectedCandidates} selected candidates; showing ${result.counts.shown}.\n${result.people.map(person => `${person.domain}\t${person.name}\t${person.stars} stars\t${person.id}`).join('\n')}`);
    return result;
  }
  requiredId(options['--person']);
  if (command === 'detail') {
    const result = await createDetail(root, options['--person'], { factId: options['--fact'], eventId: options['--event'] });
    console.log(json(result).trimEnd()); return result;
  }
  const packet = await createBrief(root, options['--person'], { maxEvents: options['--max-events'] === undefined ? 12 : Number(options['--max-events']), maxFacts: options['--max-facts'] === undefined ? 20 : Number(options['--max-facts']) });
  const output = options['--out'] ? path.resolve(options['--out']) : path.join(root, '.qa/packets', `${options['--person']}.json`);
  const result = await writePacket(root, output, packet);
  console.log(json({ ...result, facts: packet.coverage.facts.selected, omittedFacts: packet.coverage.facts.omitted, events: packet.coverage.events.selected, omittedEvents: packet.coverage.events.omitted, fullDraftBytes: packet.inputSize.researchDraft.bytes, measurement: 'UTF-8 bytes and Unicode code points, not AI tokens. Full evidence remains unchanged.' }).trimEnd());
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch(error => { console.error(`content: ${error.message}`); process.exitCode = 1; });
}
