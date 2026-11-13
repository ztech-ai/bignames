import assert from 'node:assert/strict';
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateTranslation,validateIntermediary,sourceStrings} from './i18n-core.mjs';
import {validateImageMetadata,hasPortrait} from './image-core.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async name=>JSON.parse(await readFile(path.join(root,name),'utf8'));
const args=process.argv.slice(2),options={};
while(args.length){const key=args.shift();if(!['--batch','--report'].includes(key)||options[key]||!args.length)throw Error('Usage: node scripts/check-batch.mjs --batch data/collections/NAME.json [--report data/research/NAME.json]');options[key]=args.shift();}
assert.match(options['--batch']??'',/^data\/collections\/[a-z0-9-]+\.json$/);
if(options['--report'])assert.match(options['--report'],/^data\/research\/[a-z0-9-]+\.json$/);
const batch=await json(options['--batch']),collection=await json('data/collections/contemporary-1000.json');
const previous=new Set(batch.previousProfiles.map(p=>p.id)),ids=new Set(batch.people.map(p=>p.id));
assert.equal(previous.size,batch.previousProfiles.length);assert.equal(ids.size,batch.confirmedCount);
for(const p of batch.previousProfiles)assert.equal(sha(await readFile(path.join(root,`data/people/${p.id}.json`))),p.sha256,`${p.id}: prior canonical file changed`);
const eligible=collection.people.filter(p=>!previous.has(p.id));
const highestEligibleStars=Math.max(...eligible.map(p=>p.influence.stars));
const config=await json('data/i18n/locales.json'),source=config.source??config.default;
const locales=config.locales.filter(l=>l.enabled&&l.id!==source).map(l=>l.id);
const counts={newProfiles:ids.size,unchangedPreviousCanonicalFiles:previous.size,newTimelineEvents:0,newSourceRecords:0,newFacts:0,newHighlights:0,newForeignTranslations:0,translatedTextFields:0,reviewedForeignTranslations:0,newColorPortraits:0,approvedPortraitPlaceholders:0};
const domains={};
for(const c of batch.people){
  assert(!previous.has(c.id),`${c.id}: already complete before batch`);
  const original=collection.people.find(p=>p.id===c.id);assert(original,`${c.id}: absent from collection`);
  assert.equal(c.domain,original.domain);assert.equal(c.stars,original.influence.stars);
  const person=await json(`data/people/${c.id}.json`);assert.equal(person.id,c.id);
  assert.deepEqual(person.influence,original.influence,`${c.id}: rating drift`);
  assert.equal(person.death,null,`${c.id}: selected living-person batch contains a deceased/unknown person`);
  assert.equal(person.verifiedAt,batch.cutoffDate);
  assert(person.timeline.length>=8&&person.facts.length>=2&&person.highlights.length>=2&&person.sources.length>=3,`${c.id}: insufficient dossier coverage`);
  const audit=await json(`data/research/editorial/${c.id}.json`);assert.equal(audit.reviewer.kind,'ai');assert(audit.lifeStatusEvidence&&audit.portraitReview?.visualReview);
  const english=await json(`data/i18n/en/people/${c.id}.json`);
  for(const locale of locales){
    const translation=await json(`data/i18n/${locale}/people/${c.id}.json`);
    validateTranslation(person,translation,locale);
    if(translation.translationProvenance){validateIntermediary(translation,english,locale,c.id);counts.reviewedForeignTranslations++;}
    if(batch.translationReviewRequired?.includes(locale))assert.equal(translation.translationProvenance?.kind,'ai-reviewed',`${locale}/${c.id}: missing complete AI field review`);
    counts.newForeignTranslations++;counts.translatedTextFields+=Object.keys(sourceStrings(person)).length;
  }
  const image=await json(`data/images/${c.id}.json`);validateImageMetadata(image,c.id);
  if(hasPortrait(image)){
    assert.equal(image.kind,'photo');const file=path.join(root,'public',image.src);assert((await stat(file)).size>1000);
    assert.equal(sha(await readFile(file)),audit.portraitReview.sha256,`${c.id}: photo differs from reviewed bytes`);counts.newColorPortraits++;
  }else counts.approvedPortraitPlaceholders++;
  counts.newTimelineEvents+=person.timeline.length;counts.newSourceRecords+=person.sources.length;counts.newFacts+=person.facts.length;counts.newHighlights+=person.highlights.length;
  domains[c.domain]=(domains[c.domain]??0)+1;
}
assert.deepEqual(domains,batch.domains);
if(batch.allocation==='balanced-primary-domains'){
  assert.equal(Object.keys(domains).length,8);assert(Math.max(...Object.values(domains))-Math.min(...Object.values(domains))<=1);
  assert(batch.people.every(p=>p.stars===highestEligibleStars),'Batch skips a higher existing influence tier');
  assert.equal(counts.approvedPortraitPlaceholders,0);
}
const allFiles=(await readdir(path.join(root,'data/people'))).filter(f=>f.endsWith('.json'));
assert.equal(allFiles.length,previous.size+ids.size,'Unexpected people outside this batch');
const report={status:'passed',batch:batch.id,cutoffDate:batch.cutoffDate,counts,domains,highestEligibleStars,newProfileHtmlPages:ids.size*config.locales.filter(l=>l.enabled).length,totalProfiles:allFiles.length,totalHtmlPages:(allFiles.length+5)*config.locales.filter(l=>l.enabled).length,limits:['Structural/version checks and review-record consistency; not independent certification of source claims, portrait identity or native-language quality.','Portrait color and identity were inspected by AI editors; hashes only link these records to the delivered bytes.']};
if(options['--report'])await writeFile(path.join(root,options['--report']),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
