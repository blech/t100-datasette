import { THEMES, THEME_ORDER, DEFAULT_THEME, themeChoice } from '../globe/src/themes.js';
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
  root.setProperty('--rule', `color-mix(in srgb, ${t.ui.fg} 45%, ${t.bg})`);
  document.documentElement.style.colorScheme = t.dark ? 'dark' : 'light';
  document.documentElement.dataset.scheme = t.dark ? 'dark' : 'light';
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

// 'auto' follows the system's dark mode, live; a chosen theme is remembered and kept in the URL
const systemDark = matchMedia('(prefers-color-scheme: dark)');
let choice = themeChoice(location.search, stored());
const current = () => (choice === 'auto' ? (systemDark.matches ? 'dark' : DEFAULT_THEME) : choice);
paint(current());

function apply() {
  paint(current());
  document.dispatchEvent(new CustomEvent('t100:theme', { detail: { id: current(), choice } }));
  for (const a of document.querySelectorAll('a[href]')) carry(a);
}

const select = document.getElementById('theme');
select.append(new Option('Auto', 'auto'));
for (const id of THEME_ORDER) select.append(new Option(THEMES[id].label, id));
select.value = choice;
select.addEventListener('change', () => {
  choice = select.value;
  try {
    if (choice === 'auto') localStorage.removeItem('t100-theme');
    else localStorage.setItem('t100-theme', choice);
  } catch (e) { /* storage may be unavailable */ }
  const search = replaceSearch(location.search, ['theme'], choice === 'auto' ? '' : `?theme=${choice}`);
  history.replaceState(null, '', `${location.pathname}${search}`);
  apply();
});
systemDark.addEventListener('change', () => { if (choice === 'auto') apply(); });

for (const a of document.querySelectorAll('a[href]')) carry(a);
for (const type of ['pointerover', 'pointerdown', 'focusin', 'contextmenu']) {
  document.addEventListener(type, (e) => {
    const a = e.target.closest?.('a');
    if (a) carry(a);
  }, true);
}
