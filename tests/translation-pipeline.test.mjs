import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sourceHash,sourceStrings,validateIntermediary} from '../scripts/i18n-core.mjs';
import {save} from '../scripts/reviewed-translation.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'bignames-reviewed-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const person={id:'sample',name:'人物',role:'研究者',country:'世界',summary:'中文概要',coverageNote:'范围',tags:['科研'],facts:[{id:'birth',label:'出生地',value:'城市'}],highlights:[{id:'work',title:'成果',text:'贡献'}],timeline:[{id:'start',date:'2000',title:'事件',text:'经历'}]};
  const english={sourceHash:sourceHash(person),strings:Object.fromEntries(Object.keys(sourceStrings(person)).map(k=>[k,`English ${k}`]))};
  const put=async(file,value)=>{const f=path.join(root,file);await mkdir(path.dirname(f),{recursive:true});await writeFile(f,JSON.stringify(value));};
  await put('data/people/sample.json',person);await put('data/i18n/en/people/sample.json',english);
  return {root,person,english,put};
}

test('reviewed translation saves exact keys and both versions without altering canonical facts',async t=>{
  const {root,person,english}=await fixture(t),before=await readFile(path.join(root,'data/people/sample.json'));
  const values=Object.keys(sourceStrings(person)).map(k=>`Français ${k}`);
  await save('sample','fr',values,{root,reviewedAt:'2026-11-13'});
  const result=JSON.parse(await readFile(path.join(root,'data/i18n/fr/people/sample.json')));
  assert.equal(result.sourceHash,sourceHash(person));assert.deepEqual(result.translationProvenance.reviewedKeys,Object.keys(english.strings));
  assert.equal(result.translationProvenance.kind,'ai-reviewed');assert.equal(result.translationProvenance.sourceTextSha256,sourceHash(english.strings));
  assert.equal(result.translationProvenance.nativeLanguageReview,'not-certified-by-this-program');
  assert.deepEqual(await readFile(path.join(root,'data/people/sample.json')),before);
});

test('missing fields and stale English are rejected before an existing translation can be overwritten',async t=>{
  const {root,person,english,put}=await fixture(t),values=Object.values(english.strings);
  await save('sample','fr',values,{root});const file=path.join(root,'data/i18n/fr/people/sample.json'),before=await readFile(file);
  await assert.rejects(save('sample','fr',values.slice(1),{root}),/values for/);
  await put('data/people/sample.json',{...person,summary:'Edited source'});
  await assert.rejects(save('sample','fr',values,{root}),/stale sourceHash/);
  assert.deepEqual(await readFile(file),before);
});

test('unreviewed machine text cannot pass publication and an English-only edit invalidates reviewed targets',()=>{
  const english={sourceHash:'canonical',strings:{summary:'Original English'}};
  const translation={sourceHash:'canonical',strings:{summary:'Français'},translationProvenance:{kind:'ai-reviewed',sourceLocale:'en',sourceTextSha256:sourceHash(english.strings),reviewer:{kind:'ai',name:'Codex'},reviewedKeys:['summary']}};
  validateIntermediary(translation,english,'fr','example');
  assert.throws(()=>validateIntermediary({...translation,translationProvenance:{...translation.translationProvenance,kind:'machine-assisted'}},english,'fr','example'),/unreviewed machine draft/);
  assert.throws(()=>validateIntermediary(translation,{...english,strings:{summary:'Edited English'}},'fr','example'),/stale English intermediary/);
  assert.throws(()=>validateIntermediary({...translation,translationProvenance:{...translation.translationProvenance,reviewedKeys:[]}},english,'fr','example'),/incomplete translation review/);
  validateIntermediary({sourceHash:'canonical'},null,'fr','legacy-manual');
});
