import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, timelineOrder, yearOf, safeUrl, escapeHtml, lifeLabel, birthYearValues } from '../scripts/utils.mjs';

test('BCE biography sorts and formats without JavaScript Date interpretation',()=> {
  const events=[{date:'-0551'},{date:'-0479'},{date:'2025-01-20'},{date:'2025-01-01'}];
  assert.deepEqual(events.sort(timelineOrder).map(x=>x.date),['2025-01-20','2025-01-01','-0479','-0551']);
  assert.equal(dateLabel('-0551'),'公元前551年');
  assert.equal(lifeLabel({birth:'-0551',death:'-0479'}),'公元前551 — 公元前479');
  assert.equal(yearOf('1815-12-10'),1815);
});
test('partial milestone dates retain their documented precision',()=> {
  assert.equal(dateLabel('1993'),'1993年');
  assert.equal(dateLabel('1993-04'),'1993年4月');
  assert.equal(dateLabel('1993-04-05'),'1993年4月5日');
});
test('disputed birth years remain alternatives without an invented exact date',()=>{
  assert.deepEqual(birthYearValues({birth:'1951-03'}),[1951]);
  const person={birth:null,birthYears:[1951,1952],death:null};
  assert.deepEqual(birthYearValues(person),[1951,1952]);
  assert.equal(lifeLabel(person),'1951 / 1952 — 今');
  assert.equal(lifeLabel({birth:null,birthYears:[1982,1983,1984],death:null}),'1982 / 1983 / 1984 — 今');
  for(const invalid of [{birth:null},{birth:null,birthYears:[1951]},{birth:null,birthYears:[1952,1951]},{birth:null,birthYears:[1951,1951]},{birth:null,birthYears:[1951,'1952']},{birth:'1951',birthYears:[1951,1952]}])assert.throws(()=>birthYearValues(invalid),/birth must/);
});
test('untrusted editorial text is escaped and unsafe source protocols are rejected',()=> {
  assert.equal(safeUrl('javascript:alert(1)'),'');
  assert.equal(safeUrl('data:text/html,hello'),'');
  assert.equal(safeUrl('https://example.com/a'),'https://example.com/a');
  assert.equal(escapeHtml('<img src="x" onerror=\'bad()\'> &'), '&lt;img src=&quot;x&quot; onerror=&#39;bad()&#39;&gt; &amp;');
});
test('explicitly unknown birth stays unknown independently of life status',()=>{
  const person={birth:null,birthUnknown:true,death:null};
  assert.deepEqual(birthYearValues(person),[]);
  assert.equal(lifeLabel(person),'未详 — 今');
  assert.equal(lifeLabel({...person,death:'2020'}),'未详 — 2020');
  for(const invalid of [{birth:null},{birth:null,birthUnknown:false},{birth:'1963',birthUnknown:true},{birth:null,birthUnknown:true,birthYears:[1963,1964]}])assert.throws(()=>birthYearValues(invalid),/birth must/);
});
