import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { timelineOrder, yearOf, safeUrl, lifeStatus } from './utils.mjs';
import { sourceStrings, validateTranslation, validateUI, validateUISource } from './i18n-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async name => JSON.parse(await readFile(path.join(root,name),'utf8'));
const taxonomy = await readJson('data/taxonomy.json');
const localeConfig = await readJson('data/i18n/locales.json');
const enabledLocales=localeConfig.locales.filter(l=>l.enabled);
const sourceLocale=localeConfig.source??localeConfig.default;
const candidates = await readJson('data/candidates.json');
const files = (await readdir(path.join(root,'data/people'))).filter(file=>file.endsWith('.json'));
const ids = new Set();
const people = [];
const portraitStatuses = new Map();
const datePattern = /^-?\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
let events = 0;
let references = 0;
for(const file of files) {
  const p = await readJson(`data/people/${file}`);
  assert.match(p.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(file,`${p.id}.json`);
  assert(!ids.has(p.id),`Duplicate person ${p.id}`);
  ids.add(p.id);
  people.push(p);
  sourceStrings(p); // Translation keys require stable, unique IDs.
  for(const key of ['name','enName','country','role','summary','coverageNote','verifiedAt']) assert.equal(typeof p[key],'string',`${p.id}: missing ${key}`);
  assert.match(p.verifiedAt,/^\d{4}-\d{2}-\d{2}$/);
  assert.match(p.birth,datePattern);
  if(lifeStatus(p)==='deceased') { assert.match(p.death,datePattern); assert(yearOf(p.death)>=yearOf(p.birth)); }
  for(const group of ['domains','eras','regions']) {
    assert(Array.isArray(p[group])&&p[group].length>0,`${p.id}: empty ${group}`);
    assert.equal(new Set(p[group]).size,p[group].length,`${p.id}: duplicate ${group}`);
    for(const id of p[group]) assert(taxonomy[group].some(x=>x.id===id),`${p.id}: unknown ${group}/${id}`);
  }
  for(const key of ['tags','aliases','facts','sources','timeline','highlights']) assert(Array.isArray(p[key]),`${p.id}: ${key} is not an array`);
  assert(p.tags.length>0&&p.highlights.length>=2&&p.timeline.length>=6&&p.sources.length>=2,`${p.id}: incomplete profile`);
  const sourceIds = new Set(p.sources.map(s=>s.id));
  assert.equal(sourceIds.size,p.sources.length,`${p.id}: duplicate source IDs`);
  for(const s of p.sources) assert(safeUrl(s.url)&&s.title&&s.publisher,`${p.id}: invalid source ${s.id}`);
  for(const item of [...p.timeline,...p.highlights]) {
    assert(item.title&&item.text,`${p.id}: empty milestone`);
    assert(Array.isArray(item.sourceIds)&&item.sourceIds.length>0,`${p.id}: missing citation`);
    item.sourceIds.forEach(id=>assert(sourceIds.has(id),`${p.id}: unknown citation ${id}`));
  }
  p.timeline.forEach((t,i)=> {
    assert.match(t.date,datePattern);
    assert(yearOf(t.date)>=yearOf(p.birth),`${p.id}: event before birth`);
    assert(!i||timelineOrder(p.timeline[i-1],t)<=0,`${p.id}: chronology not descending`);
  });
  const image = await readJson(`data/images/${p.id}.json`);
  assert.match(image.src,/^assets\/portraits\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/);
  assert(['photo','painting','engraving'].includes(image.kind));
  assert(image.credit&&image.alt&&image.license&&safeUrl(image.sourceUrl)&&safeUrl(image.licenseUrl),`${p.id}: incomplete image provenance`);
  const imageStat=await stat(path.join(root,'public',image.src));
  assert(imageStat.size>1000,`${p.id}: suspicious image size`);
  portraitStatuses.set(image.src,lifeStatus(p));
  assert(candidates.some(c=>c.id===p.id),`${p.id}: absent from roster`);
  events+=p.timeline.length;
  references+=p.sources.length;
}
assert.equal(new Set(candidates.map(c=>c.id)).size,candidates.length,'Duplicate candidate');
const baseUI=await readJson(`data/i18n/${sourceLocale}/ui.json`);
for(const locale of enabledLocales) {
  validateUI(baseUI,await readJson(`data/i18n/${locale.id}/ui.json`),locale.id);
  if(locale.id!==sourceLocale) {
    validateUISource(baseUI,await readJson(`data/i18n/${locale.id}/ui-source.json`),locale.id);
    for(const person of people)validateTranslation(person,await readJson(`data/i18n/${locale.id}/people/${person.id}.json`),locale.id);
  }
}
for(const c of candidates) {
  assert(c.id&&c.name&&c.enName&&taxonomy.domains.some(d=>d.id===c.domain),'Invalid candidate');
  assert(taxonomy.batches.some(b=>b.id===c.batch),'Invalid batch');
  assert(c.batch!==1||ids.has(c.id),`First-batch candidate has no profile: ${c.id}`);
}
const out=path.join(root,'dist');
async function walk(dir) {
  return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]))).flat();
}
const outputFiles=await walk(out);
const htmlFiles=outputFiles.filter(f=>f.endsWith('.html'));
const readHtml=new Map(await Promise.all(htmlFiles.map(async f=>[f,await readFile(f,'utf8')])));
const unescape = s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
let links=0;
for(const [file,html] of readHtml) {
  const firstSegment=path.relative(out,file).split(path.sep)[0];
  const locale=enabledLocales.find(l=>l.id===firstSegment)??enabledLocales.find(l=>l.id===localeConfig.default);
  assert(html.includes(`lang="${locale.lang}"`)&&html.includes(`dir="${locale.dir}"`)&&html.includes('name="viewport"'),`${file}: missing language, direction or viewport`);
  assert.equal((html.match(/<h1(?:\s|>)/g)??[]).length,1,`${file}: expected exactly one h1`);
  assert(!/\b(?:undefined|NaN)\b/.test(html),`${file}: invalid data rendered`);
  const pageIds=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(pageIds).size,pageIds.length,`${file}: duplicate HTML id`);
  for(const match of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw=unescape(match[1]);
    if(/^(?:https?:|data:|mailto:)/.test(raw))continue;
    assert(!/^(?:javascript:|\/\/)/.test(raw),`${file}: unsafe href`);
    const url=new URL(raw,`https://local.test/${path.relative(out,file)}`);
    let pathname=decodeURIComponent(url.pathname);
    if(process.env.SITE_URL&&path.basename(file)==='404.html') {
      const basePath=new URL(process.env.SITE_URL.endsWith('/')?process.env.SITE_URL:`${process.env.SITE_URL}/`).pathname;
      if(pathname.startsWith(basePath))pathname=`/${pathname.slice(basePath.length)}`;
    }
    const target=path.join(out,pathname);
    assert((await stat(target)).isFile(),`${file}: missing target ${raw}`);
    if(url.hash&&target.endsWith('.html')) {
      const content=readHtml.get(target)??await readFile(target,'utf8');
      assert(content.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${file}: missing fragment ${raw}`);
    }
    links++;
  }
  // All pictures must have meaningful alt text; no runtime image CDN dependency.
  for(const match of html.matchAll(/<img\b[^>]*>/g)) {
    assert(/alt="[^"]+"/.test(match[0]),`${file}: image without alt`);
    assert(!/src="https?:/.test(match[0]),`${file}: external image dependency`);
    const src=/\ssrc="([^"]+)"/.exec(match[0])?.[1];
    const asset=src&&new URL(src,`https://local.test/${path.relative(out,file)}`).pathname.slice(1);
    if(portraitStatuses.has(asset)) {
      assert(match[0].includes(`data-life-status="${portraitStatuses.get(asset)}"`),`${file}: portrait status does not match death data`);
      assert(/class="[^"]*\bperson-portrait\b/.test(match[0]),`${file}: missing shared portrait style`);
    }
  }
}
assert.equal(htmlFiles.length,(ids.size+5)*enabledLocales.length,'Missing generated localized pages');
console.log(`PASS: ${ids.size} profiles, ${events} dated events, ${references} source records, ${candidates.length} candidates.`);
console.log(`PASS: ${htmlFiles.length} complete HTML pages, ${links} local links/assets/anchors, ${ids.size} shared portrait licenses, ${enabledLocales.length} languages.`);
