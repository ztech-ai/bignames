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

test('bundled image licenses allow only a local plain-text license asset',()=>{
  const photo={kind:'photo',src:'assets/portraits/example.jpg',alt:'Example',credit:'Author',license:'GFDL 1.2+',licenseUrl:'https://www.gnu.org/licenses/old-licenses/fdl-1.2.html',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg'};
  validateImageMetadata({...photo,licenseText:'assets/licenses/GFDL-1.2.txt'},'example');
  for(const licenseText of ['../license.txt','assets/licenses/../secret.txt','https://example.com/license.txt','assets/licenses/license.html'])assert.throws(()=>validateImageMetadata({...photo,licenseText},'example'),/unsafe bundled license path/);
});
