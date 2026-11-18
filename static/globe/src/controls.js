import { exactCount } from '../../common/numbers.js';

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
      const count = Object.assign(document.createElement('span'), { className: 'count', textContent: exactCount(it.count) });
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

// The handles are 16px across and their centres stop 8px in from each end of the bar
const HANDLE_INSET = 8;

// The slider value under `x` (a clientX) on a bar spanning left..left+width, rounded to a whole step and kept in range
export function trackValue(x, left, width, min, max) {
  const usable = Math.max(1, width - 2 * HANDLE_INSET);
  const t = Math.min(1, Math.max(0, (x - left - HANDLE_INSET) / usable));
  return min + Math.round(t * (max - min));
}

// Which of `values` (the handles' values, the solid handle first) is nearest `v`: ties go to the earlier one
export function nearestHandle(values, v) {
  let best = 0;
  values.forEach((h, i) => { if (Math.abs(h - v) < Math.abs(values[best] - v)) best = i; });
  return best;
}

// A press on the bar, not on a handle, moves the nearest handle there (the solid one when they're level) and keeps
// it under the pointer until it's let go. Each move sends the slider an `input` event, as dragging the handle does.
// The sliders themselves ignore the pointer (so stacked ones don't cover each other), only their handles take it.
export function bindTrackPress(bar, inputs) {
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || inputs.includes(e.target)) return; // a handle: the slider drags it itself
    const live = inputs.filter((el) => !el.disabled && el.offsetParent !== null);
    if (!live.length) return;
    e.preventDefault();
    const at = (x) => {
      const r = bar.getBoundingClientRect();
      return trackValue(x, r.left, r.width, Number(live[0].min), Number(live[0].max));
    };
    const el = live[nearestHandle(live.map((i) => Number(i.value)), at(e.clientX))];
    const moveTo = (x) => {
      const v = String(at(x));
      if (el.value === v) return;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    moveTo(e.clientX);
    bar.setPointerCapture(e.pointerId);
    const onMove = (m) => moveTo(m.clientX);
    const done = () => {
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', done);
      bar.removeEventListener('pointercancel', done);
    };
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', done);
    bar.addEventListener('pointercancel', done);
  });
}
