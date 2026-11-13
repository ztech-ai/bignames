export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function yearOf(date) {
  const match = /^(-?\d{4})/.exec(date ?? '');
  return match ? Number(match[1]) : NaN;
}
export function dateLabel(date) {
  if (!date) return '';
  const year = yearOf(date);
  if (year < 0) return `公元前${Math.abs(year)}年`;
  return String(date).split('-').map((s,i) => `${Number(s)}${['年','月','日'][i] ?? ''}`).join('');
}
export function lifeStatus(person) {
  if (person.death === null) return 'living';
  if (typeof person.death === 'string' && /^-?\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(person.death)) return 'deceased';
  throw new Error(`${person.id ?? person.name ?? 'Person'}: death must be null (living) or a documented death date`);
}
export function lifeLabel(person) {
  const year = value => yearOf(value) < 0 ? `公元前${Math.abs(yearOf(value))}` : String(yearOf(value));
  return `${year(person.birth)} — ${lifeStatus(person) === 'deceased' ? year(person.death) : '今'}`;
}
export function timelineOrder(a, b) {
  const number = d => {
    const match = /^(-?\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(d);
    return match ? Number(match[1]) * 10000 + Number(match[2] ?? 0) * 100 + Number(match[3] ?? 0) : NaN;
  };
  return number(b.date) - number(a.date);
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
