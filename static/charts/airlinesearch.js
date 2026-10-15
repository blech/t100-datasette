import { airlineOptions, findAirline } from '/static/charts/src/airline.js';
import { queryUrl, fetchRows } from '/static/globe/src/api.js';

const input = document.getElementById('airline-search');
const list = document.getElementById('airline-list');
let options = [];

async function main() {
  try {
    options = airlineOptions((await fetchRows(queryUrl('airline_list'))).rows);
  } catch (err) {
    console.error(err);
    input.disabled = true;
    input.placeholder = 'Search unavailable';
    return;
  }
  list.replaceChildren(...options.map((o) => Object.assign(document.createElement('option'), { value: o.value, label: o.hint })));
  const go = () => {
    const hit = findAirline(options, input.value);
    if (hit) location.href = `/airlines/${hit.id}`;
  };
  input.addEventListener('change', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

main();
