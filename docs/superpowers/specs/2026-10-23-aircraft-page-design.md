# The aircraft page

One aircraft (a BTS aircraft type, such as the AN-225 or the Boeing 737-800) gets its own page, reached from its name in the aircraft table's disclosure. This is the second of four aircraft projects agreed with the user: family rules (done), this page, a families matrix at `/aircraft/over-time`, and a kinds page that replaces the long-haul page.

## Decisions (from the conversation)

- **Address:** under its family, `/aircraft/<family-slug>/<aircraft-slug>`, e.g. `/aircraft/boeing-737/boeing-737-800`. The slug is the BTS name slugified, the same rule as families. In the data there are no clashes within a family.
- **Entry:** the aircraft names in an opened family in the table link to it. A flat list of aircraft is for later; "families or aircraft" as a grouping option is not part of this change.
- **Chart:** the family page's chart, for one aircraft: a measure, passenger or freight flights, domestic or international, and the years-flown or all-years span. Split by airline (the default; the top eight groups, the rest folded into Other, with the family page's airline highlight) or by nothing.
- **Data:** a new rollup, `aircraft_carrier_year` (46,817 rows: aircraft × year × airline group × domestic × service class), built from the segments like `family_detail_year`. The word "type" is not used in anything new: the column is `aircraft`.
- **Family page too:** its splits become version, airline or nothing. "Domestic or international" goes from both pages, because the routes filter already covers it.
- **Comparison** of several aircraft is not built. It goes to the roadmap as an idea to generalise.
- **Views line:** family pages and aircraft pages show Families · Makers · Long-haul engines, with none of them current. The breadcrumb for an aircraft is aircraft › family › aircraft.

## My calls

- The page reuses `family.js` and the `family.html` layout, steered by data attributes on the body (`data-query`, `data-subject`), rather than a second copy of the chart code.
- The intro says what the aircraft is: its maker, its kind, the years it flew, and a link to its family.
- Data comes from a new canned query, `aircraft_detail` (`:aircraft` is the aircraft's id, `:group` narrows to one airline), over `aircraft_carrier_year`.
- A request for an unknown aircraft, or a real aircraft under the wrong family, is a 404.
