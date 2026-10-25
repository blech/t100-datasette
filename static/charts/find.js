import { FINDERS } from '/static/charts/src/find.js';
import { findAirline as findOption } from '/static/charts/src/airline.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';

// A section's find box: an airline, an airport or an aircraft, picked by name, opens its page
const input = document.getElementById('find');
const list = document.getElementById('find-list');
const finder = FINDERS[input.dataset.find];

async function main() {
  let options;
  try {
    options = finder.options((await fetchRows(queryUrl(finder.query))).rows, input.dataset.suffix || '');
  } catch (err) {
    console.error(err);
    input.disabled = true;
    input.placeholder = 'Search unavailable';
    return;
  }
  list.replaceChildren(...options.map((o) => Object.assign(document.createElement('option'), { value: o.value, label: o.hint })));
  const go = () => {
    const hit = findOption(options, input.value);
    if (hit) location.href = hit.href;
  };
  input.addEventListener('change', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

main();
