// A page's link to the canned query whose numbers it draws, with every parameter in the address (empty ones too, so the
// data page's form shows them all, ready to narrow). The link sits hidden in the footer or a map's controls until a page sets it.

export function dataHref(query, params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) q.append(k, v === null || v === undefined ? '' : String(v));
  q.append('_hide_sql', '1');
  return `/t100/${query}?${q}`;
}

export function setDataLink(query, params) {
  const link = document.getElementById('data-link');
  if (!link) return;
  link.href = dataHref(query, params);
  const box = link.closest('.data-link');
  if (box) box.hidden = false;
}
