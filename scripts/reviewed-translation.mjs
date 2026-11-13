import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceHash,sourceStrings,validateTranslation,validateIntermediary} from './i18n-core.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const LOCALES=new Set(['fr','ar','de','ja','es','ko']);

/** Save a complete, explicitly reviewed target, retaining both input versions.
 * The caller's AI review declaration is recorded, not independently certified.
 * This function performs no translation, model invocation, or network request.
 */
export async function save(id,locale,values,{root=ROOT,reviewer={kind:'ai',name:'OpenAI Codex'},reviewedAt=new Date().toISOString().slice(0,10)}={}){
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)||!LOCALES.has(locale))throw Error('Invalid person or target locale');
  if(!['ai','human'].includes(reviewer.kind)||typeof reviewer.name!=='string'||!reviewer.name.trim())throw Error('An explicit reviewer identity is required');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewedAt))throw Error('Invalid review date');
  const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
  const person=await json(`data/people/${id}.json`),english=await json(`data/i18n/en/people/${id}.json`);
  validateTranslation(person,english,'en');
  const keys=Object.keys(sourceStrings(person));
  if(Array.isArray(values)&&values.length!==keys.length)throw Error(`${id}/${locale}: ${values.length} values for ${keys.length} fields`);
  const strings=Array.isArray(values)?Object.fromEntries(keys.map((key,index)=>[key,values[index]])):values;
  const file=path.join(root,`data/i18n/${locale}/people/${id}.json`);
  let previous=null;try{previous=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const initialMachineDraftProvider=previous?.translationProvenance?.initialMachineDraftProvider??(previous?.translationProvenance?.kind==='machine-assisted'?previous.translationProvenance.provider:undefined);
  const translation={sourceHash:sourceHash(person),strings,translationProvenance:{kind:`${reviewer.kind}-reviewed`,provider:reviewer.name,sourceLocale:'en',sourceTextSha256:sourceHash(english.strings),reviewer,reviewedAt,reviewedKeys:keys,reviewScope:'Complete field-by-field translation and semantic review against the Chinese/English dossier; no human or native-speaker certification inferred.',nativeLanguageReview:'not-certified-by-this-program',...(initialMachineDraftProvider?{initialMachineDraftProvider}:{})}};
  validateTranslation(person,translation,locale);validateIntermediary(translation,english,locale,id);
  await mkdir(path.dirname(file),{recursive:true});
  const temporary=`${file}.tmp-${process.pid}`;
  await writeFile(temporary,JSON.stringify(translation,null,2)+'\n');await rename(temporary,file);
  return {id,locale,fields:keys.length,sourceHash:translation.sourceHash};
}
