import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageMetadata,hasPortrait } from '../scripts/image-core.mjs';

test('a missing portrait needs an explicit exception and cannot claim a photograph or license',()=>{
  const placeholder={kind:'placeholder',status:'awaiting-permission',approvedBy:'user',reason:'Awaiting licensed portrait',verifiedAt:'2026-11-13'};
  validateImageMetadata(placeholder,'example');assert.equal(hasPortrait(placeholder),false);
  assert.throws(()=>validateImageMetadata({...placeholder,approvedBy:undefined},'example'),/explicit editorial exception/);
  assert.throws(()=>validateImageMetadata({...placeholder,license:'CC BY'},'example'),/must not claim/);
  assert.throws(()=>validateImageMetadata({...placeholder,src:'assets/portraits/example.jpg'},'example'),/must not claim/);
  assert.throws(()=>validateImageMetadata({...placeholder,zoom:3},'example'),/must not claim/);
  assert.throws(()=>validateImageMetadata({kind:'photo',src:'assets/portraits/example.jpg'},'example'),/incomplete image provenance/);
});

test('bundled image licenses allow only a local plain-text license asset',()=>{
  const photo={kind:'photo',src:'assets/portraits/example.jpg',alt:'Example',credit:'Author',license:'GFDL 1.2+',licenseUrl:'https://www.gnu.org/licenses/old-licenses/fdl-1.2.html',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg'};
  validateImageMetadata({...photo,licenseText:'assets/licenses/GFDL-1.2.txt'},'example');
  for(const licenseText of ['../license.txt','assets/licenses/../secret.txt','https://example.com/license.txt','assets/licenses/license.html'])assert.throws(()=>validateImageMetadata({...photo,licenseText},'example'),/unsafe bundled license path/);
});

test('required photographer links accept HTTP(S) and reject unsafe URLs or placeholder claims',()=>{
  const photo={kind:'photo',src:'assets/portraits/example.jpg',alt:'Example',credit:'Author',license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',sourceUrl:'https://commons.wikimedia.org/wiki/File:Example.jpg'};
  validateImageMetadata({...photo,creditUrl:'https://photographer.example/'},'example');
  for(const creditUrl of ['javascript:alert(1)','data:text/html,test','/author','',null])assert.throws(()=>validateImageMetadata({...photo,creditUrl},'example'),/invalid image credit URL/);
  const placeholder={kind:'placeholder',status:'awaiting-permission',approvedBy:'user',reason:'Awaiting licensed portrait',verifiedAt:'2026-11-13',creditUrl:'https://photographer.example/'};
  assert.throws(()=>validateImageMetadata(placeholder,'example'),/must not claim/);
});

test('portrait zoom requires bounded numeric scale and an explicit safe focal point',()=>{
  const photo={kind:'photo',src:'assets/portraits/example.jpg',alt:'Example',credit:'Author',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',sourceUrl:'https://example.com/photo'};
  validateImageMetadata({...photo,zoom:3,position:'46.5% 23.5%'},'example');
  for(const zoom of [0,-1,6.01,'3',Infinity,NaN,null])assert.throws(()=>validateImageMetadata({...photo,zoom,position:'50% 25%'},'example'),/zoom must be a number/);
  for(const position of [undefined,'center','101% 50%','-1% 50%','50% 20%;transform:rotate(90deg)'])assert.throws(()=>validateImageMetadata({...photo,zoom:3,position},'example'),/zoom requires a percentage/);
});
