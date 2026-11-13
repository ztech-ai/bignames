import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { validateTranslation, validateUI, validateUISource, sourceStrings } from './i18n-core.mjs';
import { lifeStatus } from './utils.mjs';
import { hasPortrait, validateImageMetadata } from './image-core.mjs';
import { fingerprint, packageArtifacts, validateOutputDirectory } from './package.mjs';

const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
const readJson=async(root,file)=>JSON.parse(await readFile(path.join(root,file),'utf8'));
async function names(root,dir){try{return (await readdir(path.join(root,dir))).filter(name=>name.endsWith('.json')&&!name.startsWith('_'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
export async function workflowStatus(root=defaultRoot) {
  const problems=[];
  const issue=(type,file,error)=>problems.push({type,file,message:error.message??String(error)});
  const config=await readJson(root,'data/i18n/locales.json');const source=config.source??config.default,locales=config.locales.filter(l=>l.enabled);
  const base=await readJson(root,`data/i18n/${source}/ui.json`);
  let collection=[];try{collection=(await readJson(root,'data/collections/contemporary-1000.json')).people;}catch(error){if(error.code!=='ENOENT')issue('collection','data/collections/contemporary-1000.json',error);}
  const files=await names(root,'data/people'),published=new Set(),evidence=new Set((await names(root,'data/research/evidence')).map(n=>n.slice(0,-5))),drafts=new Set((await names(root,'data/research/drafts')).map(n=>n.slice(0,-5)));
  let translations=0,images=0,pendingPortraits=0;
  for(const locale of locales){const f=`data/i18n/${locale.id}/ui.json`;try{validateUI(base,await readJson(root,f),locale.id);if(locale.id!==source)validateUISource(base,await readJson(root,`data/i18n/${locale.id}/ui-source.json`),locale.id);}catch(error){issue('ui',f,error);}}
  for(const filename of files){
    const f=`data/people/${filename}`;let person;
    try{person=await readJson(root,f);if(filename!==`${person.id}.json`)throw new Error('Filename and person ID differ');sourceStrings(person);lifeStatus(person);for(const key of ['name','enName','country','role','summary','coverageNote','verifiedAt'])if(typeof person[key]!=='string'||!person[key].trim())throw new Error(`Missing ${key}`);if(!person.timeline?.length||!person.sources?.length)throw new Error('Missing timeline or sources');published.add(person.id);}catch(error){issue('profile',f,error);continue;}
    const imageFile=`data/images/${person.id}.json`;
    try{const image=await readJson(root,imageFile);validateImageMetadata(image,person.id);if(hasPortrait(image)){if((await stat(path.join(root,'public',image.src))).size<=1000)throw new Error('Portrait file is missing or too small');images++;}else pendingPortraits++;}catch(error){issue('image',imageFile,error);}
    for(const locale of locales.filter(l=>l.id!==source)){const translationFile=`data/i18n/${locale.id}/people/${person.id}.json`;try{validateTranslation(person,await readJson(root,translationFile),locale.id);translations++;}catch(error){issue('translation',translationFile,error);}}
  }
  let pages=0;async function countHtml(dir){try{for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isDirectory())await countHtml(path.join(dir,entry.name));else if(entry.name.endsWith('.html'))pages++;}}catch(error){if(error.code!=='ENOENT')throw error;}}await countHtml(path.join(root,'dist'));
  const evidencePresent=collection.filter(p=>evidence.has(p.id)).length,draftsPresent=collection.filter(p=>drafts.has(p.id)).length;
  return {status:problems.length?'attention-needed':'ready-for-verification',counts:{selectedCandidates:collection.length,profileFiles:files.length,enabledLanguages:locales.length,validTranslations:translations,expectedTranslations:files.length*Math.max(0,locales.length-1),validPortraits:images,pendingPortraits,existingHtmlPages:pages,expectedHtmlPages:(files.length+5)*locales.length,selectedEvidenceFiles:evidencePresent,selectedDraftFiles:draftsPresent,selectedProfiles:collection.filter(p=>published.has(p.id)).length},problems,limitations:['Status is a file and metadata preflight, not a full verification.','Evidence/draft presence is counted without reading the large research payloads; their facts and review status are not certified.','Browser layout, typography and print appearance require visual review.'],modelCalls:0,networkActions:0};
}
export function verificationPlan({quick=false}={}) {
  const plan=[{name:'build',command:process.execPath,args:['scripts/build.mjs']},{name:'data-and-links',command:process.execPath,args:['scripts/check.mjs']}];
  if(!quick)plan.push({name:'node-tests',command:'npm',args:['test']},{name:'research-tests',command:'python3',args:['tests/research-fetch.test.py']});
  return plan;
}
export function executeCheck(check,root) {
  return new Promise(resolve=>{
    const child=spawn(check.command,check.args,{cwd:root,stdio:['ignore','pipe','pipe'],shell:false});let output='';
    const append=chunk=>{output=(output+chunk).slice(-32000);};child.stdout.on('data',append);child.stderr.on('data',append);
    child.on('error',error=>resolve({exitCode:1,output:error.message}));child.on('close',code=>resolve({exitCode:code??1,output}));
  });
}
export async function runVerification(root=defaultRoot,{quick=false,runner=executeCheck,onStep=()=>{}}={}) {
  const before=await fingerprint(root),checks=[];let checkedStatic;
  for(const check of verificationPlan({quick})) {
    onStep({name:check.name,status:'running'});const result=await runner(check,root);
    const item={name:check.name,status:result.exitCode===0?'passed':'failed',exitCode:result.exitCode};checks.push(item);onStep(item);
    if(item.status==='failed')return {status:'failed',level:quick?'quick':'full',inputFingerprint:before,checks,error:result.output.slice(-5000),browserVisualReview:'not-performed-by-this-command'};
    if(check.name==='data-and-links')checkedStatic=await fingerprint(root,{staticOnly:true});
  }
  const after=await fingerprint(root);
  if(after.sha256!==before.sha256)return {status:'failed',level:quick?'quick':'full',inputFingerprint:before,checks,error:'Source inputs changed during verification; rerun against a stable input set',browserVisualReview:'not-performed-by-this-command'};
  const staticOutput=await fingerprint(root,{staticOnly:true});
  if(staticOutput.sha256!==checkedStatic.sha256)return {status:'failed',level:quick?'quick':'full',inputFingerprint:before,checks,error:'Static output changed after its checks; rerun verification',browserVisualReview:'not-performed-by-this-command'};
  const report={status:'passed',level:quick?'quick':'full',checkedAt:new Date().toISOString(),inputFingerprint:after,staticOutputFingerprint:staticOutput,checks,browserVisualReview:'not-performed-by-this-command',modelCalls:0,networkActions:0};
  await mkdir(path.join(root,'.qa'),{recursive:true});await writeFile(path.join(root,'.qa/workflow-verification.json'),JSON.stringify(report,null,2)+'\n');
  return report;
}
export function parseArguments(args) {
  const command=args.shift();if(!['status','verify','package'].includes(command))throw new Error('Usage: node scripts/workflow.mjs status|verify|package [--json] [--quick (verify only)] [--out DIRECTORY (package only)]');
  const options={command,json:false,quick:false,out:null};const seen=new Set();
  while(args.length){const arg=args.shift();if(seen.has(arg))throw new Error(`Repeated argument ${arg}`);seen.add(arg);if(arg==='--json')options.json=true;else if(arg==='--quick'&&command==='verify')options.quick=true;else if(arg==='--out'&&command==='package'){options.out=args.shift();if(!options.out||options.out.startsWith('--'))throw new Error('--out requires a directory');}else throw new Error(`Unknown or unsupported argument ${arg}`);}
  return options;
}
export async function main(args=process.argv.slice(2),root=defaultRoot) {
  const options=parseArguments([...args]);let result;
  const onStep=step=>{if(!options.json)process.stderr.write(`${step.status}: ${step.name}\n`);};
  if(options.command==='status')result=await workflowStatus(root);
  else {
    const out=options.command==='package'?await validateOutputDirectory(root,options.out??path.dirname(root)):null;
    const verification=await runVerification(root,{quick:options.quick,onStep});
    result=verification;
    if(options.command==='package'&&verification.status==='passed')result={...await packageArtifacts(root,out,verification),verification};
  }
  process.stdout.write(JSON.stringify(result,null,options.json?0:2)+'\n');
  if(result.status==='failed'||result.status==='attention-needed')process.exitCode=1;
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(JSON.stringify({status:'failed',error:error.message})+'\n');process.exitCode=1;});
