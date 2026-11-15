import assert from 'node:assert/strict';

// Equal rounds, stopping at each domain's remaining highest-tier capacity.
// This never substitutes a lower influence tier to fill a domain quota.
export function allocateWithinCapacity(capacities,count,priority=Object.keys(capacities)){
  assert(Number.isInteger(count)&&count>=0,'Batch size must be a nonnegative integer');
  assert(priority.length===new Set(priority).size,'Domain priority contains duplicates');
  assert.deepEqual([...priority].sort(),Object.keys(capacities).sort(),'Priority must cover every capacity domain');
  for(const capacity of Object.values(capacities))assert(Number.isInteger(capacity)&&capacity>=0,'Domain capacities must be nonnegative integers');
  assert(count<=Object.values(capacities).reduce((a,b)=>a+b,0),'Insufficient eligible highest-tier capacity');
  const result=Object.fromEntries(priority.map(d=>[d,0]));
  let assigned=0;
  while(assigned<count)for(const domain of priority){
    if(assigned===count)break;
    if(result[domain]<capacities[domain]){result[domain]++;assigned++;}
  }
  return result;
}
