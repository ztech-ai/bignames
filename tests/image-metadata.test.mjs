import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageMetadata,hasPortrait } from '../scripts/image-core.mjs';

test('a missing portrait needs an explicit exception and cannot claim a photograph or license',()=>{
  const placeholder={kind:'placeholder',status:'awaiting-permission',approvedBy:'user',reason:'Awaiting licensed portrait',verifiedAt:'2026-11-13'};
  validateImageMetadata(placeholder,'example');assert.equal(hasPortrait(placeholder),false);
  assert.throws(()=>validateImageMetadata({...placeholder,approvedBy:undefined},'example'),/explicit editorial exception/);
  assert.throws(()=>validateImageMetadata({...placeholder,license:'CC BY'},'example'),/must not claim/);
  assert.throws(()=>validateImageMetadata({...placeholder,src:'assets/portraits/example.jpg'},'example'),/must not claim/);
  assert.throws(()=>validateImageMetadata({kind:'photo',src:'assets/portraits/example.jpg'},'example'),/incomplete image provenance/);
});
