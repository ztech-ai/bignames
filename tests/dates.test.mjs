import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, timelineOrder, yearOf, safeUrl, escapeHtml, lifeLabel } from '../scripts/utils.mjs';

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
test('untrusted editorial text is escaped and unsafe source protocols are rejected',()=> {
  assert.equal(safeUrl('javascript:alert(1)'),'');
  assert.equal(safeUrl('data:text/html,hello'),'');
  assert.equal(safeUrl('https://example.com/a'),'https://example.com/a');
  assert.equal(escapeHtml('<img src="x" onerror=\'bad()\'> &'), '&lt;img src=&quot;x&quot; onerror=&#39;bad()&#39;&gt; &amp;');
});
