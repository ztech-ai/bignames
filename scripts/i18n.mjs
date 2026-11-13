import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sourceStrings, sourceHash, validateTranslation, validateUI, validateUISource } from './i18n-core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
const [command,localeId]=args;
const option=name=>{const index=args.indexOf(`--${name}`);return index<0?undefined:args[index+1];};
const read=async relative=>JSON.parse(await readFile(path.join(root,relative),'utf8'));
const readOptional=async relative=>{try{return await read(relative);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const write=async (relative,value)=>{const file=path.join(root,relative);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');};
if(!['prepare','export','import','check','enable'].includes(command)) {
  console.log('Usage: node scripts/i18n.mjs prepare|export|import|check|enable <locale> [--name NativeName] [--lang BCP47] [--dir ltr|rtl] [--out file] [--file file]');
  process.exit(command?1:0);
}
if(localeId&&!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(localeId))throw new Error('Locale must be a safe BCP47-style path id');
const config=await read('data/i18n/locales.json');
const sourceLocale=config.source??config.default;
const baseUI=await read(`data/i18n/${sourceLocale}/ui.json`);
const people=await Promise.all((await readdir(path.join(root,'data/people'))).filter(f=>f.endsWith('.json')).sort().map(file=>read(`data/people/${file}`)));
const locale=config.locales.find(l=>l.id===localeId);
const uiPath=id=>`data/i18n/${id}/ui.json`;
const uiMetadataPath=id=>`data/i18n/${id}/ui-source.json`;
const personPath=(id,p)=>`data/i18n/${id}/people/${p.id}.json`;
async function check(id) {
  const errors=[];
  try{validateUI(baseUI,await read(uiPath(id)),id);}catch(error){errors.push(error.message);}
  if(id!==sourceLocale)try{validateUISource(baseUI,await read(uiMetadataPath(id)),id);}catch(error){errors.push(error.message);}
  if(id!==sourceLocale)for(const person of people) {
    try{validateTranslation(person,await read(personPath(id,person)),id);}catch(error){errors.push(error.message);}
  }
  return errors;
}
if(command==='check') {
  const requested=localeId?[localeId]:config.locales.filter(l=>l.enabled).map(l=>l.id);
  let errors=[];
  for(const id of requested) {
    if(!config.locales.some(l=>l.id===id))throw new Error(`Unregistered locale: ${id}`);
    const found=await check(id);errors.push(...found);
    if(!found.length)console.log(`PASS ${id}: ${Object.keys(baseUI).length} UI strings + ${people.length} complete profiles`);
  }
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
} else {
  if(!localeId)throw new Error('A locale id is required');
  if(localeId===sourceLocale)throw new Error('Edit canonical source data/default UI directly; this command manages translations only');
  if(command==='prepare') {
    if(!locale) {
      const name=option('name');const lang=option('lang')??localeId;const dir=option('dir')??'ltr';
      if(!name||!['ltr','rtl'].includes(dir))throw new Error('New locales require --name; --dir must be ltr or rtl');
      new Intl.Locale(lang);
      config.locales.push({id:localeId,lang,name,dir,enabled:false});
      await write('data/i18n/locales.json',config);
    }
    const ui=await readOptional(uiPath(localeId));
    await write(uiPath(localeId),Object.fromEntries(Object.keys(baseUI).map(key=>[key,ui?.[key]??''])));
    if(!await readOptional(uiMetadataPath(localeId)))await write(uiMetadataPath(localeId),{sourceHash:sourceHash(baseUI)});
    for(const person of people) {
      const prior=await readOptional(personPath(localeId,person));
      await write(personPath(localeId,person),{
        sourceHash:prior?.sourceHash??sourceHash(person),
        strings:Object.fromEntries(Object.keys(sourceStrings(person)).map(key=>[key,prior?.strings?.[key]??'']))
      });
    }
    console.log(`Prepared ${localeId}. Existing translations and their old hashes are preserved; blanks/stale hashes must be reviewed before enabling.`);
  } else if(command==='export') {
    if(!locale)throw new Error('Run prepare to register the locale first');
    const ui=await readOptional(uiPath(localeId));
    const packet={formatVersion:1,locale:localeId,uiReviewed:false,uiSourceHash:sourceHash(baseUI),ui:Object.fromEntries(Object.entries(baseUI).map(([key,source])=>[key,{source,target:ui?.[key]??''}])),people:{}};
    for(const person of people) {
      const prior=await readOptional(personPath(localeId,person));
      packet.people[person.id]={sourceHash:sourceHash(person),reviewed:false,strings:Object.fromEntries(Object.entries(sourceStrings(person)).map(([key,source])=>[key,{source,target:prior?.strings?.[key]??''}]))};
    }
    const outputFile=option('out');
    if(outputFile){await writeFile(path.resolve(outputFile),JSON.stringify(packet,null,2)+'\n');console.log(`Exported ${localeId} to ${path.resolve(outputFile)}`);}
    else process.stdout.write(JSON.stringify(packet,null,2)+'\n');
  } else if(command==='import') {
    if(!locale)throw new Error('Run prepare to register the locale first');
    const inputFile=option('file');if(!inputFile)throw new Error('Import requires --file path');
    const packet=JSON.parse(await readFile(path.resolve(inputFile),'utf8'));
    if(packet.locale!==localeId||packet.formatVersion!==1)throw new Error('Packet format or target locale mismatch');
    if(packet.uiReviewed!==true)throw new Error('Mark uiReviewed true after reviewing the interface translation');
    validateUISource(baseUI,{sourceHash:packet.uiSourceHash},localeId);
    const ui=Object.fromEntries(Object.entries(packet.ui??{}).map(([key,value])=>[key,value.target]));
    validateUI(baseUI,ui,localeId);
    for(const [key,source] of Object.entries(baseUI))if(packet.ui[key].source!==source)throw new Error(`Stale UI export: ${key}; export again and review`);
    const ready=[];
    for(const person of people) {
      const entry=packet.people?.[person.id];
      if(entry?.reviewed!==true)throw new Error(`${person.id}: mark reviewed true after checking all target strings`);
      const translation={sourceHash:entry.sourceHash,strings:Object.fromEntries(Object.entries(entry.strings).map(([key,value])=>[key,value.target]))};
      validateTranslation(person,translation,localeId);
      for(const [key,source] of Object.entries(sourceStrings(person)))if(entry.strings[key].source!==source)throw new Error(`${person.id}: changed source text in packet at ${key}; export again and review`);
      ready.push([person,translation]);
    }
    // Validate the complete packet first; a failed import does not partially write content.
    await write(uiPath(localeId),ui);
    await write(uiMetadataPath(localeId),{sourceHash:packet.uiSourceHash});
    for(const [person,translation] of ready)await write(personPath(localeId,person),translation);
    console.log(`Imported ${localeId}: ${people.length} reviewed profiles. Publication status unchanged; run enable when ready.`);
  } else if(command==='enable') {
    if(!locale)throw new Error('Unregistered locale; run prepare first');
    const errors=await check(localeId);if(errors.length)throw new Error(errors.join('\n'));
    locale.enabled=true;await write('data/i18n/locales.json',config);
    console.log(`Enabled ${localeId}. Run npm run build to generate static pages.`);
  }
}
