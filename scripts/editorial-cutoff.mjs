import assert from 'node:assert/strict';

function day(value) {
  assert(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'Editorial cutoff must be a calendar day');
  const date=new Date(`${value}T00:00:00Z`);
  assert(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value,'Editorial cutoff must be a valid calendar day');
  return value;
}

// Raw research keeps its original date. Only people explicitly included in a
// completed editorial batch may acquire that batch's later factual cutoff.
export function completedBatchCutoffs(collection,batches,today=new Date().toISOString().slice(0,10)) {
  day(today);const original=day(collection.cutoffDate);assert(original<=today,'Research cutoff is in the future');
  const cutoffs=new Map(collection.people.map(p=>[p.id,original]));
  for(const batch of batches) {
    if(batch?.sourceCollection!==collection.id||batch.status!=='complete')continue;
    const cutoff=day(batch.cutoffDate),reviewed=day(batch.reviewedAt??cutoff);
    assert(cutoff<=reviewed&&reviewed<=today,'Completed batch cutoff exceeds its actual review day');
    assert(Array.isArray(batch.people),'Completed batch must list its people');
    const ids=new Set();
    for(const p of batch.people) {
      assert(cutoffs.has(p.id)&&!ids.has(p.id),'Completed batch has an unknown or duplicate person');ids.add(p.id);
      if(cutoff>cutoffs.get(p.id))cutoffs.set(p.id,cutoff);
    }
  }
  return cutoffs;
}

export function assertProfileCutoff(person,cutoff) {
  day(cutoff);day(person.verifiedAt);
  assert(cutoff<=person.verifiedAt,`${person.id}: factual cutoff exceeds actual profile review day`);
  for(const event of person.timeline)assert(event.date.startsWith('-')||event.date<=cutoff.slice(0,event.date.length),`${person.id}: event after editorial cutoff`);
}
