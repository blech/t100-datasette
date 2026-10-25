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
| Southwest, 737 family, all years, route √ó year | 62,165 | 6.4s |
| SFO, all years, family √ó year | 684 | 0.20s |
| ATL, all years, family √ó year | 840 | 0.74s |
| no airport and no year (a full scan) | ‚Äî | about 80s |

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

Open: whether to build the by-year table first, which needs no upload, and the matrix later; and whether the new rollup is worth its size.

### Decision

## Datasette or custom tables?

### Detail

For the entry points, the site uses Datasette only as a back end for executing queries and returning JSON to display. There are now also "raw data" links that open up the Datasette view, but it's less polished than the UI: for example, it doesn't have sorting. Where to go here- making Datasette more like the rest, or making pages that handle more arbitrary queries?

### Discussion

### Decision