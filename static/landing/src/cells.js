import { formatCount, formatTons, exactCount } from '/static/common/numbers.js';

// table cells shared by the busiest-airports table and a country's page
export function cell(text, className, title) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  if (title !== undefined) td.title = title;
  return td;
}

// a measured count, rounded, with the exact figure on hover
export const countCell = (n, noun) => cell(formatCount(n), 'num', `${exactCount(n)} ${noun}`);
export const tonsCell = (pounds) => cell(formatTons(pounds), 'num', `${exactCount(pounds)} lb`);
export const percentCell = (pct) => cell(pct === null ? '–' : `${pct.toFixed(1)}%`, 'num');

export function link(href, text, title) {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  if (title !== undefined) a.title = title;
  return a;
}
