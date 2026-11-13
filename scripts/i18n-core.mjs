import { createHash } from 'node:crypto';

export function sourceStrings(person) {
  const strings=Object.fromEntries(['name','role','country','summary','coverageNote'].map(key=>[key,person[key]]));
  for(const tag of person.tags) strings[`tags.${tag}`]=tag;
  for(const group of ['facts','highlights','timeline']) {
    const ids=new Set();
    for(const item of person[group]) {
      if(!item.id)throw new Error(`${person.id}: missing stable ${group} item id`);
      if(ids.has(item.id))throw new Error(`${person.id}: duplicate stable ${group} id ${item.id}`);
      ids.add(item.id);
      for(const key of group==='facts'?['label','value']:['title','text']) strings[`${group}.${item.id}.${key}`]=item[key];
      if(group==='timeline'&&item.dateLabel)strings[`${group}.${item.id}.dateLabel`]=item.dateLabel;
    }
  }
  return strings;
}
export function sourceHash(person) {
  return createHash('sha256').update(JSON.stringify(person)).digest('hex');
}
export function validateTranslation(person,translation,locale) {
  if(translation.sourceHash!==sourceHash(person))throw new Error(`${locale}/${person.id}: stale sourceHash; review translation against source`);
  const expected=Object.keys(sourceStrings(person));
  for(const key of expected)if(typeof translation.strings?.[key]!=='string'||!translation.strings[key].trim())throw new Error(`${locale}/${person.id}: missing translated string ${key}`);
  for(const key of Object.keys(translation.strings))if(!expected.includes(key))throw new Error(`${locale}/${person.id}: obsolete translation key ${key}`);
}
export function localizePerson(person,translation) {
  if(!translation)return {...person,timeline:[...person.timeline],tagIds:[...person.tags]};
  const strings=translation.strings;
  const result={...person,aliases:[...new Set([person.name,...person.aliases])],tagIds:[...person.tags]};
  for(const key of ['name','role','country','summary','coverageNote'])result[key]=strings[key];
  result.tags=person.tags.map(tag=>strings[`tags.${tag}`]);
  for(const group of ['facts','highlights','timeline'])result[group]=person[group].map(item=>{
    const next={...item};
    for(const key of group==='facts'?['label','value']:['title','text'])next[key]=strings[`${group}.${item.id}.${key}`];
    if(item.dateLabel)next.dateLabel=strings[`${group}.${item.id}.dateLabel`];
    return next;
  });
  return result;
}
export function placeholders(value) {
  return [...String(value).matchAll(/\{([a-zA-Z]+)\}/g)].map(m=>m[1]).sort();
}
export function validateUI(base,ui,locale) {
  for(const [key,value] of Object.entries(base)) {
    if(typeof ui[key]!=='string'||!ui[key].trim())throw new Error(`${locale}: missing UI string ${key}`);
    if(JSON.stringify(placeholders(value))!==JSON.stringify(placeholders(ui[key])))throw new Error(`${locale}: inconsistent placeholders in ${key}`);
  }
  for(const key of Object.keys(ui))if(!Object.hasOwn(base,key))throw new Error(`${locale}: obsolete UI key ${key}`);
}
export function validateUISource(base,metadata,locale) {
  if(metadata?.sourceHash!==sourceHash(base))throw new Error(`${locale}: stale UI sourceHash; review UI translations against the default language`);
}
export function formatMessage(value,params={}) {
  return value.replace(/\{([a-zA-Z]+)\}/g,(full,key)=>key in params?String(params[key]):full);
}
