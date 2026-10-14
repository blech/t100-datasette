import { THEMES, THEME_ORDER, resolveTheme } from '../globe/src/themes.js';
import { decorate, replaceSearch } from './src/state.js';

const root = document.documentElement.style;

function stored() {
  try { return localStorage.getItem('t100-theme'); } catch (e) { return null; }
}

function paint(id) {
  const t = THEMES[id];
  root.setProperty('--bg', t.bg);
  root.setProperty('--fg', t.ui.fg);
  root.setProperty('--muted', t.ui.muted);
  root.setProperty('--panel', t.ui.panel);
  root.setProperty('--accent', t.ui.accent);
  root.setProperty('--line', `color-mix(in srgb, ${t.ui.fg} 18%, ${t.bg})`);
  document.documentElement.style.colorScheme = id === 'night' || id === 'natural' || id === 'airtrailDark' ? 'dark' : 'light';
}

// Links keep the visitor's settings: refreshed just before they are used, so hover previews,
// middle-clicks and copied links are right even for links drawn later (chart cells, table rows).
function carry(a) {
  const attr = a.hasAttribute('href') ? 'href' : 'xlink:href';
  const current = a.getAttribute(attr);
  if (current === null) return;
  const previous = (a.dataset.carried || '').split(',').filter(Boolean);
  const { href, keys } = decorate(current, location.search, previous);
  if (href !== current) a.setAttribute(attr, href);
  a.dataset.carried = keys.join(',');
}

let themeId = resolveTheme(location.search, stored(), matchMedia('(prefers-color-scheme: dark)').matches);
paint(themeId);

const select = document.getElementById('theme');
for (const id of THEME_ORDER) select.append(new Option(THEMES[id].label, id));
select.value = themeId;
select.addEventListener('change', () => {
  themeId = select.value;
  paint(themeId);
  try { localStorage.setItem('t100-theme', themeId); } catch (e) { /* storage may be unavailable */ }
  const search = replaceSearch(location.search, ['theme'], themeId === 'paper' ? '' : `?theme=${themeId}`);
  history.replaceState(null, '', `${location.pathname}${search}`);
  document.dispatchEvent(new CustomEvent('t100:theme', { detail: { id: themeId } }));
  for (const a of document.querySelectorAll('a[href]')) carry(a);
});

for (const a of document.querySelectorAll('a[href]')) carry(a);
for (const type of ['pointerover', 'pointerdown', 'focusin', 'contextmenu']) {
  document.addEventListener(type, (e) => {
    const a = e.target.closest?.('a');
    if (a) carry(a);
  }, true);
}
