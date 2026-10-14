// BTS names airlines by their legal entity ("Hyannis Air Service, Inc. dba Cape Air"). shortName gives the name
// people know, for labels with little room; the full name stays in tooltips and on the airline's own page.

const DBA = /\s*,?\s*(?:d\/b\/a\/?|d\/ba|dba|t\/a)\s+/i;
const FORMER = /\s+f\/k\/a\s+.*$/i;
// a trade name that is another airline's brand says less about who flew than the legal name does
const MAINLINE_BRANDS = /^(united|delta|american|us airways|alaska)\b/i;
const SA = String.raw`s\.?\s?a\.?(?:\s*de\s*c\.?\s?v\.?)?`;
const LEGAL_ENDINGS = new RegExp(String.raw`(?:[\s,]+(?:inc\.?|incorporated|llc|l\.l\.c\.|ltda?\.?|limited|corp\.?|corporation|co\.|plc|gmbh|mbh|pty\.?|pte\.?|n\.v\.|nv|${SA}|s\.p\.a\.?|a\/s|ag))+[\s.,]*$`, 'i');
const ROOMY = 28;

export function shortName(full) {
  let name = String(full ?? '').trim();
  if (!name) return name;
  name = name
    .replace(/\s*\(incl\..*\)\s*$/, '')
    .replace(/\s*\(subsidiary[^)]*\)\s*$/i, '')
    .replace(/\s*\((?:[^)]{1,6})\)\s*$/, (m) => (name.length > m.length ? '' : m))
    .replace(FORMER, '');
  const parts = name.split(DBA);
  if (parts.length > 1) {
    const brand = parts[1].replace(LEGAL_ENDINGS, '').trim();
    name = brand.length >= 6 && !MAINLINE_BRANDS.test(brand) ? brand : parts[0];
  }
  let out = name.replace(LEGAL_ENDINGS, '').replace(/[\s,.]+$/, '').replace(/\s{2,}/g, ' ').trim() || name;
  const volaris = out.match(/^(.{20,}?)\s*\(([A-Za-z]{5,})\)$/);
  if (volaris && out.length > ROOMY) out = volaris[2];
  if (out.length > ROOMY) out = out.replace(/\bInternational\b/g, 'Intl');
  return out;
}

// Short names for a set of full names. Two airlines that would share a short name keep their full names.
export function shortNames(fullNames) {
  const unique = [...new Set(fullNames)];
  const shorts = new Map(unique.map((n) => [n, shortName(n)]));
  const uses = new Map();
  for (const s of shorts.values()) uses.set(s, (uses.get(s) || 0) + 1);
  for (const [n, s] of shorts) if (uses.get(s) > 1) shorts.set(n, n);
  return shorts;
}
