import assert from 'node:assert/strict';

export function validateInfluence(influence, id, { required = false, minimum = 1, cutoff = '2026-11-13' } = {}) {
  if (!influence) {
    assert(!required, `${id}: missing influence assessment`);
    return;
  }
  assert(Number.isInteger(influence.stars) && influence.stars >= minimum && influence.stars <= 5, `${id}: invalid influence stars`);
  assert(['global', 'field', 'regional'].includes(influence.scope), `${id}: invalid influence scope`);
  assert(typeof influence.rationale === 'string' && influence.rationale.trim().length >= 10, `${id}: missing influence rationale`);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(influence.assessedAt) && influence.assessedAt <= cutoff, `${id}: invalid influence assessment date`);
  assert.equal(influence.methodVersion, '1.0', `${id}: unknown influence method`);
  assert(['provisional', 'reviewed'].includes(influence.reviewStatus), `${id}: invalid influence review status`);
  if (influence.reviewStatus === 'reviewed') {
    assert(Array.isArray(influence.sourceUrls) && influence.sourceUrls.length >= 1, `${id}: reviewed rating needs evidence`);
    for (const url of influence.sourceUrls) assert(/^https:\/\//.test(url), `${id}: invalid influence source URL`);
  }
}
