import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sourceHash, sourceStrings } from '../scripts/i18n-core.mjs';
import { workflowStatus, runVerification, parseArguments, verificationPlan } from '../scripts/workflow.mjs';
import { collectFiles, fingerprint, packageArtifacts, validateOutputDirectory } from '../scripts/package.mjs';

async function fixture(t) {
  const base=await mkdtemp(path.join(os.tmpdir(),'bignames-workflow-'));
  t.after(()=>rm(base,{recursive:true,force:true}));
  const root=path.join(base,'project'),out=path.join(base,'artifacts');
  await mkdir(root);await mkdir(out);
  const put=async(file,value)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
  const person={id:'sample-person',name:'人物',enName:'Sample Person',country:'世界',role:'研究者',summary:'有来源的概要',coverageNote:'档案范围',verifiedAt:'2026-11-13',birth:'1980',death:null,tags:['科技'],facts:[{id:'role',label:'职位',value:'研究者'}],highlights:[{id:'work',title:'成果',text:'有影响力的成果'}],timeline:[{id:'event',date:'2020',title:'事件',text:'有来源的事件'}],sources:[{id:'source',url:'https://example.com'}]};
  const ui={title:'人物 {count}'};
  await put('data/i18n/locales.json',{source:'zh',default:'zh',locales:[{id:'zh',enabled:true},{id:'en',enabled:true}]});
  await put('data/i18n/zh/ui.json',ui);await put('data/i18n/en/ui.json',{title:'People {count}'});await put('data/i18n/en/ui-source.json',{sourceHash:sourceHash(ui)});
  await put('data/people/sample-person.json',person);
  await put('data/i18n/en/people/sample-person.json',{sourceHash:sourceHash(person),strings:sourceStrings(person)});
  await put('data/images/sample-person.json',{src:'assets/portraits/sample-person.jpg',alt:'人物',credit:'Photographer',license:'CC BY',sourceUrl:'https://example.com/photo',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'});
  await put('public/assets/portraits/sample-person.jpg',Buffer.alloc(1024,1));
  await put('data/collections/contemporary-1000.json',{people:[{id:'sample-person'},{id:'candidate-person'}]});
  await put('data/research/evidence/candidate-person.json','not parsed by status');
  await put('data/research/drafts/candidate-person.json','not parsed by status');
  await put('dist/index.html','<!doctype html><title>People</title>');
  return {base,root,out,put,person};
}
const successfulRunner=async()=>({exitCode:0,output:''});
const verified=root=>runVerification(root,{runner:successfulRunner});

test('status is read-only, counts research presence cheaply and detects stale or missing published assets',async t=>{
  const {root,put,person}=await fixture(t),before=await fingerprint(root);
  const status=await workflowStatus(root);
  assert.equal(status.status,'ready-for-verification');
  assert.equal(status.counts.selectedCandidates,2);
  assert.equal(status.counts.selectedDraftFiles,1);
  assert.equal(status.counts.selectedEvidenceFiles,1);
  assert.equal(status.counts.validTranslations,1);
  assert.equal(status.counts.expectedHtmlPages,12);
  assert.deepEqual(await fingerprint(root),before);
  await put('data/people/sample-person.json',{...person,summary:'更新后的概要'});
  await rm(path.join(root,'public/assets/portraits/sample-person.jpg'));
  const invalid=await workflowStatus(root);
  assert.equal(invalid.status,'attention-needed');
  assert.deepEqual(invalid.problems.map(p=>p.type).sort(),['image','translation']);
  assert.match(invalid.problems.find(p=>p.type==='translation').message,/stale sourceHash/);
  await rm(path.join(root,'data/i18n/en/people/sample-person.json'));
  assert.match((await workflowStatus(root)).problems.find(p=>p.type==='translation').message,/ENOENT/);
});

test('verification fails fast and quick checks cannot qualify for packaging',async t=>{
  const {root,out}=await fixture(t),calls=[];
  const report=await runVerification(root,{runner:async check=>{calls.push(check.name);return {exitCode:check.name==='data-and-links'?2:0,output:'invalid citation'};}});
  assert.deepEqual(calls,['build','data-and-links']);
  assert.equal(report.status,'failed');assert.match(report.error,/invalid citation/);
  await assert.rejects(readFile(path.join(root,'.qa/workflow-verification.json')),/ENOENT/);
  const quick=await runVerification(root,{quick:true,runner:successfulRunner});
  assert.equal(quick.level,'quick');assert.equal(quick.checks.length,2);
  await assert.rejects(packageArtifacts(root,out,quick),/successful full verification/);
  assert.deepEqual(verificationPlan().map(c=>c.name),['build','data-and-links','node-tests','research-tests']);
});

test('verification refuses inputs or built pages modified during the check sequence',async t=>{
  const {root,put}=await fixture(t);
  const changed=await runVerification(root,{runner:async check=>{if(check.name==='node-tests')await put('data/new.json','{}');return successfulRunner();}});
  assert.equal(changed.status,'failed');assert.match(changed.error,/Source inputs changed/);
  const changedPages=await runVerification(root,{runner:async check=>{if(check.name==='node-tests')await put('dist/index.html','changed after link check');return successfulRunner();}});
  assert.equal(changedPages.status,'failed');assert.match(changedPages.error,/Static output changed/);
});

test('argument and output validation rejects unsafe or ambiguous package requests',async t=>{
  const {root,base}=await fixture(t);
  assert.deepEqual(parseArguments(['package','--out',base,'--json']),{command:'package',out:base,json:true,quick:false});
  for(const args of [['package','--quick'],['status','--out',base],['verify','--json','--json'],['package','--out'],['unknown']])assert.throws(()=>parseArguments(args));
  await assert.rejects(validateOutputDirectory(root,root),/outside the project/);
  await assert.rejects(validateOutputDirectory(root,path.join(root,'new','directory')),/outside the project/);
  const alias=path.join(base,'alias');await symlink(root,alias);
  await assert.rejects(validateOutputDirectory(root,path.join(alias,'nested')),/outside the project/);
  assert.equal(await validateOutputDirectory(root,base),base);
});

test('packages are reproducible, preserve site inputs and exclude secrets, caches and build dependencies',async t=>{
  const {root,out,base,put}=await fixture(t);
  for(const file of ['.env','.env.production','.git/config','node_modules/module.js','.qa/report.json','data/research/cache/page.json','__pycache__/cache.pyc','.ssh/id_rsa','.config/token','tmp/scratch','credentials.json','secret.key','old.zip'])await put(file,'secret or generated');
  const before=await fingerprint(root),report=await verified(root),result=await packageArtifacts(root,out,report);
  assert.equal(result.status,'packaged');assert.deepEqual(await fingerprint(root),before);
  const manifest=JSON.parse(await readFile(result.manifest,'utf8'));
  assert.equal(manifest.verification.level,'full');assert.equal(manifest.browserVisualReview,'not-performed-by-this-command');assert.equal(manifest.modelCalls,0);
  const inspect=archive=>JSON.parse(execFileSync('python3',['-c','import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps([[i.filename,list(i.date_time)] for i in z.infolist()]))',path.join(out,archive)],{encoding:'utf8'}));
  const sourceEntries=inspect('big-names-source.zip');
  assert.ok(sourceEntries.some(([name])=>name==='bignames/data/research/drafts/candidate-person.json'));
  assert.ok(!sourceEntries.some(([name])=>/(?:\/\.env|\/\.git\/|\/node_modules\/|\/\.qa\/|\/cache\/|\/dist\/|\/\.ssh\/|\/\.config\/|\/tmp\/|credentials|secret\.key|old\.zip)/.test(name)));
  assert.ok(sourceEntries.every(([,date])=>JSON.stringify(date)==='[1980,1,1,0,0,0]'));
  assert.deepEqual(inspect('big-names-static.zip').map(([name])=>name),['index.html']);
  const second=await packageArtifacts(root,path.join(base,'second'),report);
  assert.deepEqual(second.archives.map(a=>a.sha256),result.archives.map(a=>a.sha256));
  const checksum=await readFile(path.join(out,'big-names-SHA256SUMS.txt'),'utf8');
  assert.ok(result.archives.every(a=>checksum.includes(`${a.sha256}  ${a.file}`)));
});

test('packaging rejects stale verification and symbolic link inputs',async t=>{
  const {root,out,base,put}=await fixture(t),report=await verified(root);
  await put('dist/index.html','new unverified HTML');
  await assert.rejects(packageArtifacts(root,out,report),/Static output changed after verification/);
  const fresh=await verified(root);await put('new-source.json','{}');
  await assert.rejects(packageArtifacts(root,out,fresh),/Source inputs changed after verification/);
  await writeFile(path.join(base,'outside-secret'),'private');await symlink(path.join(base,'outside-secret'),path.join(root,'linked'));
  await assert.rejects(collectFiles(root),/symbolic link/);
});

test('ZIP errors and installation failures preserve existing archives and remove staging files',async t=>{
  const {root,out}=await fixture(t),report=await verified(root);
  const filenames=['big-names-static.zip','big-names-source.zip','big-names-SHA256SUMS.txt','big-names-manifest.json'];
  for(const filename of filenames)await writeFile(path.join(out,filename),`old ${filename}`);
  await assert.rejects(packageArtifacts(root,out,report,{zipper:async()=>{throw new Error('simulated ZIP failure');}}),/simulated ZIP failure/);
  for(const filename of filenames)assert.equal(await readFile(path.join(out,filename),'utf8'),`old ${filename}`);
  await rm(path.join(out,filenames[2]));await mkdir(path.join(out,filenames[2]));
  await assert.rejects(packageArtifacts(root,out,report),/not a regular file/);
  for(const filename of [filenames[0],filenames[1],filenames[3]])assert.equal(await readFile(path.join(out,filename),'utf8'),`old ${filename}`);
  assert.deepEqual((await readdir(out)).sort(),filenames.sort());
});

test('source changes during ZIP creation leave previous good outputs intact',async t=>{
  const {root,out,put}=await fixture(t),report=await verified(root);
  await writeFile(path.join(out,'big-names-static.zip'),'previous good output');
  await assert.rejects(packageArtifacts(root,out,report,{zipper:async()=>{await put('changed-during-zip.json','{}');}}),/Inputs changed while packaging/);
  assert.equal(await readFile(path.join(out,'big-names-static.zip'),'utf8'),'previous good output');
  assert.deepEqual(await readdir(out),['big-names-static.zip']);
});
