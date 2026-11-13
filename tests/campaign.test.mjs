import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

// A temporary collection tests publication boundaries without adding fictional
// people to the actual archive or changing the real editorial selection.
const root=new URL('../',import.meta.url);
const fixture=await mkdtemp(path.join(tmpdir(),'big-names-campaign-'));
after(()=>rm(fixture,{recursive:true,force:true}));
await Promise.all(['scripts','data','public'].map(folder=>cp(new URL(folder,root),path.join(fixture,folder),{recursive:true})));
const sample={id:'elon-musk',name:'埃隆·马斯克',enName:'Elon Musk',domain:'technology',domains:['technology','business'],regions:['africa','north-america'],subfield:'航天',inclusionReason:'用于测试的中文入选说明',inclusionReasonEn:'Selection reason for this test.',influence:{stars:5,scope:'global',reviewStatus:'provisional'}};
const people=[sample,...Array.from({length:120},(_,i)=>({id:`research-person-${i}`,name:`测试人物${i}`,enName:`Test Person ${i}`,domain:i%2?'business':'technology',domains:[i%2?'business':'technology'],regions:[i%2?'europe':'asia'],inclusionReason:'测试资料，不能作为正式档案发布。',influence:{stars:i%5+1,scope:'field',reviewStatus:'provisional'}}))];
await mkdir(path.join(fixture,'data/collections'),{recursive:true});
await writeFile(path.join(fixture,'data/collections/contemporary-1000.json'),JSON.stringify({id:'contemporary-1000',targetCount:1000,cutoffDate:'2026-11-13',people}));
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:fixture,stdio:'pipe'});
const read=file=>readFile(path.join(fixture,'dist',file),'utf8');
const script=await read('assets/site.js');
const visible=document=>[...document.querySelectorAll('[data-candidate]')].filter(row=>!row.hidden);
async function open(t,locale='zh',query=''){
 const prefix=locale==='zh'?'':`${locale}/`;
 const dom=new JSDOM(await read(`${prefix}candidates.html`),{url:`https://example.test/archive/${prefix}candidates.html${query}`,runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 dom.window.matchMedia=()=>({matches:true});dom.window.Element.prototype.scrollIntoView=()=>{};
 dom.window.eval(await read(`assets/locales/${locale}.js`));dom.window.eval(script);
 return {window:dom.window,document:dom.window.document};
}
function change(window,id,value){const node=window.document.getElementById(id);node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));}

test('the collection counts selections separately from real biographies and is fully readable without JavaScript',async t=>{
 const dom=new JSDOM(await read('candidates.html'));t.after(()=>dom.window.close());const document=dom.window.document;
 assert.equal(document.querySelectorAll('[data-candidate]').length,121);
 assert.equal(document.querySelectorAll('[data-candidate][hidden]').length,0);
 assert.equal(document.querySelector('[data-campaign-count="selected"]').textContent,'121');
 assert.equal(document.querySelector('[data-campaign-count="published"]').textContent,'1');
 assert.equal(document.querySelector('[data-campaign-count="pending"]').textContent,'120');
 assert.equal(document.querySelectorAll('[data-candidate] a').length,1);
 assert.ok(!document.querySelector('a[href*="research-person"]'));
 assert.ok(document.querySelector('[data-id="elon-musk"] .influence-stars').getAttribute('aria-label').includes('5 / 5'));
 assert.ok(document.querySelector('.influence-method').textContent.includes('不是道德评价'));
 const profile=new JSDOM(await read('people/elon-musk/index.html'));t.after(()=>profile.window.close());
 assert.equal(profile.window.document.querySelector('.influence-rating'),null,'A candidate rating must not silently become an existing biography rating');
});

test('collection search, cross-domain tags, regions, status and minimum stars compose with pagination',async t=>{
 const {document,window}=await open(t);
 assert.equal(visible(document).length,50);
 document.querySelector('#candidate-pagination [data-page="3"]').click();
 assert.equal(visible(document).length,21);
 assert.equal(new URL(window.location.href).searchParams.get('page'),'3');
 change(window,'candidate-status','published');
 assert.deepEqual(visible(document).map(row=>row.dataset.id),['elon-musk']);
 change(window,'candidate-domain','business');
 assert.deepEqual(visible(document).map(row=>row.dataset.id),['elon-musk'],'Cross-domain tags should participate in filtering');
 change(window,'candidate-region','europe');
 assert.equal(visible(document).length,0);
 assert.equal(document.getElementById('candidate-empty').hidden,false);
 document.getElementById('candidate-reset').click();
 change(window,'candidate-min-stars','5');
 assert.ok(visible(document).every(row=>row.dataset.stars==='5'));
 assert.equal(visible(document).length,25);
 assert.equal(new URL(window.location.href).searchParams.get('minStars'),'5');
 document.getElementById('candidate-reset').click();
 change(window,'candidate-sort','stars');
 const stars=visible(document).map(row=>Number(row.dataset.stars));
 assert.deepEqual(stars,[...stars].sort((a,b)=>b-a));
 const input=document.getElementById('candidate-search');input.value='ELON MUSK';input.dispatchEvent(new window.Event('input',{bubbles:true}));
 assert.deepEqual(visible(document).map(row=>row.dataset.id),['elon-musk']);
 assert.equal(new URL(document.querySelector('[data-language="ar"]').href).searchParams.get('q'),'ELON MUSK');
});

test('collection deep links and translated views preserve filters without leaking Chinese editorial notes',async t=>{
 const {document,window}=await open(t,'ar','?domain=business&region=europe&minStars=4&sort=stars&page=999');
 assert.equal(document.documentElement.dir,'rtl');
 assert.ok(visible(document).every(row=>row.dataset.domain==='business'&&row.dataset.regions==='europe'&&Number(row.dataset.stars)>=4));
 assert.equal(document.getElementById('candidate-min-stars').value,'4');
 assert.ok(!document.querySelector('.candidate-table').textContent.includes('用于测试的中文入选说明'));
 assert.equal(document.querySelector('[data-id="elon-musk"] .candidate-reason'),null);
 assert.ok(document.querySelector('[data-id="elon-musk"] .influence-stars').getAttribute('aria-label').includes('5'));
 assert.equal(new URL(window.location.href).searchParams.has('page'),false,'Out-of-range pagination is bounded');
 const english=await open(t,'en','?q=Elon');
 assert.equal(english.document.querySelector('[data-id="elon-musk"] .candidate-reason').textContent,'Selection reason for this test.');
});
