// the settings select reloads the page on change, as the other pages' selects do; without scripts the form's button does it
for (const id of ["from", "to", "min"]) document.getElementById(id)?.addEventListener("change", (e) => e.target.form.requestSubmit());
