# Story exploration

Read-only on `t100.db`; everything derived lives in `explore/cubes.duckdb` (~0.5 GB). That file is deliberately not
committed (see `.gitignore`): rebuild it with the steps below, in order, from the repo root with `t100.db` present
(about a minute in all). It needs the DuckDB CLI, and `00_load.sql` installs the `sqlite` extension on first run.
The lookup tables are the site's own `data/aircraft_families.csv` and `data/carrier_groups.csv`, so the explorations
and the site agree on which airlines are merged. `leads/*.csv` are committed as a record of the last run; regenerating
them after a change to those files will shift some rankings.

    duckdb explore/cubes.duckdb < explore/00_load.sql      # copy t100.db into DuckDB (~35 s)
    duckdb explore/cubes.duckdb < explore/10_cubes.sql     # type_year_band, route_year, airport_year, carrier_year (~2 s)
    duckdb explore/cubes.duckdb < explore/12_market_routes.sql   # market_route_year (city-market pairs), market_route_top
    duckdb explore/cubes.duckdb < explore/13_route_time.sql   # route_time_year (directional, carrier+type) and like_for_like() macro
    duckdb explore/cubes.duckdb < explore/14_families.sql   # aircraft_family (type -> family/subfamily/class), family_year
    duckdb explore/cubes.duckdb < explore/15_labels.sql    # carrier_group (merger-aware), carrier_group_year, labels
    duckdb explore/cubes.duckdb < explore/20_story_engines.sql   # view: long-haul departures by engine count
    duckdb explore/cubes.duckdb < explore/21_story_freight.sql   # view: long-haul freight by engine count, freighter vs belly
    duckdb explore/cubes.duckdb < explore/31_route_time_leads.sql   # like-for-like flight-time changes vs 2019 -> leads/route_time*.csv
    ./explore/30_leads.sh                                  # ranked movers -> explore/leads/*.csv
    duckdb explore/cubes.duckdb < explore/50_db1c_connections.sql   # DB1C monthly -> db1c_airport_month (~6 min)
    explore/01_db1b_parquet.sh                             # DB1B zips -> explore/db1b/*.parquet, new quarters only (~15 s each)
    duckdb explore/cubes.duckdb < explore/51_db1b_connections.sql   # DB1B quarterly -> db1b_airport_quarter
    duckdb -bail explore/cubes.duckdb < explore/52_od_rollups.sql   # DB1C+DB1B -> od_segment/route/trip_period, explore/od_rollups.db (~13 min)

Conventions: passenger metrics use class F/L only; routes are unordered airport pairs; carriers are keyed on
`airline_id` (stable across `carrier_entity` changes, but NOT across mergers: Northwest and Delta are different ids);
`aircraft_group` 6/7/8 = twin/tri/quad jet (checked in `check_groups.sql`; group 7 includes short-haul 727s, group 6
includes business jets, so filter by distance band).

Merger-aware carriers: `data/carrier_groups.csv` (at the repo root) maps mainline airline_ids to a surviving parent (Delta+Northwest,
United+Continental, American+TWA/US Airways/America West/Reno, Southwest+AirTran, Alaska+Virgin America). Regional
carriers (SkyWest, Envoy, Republic...) report under their own ids, so mainline shares are understated in the regional era.
Add rows to the CSV to extend it, then re-run 15_labels.sql and 30_leads.sh.

Routes: `routes.csv` ranks airport pairs; `market_routes.csv` ranks BTS city-market pairs, which keeps a route one
series across airport/code changes (OSA->KIX, SEL->ICN, Berlin TXL/SXF->BER). Its `airport_switch` column flags era
ends where the busiest airport pair differs (e.g. LGA-MIA -> EWR-FLL). Residual cases BTS did not re-market would need an override file.

Flight time: `air_time` / `ramp_to_ramp` are minutes summed over departures; zero means not reported (309k rows since 2019),
so route_time_year keeps only rows with air_time > 0. `like_for_like(base, year)` compares only carrier+aircraft-type
combinations flown in both years, weighted by the later year's departures; `coverage` is the matched share. Across all
long routes the 2019->2023 change has median +0.2 min and p99 +11 min, so tens of minutes is signal.

Aircraft families: `data/aircraft_families.csv` (at the repo root) is an ordered list of name regexes -> family, subfamily, class
(first matching `priority` wins; edit it to re-map). Types no rule matches fall back to their BTS `ac_group`
(0.18% of departures). `family_year` is the type cube rolled up to family. BTS lumps some variants into one type
(e.g. "737-700/700LR/Max 7" is filed as 737 NG; "777-200ER/200LR"), so MAX 7 and 200LR cannot be separated.

DB1C and DB1B (`50_db1c_connections.sql`, `51_db1b_connections.sql`) are BTS's ticket samples of domestic-only
itineraries: DB1C is a 40% sample, monthly, `explore/DB1C.PUBLIC.*.parquet`, from July 2025; DB1B is the 10% sample it
replaced, quarterly from 2010: `01_db1b_parquet.sh` streams the zips in `source_downloads/db1b/` into
`explore/db1b/db1b_<yyyyq>.parquet` (one row per record, coupon fields as lists). Neither is committed; record
layouts are the two PDFs in `source_downloads/`. DB1B city market IDs follow other schemes in 2010 and 2011 Q3, so
everything here keys on airports. Both reduce to boardings by airport, period and marketing (ticketed) carrier, with `conn_dir`
= boardings that continue a trip (not the first coupon, no directional trip break there); DB1C also has `conn_8h`,
which additionally breaks after stays over 8 hours. Against T100 domestic F/L enplanements the samples come to about
0.09 (DB1B) and 0.36 (DB1C): the shortfall from 0.10 / 0.40 is itineraries with an international leg, which are
excluded, so gateways (MIA, JFK, IAH, EWR) also understate connections. National `conn_dir` share is ~20.5% in both
sources, so the series join up.

`52_od_rollups.sql` rolls both samples up to T100-like grains in one table per grain (a `source` column, `period` =
first day of the month or quarter): `od_segment_period` (origin x dest x operating carrier, with local vs connecting
passengers), `od_route_period` (directional trip origin x destination x connecting airports x marketing carriers) and
`od_trip_period` (origin x destination, nonstop vs connecting). The segment and trip tables are also written to
`explore/od_rollups.db` (SQLite, ~33 MB for 2025 H1 + H2 + July 2026; not committed). Counts are sample passengers.
Each itinerary is processed as lists rather than unnested to coupons, which keeps memory in bounds on a 16 GB machine.
