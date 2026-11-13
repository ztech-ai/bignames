import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInfluence } from '../scripts/influence.mjs';

const rating = {stars:4,scope:'field',rationale:'在多个国家的技术实践中产生了持续、可说明的影响。',assessedAt:'2026-11-13',methodVersion:'1.0',reviewStatus:'provisional'};
test('legacy biographies remain valid without a new editorial rating', () => {
  assert.doesNotThrow(()=>validateInfluence(undefined,'legacy'));
  assert.throws(()=>validateInfluence(undefined,'new',{required:true}),/missing/);
});
test('candidate impact threshold rejects padding and invalid ranges', () => {
  assert.doesNotThrow(()=>validateInfluence(rating,'example',{required:true,minimum:3}));
  for (const stars of [0,2,3.5,6]) assert.throws(()=>validateInfluence({...rating,stars},'example',{minimum:3}),/stars/);
});
test('reviewed assessments require evidence and cannot be postdated', () => {
  assert.throws(()=>validateInfluence({...rating,reviewStatus:'reviewed'},'example'),/evidence/);
  assert.throws(()=>validateInfluence({...rating,assessedAt:'2026-11-30'},'example'),/date/);
  assert.doesNotThrow(()=>validateInfluence({...rating,reviewStatus:'reviewed',sourceUrls:['https://example.org/biography']},'example'));
});
