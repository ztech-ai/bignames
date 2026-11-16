import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateWithinCapacity,allocateByTier} from '../scripts/batch-allocation.mjs';

test('domain scarcity redistributes places within the highest tier',()=>{
  const capacities={technology:105,business:78,politics:61,culture:52,science:11,literature:3,arts:1,sports:87};
  assert.deepEqual(allocateWithinCapacity(capacities,100),{technology:17,business:17,politics:17,culture:17,science:11,literature:3,arts:1,sports:17});
});
test('empty domains do not cause lower-tier fill or lost places',()=>{
  assert.deepEqual(allocateWithinCapacity({technology:30,business:30,arts:0},5),{technology:3,business:2,arts:0});
  assert.deepEqual(allocateWithinCapacity({technology:30,business:30,arts:0},5,['business','technology','arts']),{business:3,technology:2,arts:0});
});
test('invalid or insufficient capacities fail instead of fabricating candidates',()=>{
  assert.throws(()=>allocateWithinCapacity({science:2,arts:1},4),/Insufficient/);
  for(const capacities of [{science:-1},{science:1.5},{science:NaN}])assert.throws(()=>allocateWithinCapacity(capacities,0),/nonnegative/);
  assert.throws(()=>allocateWithinCapacity({science:2,arts:1},1,['science']),/every/);
  assert.throws(()=>allocateWithinCapacity({science:2,arts:1},1,['science','science']),/duplicates/);
});

test('higher influence tiers are exhausted before lower tiers balance cumulative domains',()=>{
  const input=[{stars:3,domainCapacities:{technology:20,culture:20}},{stars:4,domainCapacities:{technology:5,culture:0}}];
  const result=allocateByTier(input,10,['technology','culture']);
  assert.deepEqual(result.domains,{technology:5,culture:5});
  assert.deepEqual(result.tiers.map(t=>[t.stars,t.selectedCount,t.domains]),[[4,5,{technology:5,culture:0}],[3,5,{technology:0,culture:5}]]);
  assert.equal(input[0].stars,3,'Input order is not mutated');
});
test('a sufficient highest tier prevents any lower-tier selection',()=>{
  const result=allocateByTier([{stars:4,domainCapacities:{business:5,arts:1}},{stars:3,domainCapacities:{business:10,arts:20}}],4,['arts','business']);
  assert.deepEqual(result.domains,{arts:1,business:3});assert.equal(result.tiers.length,1);assert.equal(result.tiers[0].stars,4);
});
test('tiered allocation preserves scarce domains and deterministic domain priority',()=>{
  const tiers=[{stars:4,domainCapacities:{technology:4,politics:1,arts:0}},{stars:3,domainCapacities:{technology:2,politics:4,arts:1}}];
  assert.deepEqual(allocateByTier(tiers,9,['technology','politics','arts']).domains,{technology:4,politics:4,arts:1});
  assert.deepEqual(allocateByTier(tiers,0,['technology','politics','arts']).tiers,[]);
});
test('invalid or insufficient influence tiers are rejected',()=>{
  const valid={stars:4,domainCapacities:{technology:1}};
  for(const tiers of [[],[valid,valid],[{...valid,stars:6}],[{...valid,domainCapacities:{technology:-1}}],[{...valid,domainCapacities:{technology:1.5}}]])assert.throws(()=>allocateByTier(tiers,1,['technology']));
  assert.throws(()=>allocateByTier([valid],2,['technology']),/Insufficient/);
  assert.throws(()=>allocateByTier([valid],1,['business']),/every/);
});
