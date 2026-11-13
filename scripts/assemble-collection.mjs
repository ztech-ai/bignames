import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateInfluence } from './influence.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const write=async(file,data)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),JSON.stringify(data,null,2)+'\n');};
const cutoffDate='2026-11-13';
const targetCount=1000;
const baselinePath='data/research/baseline.json';
let baseline;
try {baseline=await read(baselinePath);} catch(error) {
  if(error.code!=='ENOENT')throw error;
  // The checked-in state predates this collection; preserve its published set.
  const filenames=execFileSync('git',['ls-tree','--name-only','HEAD','data/people/'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const profiles=filenames.map(file=>({id:path.basename(file,'.json'),blob:execFileSync('git',['rev-parse',`HEAD:${file}`],{cwd:root,encoding:'utf8'}).trim()}));
  baseline={capturedAt:cutoffDate,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),profiles};
  await write(baselinePath,baseline);
}
const oldPublished=new Set(baseline.profiles.map(p=>p.id));
let lifeReviews=[];
try {lifeReviews=await read('data/research/life-review.json');}catch(error){if(error.code!=='ENOENT')throw error;}
const confirmedDeaths=new Map(lifeReviews.filter(x=>x.decision==='defer-from-living-priority-collection').map(x=>[x.id,x]));
// Keep the pre-expansion roster in the baseline so exported source archives can
// repeat selection without needing the original repository's Git history.
if(!baseline.candidates){
  baseline.candidates=JSON.parse(execFileSync('git',['show',`${baseline.commit}:data/candidates.json`],{cwd:root,encoding:'utf8'}));
  await write(baselinePath,baseline);
}
const existingCandidates=baseline.candidates;
const aliases=new Map(existingCandidates.map(c=>[c.enName.toLocaleLowerCase(),c.id]));
const taxonomy=await read('data/taxonomy.json');
const pool=[];
const held=[];
const files=(await readdir(path.join(root,'data/research/rosters'))).filter(f=>f.endsWith('.json')&&!/-(sources|reserves)\.json$/.test(f)).sort();
const canonical=value=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const seenIds=new Set(),seenNames=new Set(),seenEntities=new Set();
for(const file of files) {
  const input=await read(`data/research/rosters/${file}`);
  for(const original of (Array.isArray(input)?input:input.people)) {
    const p={...original,id:aliases.get(original.enName.toLocaleLowerCase())??original.id};
    validateInfluence(p.influence,p.id,{required:true,minimum:3,cutoff:cutoffDate});
    if(oldPublished.has(p.id)){held.push({id:p.id,reason:'existing-published-deferred'});continue;}
    let evidence=null;
    try {evidence=await read(`data/research/evidence/${p.id}.json`);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(confirmedDeaths.has(p.id)){const review=confirmedDeaths.get(p.id);held.push({id:p.id,reason:'confirmed-deceased',date:review.deathDate,source:review.source});continue;}
    const normalized=canonical(p.enName);
    const evidenceMatches=evidence&&evidence.identity?.requestedTitle===p.wikipediaTitle&&(!p.wikidataId||p.wikidataId===evidence.identity?.wikidataId);
    const qid=p.wikidataId??(evidenceMatches?evidence?.identity?.wikidataId:null);
    if(seenIds.has(p.id)||seenNames.has(normalized)||(qid&&seenEntities.has(qid))){
      const prior=pool.find(x=>x.id===p.id||canonical(x.enName)===normalized||(qid&&x.wikidataId===qid));
      if(prior){prior.domains=[...new Set([...(prior.domains??[prior.domain]),...(p.domains??[p.domain])])];prior.regions=[...new Set([...prior.regions,...p.regions])];}
      held.push({id:p.id,reason:'duplicate-person',canonicalId:prior?.id});continue;
    }
    if(!taxonomy.domains.some(d=>d.id===p.domain))throw new Error(`${p.id}: invalid primary domain`);
    seenIds.add(p.id);seenNames.add(normalized);if(qid)seenEntities.add(qid);
    const researchStatus=evidence?(!evidenceMatches||evidence.status==='blocked'?'blocked':'evidence-collected'):'pending';
    pool.push({...p,researchStatus,lifeReviewStatus:'pending',...(qid?{wikidataId:qid}:{})});
  }
}
const domainOrder=['technology','business','politics','science','culture','literature','arts','sports'];
pool.sort((a,b)=>b.influence.stars-a.influence.stars||(a.priority??3)-(b.priority??3)||domainOrder.indexOf(a.domain)-domainOrder.indexOf(b.domain)||a.enName.localeCompare(b.enName,'en'));
const people=pool.slice(0,targetCount);
const reserve=pool.slice(targetCount);
const collection={id:'contemporary-1000',title:'当代世界 · 千人收录计划',targetCount,cutoffDate,selectionMinimum:3,method:'editorial-influence/1.0',scope:'新增人物优先；原有已发布档案的履历更新和影响力评级另行处理。',status:people.length===targetCount?'selection-complete':'selection-in-progress',people};
await write('data/collections/contemporary-1000.json',collection);
const csvValue=value=>`"${String(value??'').replaceAll('"','""')}"`;
const csvRows=[['ID','姓名','英文名','主领域','星级','影响范围','评级理由','关联地区','资料状态','来源入口'],...people.map(p=>[p.id,p.name,p.enName,p.domain,p.influence.stars,p.influence.scope,p.influence.rationale,p.regions.join(' / '),p.researchStatus,p.wikidataId?`https://www.wikidata.org/wiki/${p.wikidataId}`:`https://en.wikipedia.org/wiki/${encodeURIComponent(p.wikipediaTitle.replaceAll(' ','_'))}`])];
await writeFile(path.join(root,'data/collections/contemporary-1000.csv'),'\ufeff'+csvRows.map(row=>row.map(csvValue).join(',')).join('\n')+'\n');
const report={cutoffDate,targetCount,selected:people.length,eligiblePool:pool.length,existingPublishedDeferred:oldPublished.size,byDomain:{},byStars:{},byResearchStatus:{},held,reserve:reserve.map(p=>({id:p.id,name:p.name,enName:p.enName,domain:p.domain,stars:p.influence.stars}))};
for(const p of people){for(const [key,value] of [['byDomain',p.domain],['byStars',p.influence.stars],['byResearchStatus',p.researchStatus]])report[key][value]=(report[key][value]??0)+1;}
await write('data/research/selection-report.json',report);
const merged=new Map(existingCandidates.map(c=>[c.id,c]));
for(const p of people)if(!merged.has(p.id))merged.set(p.id,{id:p.id,name:p.name,enName:p.enName,domain:p.domain,batch:4});
for(const file of await readdir(path.join(root,'data/people'))){
  if(!file.endsWith('.json'))continue;
  const p=await read(`data/people/${file}`);
  if(!merged.has(p.id))merged.set(p.id,{id:p.id,name:p.name,enName:p.enName,domain:p.domains[0],batch:4});
}
await write('data/candidates.json',[...merged.values()]);
for(const p of people) {
  const file=`data/research/queue/${p.id}.json`;
  await write(file,{id:p.id,selection:p,cutoffDate,publicationReady:false,requiredLocales:['zh','en','fr','ar','de','ja','es','ko'],evidenceFile:`data/research/evidence/${p.id}.json`,requiredChecks:['identity','living-status-at-cutoff','latest-career-coverage','independent-sources','portrait-identity-and-license','color-photo','original-resume','eight-language-parity','influence-evidence'],note:'候选与已抓取资料不等于已完成或已核验的人物档案。'});
}
const currentIds=new Set(people.map(p=>p.id));
for(const file of await readdir(path.join(root,'data/research/queue')))if(file.endsWith('.json')&&!currentIds.has(file.slice(0,-5)))await rm(path.join(root,'data/research/queue',file));
console.log(JSON.stringify({selected:report.selected,eligiblePool:report.eligiblePool,byDomain:report.byDomain,byStars:report.byStars,byResearchStatus:report.byResearchStatus,held:held.length,reserves:reserve.length}));
