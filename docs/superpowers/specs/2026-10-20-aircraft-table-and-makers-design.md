# Aircraft table and manufacturer chart

## Purpose

`/aircraft` is a heat map of aircraft families by year. Two more views of the same data:

- **A table** (`/aircraft/table`): families ranked by a chosen measure and year, each opening into its types, so it works as a ranking and as a lookup. It is built as both so that later work can lean towards either.
- **A manufacturer chart** (`/aircraft/makers`): who built the aircraft that flew, year by year, with a disclosure of how makers are counted.

The heat map stays as it is. Both pages are linked from it.

## Data

### Existing columns used

`aircraft_types.maker` (read from the type's name by `data/aircraft_makers.csv`) and `aircraft_types.kind` (from BTS's aircraft group) already exist locally and in production. Six generic float and land types have no maker; they are shown as "Unknown maker".

### New table: `type_year`

One row per aircraft type, year, domestic flag and service class, built by `rebuild_type_year()` from the `t100` view and added to `rebuild_derived_tables` and `schema.sql`:

```
type_year (year INTEGER, aircraft_type TEXT, domestic INTEGER, service_class TEXT,
           deps INTEGER, seats INTEGER, passengers INTEGER, freight INTEGER,
           PRIMARY KEY (year, aircraft_type, domestic, service_class)) WITHOUT ROWID
```

- Segments whose type is missing from `aircraft_types` are kept under `aircraft_type = 'unknown'`, as `family_year` does with its "Unknown".
- Size: roughly 60,000 rows. It reaches production by the usual snapshot and table load before the code deploys; the schema check enforces the order.
- No separate maker table. Makers are `type_year` joined to `aircraft_types`.

### Canned queries (`datasette.yml`)

| Query | Returns |
|---|---|
| `type_table` | One row per type for the chosen `year`: type id, name, family, maker, kind, deps, seats, passengers, freight (passenger and freight service split as `kind` "passenger" / "freight"), plus the type's first and last year with departures. |
| `maker_by_year` | `year, maker, kind (aircraft kind), service, flights ("passenger"/"freight"), deps, seats, passengers, freight`, grouped for the chart. |

Families are grouped in the page's JavaScript from `type_table` rows (the family comes from `aircraft_family`), so the table needs one query for ranking and lookup. The family's maker is the maker with the most departures among its types in that year.

## Table page: `/aircraft/table`

- Sentence-style controls above the table, as on the family pages: "Show *measure* for *passenger flights* in *year*, for *kind*, by *maker*." Measure is departures, seats, passengers or freight; kind is all aircraft or one of BTS's groups; maker is all or one. State is kept in the URL (`measure`, `year`, `kind`, `maker`, `q`, `sort`), so a view can be linked.
- A search box filters families and types by name. A family with a matching type is shown with that type visible.
- Rows are families: family (linked to its page `/aircraft/<slug>`), maker, kind, first and last year, the chosen measure for the chosen year, and its share of the total. Headers sort; the default is the chosen measure, descending.
- Each row opens (a `<details>` row, working without scripts) to its types with the same columns. A family with one type shows that type.
- Families with nothing in the chosen year are hidden unless searched for.
- Freight is in short tons, as elsewhere.

## Manufacturer chart: `/aircraft/makers`

- Stacked bars by year for the top eight makers over the chosen filters, with the rest as "Other". Same chart code and series builder as the family page, with `split = maker` added. The top eight are by total over the whole period, so colours stay stable between filters.
- Controls: measure; passenger, freight or all flights; all, domestic or international routes; and aircraft kind (all, jets, turboprops, piston and helicopter, or one BTS group). State in the URL.
- A collapsed `<details>` "How makers are counted":
  - The maker is read from the aircraft's name in the BTS data, with spelling variants merged (Beech and Beechcraft; Gulfstream and Gulfstream Aerospace; "Bomardier" and other typos).
  - Takeovers are not followed. McDonnell Douglas, Boeing, Canadair and Bombardier, and Raytheon Beechcraft and Beechcraft, are separate makers. A DC-9 and an MD-11 share a maker; a DC-9 and a 737 do not.
  - A few generic float and land aircraft name no maker and are counted as "Unknown maker".
  - Links to `/about#groupings`, and a short new paragraph there.

## Links and wiring

- `/aircraft` gets two links, "Table of aircraft" and "Aircraft by maker", under its controls. Breadcrumbs are site › aircraft › table / makers.
- Routes `^/aircraft/table$` and `^/aircraft/makers$` are registered before the `/aircraft/<slug>` pattern. A family whose slug is `table` or `makers` does not exist.
- The nav's page detection treats both as aircraft pages.
- `datasette.yml`, templates `aircraft_table.html` and `aircraft_makers.html`, scripts `static/charts/aircrafttable.js` and `makers.js`, helpers in `static/charts/src/`.

## Testing

- `rebuild_type_year`: totals equal the segment tables; unknown types are kept; rebuilding twice gives the same result.
- Queries: `type_table` for a chosen year and `maker_by_year`, including a type with no maker.
- Pages: 200 for both, and the existing `/aircraft/<slug>` and 404 behaviour unchanged.
- JavaScript: grouping of types into families, the family's maker, sorting, search, and `maker` as a series split (top eight and Other).
- `scripts/smoke_check.sh`: both pages and both queries.
- Pages are not checked visually here; the layout needs a look in a browser.

## Out of scope

- Linking takeovers (a "merged makers" toggle is possible later, like the airline groups).
- Changing the heat map or making the table the default `/aircraft` page.
- A per-type page.
- Renaming the stored `kind` values. The pages show them as they are; the wording can be revisited once it is seen on screen.
