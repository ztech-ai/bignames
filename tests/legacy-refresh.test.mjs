import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyExpectedBlobs} from '../scripts/legacy-refresh.mjs';
const before='a'.repeat(40),after='b'.repeat(40),baseline={profiles:[{id:'example',blob:before}]};
const refresh={id:'legacy24-career-refresh',status:'complete',authorization:{source:'explicit-user-request',instruction:'先更新最早的24人履历'},profiles:[{id:'example',beforeBlob:before,afterBlob:after}]};
test('legacy data remains frozen without an authorized revision',()=>assert.equal(legacyExpectedBlobs(baseline,null).get('example'),before));
test('a completed revision preserves the old baseline and pins new content',()=>{assert.equal(legacyExpectedBlobs(baseline,refresh).get('example'),after);assert.equal(baseline.profiles[0].blob,before);});
test('incomplete, expanded or unanchored refresh records cannot waive legacy protection',()=>{
  for(const r of [{...refresh,status:'in-progress'},{...refresh,authorization:{}},{...refresh,profiles:[]},{...refresh,profiles:[{id:'other',beforeBlob:before,afterBlob:after}]},{...refresh,profiles:[{id:'example',beforeBlob:after,afterBlob:after}]}])assert.throws(()=>legacyExpectedBlobs(baseline,r));
});
