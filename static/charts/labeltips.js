// A matrix's row labels carry their hover text in an SVG <title>; show it at once in the page's own popover (#label-tip),
// the same way in every browser. useLabelTips moves the titles into data-tip after each draw; attachLabelTips shows them.

export function useLabelTips(box) {
  for (const text of box.querySelectorAll('svg text')) {
    const title = text.querySelector(':scope > title');
    if (!title) continue;
    text.dataset.tip = title.textContent;
    title.remove();
  }
}

export function attachLabelTips(box, tip) {
  if (!tip) return;
  box.addEventListener('mousemove', (e) => {
    const text = e.target.closest && e.target.closest('text[data-tip]');
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text.dataset.tip;
    tip.style.left = `${Math.min(e.clientX + 14, window.innerWidth - 320)}px`;
    tip.style.top = `${e.clientY + 14}px`;
    tip.hidden = false;
  });
  box.addEventListener('mouseleave', () => { tip.hidden = true; });
}
