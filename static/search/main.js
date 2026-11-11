import { fetchRows } from '../globe/src/api.js';
import { searchUrl, groupResults, moveSelection } from './src/search.js';

// The header's search: a panel that finds an airport, airline or aircraft as you type and opens its page. Built on first use.
const opener = document.getElementById('search-open');
const DEBOUNCE_MS = 120;
let dialog;
let input;
let results;
let status;
let links = [];
let selected = 0;
let latest = 0;
let timer;

const el = (tag, props = {}, ...children) => { const e = Object.assign(document.createElement(tag), props); e.append(...children); return e; };

function build() {
  input = el('input', { type: 'search', placeholder: 'Airport, airline or aircraft: KEF, Reykjavik, Delta, Airbus A340', autocomplete: 'off', spellcheck: false });
  input.setAttribute('aria-label', 'Search airports, airlines and aircraft');
  status = el('p', { className: 'search-status' });
  status.setAttribute('aria-live', 'polite');
  results = el('div', { className: 'search-results' });
  dialog = el('dialog', { id: 'search-dialog', className: 'search-dialog' }, input, status, results);
  dialog.setAttribute('aria-label', 'Search');
  document.body.append(dialog);
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, DEBOUNCE_MS); });
  input.addEventListener('keydown', onKey);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    opener.setAttribute('aria-expanded', 'false');
    opener.focus();
  });
  addEventListener('resize', place);
}

// On a wide window the panel hangs from the icon, its right edge under the icon's (the stylesheet centres it on a phone)
function place() {
  const box = opener.getBoundingClientRect();
  dialog.style.setProperty('--search-top', `${Math.round(box.bottom + 8)}px`);
  dialog.style.setProperty('--search-right', `${Math.max(12, Math.round(document.documentElement.clientWidth - box.right))}px`);
}

function open() {
  if (!dialog) build();
  place();
  if (!dialog.open) dialog.showModal();
  opener.setAttribute('aria-expanded', 'true');
  input.select();
}

function select(index) {
  selected = index;
  links.forEach((a, i) => {
    a.classList.toggle('selected', i === index);
    a.setAttribute('aria-selected', String(i === index));
  });
  links[index]?.scrollIntoView({ block: 'nearest' });
}

function show(rows, query) {
  const groups = groupResults(rows);
  results.replaceChildren(...groups.map((g) => el('section', {}, el('h2', { textContent: g.title }), el('ul', {}, ...g.items.map((r) => el('li', {}, el('a', { href: r.href }, el('span', { className: 'search-label', textContent: r.label }), el('span', { className: 'search-hint', textContent: r.hint }))))))));
  links = [...results.querySelectorAll('a')];
  status.textContent = !query ? '' : links.length ? '' : 'No matches';
  select(0);
}

async function run() {
  const url = searchUrl(input.value);
  const mine = ++latest;
  if (!url) { show([], ''); return; }
  try {
    const { rows } = await fetchRows(url);
    if (mine === latest) show(rows, input.value);
  } catch (err) {
    console.error(err);
    if (mine === latest) { show([], ''); status.textContent = 'Search unavailable'; }
  }
}

function onKey(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    select(moveSelection(selected, links.length, e.key));
  } else if (e.key === 'Enter' && links[selected]) {
    e.preventDefault();
    links[selected].focus(); // the header script adds the visitor's settings to a link as it gets focus
    links[selected].click();
  }
}

opener.addEventListener('click', (e) => { e.preventDefault(); open(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
  e.preventDefault();
  open();
});
