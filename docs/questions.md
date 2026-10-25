# Questions

2026-10-25

## Is bringing in DB1B/DB1C a good idea?

### Detail

### Discussion

### Decision

## Is narrowing a good use case?

### Detail

The site's entry points are all aggregations - airports, airlines, aircraft. Eventually pages move into slices of those: "SFO's destinations", "Southwest's planes", "British Airways destinations". Combinations start blurring the line between the aggregations and the raw rows being the right answer. Which is better (or just able) to answer questions like "which destinations did BA fly to with A380s" - considering "which destinations did Southwest fly to with 737s" will produce (many?) more rows? See also "Datasette or custom tables?"

### Discussion

**The number of rows isn't the problem; the reading is.** Southwest's 737 routes in 2025 are 3,374 rows and take 0.60s. BA's A380 routes in 2025 are 15 rows and take 0.06s. What makes a narrowing slow is how many raw rows have to be read to find the answer, not how many come back.

**Think of the data as a cube.** It has five dimensions: airline, aircraft (type or family), airport (origin), route (origin and destination) and year. Every rollup also keeps two small ones, domestic or international and service class. A page fixes some dimensions (JFK, BA) and lays out others (airlines across years, routes across years). A rollup can serve a page when:

1. it has every dimension the page uses;
2. its key starts with the dimensions the page fixes, so the matching rows sit together;
3. the rows left to add up are few.

The raw `t100` rows are the rollup of everything, with month and class too. Their indexes start with origin airport or with year, so those are the only two cheap ways in.

**What exists:**

| Dimensions | Table | Serves |
|---|---|---|
| airline · year | `carrier_group_year` | airline pages |
| aircraft · year | `type_year`, `family_year` | aircraft pages |
| aircraft · airline · year | `aircraft_carrier_year`, `family_detail_year` | a family's operators; an airline's fleet |
| airport · year | `airport_year_totals` | busiest-airports matrix |
| airport · airline · year | `airport_carrier_year` | `/airports/JFK?split=airline` |
| route · year | `route_year_totals` | route pages |
| route · airline · year | `carrier_route_year` (1.3M rows) | `/airlines/19540/routes` |
| anything that fixes an airport or one year | raw `t100` | through the origin and year indexes |

**Measured cases.** Measured locally on 2026-10-25 against raw `t100`, with a warm cache; production will be slower.

| Query | Rows | Time |
|---|---|---|
| BA, A380, 2025, by route | 15 | 0.06s |
| Southwest, 737 family, 2025, by route | 3,374 | 0.60s |
| BA, A380, all years, by route | 36 | 4.4s |
| Southwest, 737 family, all years, route × year | 62,165 | 6.4s |
| SFO, all years, family × year | 684 | 0.20s |
| ATL, all years, family × year | 840 | 0.74s |
| no airport and no year (a full scan) | — | about 80s |

The time limit is 5 seconds (`sql_time_limit_ms`).

**The rule this suggests:**

- If a narrowing fixes an airport or a single year, the raw rows answer it, and a saved query is enough. Examples are `/airports/SFO/aircraft`, and BA's A380 routes in one year (a link from each row of `family_airlines`).
- If it fixes something else and spans years, it needs a rollup that has those dimensions, keyed with the fixed ones first. Examples are BA's A380 routes over time as a matrix, and each route's aircraft mix on an airline's routes page.

**The gap.** Most of what's missing is route · airline · family · year, which would be about 2.5M rows, roughly twice `carrier_route_year`. With one key starting with airline and family, and a second starting with family, it would serve:

- an airline's routes on a family, over time (BA's A380 matrix);
- each route's aircraft mix on an airline's routes page;
- "who flies the A380 where";
- "where does the A380 go", which needs the second key.

An airline's whole-network aircraft mix is already in `family_detail_year`. A matrix for a big case like Southwest's 737s would show only the top routes.

**On uploads.** A new rollup means rebuilding and uploading the database, which has been common. What matters more than how often is the shape of the table. A rollup keyed by what pages fix serves many pages per upload; one shaped for a single page doesn't.

**Change over time comes first.** The site's value is in change over time, so narrowings must work across all years. A by-year table answered from the raw rows isn't enough on its own. That settles it in favour of a rollup rather than more indexes on the raw tables. Uploads are handled by agents, so they're not a cost worth designing around.

**Which rollups a bigger one could replace.** A route · airline · aircraft · year rollup could, in principle, rebuild most of the others by adding rows up. Replacing one only makes sense when its pages fix what the new table's key starts with, so there are few rows to add.

| Existing table | Rows | Replace it? |
|---|---|---|
| `carrier_route_year` | 1.32M | Yes. It's the new table without the aircraft; an airline's routes page adds up a few models per route. |
| `route_year_totals` | 0.98M | Probably not. It would need a route-first key costing about as much as the table, and lists across all routes would add up millions of rows. |
| `airport_carrier_year` | 0.46M | Possibly later. Workable, but it needs an airport-first key, and this table also splits service class. |
| the small tables (`airport_year_totals`, `family_year`, `type_year`, `carrier_group_year`, …) | 5k–52k | Keep. They feed views across everything, which would otherwise add up millions of rows. |

**Grain.** Measured on 2026-10-25:

| Grain | Rows |
|---|---|
| route · airline · family · year | 2.47M |
| … plus service class | 2.61M |
| route · airline · model · year | 3.07M |

"Model" is BTS's aircraft type code, often a single version: 614 is the 737-800, 838 the 737 MAX 8, 882 the A380-800. It isn't the aircraft group, the "4-engine jet" category. Families come from models with a lookup in `aircraft_family`, so the model level answers family questions too, and costs only 24% more.

