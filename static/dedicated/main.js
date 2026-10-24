// the year select reloads the page on change, as the other pages' selects do; without scripts the form's button does it
document.getElementById("year")?.addEventListener("change", (e) => e.target.form.requestSubmit());
