import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceStrings,validateTranslation,validateIntermediary} from './i18n-core.mjs';
import {assertProfileCutoff} from './editorial-cutoff.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MANIFEST='data/collections/remaining-224-2026-11.json';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const states=new Set(['pending','text-reviewed-awaiting-portrait','published']);

// Read-only checks: a prepared dossier never contributes to the public count.
// Review declarations are consistency checks, not independent factual review.
export async function remainingProgress(root=ROOT) {
  const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
  const manifest=await read(MANIFEST);
  const collection=await read('data/collections/contemporary-1000.json');
  const config=await read('data/i18n/locales.json');
  const locales=config.locales.filter(l=>l.enabled&&l.id!==(config.source??config.default)).map(l=>l.id);
  const original=new Map(collection.people.map(p=>[p.id,p]));
  const previous=new Set(manifest.previousProfiles.map(p=>p.id));
  const targets=new Set(manifest.people.map(p=>p.id));
  assert.equal(previous.size,manifest.priorProfileCount,'Prior profile count drift');
  assert.equal(previous.size,manifest.previousProfiles.length,'Duplicate baseline person');
  assert.equal(targets.size,manifest.targetCount,'Remaining roster count drift');
  assert.equal(targets.size,manifest.people.length,'Duplicate remaining person');
  assert.deepEqual([...targets].sort(),collection.people.filter(p=>!previous.has(p.id)).map(p=>p.id).sort(),'Remaining roster does not match the frozen baseline');
  for(const p of manifest.previousProfiles) {
    assert.equal(sha(await readFile(path.join(root,`data/people/${p.id}.json`))),p.sha256,`${p.id}: existing canonical profile changed`);
  }
  const published=new Set((await readdir(path.join(root,'data/people'))).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)));
  for(const id of published)assert(previous.has(id)||targets.has(id),`${id}: unexpected profile outside this campaign`);
  const counts={target:targets.size,pending:0,textReviewedAwaitingPortrait:0,published:0,preparedTranslations:0,preparedTextFields:0,unchangedPriorProfiles:previous.size};
  for(const item of manifest.people) {
    assert(states.has(item.status),`${item.id}: unknown progress state`);
    const candidate=original.get(item.id);
    assert.equal(item.domain,candidate.domain,`${item.id}: domain drift`);
    assert.equal(item.stars,candidate.influence.stars,`${item.id}: rating drift`);
    if(item.status==='published') {
      assert(published.has(item.id),`${item.id}: declared published without a canonical profile`);
      const person=await read(`data/people/${item.id}.json`);
      const audit=await read(`data/research/editorial/${item.id}.json`);
      assert.equal(audit.publicationReady,true,`${item.id}: publication review not complete`);
      const english=await read(`data/i18n/en/people/${item.id}.json`);
      for(const locale of locales) {
        const translation=await read(`data/i18n/${locale}/people/${item.id}.json`);
        validateTranslation(person,translation,locale);
        if(locale!=='en')validateIntermediary(translation,english,locale,item.id);
      }
      await read(`data/images/${item.id}.json`);
      counts.published++;
      continue;
    }
    assert(!published.has(item.id),`${item.id}: published file conflicts with unfinished progress state`);
    if(item.status==='pending') {counts.pending++;continue;}
    const base=`data/research/prepared/${item.id}`;
    const person=await read(`${base}/person.json`),audit=await read(`${base}/review.json`);
    assert.equal(person.id,item.id);assert.equal(audit.id,item.id);
    assert.equal(audit.publicationReady,false,`${item.id}: staged profile must not claim publication readiness`);
    assert.equal(audit.status,item.status,`${item.id}: progress and review status differ`);
    assert.deepEqual(person.influence,candidate.influence,`${item.id}: original rating changed`);
    assertProfileCutoff(person,audit.cutoffDate);
    assert.equal(person.verifiedAt,audit.reviewedAt);
    assert(person.timeline.length>=8&&person.sources.length>=3&&person.facts.length>=2&&person.highlights.length>=2,`${item.id}: incomplete prepared dossier`);
    assert(audit.lifeStatusEvidence&&audit.lifeStatusEvidenceURL,`${item.id}: missing life-status review`);
    const sources=new Set(person.sources.map(s=>s.id));
    assert.equal(sources.size,person.sources.length,`${item.id}: duplicate source id`);
    for(const entry of [...person.timeline,...person.highlights])assert(entry.sourceIds?.length&&entry.sourceIds.every(id=>sources.has(id)),`${item.id}: missing source reference`);
    const english=await read(`${base}/en.json`);
    for(const locale of locales) {
      const translation=await read(`${base}/${locale}.json`);
      validateTranslation(person,translation,locale);
      if(locale!=='en') {
        assert.equal(translation.translationProvenance?.kind,'ai-reviewed');
        validateIntermediary(translation,english,locale,item.id);
      }
      counts.preparedTranslations++;
      counts.preparedTextFields+=Object.keys(sourceStrings(person)).length;
    }
    counts.textReviewedAwaitingPortrait++;
  }
  return {campaign:manifest.id,status:manifest.status,counts,priorPortraitObstacles:manifest.people.filter(p=>p.priorPortraitObstacle).length,totalPublishedProfiles:published.size,limits:['Prepared text is not a published profile.','These checks validate versions, completeness and review records; they do not certify sources, image identity, licensing or native-language quality.']};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await remainingProgress(),null,2));
