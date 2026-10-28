// Every data colour on the site, by role, for the light and dark themes. Ember (deep red to sand) is the family;
// the choices and why: docs/superpowers/specs/2026-10-21-colour-design.md. Matrices (YlOrRd) and the front page's
// airline liveries are deliberately outside it.

export const PALETTE = {
  light: {
    series: ['#7f1d1d', '#9e261f', '#be301e', '#d44c23', '#e36d2a', '#ef9048', '#f7bb82', '#fae4b8'],
    other: '#a1a1aa',
    service: { domestic: '#0d9488', international: '#e36d2a' },
    kind: { passenger: '#e36d2a', freight: '#64748b' },
    single: '#e36d2a',
    engines: ['#be301e', '#ef9048', '#fae4b8', '#969696', '#d0d0d0'],
    change: { added: '#4dac26', dropped: '#c51b7d', between: '#3f3f46' },
    accent: '#e36d2a',
  },
  // lifted: starts brighter and stops short of the palest sand, so nothing sinks into the black or glares
  dark: {
    series: ['#c53a2a', '#d04d2c', '#da5f2d', '#e4712f', '#ec863f', '#f0a05c', '#f3b976', '#f5d290'],
    other: '#a1a1aa',
    service: { domestic: '#2bb39a', international: '#ec863f' },
    kind: { passenger: '#ec863f', freight: '#94a3b8' },
    single: '#ec863f',
    engines: ['#da5f2d', '#f0a05c', '#f5d290', '#8a8a8a', '#5e5e5e'],
    change: { added: '#4dac26', dropped: '#c51b7d', between: '#e4e4e7' },
    accent: '#ec863f',
  },
};

export const palette = (dark) => (dark ? PALETTE.dark : PALETTE.light);

// a Plot colour scale for stacked series, biggest first. Fewer series than steps are spread evenly across the whole
// ramp (four series take steps 0, 2, 5 and 7), so neighbours sit as far apart as they can; more than eight reuse the
// last step. "Other" is grey and doesn't count towards the spread.
export function seriesColours(series, dark) {
  const p = palette(dark);
  const last = p.series.length - 1;
  const n = series.filter((s) => s !== 'Other').length;
  const step = (i) => (n > p.series.length ? Math.min(i, last) : n <= 1 ? 0 : Math.round((i * last) / (n - 1)));
  let i = 0;
  const range = series.map((s) => (s === 'Other' ? p.other : p.series[step(i++)]));
  return { domain: series, range };
}

// the page's theme as the nav script set it, or the system's before it has run
export function isDark() {
  const scheme = globalThis.document?.documentElement?.dataset?.scheme;
  if (scheme) return scheme === 'dark';
  return Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
}
