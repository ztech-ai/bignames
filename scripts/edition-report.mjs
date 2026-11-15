import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {lifeStatus} from './utils.mjs';
import {hasPortrait,validateImageMetadata} from './image-core.mjs';

// Counts and attribution are reproducible outputs. Editorial/source judgments
// remain in the individual dossiers; this command cannot certify their truth.
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
assert(args.length===2&&args[0]==='--batch'&&/^data\/collections\/[a-z0-9-]+\.json$/.test(args[1]),'Usage: node scripts/edition-report.mjs --batch data/collections/NAME.json');
const batchPath=args[1],read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const write=async(file,value)=>writeFile(path.join(root,file),JSON.stringify(value,null,2)+'\n');
const batch=await read(batchPath);
assert.match(batch.id,/^[a-z0-9-]+$/);
const reportPath=`data/research/${batch.id.replace(/-2026-11$/,'')}-report.json`;
const checked=JSON.parse(execFileSync(process.execPath,['scripts/check-batch.mjs','--batch',batchPath],{cwd:root,encoding:'utf8'}));
const collection=await read('data/collections/contemporary-1000.json');
const config=await read('data/i18n/locales.json'),taxonomy=await read('data/taxonomy.json');
const files=(await readdir(path.join(root,'data/people'))).filter(f=>f.endsWith('.json')).sort();
const people=await Promise.all(files.map(f=>read(`data/people/${f}`)));
const ids=new Set(people.map(p=>p.id));
const metadata=await Promise.all(people.map(async p=>{
  const image=await read(`data/images/${p.id}.json`);validateImageMetadata(image,p.id);return image;
}));
const enabledLanguages=config.locales.filter(l=>l.enabled).length;
const living=people.filter(p=>lifeStatus(p)==='living').length;
const completed=collection.people.filter(p=>ids.has(p.id)).length;
const edition=await read('data/research/edition-report.json');
Object.assign(edition,{
  cutoffDate:batch.cutoffDate,reviewedAt:batch.reviewedAt??batch.cutoffDate,
  newCompleteProfiles:completed,totalCompleteProfiles:people.length,pendingNewProfiles:collection.people.length-completed,
  languages:enabledLanguages,staticHtmlPages:(people.length+5)*enabledLanguages,
  timelineEvents:people.reduce((n,p)=>n+p.timeline.length,0),sourceRecords:people.reduce((n,p)=>n+p.sources.length,0),
  livingCompleteProfiles:living,deceasedCompleteProfiles:people.length-living,
  completeByPrimaryDomain:Object.fromEntries(taxonomy.domains.map(d=>[d.id,people.filter(p=>p.domains[0]===d.id).length])),
  portraitFiles:metadata.filter(hasPortrait).length,approvedPortraitPlaceholders:metadata.filter(p=>!hasPortrait(p)).length,
  latestBatch:batch.id,deployment:'GitHub Pages via .github/workflows/pages.yml; publication authorized by user'
});
edition.verificationLimits=edition.verificationLimits.filter(s=>!s.startsWith('Latest30:')&&!s.startsWith('Latest batch:'));
edition.verificationLimits.push(`Latest batch: ${checked.counts.newProfiles} Chinese/English dossiers and ${checked.counts.reviewedForeignTranslations} six-language variants have AI review records; programs check structure and versions, not human/native-language certification.`);
const escape=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const lines=[
  '# 图片署名与许可','',
  `核对日：${edition.reviewedAt}；事实截止：${batch.cutoffDate}。全站${edition.portraitFiles}张本地肖像，另有${edition.approvedPortraitPlaceholders}个经用户确认的姓名占位。图片在八语之间共享，不依赖运行时外链。`,'',
  `本批${checked.counts.newColorPortraits}张真实彩照由AI编辑查看本地文件并对照具名来源、作者和许可；逐人采编记录保存检查范围及图片SHA-256。程序整理本表，不据此认证身份、法律权利或语言质量。`,'',
  '在世人物保留原图色彩，已故人物统一显示黑白，不修改原图。历史画像不是生前照片；照片拍摄时间不等于资料核对日，旧队服或场景不表示现有任职。原许可声明按元数据保留。需要附全文的许可随站提供并在各语人物、许可页链接；GFDL 1.2文本来自系统提供的未修改标准GNU许可副本。','',
  '| 人物 | 作者 / 署名 | 许可 | 来源 |','| --- | --- | --- | --- |'
];
for(const [i,p] of people.entries()){
  const image=metadata[i];if(!hasPortrait(image))continue;
  const licenseURL=image.licenseText?`../public/${image.licenseText}`:image.licenseUrl;
  lines.push(`| ${escape(p.name)} | ${escape(image.credit)} | [${escape(image.license)}](${licenseURL})${image.permissionNotice?`<br>${escape(image.permissionNotice)}`:''} | [来源说明](${image.sourceUrl}) |`);
}
lines.push('','## 已确认的缺失肖像例外','');
for(const [i,p] of people.entries())if(!hasPortrait(metadata[i]))lines.push(`${p.name}：${metadata[i].reason} 详见\`data/images/${p.id}.json\`。`,'');
lines.push('机器可读元数据：`data/images/<人物id>.json`；本地图：`public/assets/portraits/`。`docs/portrait-contact-sheet.jpg`仅是最初24张图片的历史联络图，不代表后续批次全量照片。','');
const label=id=>taxonomy.domains.find(d=>d.id===id)?.label??id;
const csvCell=value=>`"${String(value).replaceAll('"','""')}"`;
const csv=[['领域','姓名','English name','id','影响力'],...batch.people.map(p=>[label(p.domain),p.name,p.enName,p.id,p.stars])].map(row=>row.map(csvCell).join(',')).join('\n')+'\n';
// Validation finishes before any output changes. No source biography, original
// rating, translation or research draft is rewritten by this command.
await write(reportPath,checked);
await write('data/research/edition-report.json',edition);
await writeFile(path.join(root,'docs/IMAGE-CREDITS.md'),lines.join('\n'));
await writeFile(path.join(root,batchPath.replace(/\.json$/,'.csv')),csv);
console.log(JSON.stringify({batch:batch.id,report:reportPath,totalProfiles:edition.totalCompleteProfiles,completedNewCandidates:completed,pendingNewCandidates:edition.pendingNewProfiles,staticHtmlPages:edition.staticHtmlPages,portraitFiles:edition.portraitFiles,sourceRecords:edition.sourceRecords,timelineEvents:edition.timelineEvents,modelCalls:0,networkActions:0}));
