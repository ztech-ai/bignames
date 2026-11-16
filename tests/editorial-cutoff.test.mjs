import test from 'node:test';
import assert from 'node:assert/strict';
import {completedBatchCutoffs,assertProfileCutoff} from '../scripts/editorial-cutoff.mjs';

const collection={id:'contemporary-1000',cutoffDate:'2026-11-13',people:[{id:'new-person'},{id:'earlier-person'}]};
const completed={sourceCollection:collection.id,status:'complete',cutoffDate:'2026-11-16',reviewedAt:'2026-11-16',people:[{id:'new-person'}]};
const profile=(id,date,verifiedAt='2026-11-16')=>({id,verifiedAt,timeline:[{date}]});

test('a completed later batch admits new facts without redating earlier profiles or raw research',()=>{
  const cutoffs=completedBatchCutoffs(collection,[completed],'2026-11-16');
  assertProfileCutoff(profile('new-person','2026-11-15'),cutoffs.get('new-person'));
  assert.throws(()=>assertProfileCutoff(profile('earlier-person','2026-11-15'),cutoffs.get('earlier-person')),/event after editorial cutoff/);
  assert.equal(collection.cutoffDate,'2026-11-13');
  assert.equal(completed.cutoffDate,'2026-11-16');
});

test('incomplete or unrelated batches cannot authorize a newer factual cutoff',()=>{
  for(const batch of [{...completed,status:'in-progress'},{...completed,sourceCollection:'another-collection'}]){
    const cutoff=completedBatchCutoffs(collection,[batch],'2026-11-16').get('new-person');
    assert.throws(()=>assertProfileCutoff(profile('new-person','2026-11-15'),cutoff),/event after editorial cutoff/);
  }
});

test('future events and an unreviewed later cutoff remain blocked with date precision preserved',()=>{
  const cutoff=completedBatchCutoffs(collection,[completed],'2026-11-16').get('new-person');
  assertProfileCutoff(profile('new-person','2026-11'),cutoff);
  assertProfileCutoff(profile('new-person','2026'),cutoff);
  assert.throws(()=>assertProfileCutoff(profile('new-person','2026-11-17'),cutoff),/event after editorial cutoff/);
  assert.throws(()=>assertProfileCutoff(profile('new-person','2026-11-15','2026-11-13'),cutoff),/exceeds actual profile review/);
});

test('invalid completed dates and unexpected people fail before a cutoff is granted',()=>{
  for(const batch of [{...completed,cutoffDate:'2026-02-30'},{...completed,cutoffDate:'2026-11-17'},{...completed,reviewedAt:'2026-11-17'},{...completed,people:[{id:'unknown'}]},{...completed,people:[{id:'new-person'},{id:'new-person'}]}])assert.throws(()=>completedBatchCutoffs(collection,[batch],'2026-11-16'));
});
