import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceHash, validateTranslation, validateUI, validateUISource } from './i18n-core.mjs';
import { createSnapshot, validateSnapshot, snapshotPath, buildDeltaEntry, createPacket, reviewPacket, readJSON, fileHash, serialize, writeTransaction } from './i18n-delta-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const command = args.shift();
const options = {};
const usage = `Usage:
  node scripts/i18n-delta.mjs snapshot [--locale en] [--person person-id] [--ui]
  node scripts/i18n-delta.mjs export --locale en (--person person-id [--ui] | --ui) [--out packet.json]
  node scripts/i18n-delta.mjs import --locale en (--person person-id [--ui] | --ui) --file packet.json

Snapshot with no scope validates all enabled translation locales, people and UI.
Export/import always require an explicit locale and person/UI scope.
Review every unit (including deletions): reviewed=true; set translated target.
Set packet.reviewer={"kind":"ai"|"human","name":"reviewer identity"}.
For shared-fact changes, entry.sharedFacts.reviewed=true explicitly acknowledges
checking canonical changes and affected existing localized prose.
Missing historical snapshots fail safely; use the existing full i18n workflow to
review a complete translation, then snapshot. No AI/model API is called.`;

async function main() {
  if (!command || command === '--help' || command === 'help') { console.log(usage); return; }
  if (!['snapshot', 'export', 'import'].includes(command)) throw new Error(usage);
  while (args.length) {
    const flag = args.shift();
    if (!['--locale', '--person', '--ui', '--out', '--file'].includes(flag) || Object.hasOwn(options, flag.slice(2))) throw new Error(`Unknown or repeated option: ${flag}`);
    options[flag.slice(2)] = flag === '--ui' ? true : args.shift();
    if (options[flag.slice(2)] === undefined || typeof options[flag.slice(2)] === 'string' && options[flag.slice(2)].startsWith('--')) throw new Error(`Missing value for ${flag}`);
  }
  if (options.locale && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(options.locale)) throw new Error('Invalid locale id');
  if (options.person && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.person)) throw new Error('Invalid person id');
  if (options.out && command !== 'export' || options.file && command !== 'import') throw new Error('--out belongs to export; --file belongs to import');
  const config = await readJSON(path.join(root, 'data/i18n/locales.json'));
  const sourceLocale = config.source ?? config.default;
  const available = config.locales.filter(locale => locale.id !== sourceLocale);
  if (options.locale && !available.some(locale => locale.id === options.locale)) throw new Error('Choose a registered translation locale, not the source locale');
  const read = relative => readJSON(path.join(root, relative));
  const hash = relative => fileHash(path.join(root, relative));
  const readBound = async relative => {
    const bytes = await readFile(path.join(root, relative), 'utf8');
    return { value: JSON.parse(bytes), hash: sourceHash(bytes) };
  };
  const scoped = Boolean(options.person || options.ui);
  const personIds = options.person ? [options.person] : scoped ? [] : (await readdir(path.join(root, 'data/people'))).filter(file => file.endsWith('.json')).map(file => file.slice(0, -5)).sort();
  const includeUI = options.ui || !scoped;
  const scope = { person: options.person ?? null, ui: Boolean(options.ui) };
  const sourceUIPath = `data/i18n/${sourceLocale}/ui.json`;
  async function statesFor(locale) {
    const states = [];
    for (const id of personIds) {
      const sourcePath = `data/people/${id}.json`;
      const targetPath = `data/i18n/${locale}/people/${id}.json`;
      const sourceFile = await readBound(sourcePath);
      const targetFile = await readBound(targetPath);
      const source = sourceFile.value;
      if (source.id !== id) throw new Error('Canonical file and person id disagree');
      states.push({ kind: 'person', source, target: targetFile.value, sourcePath, targetPath,
        bindings: { [sourcePath]: sourceFile.hash, [targetPath]: targetFile.hash } });
    }
    if (includeUI) {
      const targetPath = `data/i18n/${locale}/ui.json`;
      const metadataPath = `data/i18n/${locale}/ui-source.json`;
      const sourceFile = await readBound(sourceUIPath);
      const targetFile = await readBound(targetPath);
      const metadataFile = await readBound(metadataPath);
      states.push({ kind: 'ui', source: sourceFile.value, target: { strings: targetFile.value, metadata: metadataFile.value }, sourcePath: sourceUIPath, targetPath, metadataPath,
        bindings: { [sourceUIPath]: sourceFile.hash, [targetPath]: targetFile.hash, [metadataPath]: metadataFile.hash } });
    }
    return states;
  }
  const snapshotWrites = new Map();
  async function stageSnapshot(kind, source) {
    const snapshot = createSnapshot(kind, source);
    const relative = snapshotPath(snapshot.sourceHash);
    if (snapshotWrites.has(relative)) return;
    try {
      const existing = await read(relative);
      validateSnapshot(existing, kind, snapshot.sourceHash);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      snapshotWrites.set(relative, { path: relative, content: serialize(snapshot), expectedHash: null });
    }
  }
  async function checkBindings(states) {
    for (const state of states) for (const [relative, expected] of Object.entries(state.bindings)) {
      if (await hash(relative) !== expected) throw new Error(`Concurrent edit detected: ${relative}`);
    }
  }
  if (command === 'snapshot') {
    const locales = options.locale ? [options.locale] : available.filter(locale => locale.enabled).map(locale => locale.id);
    if (!locales.length) throw new Error('No translation locale selected');
    const allStates = [];
    for (const locale of locales) for (const state of await statesFor(locale)) {
      if (state.kind === 'person') validateTranslation(state.source, state.target, locale);
      else { validateUI(state.source, state.target.strings, locale); validateUISource(state.source, state.target.metadata, locale); }
      await stageSnapshot(state.kind, state.source);
      allStates.push(state);
    }
    await checkBindings(allStates);
    await writeTransaction(root, [...snapshotWrites.values()], { guards: Object.assign({}, ...allStates.map(state => state.bindings)) });
    console.log(`Validated ${allStates.length} translation baselines; wrote ${snapshotWrites.size} shared source snapshots. Basis: validated-existing-translation (no human review asserted).`);
    return;
  }
  if (!options.locale || !scoped) throw new Error('Export/import requires --locale and --person and/or --ui');
  const states = await statesFor(options.locale);
  const entries = [];
  for (const state of states) {
    const previousHash = state.kind === 'person' ? state.target.sourceHash : state.target.metadata.sourceHash;
    if (!/^[a-f0-9]{64}$/.test(previousHash ?? '')) throw new Error('Invalid baseline sourceHash');
    let snapshot;
    try { snapshot = await read(snapshotPath(previousHash)); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Missing validated snapshot ${previousHash}; do not guess the previous source. Restore it, or explicitly use the full i18n export/import workflow and snapshot the validated result.`);
      throw error;
    }
    entries.push(buildDeltaEntry({ ...state, snapshot, locale: options.locale }));
  }
  const expected = createPacket(options.locale, scope, entries);
  await checkBindings(states);
  if (command === 'export') {
    const content = serialize(expected);
    if (options.out) {
      const output = path.resolve(options.out);
      if (output.startsWith(path.join(root, 'data') + path.sep)) throw new Error('Export packets outside data/ to avoid overwriting website source');
      await writeFile(output, content);
      const units = expected.entries.reduce((sum, entry) => sum + entry.units.length, 0);
      console.log(`Exported ${units} field review units, ${expected.entries.filter(entry => entry.sharedFacts.required).length} shared-fact reviews; ${content.length} characters / ${Buffer.byteLength(content)} UTF-8 bytes to ${output}. These are payload sizes, not billable token estimates.`);
    } else process.stdout.write(content);
    return;
  }
  if (!options.file) throw new Error('Import requires --file');
  const packet = JSON.parse(await readFile(path.resolve(options.file), 'utf8'));
  const results = reviewPacket(packet, expected, states);
  const writes = [];
  for (const state of results) {
    writes.push({ path: state.targetPath, content: serialize(state.kind === 'person' ? state.next : state.next.strings), expectedHash: state.bindings[state.targetPath] });
    if (state.kind === 'ui') writes.push({ path: state.metadataPath, content: serialize(state.next.metadata), expectedHash: state.bindings[state.metadataPath] });
    await stageSnapshot(state.kind, state.source);
  }
  await checkBindings(states);
  await writeTransaction(root, [...writes, ...snapshotWrites.values()], { guards: Object.assign({}, ...states.map(state => state.bindings)) });
  console.log(`Imported ${results.length} reviewed delta entries; untouched strings preserved. Canonical data and locale publication settings were not changed.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
