import assert from 'node:assert/strict';

// Retain the original collection baseline; accept only an explicitly recorded,
// completed revision of exactly those biographies, never a blanket bypass.
export function legacyExpectedBlobs(baseline,refresh){
  if(!refresh)return new Map(baseline.profiles.map(p=>[p.id,p.blob]));
  assert.equal(refresh.id,'legacy24-career-refresh');
  assert.equal(refresh.status,'complete','Legacy refresh must be completed before publication');
  assert.equal(refresh.authorization?.source,'explicit-user-request');
  assert.equal(refresh.authorization?.instruction,'先更新最早的24人履历');
  assert.equal(refresh.profiles.length,baseline.profiles.length);
  const rows=new Map(refresh.profiles.map(p=>[p.id,p]));assert.equal(rows.size,baseline.profiles.length);
  for(const previous of baseline.profiles){
    const next=rows.get(previous.id);assert(next,`${previous.id}: missing refresh record`);
    assert.equal(next.beforeBlob,previous.blob,`${previous.id}: original baseline mismatch`);
    assert.match(next.afterBlob,/^[a-f0-9]{40}$/);
  }
  return new Map(refresh.profiles.map(p=>[p.id,p.afterBlob]));
}
