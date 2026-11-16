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

// Exhaust each available influence tier before selecting a lower one. Domain
// balance includes places already assigned by higher tiers in this batch.
export function allocateByTier(tiers,count,priority){
  assert(Array.isArray(tiers)&&tiers.length,'At least one influence tier is required');
  assert(Number.isInteger(count)&&count>=0,'Batch size must be a nonnegative integer');
  assert(Array.isArray(priority)&&priority.length&&new Set(priority).size===priority.length,'Domain priority must be nonempty and distinct');
  const seen=new Set(),ordered=[...tiers].sort((a,b)=>b.stars-a.stars);
  let available=0;
  for(const tier of ordered){
    assert(Number.isInteger(tier.stars)&&tier.stars>=1&&tier.stars<=5&&!seen.has(tier.stars),'Influence tiers must have distinct stars from1to5');seen.add(tier.stars);
    assert.deepEqual(Object.keys(tier.domainCapacities).sort(),[...priority].sort(),'Each tier must cover every priority domain');
    for(const value of Object.values(tier.domainCapacities)){assert(Number.isInteger(value)&&value>=0,'Domain capacities must be nonnegative integers');available+=value;}
  }
  assert(count<=available,'Insufficient eligible highest-tier capacity');
  const domains=Object.fromEntries(priority.map(d=>[d,0])),allocations=[];
  let remaining=count;
  for(const tier of ordered){
    if(!remaining)break;
    const selectedCount=Math.min(remaining,Object.values(tier.domainCapacities).reduce((a,b)=>a+b,0));
    const allocation=Object.fromEntries(priority.map(d=>[d,0]));
    for(let i=0;i<selectedCount;i++){
      let next;
      for(const domain of priority)if(allocation[domain]<tier.domainCapacities[domain]&&(next===undefined||domains[domain]+allocation[domain]<domains[next]+allocation[next]))next=domain;
      allocation[next]++;
    }
    for(const domain of priority)domains[domain]+=allocation[domain];
    allocations.push({stars:tier.stars,domainCapacities:{...tier.domainCapacities},selectedCount,domains:allocation});remaining-=selectedCount;
  }
  return {domains,tiers:allocations};
}
