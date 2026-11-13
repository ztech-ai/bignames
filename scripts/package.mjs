import { readdir, lstat, readFile, mkdir, mkdtemp, writeFile, rename, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const excludedDirectories=new Set(['.git','node_modules','.qa','__pycache__','.cache','.ssh','.aws','.config','tmp']);
const excludedFile=name=>name==='.DS_Store'||name==='.npmrc'||name.startsWith('.env')||/\.(?:zip|pyc|pyo|tmp|pem|key)$/i.test(name)||/^(?:credentials|secrets)(?:\.|$)/i.test(name);
export async function collectFiles(root,{staticOnly=false}={}) {
  const base=path.resolve(root,staticOnly?'dist':'.');
  const files=[];
  async function visit(directory,relative='') {
    for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      const rel=relative?`${relative}/${entry.name}`:entry.name;
      if(excludedDirectories.has(entry.name)||excludedFile(entry.name)||(!staticOnly&&(rel==='dist'||rel==='data/research/cache')))continue;
      const absolute=path.join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error(`Package input cannot be a symbolic link: ${rel}`);
      if(entry.isDirectory())await visit(absolute,rel);
      else if(entry.isFile())files.push({relative:rel,absolute});
    }
  }
  await visit(base);
  return files;
}
export async function fingerprint(root,options={}) {
  const files=await collectFiles(root,options),hash=createHash('sha256');
  for(const file of files) {
    const bytes=await readFile(file.absolute);
    hash.update(JSON.stringify([file.relative,bytes.length,createHash('sha256').update(bytes).digest('hex')])+'\n');
  }
  return {sha256:hash.digest('hex'),files:files.length};
}
async function resolvedPath(input) {
  let cursor=path.resolve(input),suffix=[];
  while(true) {
    try{return path.join(await realpath(cursor),...suffix.reverse());}
    catch(error){if(error.code!=='ENOENT')throw error;const parent=path.dirname(cursor);if(parent===cursor)throw error;suffix.push(path.basename(cursor));cursor=parent;}
  }
}
export async function validateOutputDirectory(root,out) {
  const project=await realpath(root),destination=await resolvedPath(out);
  const relative=path.relative(project,destination);
  if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('Package output must be outside the project directory');
  try{if(!(await lstat(destination)).isDirectory())throw new Error('Package output must be a directory');}catch(error){if(error.code!=='ENOENT')throw error;}
  return destination;
}
const zipProgram=String.raw`
import sys,json,zipfile,os
cfg=json.load(sys.stdin)
for target in cfg['archives']:
 with zipfile.ZipFile(target['output'],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
  for entry in target['files']:
   info=zipfile.ZipInfo(entry['name'],date_time=(1980,1,1,0,0,0))
   info.compress_type=zipfile.ZIP_DEFLATED
   info.create_system=3
   info.external_attr=0o100644 << 16
   with open(entry['path'],'rb') as source: archive.writestr(info,source.read(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
 with zipfile.ZipFile(target['output']) as archive:
  bad=archive.testzip()
  if bad: raise RuntimeError('Archive CRC failed: '+bad)
`;
function zipFiles(config) {
  return new Promise((resolve,reject)=>{
    const child=spawn('python3',['-c',zipProgram],{stdio:['pipe','ignore','pipe']});let errorText='';
    child.stderr.on('data',chunk=>{errorText=(errorText+chunk).slice(-4000);});
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`ZIP creation failed (${code}): ${errorText}`)));
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(config));
  });
}
async function replaceAsGroup(staging,out,names) {
  const moved=[],backups=[];
  try {
    for(const name of names) {
      const destination=path.join(out,name),backup=path.join(staging,`old-${name}`);
      try{const info=await lstat(destination);if(!info.isFile()||info.isSymbolicLink())throw new Error(`Existing artifact is not a regular file: ${name}`);await rename(destination,backup);backups.push([destination,backup]);}catch(error){if(error.code!=='ENOENT')throw error;}
      await rename(path.join(staging,name),destination);moved.push(destination);
    }
  }catch(error){
    for(const file of moved.reverse())await rm(file,{force:true});
    for(const[destination,backup]of backups.reverse())await rename(backup,destination);
    throw error;
  }
}
export async function packageArtifacts(root,out,verification,{zipper=zipFiles}={}) {
  root=path.resolve(root);out=await validateOutputDirectory(root,out);
  const requiredChecks=['build','data-and-links','node-tests','research-tests'];
  if(verification?.status!=='passed'||verification.level!=='full'||!verification.inputFingerprint?.sha256||!verification.staticOutputFingerprint?.sha256||!verification.checkedAt||!Array.isArray(verification.checks)||verification.checks.length!==4||verification.checks.some((check,i)=>check.name!==requiredChecks[i]||check.status!=='passed'||check.exitCode!==0))throw new Error('Packaging requires a successful full verification from this workflow');
  const input=await fingerprint(root);
  if(input.sha256!==verification.inputFingerprint.sha256)throw new Error('Source inputs changed after verification; run verification again');
  const staticInput=await fingerprint(root,{staticOnly:true});
  if(staticInput.sha256!==verification.staticOutputFingerprint.sha256)throw new Error('Static output changed after verification; run verification again');
  if(!staticInput.files)throw new Error('Static output is empty');
  const sourceFiles=await collectFiles(root),staticFiles=await collectFiles(root,{staticOnly:true});
  if(!staticFiles.some(f=>f.relative==='index.html'))throw new Error('Static output is missing index.html');
  await mkdir(out,{recursive:true});const staging=await mkdtemp(path.join(out,'.bignames-package-'));
  const names=['big-names-static.zip','big-names-source.zip','big-names-SHA256SUMS.txt','big-names-manifest.json'];
  try {
    await zipper({archives:[{output:path.join(staging,names[0]),files:staticFiles.map(f=>({name:f.relative,path:f.absolute}))},{output:path.join(staging,names[1]),files:sourceFiles.map(f=>({name:`bignames/${f.relative}`,path:f.absolute}))}]});
    if((await fingerprint(root)).sha256!==input.sha256||(await fingerprint(root,{staticOnly:true})).sha256!==staticInput.sha256)throw new Error('Inputs changed while packaging; existing archives have been preserved');
    const archives=[];
    for(const [index,name]of names.slice(0,2).entries()){const bytes=await readFile(path.join(staging,name));archives.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,files:index===0?staticFiles.length:sourceFiles.length});}
    const manifest={formatVersion:1,createdAt:new Date().toISOString(),inputFingerprint:input,staticOutputFingerprint:staticInput,verification:{level:verification.level,status:verification.status,checkedAt:verification.checkedAt,checks:verification.checks.map(({name,status,exitCode})=>({name,status,exitCode}))},browserVisualReview:'not-performed-by-this-command',modelCalls:0,networkActions:0,deployment:'not-performed',archives};
    await writeFile(path.join(staging,names[2]),archives.map(a=>`${a.sha256}  ${a.file}`).join('\n')+'\n');
    await writeFile(path.join(staging,names[3]),JSON.stringify(manifest,null,2)+'\n');
    await replaceAsGroup(staging,out,names);
    return {status:'packaged',outputDirectory:out,manifest:path.join(out,names[3]),archives};
  }finally{await rm(staging,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.error('Use node scripts/workflow.mjs package [--out absolute-directory] [--json] to verify and package.');process.exitCode=1;
}