"Service class" is BTS's `class`, which combines passenger or cargo with scheduled or charter: F is scheduled passenger, G scheduled all-cargo, L charter passenger, P charter all-cargo. Domestic or international is a separate flag; for a table keyed by route the two airports already decide it.

### Decision

Decided 2026-10-25.

Yes, narrowing is a good use case, and it's served across all years by one new rollup, not by indexes on the raw tables.

- **The table:** route · airline · aircraft model · year, split by service class (F/G/L/P). Families come from the model through `aircraft_family`. That's about 3.1M rows at model level (measured), and an estimated 3.2M with the class split.
- **What it measures:** departures, seats, passengers and freight, with the first and last month, as `carrier_route_year` does now.
- **Keys:**
  - one starting with airline, for an airline's routes and each route's aircraft mix;
  - a second starting with aircraft, for an aircraft's routes over time and "who flies it where".
- **It replaces `carrier_route_year`**, so the database grows by about 1.9M rows.
- **These stay:** `route_year_totals`, `airport_carrier_year` and the small rollups.
- **The raw rows stay** for narrowings that fix an airport or a single year, such as `/airports/SFO/aircraft`.
- **Uploads:** not a constraint, since agents handle them.

What it makes possible:
- an airline's routes on an aircraft, as a matrix over time (BA's A380s);
- each route's aircraft mix on an airline's routes page;
- an aircraft's routes over time.

Big cases, like Southwest's 737s, show only the top routes.

Next: the table and its pages are a project, with its own written design. That design settles:
- whether "who flies it where" needs the second key;
- which pages come first;
- the table's name.

Revisit if the database outgrows its hosting, or if the 5-second limit changes.

## Datasette or custom tables?

### Detail

For the entry points, the site uses Datasette only as a back end for executing queries and returning JSON to display. There are now also "raw data" links that open up the Datasette view, but it's less polished than the UI: for example, it doesn't have sorting. Where to go here- making Datasette more like the rest, or making pages that handle more arbitrary queries?

### Discussion

**Why there's no sorting.** The "raw data" links mostly open saved queries, such as `family_airlines`. Datasette sorts a table when a column heading is clicked, but a saved query's results come from arbitrary SQL, which Datasette won't re-sort. The only sort is the one built into the query, such as its `sort` parameter.

**What digging actually involves.** It's a mix of sorting, filtering and combining. Sorting (ORDER BY) and filtering (WHERE) are easy enough to edit by hand. The hard part is moving between levels of the data, in both directions:

- **down**, from a summary figure to the raw `t100` rows behind it. From `family_airlines` there's no way to open the matching `t100` rows.
- **up**, from a set of `t100` rows to the summary table that already adds them up, or to the SQL that would. The GROUP BY / SUM / COALESCE pattern of a rollup is hard to write from scratch.

**The `t100` view has no names.** `t100_domestic` and `t100_international` declare foreign keys to `carriers` and `aircraft_types`, so Datasette shows names beside the codes. `t100` is a view that combines them, and a view can't declare foreign keys, so it shows bare codes.

**The cube is the missing map.** The narrowing decision describes each summary table as a set of dimensions. Each dimension maps to raw columns:

- a year is the year;
- a route is origin and destination;
- a family is a list of aircraft types, through `aircraft_family`;
- an airline group is a list of carriers, through `carrier_group`.

Written down once, that map is enough to build links both ways. A link down filters `t100` through the address, such as `?year=1999&aircraft_type__in=…&carrier_entity__in=…`.

**Saved queries on `t100` can do the adding up**, within the limits found for narrowing. They're quick when an airport or a single year is fixed, and a full scan otherwise. SQL can't take a column name as a parameter, but `GROUP BY CASE :by WHEN … END` does the same job. The query's SQL is visible in Datasette, so it doubles as a worked example to start from.

The summary most wanted from filtered `t100` rows is by aircraft.

### Decision

Decided 2026-10-25.

Neither Datasette nor custom pages replaces the other. The site's pages stay the polished way in, and Datasette stays the place to dig: its filtering and its table sorting already work, and editing ORDER BY and WHERE is manageable. The gap is moving between levels, and that's the work:

- **The map:** write the cube map down once. It records which summary table has which dimensions, and how a family or airline group translates into raw codes. Links in both directions are built from it.
- **Down:** summary rows and saved queries get a "these flights" link, which opens `t100` already filtered. A family becomes its list of models; a group becomes its list of carriers.
- **Up, two ways:**
  - **"Summarise by…":** one general saved query on `t100` with a "by" choice, which does the GROUP BY for you. The first choice is aircraft, grouped by model with each model's family alongside. Airline, route, destination and month come later. It works when the filters fix an airport or a year; otherwise it says so.
  - **"Already summarised in…":** a link to a summary table that fits, for the cases the summary query can't do in time.
- **Names on the `t100` view:** carriers and aircraft named, as on the two tables it combines.
- **Related:** the backlog item in `site-coherence.md` for styling Datasette's pages like the site, in light mode, still stands. It's separate work, but it makes digging feel part of the site.

My calls, which can be overridden:
- aircraft first, at model level, with families alongside;
- one general summary query with a "by" choice, not one query per summary.

Next: a project, with its own written design. It settles:
- where the map lives (configuration or a plugin);
- what the links look like, and whether the site's own pages link down the same way;
- what "up" offers when several summary tables fit;
- how the view gets its names.

Revisit if the custom pages start needing arbitrary queries, or if Datasette gains sorting for saved queries.