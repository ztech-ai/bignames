import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {remainingProgress} from '../scripts/remaining-progress.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
async function fixture(t) {
  const root=await mkdtemp(path.join(tmpdir(),'remaining-progress-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(file,value)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),JSON.stringify(value));};
  const old='{"id":"existing-person"}';
  await mkdir(path.join(root,'data/people'),{recursive:true});
  await writeFile(path.join(root,'data/people/existing-person.json'),old);
  const person=JSON.parse(await readFile(path.join(ROOT,'data/research/prepared/aaron-levie/person.json'),'utf8'));
  const candidate={id:person.id,domain:person.domains[0],influence:person.influence};
  const manifest={id:'test',status:'in-progress',priorProfileCount:1,targetCount:1,previousProfiles:[{id:'existing-person',sha256:createHash('sha256').update(old).digest('hex')}],people:[{...candidate,stars:person.influence.stars,status:'text-reviewed-awaiting-portrait'}]};
  await put('data/collections/remaining-224-2026-11.json',manifest);
  await put('data/collections/contemporary-1000.json',{people:[candidate]});
  await cp(path.join(ROOT,'data/i18n/locales.json'),path.join(root,'locales.json'));
  await mkdir(path.join(root,'data/i18n'),{recursive:true});
  await cp(path.join(root,'locales.json'),path.join(root,'data/i18n/locales.json'));
  await cp(path.join(ROOT,'data/research/prepared/aaron-levie'),path.join(root,'data/research/prepared/aaron-levie'),{recursive:true});
  return {root,put,person,manifest};
}

test('prepared eight-language text is counted separately from canonical profiles',async t=>{
  const {root}=await fixture(t);const report=await remainingProgress(root);
  assert.equal(report.counts.textReviewedAwaitingPortrait,1);
  assert.equal(report.counts.preparedTranslations,7);
  assert.equal(report.counts.published,0);
  assert.equal(report.totalPublishedProfiles,1);
});
test('changing an existing biography is detected before reporting progress',async t=>{
  const {root,put}=await fixture(t);
  await put('data/people/existing-person.json',{id:'existing-person',summary:'changed'});
  await assert.rejects(remainingProgress(root),/existing canonical profile changed/);
});
test('editing the English intermediary invalidates unrevised target translations',async t=>{
  const {root,put}=await fixture(t);
  const file='data/research/prepared/aaron-levie/en.json';
  const english=JSON.parse(await readFile(path.join(root,file),'utf8'));
  english.strings.summary+=' A new claim.';await put(file,english);
  await assert.rejects(remainingProgress(root),/stale English intermediary/);
});
test('unfinished text cannot silently enter the canonical build input',async t=>{
  const {root,put,person}=await fixture(t);
  await put(`data/people/${person.id}.json`,person);
  await assert.rejects(remainingProgress(root),/conflicts with unfinished progress state/);
});
