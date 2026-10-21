// One way to write a measured count anywhere on the site: three significant figures, words in prose
// ("51.5 million", "1.11 billion"), and one unit, × 10⁶, wherever numbers sit side by side (tables, tooltips,
// axes) so they compare by length. The rules: docs/superpowers/specs/2026-10-20-number-precision-design.md.
// plugins/t100_globe.py prose_count() follows the same rules; tests/fixtures/number_formats.json holds both to them.

export const MILLIONS = ' × 10⁶';
const LB_PER_SHORT_TON = 2000;

const toNumber = (n) => (n === null || n === undefined || n === '' ? NaN : Number(n));
const round3 = (v) => (v === 0 ? 0 : Number(v.toPrecision(3)));
const digits = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function formatCount(n, form = 'dense') {
  const v = toNumber(n);
  if (Number.isNaN(v)) return '–';
  const sign = v < 0 ? '-' : '';
  const r = round3(Math.abs(v)); // round first, so 999,999 is a million, not 1,000 thousand
  if (r < 1e6) return sign + digits(r);
  if (form === 'prose') {
    return r < 1e9
      ? `${sign}${Number((r / 1e6).toPrecision(3))} million`
      : `${sign}${digits(Number((r / 1e9).toPrecision(3)))} billion`;
  }
  const m = r / 1e6;
  return sign + (m < 1000 ? m.toPrecision(3) : digits(Math.round(m))) + MILLIONS;
}

export const countLabel = (n) => formatCount(n, 'prose');

export function exactCount(n) {
  const v = toNumber(n);
  return Number.isNaN(v) ? '–' : Math.round(v).toLocaleString('en-US');
}

export function formatTons(pounds, form = 'dense') {
  const v = toNumber(pounds);
  return Number.isNaN(v) ? '–' : `${formatCount(v / LB_PER_SHORT_TON, form)} tons`;
}

// a Plot axis or colour legend: plain millions with "(× 10⁶)" on the label when the domain reaches a million
export function millionsAxis(max, label) {
  if (!(max >= 1e6)) return { label, tickFormat: (v) => digits(v) };
  return { label: `${label} (× 10⁶)`, tickFormat: (v) => digits(v / 1e6) };
}

// a table cell's contents: the dense form for the eye, the prose form for a screen reader
export function spokenCount(shown, spoken, doc = document) {
  const seen = doc.createElement('span');
  seen.setAttribute('aria-hidden', 'true');
  seen.textContent = shown;
  const heard = doc.createElement('span');
  heard.className = 'visually-hidden';
  heard.textContent = spoken;
  return [seen, heard];
}
