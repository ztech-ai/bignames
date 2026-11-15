import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateWithinCapacity} from '../scripts/batch-allocation.mjs';

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
