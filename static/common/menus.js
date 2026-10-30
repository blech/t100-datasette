// Put settled settings (src/flights.js's settle) into a page's menus, `menus` naming each setting's <select>. A menu
// changed other than the one just `chosen` is outlined for a moment, so a change the page made by itself is seen;
// when the page is only putting an address right as it loads, nothing was chosen and nothing is marked.
export function setMenus(menus, settings, chosen = null) {
  for (const [key, select] of Object.entries(menus)) {
    if (!select || settings[key] === undefined || select.value === settings[key]) continue;
    select.value = settings[key];
    if (chosen === null || key === chosen) continue;
    select.classList.remove('auto-changed');
    void select.offsetWidth; // so the outline starts again when it's already showing
    select.classList.add('auto-changed');
  }
}

// Take out of each menu the choices a page doesn't offer (src/flights.js's offeredBy)
export function offerOnly(menus, offered) {
  for (const [key, select] of Object.entries(menus)) {
    if (!select || !offered[key]) continue;
    for (const o of [...select.options]) if (!offered[key].includes(o.value)) o.remove();
  }
}
