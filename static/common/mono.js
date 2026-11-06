// Picks the monospace experiment (static/common/fonts.css): #mono=departure-11 | b612-11 | b612-13 | b612-14 | system, remembered.
// A plain script, run in <head> before the page paints, so the type never changes size after it appears.
(function () {
  var choices = ['departure-11', 'b612-11', 'b612-13', 'b612-14', 'system'];
  var asked = new URLSearchParams(location.hash.slice(1)).get('mono');
  try {
    if (choices.indexOf(asked) >= 0) localStorage.setItem('mono', asked);
    var mono = localStorage.getItem('mono');
  } catch (e) {}
  document.documentElement.dataset.mono = choices.indexOf(mono) >= 0 ? mono : choices.indexOf(asked) >= 0 ? asked : 'departure-11';
})();
