import { readFile, writeFile, mkdir, rename, unlink, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sourceStrings, sourceHash, validateTranslation, validateUI, validateUISource } from './i18n-core.mjs';

export const FORMAT = 'big-names-i18n-delta';
const json = value => JSON.stringify(value, null, 2) + '\n';
const own = (value, key) => Object.hasOwn(value, key);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => sourceHash(canonical(value));
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const clone = value => structuredClone(value);
export const snapshotPath = hash => `data/i18n/snapshots/${hash}.json`;

export function createSnapshot(kind, source) {
  return { formatVersion: 1, kind, sourceHash: sourceHash(source), basis: 'validated-existing-translation', source: clone(source) };
}

export function validateSnapshot(snapshot, kind, hash) {
  if (!snapshot || snapshot.formatVersion !== 1 || snapshot.kind !== kind || snapshot.sourceHash !== hash || sourceHash(snapshot.source) !== hash || snapshot.basis !== 'validated-existing-translation') {
    throw new Error('Invalid or tampered source snapshot; restore a validated baseline');
  }
}

function validateTarget(kind, source, target, locale) {
  if (kind === 'person') validateTranslation(source, target, locale);
  else {
    validateUI(source, target.strings, locale);
    validateUISource(source, target.metadata, locale);
  }
}

// Keep dates, source URLs, IDs, ordering and every other shared fact in this view.
// Only strings explicitly managed by sourceStrings are excluded from shared review.
function sharedSource(source) {
  const result = clone(source);
  for (const key of Object.keys(sourceStrings(source))) {
    const parts = key.split('.');
    if (parts.length === 1) delete result[key];
    else if (parts[0] === 'influence' && parts.length === 2) delete result.influence[parts[1]];
    else if (['facts', 'highlights', 'timeline'].includes(parts[0])) {
      const item = result[parts[0]].find(item => item.id === parts[1]);
      if (item) delete item[parts[2]];
    }
  }
  return result;
}

function preview(value) {
  if (value === undefined) return null;
  const rendered = JSON.stringify(value);
  return rendered.length <= 800 ? value : { preview: rendered.slice(0, 800), truncated: true };
}
function changedFacts(before, after, prefix = '$', output = []) {
  if (equal(before, after)) return output;
  if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) changedFacts(before[key], after[key], `${prefix}.${key}`, output);
  } else output.push({ path: prefix, before: preview(before), after: preview(after) });
  return output;
}

const brief = value => typeof value === 'string' && value.length > 400 ? value.slice(0, 400) + '…' : value;
function contextFor(source, key) {
  const context = { name: brief(source.name), role: brief(source.role) };
  const [group, id] = key.split('.');
  const index = source[group]?.findIndex?.(item => item.id === id);
  if (['facts', 'highlights', 'timeline'].includes(group) && index >= 0) {
    const item = source[group][index];
    context.item = Object.fromEntries(['id', 'date', 'dateLabel', 'title', 'label'].filter(key => item[key] !== undefined).map(key => [key, brief(item[key])]));
    if (group === 'timeline') context.neighbors = source[group].slice(Math.max(0, index - 1), index + 2).filter(other => other.id !== id).map(other => ({ id: other.id, date: other.date, title: brief(other.title) }));
    context.sourceUrls = (item.sourceIds ?? []).map(sourceId => source.sources?.find(reference => reference.id === sourceId)?.url).filter(Boolean).slice(0, 4).map(url => url.length > 1500 ? url.slice(0, 1500) + '…' : url);
  }
  return context;
}

export function buildDeltaEntry({ kind, source, target, snapshot, locale, bindings }) {
  const previousHash = kind === 'person' ? target.sourceHash : target.metadata?.sourceHash;
  validateSnapshot(snapshot, kind, previousHash);
  validateTarget(kind, snapshot.source, target, locale);
  if (kind === 'person' && snapshot.source.id !== source.id) throw new Error('Snapshot person identity mismatch');
  const oldStrings = kind === 'person' ? sourceStrings(snapshot.source) : snapshot.source;
  const newStrings = kind === 'person' ? sourceStrings(source) : source;
  const units = [];
  for (const key of new Set([...Object.keys(newStrings), ...Object.keys(oldStrings)])) {
    if (oldStrings[key] === newStrings[key] && own(oldStrings, key) === own(newStrings, key)) continue;
    const operation = !own(newStrings, key) ? 'delete' : !own(oldStrings, key) ? 'add' : 'change';
    units.push({ key, operation, previousSource: oldStrings[key] ?? null, source: newStrings[key] ?? null,
      previousTarget: target.strings[key] ?? null, target: operation === 'delete' ? null : target.strings[key] ?? '', reviewed: false,
      context: kind === 'person' ? contextFor(source, key) : { uiKey: key } });
  }
  const facts = kind === 'person' ? changedFacts(sharedSource(snapshot.source), sharedSource(source)) : [];
  if (!units.length && previousHash === sourceHash(source)) return null;
  return { kind, id: kind === 'person' ? source.id : 'ui', previousSourceHash: previousHash, sourceHash: sourceHash(source),
    expectedTargetHash: digest(target), bindings, units,
    sharedFacts: { required: facts.length > 0 || !units.length, changes: facts, reviewed: false,
      instruction: 'When required, check changed shared facts against the canonical file and all affected existing localized prose before acknowledging. Add translated source changes before exporting if prose must change.' } };
}

