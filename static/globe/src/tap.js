// What a tap on an airport does. A mouse hovers before it clicks, so a click lands on the airport already showing and
// opens it. A touch has no hover: its first tap shows the airport (its routes and figures) and a second tap opens it.
export function tapAction(showing, tapped) {
  if (tapped < 0) return 'clear';
  return tapped === showing ? 'open' : 'show';
}
