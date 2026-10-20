// Colours taken from the AirTrail app (src/app.css and the OpenFreeMap positron/dark basemap styles):
// land is the style's background, ocean its water fill, trails the app's primary blue, airports its emerald.
export const THEMES = {
  light: {
    id: 'light', label: 'Light', dark: false,
    bg: '#ffffff', ocean: '#c2c8ca', land: '#f2f3f0', coast: '#c2c8ca',
    trail: '59,130,246', settledAlpha: 0.35, activeAlpha: 0.95, dot: '#10b981',
    glow: null, outline: null,
    ui: { fg: '#09090b', muted: '#71717a', panel: 'rgba(255,255,255,0.85)', accent: '#3b82f6' },
  },
  dark: {
    id: 'dark', label: 'Dark', dark: true,
    bg: '#09090b', ocean: '#1b1b1d', land: '#0c0c0c', coast: '#1b1b1d',
    trail: '59,130,246', settledAlpha: 0.4, activeAlpha: 0.95, dot: '#10b981',
    glow: null, outline: null,
    ui: { fg: '#fafafa', muted: '#a1a1aa', panel: 'rgba(9,9,11,0.8)', accent: '#3b82f6' },
  },
};

export const DEFAULT_THEME = 'light';
export const THEME_ORDER = ['light', 'dark'];

const valid = (id) => typeof id === 'string' && Object.hasOwn(THEMES, id);

// An explicit choice (query, then stored) wins; otherwise follow the system's dark mode.
export function resolveTheme(search, stored, prefersDark = false) {
  const choice = themeChoice(search, stored);
  if (choice !== 'auto') return choice;
  return prefersDark ? 'dark' : DEFAULT_THEME;
}

// What the picker shows: a theme chosen in the query or in storage, or 'auto' to follow the system.
export function themeChoice(search, stored) {
  const q = new URLSearchParams(search || '').get('theme');
  if (valid(q)) return q;
  if (valid(stored)) return stored;
  return 'auto';
}
