// The legend's chips, one button per category, pressed while its routes are shown
export function renderLegend(el, groups, onToggle) {
  // the chips are rebuilt on every change, so hand keyboard focus on to the new copy of the one that had it
  const focused = el.contains(document.activeElement) ? document.activeElement.dataset.key : null;
  el.replaceChildren();
  for (const g of groups) {
    const group = Object.assign(document.createElement('span'), { className: 'legend-group' });
    for (const it of g.items) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip' });
      b.setAttribute('aria-pressed', String(!it.hidden));
      b.dataset.key = it.key;
      b.title = `${it.hidden ? 'Show' : 'Hide'} ${it.label.toLowerCase()} routes`;
      const sw = Object.assign(document.createElement('span'), { className: 'swatch' });
      if (it.colour) sw.style.setProperty('--swatch', it.colour); else sw.classList.add('plain');
      if (it.dashed) sw.classList.add('dashed');
      const count = Object.assign(document.createElement('span'), { className: 'count', textContent: it.count.toLocaleString('en-US') });
      b.append(sw, `${it.label} `, count);
      b.addEventListener('click', () => onToggle(it.key));
      group.append(b);
    }
    el.append(group);
  }
  if (focused) el.querySelector(`[data-key="${focused}"]`)?.focus();
}

// Place the two year handles and the fill between them
export function syncRange({ from, to, fill }, years, year, compare) {
  const lo = years.indexOf(compare ?? year);
  const hi = years.indexOf(year);
  from.value = String(lo);
  to.value = String(hi);
  const span = Math.max(1, years.length - 1);
  fill.style.left = `calc(8px + (100% - 16px) * ${lo / span})`;
  fill.style.width = `calc((100% - 16px) * ${(hi - lo) / span})`;
}
