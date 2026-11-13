import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateInfluence } from '../scripts/migrate-influence-i18n.mjs';
import { sourceStrings,sourceHash,localizePerson,validateTranslation } from '../scripts/i18n-core.mjs';

const person={id:'example',name:'名字',role:'角色',country:'地区',summary:'概要',coverageNote:'范围',tags:[],aliases:[],facts:[],highlights:[],timeline:[],influence:{stars:4,rationale:'理由',rationales:{zh:'理由',en:'Reason'},rationaleEn:'Reason'}};
const legacy={sourceHash:sourceHash(person),strings:Object.fromEntries(Object.entries(sourceStrings(person)).filter(([key])=>key!=='influence.rationale'))};
test('rating migration preserves existing translations and exposes the localized reason',()=>{
  const next=migrateInfluence(person,{en:legacy});
  assert.equal(next.person.influence.rationale,'理由');
  assert.equal(next.person.influence.rationales,undefined);
  assert.equal(next.person.influence.rationaleEn,undefined);
  assert.equal(next.translations.en.strings['influence.rationale'],'Reason');
  assert.equal(localizePerson(next.person,next.translations.en).influence.localizedRationale,'Reason');
  validateTranslation(next.person,next.translations.en,'en');
  assert.equal(migrateInfluence(next.person,next.translations),null);
  assert.equal(person.influence.rationales.en,'Reason');
});
test('migration rejects stale, missing, or conflicting legacy content without changing input',()=>{
  assert.throws(()=>migrateInfluence({...person,summary:'修改'}, {en:legacy}),/stale/);
  const missing=structuredClone(person);delete missing.influence.rationales.en;
  assert.throws(()=>migrateInfluence(missing,{en:{...legacy,sourceHash:sourceHash(missing)}}),/missing legacy reason/);
  const conflicting=structuredClone(person);conflicting.influence.rationaleEn='Different';
  assert.throws(()=>migrateInfluence(conflicting,{en:{...legacy,sourceHash:sourceHash(conflicting)}}),/conflicting English/);
});
