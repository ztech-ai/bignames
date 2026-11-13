import { readFile, readdir, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sourceHash, sourceStrings, validateTranslation } from './i18n-core.mjs';

// One-time format migration. Copies existing translations verbatim; never
// approves factual edits or fills missing translations by guessing.
export function migrateInfluence(person, translations, sourceLocale='zh') {
  if(!person.influence?.rationales) return null;
  const next=structuredClone(person);
  if(person.influence.rationales[sourceLocale]!==undefined)assert.equal(person.influence.rationales[sourceLocale],person.influence.rationale,`${person.id}: conflicting source reason`);
  delete next.influence.rationales;
  delete next.influence.rationaleEn;
  const expected=Object.keys(sourceStrings(person)).filter(key=>key!=='influence.rationale').sort();
  const migrated={};
  for(const [locale,translation] of Object.entries(translations)) {
    assert.equal(translation.sourceHash,sourceHash(person),`${locale}/${person.id}: stale translation; migration cannot approve edits`);
    assert.deepEqual(Object.keys(translation.strings).sort(),expected,`${locale}/${person.id}: unexpected legacy translation keys`);
    const rationale=person.influence.rationales[locale];
    assert(typeof rationale==='string'&&rationale.trim(),`${locale}/${person.id}: missing legacy reason`);
    if(locale==='en'&&person.influence.rationaleEn)assert.equal(rationale,person.influence.rationaleEn,`${person.id}: conflicting English reasons`);
    migrated[locale]={...translation,sourceHash:sourceHash(next),strings:{...translation.strings,'influence.rationale':rationale}};
    validateTranslation(next,migrated[locale],locale);
  }
  return {person:next,translations:migrated};
}

async function main() {
  const args=process.argv.slice(2);
  assert(args.every(arg=>arg==='--apply'),'Usage: node scripts/migrate-influence-i18n.mjs [--apply] (default: dry run)');
  const root=fileURLToPath(new URL('../',import.meta.url));
  const read=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
  const config=await read('data/i18n/locales.json');
  const sourceLocale=config.source??config.default;
  const locales=config.locales.filter(l=>l.id!==sourceLocale).map(l=>l.id);
  const changes=[];
  let profiles=0;
  for(const file of (await readdir(path.join(root,'data/people'))).filter(f=>f.endsWith('.json')).sort()) {
    const person=await read(`data/people/${file}`);
    if(!person.influence?.rationales)continue;
    const translations={};
    for(const locale of locales) {
      try {translations[locale]=await read(`data/i18n/${locale}/people/${file}`);}
      catch(error) {if(error.code==='ENOENT'&&!config.locales.find(l=>l.id===locale).enabled)continue;throw error;}
    }
    const result=migrateInfluence(person,translations,sourceLocale);
    changes.push({name:`data/people/${file}`,value:result.person});
    for(const [locale,value] of Object.entries(result.translations))changes.push({name:`data/i18n/${locale}/people/${file}`,value});
    profiles++;
  }
  if(args.includes('--apply')) {
    // Validate every record first, then stage; roll back on an ordinary I/O failure.
    const written=[];
    try {
      for(const item of changes) {
        item.file=path.join(root,item.name);item.temp=`${item.file}.migration-${process.pid}`;
        item.original=await readFile(item.file);
        await writeFile(item.temp,JSON.stringify(item.value,null,2)+'\n',{flag:'wx'});
      }
      for(const item of changes){await rename(item.temp,item.file);written.push(item);}
    } catch(error) {
      for(const item of written.reverse())await writeFile(item.file,item.original);
      throw error;
    } finally {for(const item of changes)if(item.temp)await unlink(item.temp).catch(()=>{});}
  }
  console.log(JSON.stringify({mode:args.includes('--apply')?'applied':'dry-run',profiles,files:changes.length,translationTextChanged:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