function immutablePacket(packet) {
  const result = clone(packet);
  delete result.reviewer;
  delete result.manifestHash;
  for (const entry of result.entries ?? []) {
    for (const unit of entry.units ?? []) { delete unit.target; delete unit.reviewed; }
    if (entry.sharedFacts) delete entry.sharedFacts.reviewed;
  }
  return result;
}

export function createPacket(locale, scope, entries) {
  const packet = { format: FORMAT, formatVersion: 1, locale, scope, reviewer: null, entries: entries.filter(Boolean) };
  packet.manifestHash = digest(immutablePacket(packet));
  return packet;
}

export function reviewPacket(packet, expected, states) {
  if (!equal(immutablePacket(packet), immutablePacket(expected)) || packet.manifestHash !== expected.manifestHash) {
    throw new Error('Stale or tampered delta packet: source, baseline, target, or scope changed; export again');
  }
  if (!packet.entries.length) return [];
  if (!packet.reviewer || !['ai', 'human'].includes(packet.reviewer.kind) || typeof packet.reviewer.name !== 'string' || !packet.reviewer.name.trim() || packet.reviewer.name.length > 200) {
    throw new Error('Set reviewer to {kind:"ai"|"human",name:"reviewer identity"}; this is a self-declared review, not authentication');
  }
  const results = [];
  for (const entry of packet.entries) {
    const state = states.find(state => state.kind === entry.kind && (state.kind === 'ui' ? 'ui' : state.source.id) === entry.id);
    if (!state) throw new Error('Unknown delta entry');
    if (entry.sharedFacts.required && entry.sharedFacts.reviewed !== true) throw new Error(`${entry.id}: shared facts require explicit review of affected localized prose`);
    const next = clone(state.target);
    for (const unit of entry.units) {
      if (unit.reviewed !== true) throw new Error(`${entry.id}/${unit.key}: every delta field, including deletions, must be reviewed`);
      if (unit.operation === 'delete') {
        if (unit.target !== null) throw new Error(`${unit.key}: deleted field target must be null`);
        delete next.strings[unit.key];
      } else {
        if (typeof unit.target !== 'string' || !unit.target.trim()) throw new Error(`${unit.key}: translated target must be nonempty`);
        next.strings[unit.key] = unit.target;
      }
    }
    const review = { basis: 'explicit-delta-review', reviewer: clone(packet.reviewer), sourceHash: entry.sourceHash,
      fields: entry.units.map(unit => unit.key), sharedFactsReviewed: entry.sharedFacts.required ? true : false };
    if (entry.kind === 'person') { next.sourceHash = entry.sourceHash; next.deltaReview = review; }
    else { next.metadata = { ...next.metadata, sourceHash: entry.sourceHash, deltaReview: review }; }
    validateTarget(entry.kind, state.source, next, packet.locale);
    results.push({ ...state, next });
  }
  return results;
}

export async function readJSON(file) { return JSON.parse(await readFile(file, 'utf8')); }
export async function fileHash(file) { return sourceHash(await readFile(file, 'utf8')); }
export const serialize = json;

// Stage every file first; verify original bytes immediately before committing.
// A failed rename restores every already-committed file. This is rollback on
// handled I/O failure, not a claim of multi-file atomicity across power loss.
export async function writeTransaction(root, writes, { renameFile = rename, guards = {} } = {}) {
  if (!writes.length) return;
  const unique = new Set(writes.map(write => write.path));
  if (unique.size !== writes.length) throw new Error('Duplicate transaction destination');
  const lockPath = path.join(root, 'data/i18n/.delta.lock');
  await mkdir(path.dirname(lockPath), { recursive: true });
  let lock;
  try { lock = await open(lockPath, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Another delta transaction is active; inspect data/i18n/.delta.lock before removing a stale lock'); throw error; }
  const staged = []; const committed = [];
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, operation: 'i18n-delta' }));
    for (const write of writes) {
      const destination = path.resolve(root, write.path);
      if (!destination.startsWith(path.resolve(root, 'data/i18n') + path.sep)) throw new Error('Transaction destination must be inside data/i18n');
      let original = null;
      try { original = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (write.expectedHash !== undefined && (original === null ? null : sourceHash(original.toString('utf8'))) !== write.expectedHash) throw new Error(`Concurrent edit detected: ${write.path}`);
      await mkdir(path.dirname(destination), { recursive: true });
      const temp = `${destination}.delta-${randomUUID()}.tmp`;
      await writeFile(temp, write.content, { flag: 'wx' });
      staged.push({ ...write, destination, original, temp });
    }
    for (const file of staged) {
      let current = null;
      try { current = await readFile(file.destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!(current === null && file.original === null) && !(current !== null && file.original !== null && current.equals(file.original))) throw new Error(`Concurrent edit detected: ${file.path}`);
    }
    for (const [relative, expected] of Object.entries(guards)) {
      if (await fileHash(path.join(root, relative)) !== expected) throw new Error(`Concurrent edit detected: ${relative}`);
    }
    for (const file of staged) { await renameFile(file.temp, file.destination); committed.push(file); }
  } catch (error) {
    const rollbackErrors = [];
    for (const file of committed.reverse()) {
      try {
        if (file.original === null) await unlink(file.destination);
        else { const recovery = `${file.destination}.delta-${randomUUID()}.restore`; await writeFile(recovery, file.original); await rename(recovery, file.destination); }
      } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    }
    if (rollbackErrors.length) throw new Error(`${error.message}; rollback needs manual recovery: ${rollbackErrors.join('; ')}`, { cause: error });
    throw error;
  } finally {
    for (const file of staged) await unlink(file.temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock.close(); await unlink(lockPath);
  }
}
