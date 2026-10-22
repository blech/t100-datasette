# Setting up t100.db

The database has two segment tables, `t100_international` and `t100_domestic`, and a `t100` view that unions them with an extra `domestic` (0/1) column. The same origin/destination pair can appear in both tables, so the canned queries decide a route's `service` by whether most of its departures were domestic.

## Schema

`schema.sql` is generated from `build_database.py`. Create an empty database with it:

```sh
sqlite3 t100.db < schema.sql
```

or, from Python (this is idempotent and also adds any missing indexes and the `t100` view to an existing database):

```sh
uv run python -c "import sqlite3, build_database as b; c = sqlite3.connect('t100.db'); b.create_schema(c); b.create_indexes(c)"
```

## Segment data

Download the BTS segment files: international (`db28seg.fd.wac.*`) and domestic (`db28seg.dd.wac.*`). Multi-year files (1990-2000, 2001-2010, 2011-2020) and single-year releases both work. The data is provided monthly but each release contains the whole previous year, so one file per year is enough.

Things to know about the files:
- The multi-year files have a header row; the single-year files (2021 onwards in the domestic set) do not.
- Header spelling differs between the sets (domestic uses `Svc_Class` where international uses `class`; `Carrier` vs `carrier`), but the columns are in the same order. Load by position and skip any header line.
- Every row ends with `|`, which adds an empty trailing field.

Loading with the sqlite3 shell (drop the trailing `|`, skip a header if the file has one; use `--skip 0` for headerless files):

```sh
sqlite3 t100.db <<'SQL'
.mode csv
.separator |
.import --skip 1 '|sed "s/|$//" path/to/db28seg.dd.wac.1990.2000.asc' t100_domestic
SQL
```

Repeat for each file, using `t100_international` for the `fd` files. Then create the indexes:

```sh
uv run python -c "import sqlite3, build_database as b; c = sqlite3.connect('t100.db'); b.create_indexes(c)"
```

Finally, build the derived tables: `airport_year_totals` (one row per airport and year, read by the landing page), `airport_names` (BTS's newest city name for each airport code, read by the map and chart pages), `airport_market` (BTS's newest city market for each airport code, for grouping airports into cities), and the rollups behind the aircraft and carrier charts: `aircraft_family` and `family_year` (types grouped into families by the rules in `data/aircraft_families.csv`), `carrier_group` and `carrier_group_year` (merger-aware carriers, from `data/carrier_groups.csv`) `aircraft_group_band_year` (totals by BTS aircraft group and distance band, for the twin/tri/quad-jet stories) `family_detail_year` (each aircraft family by version and airline group, for the family pages) `carrier_route_year` (each airline group's yearly flying by member airline and airport pair, for the airline pages and maps) and `route_year_totals` (every airport pair's yearly totals in each direction, with its domestic departures, for hovering an airport on the all-airports map). `type_year` (each aircraft type's yearly totals, for the aircraft table and maker chart). A table that gained a column since you last built it is dropped and recreated by the rebuild. This takes about four minutes:

```sh
uv run python -c "import sqlite3, build_database as b; c = sqlite3.connect('t100.db'); print(b.rebuild_derived_tables(c))"
```

The server checks the database against `schema.sql` when it starts and logs a warning for each missing table or column; `/-/derived` reports the same as JSON (`"ok": true` when nothing is missing), and `scripts/smoke_check.sh` fails a deploy if it is not. After pulling code that adds a table or column, run the rebuild above on every machine, and load the changed tables onto the Fly volume (see [Updating the Fly volume](#updating-the-fly-volume)). `schema.sql` is generated from `build_database.py`; a test fails if they drift apart.

**Run this again whenever segment data is loaded or changed**, or the landing page will show stale totals. It deletes and recomputes the tables, so it is safe to repeat. Also update `max_year` under `plugins: t100_globe` in `datasette.yml` when a new year is added.

(A repeatable build script that does all of this is not written yet.)

## Lookup tables

Two further tables are populated from the [Aviation Support Tables](https://www.transtats.bts.gov/Tables.asp?QO_VQ=IMI&QO_anzr=N8vn6v10%FDf722146%FDgnoyr5&QO_fu146_anzr=N8vn6v10%FDf722146%FDgnoyr5): Aircraft Types and Carrier Decode. The headers should be modified: all lower case, with `CARRIER_NAME` renamed to `name` for `T_CARRIER_DECODE.csv` and `LONG_NAME` renamed to `name` for `T_AIRCRAFT_TYPES.csv`.

```sh
sqlite-utils insert t100.db carriers source_downloads/T_CARRIER_DECODE.csv --csv
sqlite-utils insert t100.db aircraft_types source_downloads/T_AIRCRAFT_TYPES.csv --csv
```

## Airport coordinates

Geographic data comes from the [OpenFlights airport data](https://openflights.org/data.php). The headers need to be added first.

```sh
sqlite-utils insert t100.db openflights_airports airports.txt --csv
```

Some airport codes in T-100 are missing from OpenFlights, including city-wide codes such as `SEL` and `OSA`. `data/airport_overrides.csv` holds hand-maintained coordinates for the largest of these, and wins over OpenFlights when a code appears in both. Load it with:

```sh
uv run python -c "import sqlite3, build_database as b; c = sqlite3.connect('t100.db'); b.create_schema(c); print(b.load_airport_overrides(c, 'data/airport_overrides.csv'))"
```

To list airport codes still without coordinates, busiest first:

```sh
sqlite3 t100.db "
WITH codes AS (SELECT origin AS code, SUM(passengers) AS pax FROM t100 GROUP BY origin
               UNION ALL SELECT dest, SUM(passengers) FROM t100 GROUP BY dest)
SELECT code, SUM(pax) AS pax FROM codes
WHERE code NOT IN (SELECT iata_code FROM openflights_airports WHERE latitude IS NOT NULL)
  AND code NOT IN (SELECT code FROM airport_overrides)
GROUP BY code ORDER BY pax DESC LIMIT 30"
```

Add any you want drawn to `data/airport_overrides.csv` and run the loading command again.

## Updating the Fly volume

The live database is `/mnt/db/t100.db` on the Fly volume, about 2.5GB, so copy only the tables that changed instead of the whole file. Do this **before** pushing code that needs them: every push to `main` deploys, and the smoke check fails if `/-/derived` is not ok. These steps use `route_year_totals` as the example; build it locally first.

1. Snapshot the volume, and check that it finished and that there is room:

   ```sh
   flyctl volumes snapshots create vol_40o8kkyxj88lyj24 -a blech-datasette-t100 </dev/null
   flyctl volumes snapshots list vol_40o8kkyxj88lyj24 -a blech-datasette-t100 </dev/null
   flyctl ssh console -a blech-datasette-t100 -C "df -h /mnt/db" </dev/null
   ```

2. Export the table's rows as INSERT statements. Gzip anything large; the loader decompresses it with Python's `gzip` module.

   ```sh
   sqlite3 -readonly t100.db ".mode insert route_year_totals" "SELECT * FROM route_year_totals;" | gzip > rt.sql.gz
   ```

3. Write a loader, `load_rt.py`. It runs everything in one transaction, so a failure leaves the live table as it was, and the `DELETE` makes it safe to run again. Copy the `CREATE TABLE` from `schema.sql`, and add any `CREATE INDEX` after the inserts. For a table that has gained a column, use `DROP TABLE IF EXISTS` instead of `DELETE`.

   ```python
   import gzip, sqlite3
   inserts = gzip.open("/mnt/db/rt.sql.gz", "rt").read()
   c = sqlite3.connect("/mnt/db/t100.db")
   c.executescript(
       """BEGIN;
       CREATE TABLE IF NOT EXISTS "route_year_totals" (
          [year] INTEGER, [origin] TEXT, [dest] TEXT, [deps] INTEGER, [domestic_deps] INTEGER,
          [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
          PRIMARY KEY ([year], [origin], [dest])
       ) WITHOUT ROWID;
       DELETE FROM route_year_totals;
       """ + inserts + "\nCOMMIT;"
   )
   print(c.execute("SELECT COUNT(*), SUM(passengers) FROM route_year_totals").fetchone())
   ```

4. Upload both files to the volume, then compare the remote sizes with the local ones (large sftp puts have dropped before):

   ```sh
   printf 'put rt.sql.gz /mnt/db/rt.sql.gz\nput load_rt.py /mnt/db/load_rt.py\n' | flyctl ssh sftp shell -a blech-datasette-t100
   ls -l rt.sql.gz; flyctl ssh console -a blech-datasette-t100 -C "ls -l /mnt/db" </dev/null
   ```

5. Run the loader. Check that its count and sum match the local table (`SELECT COUNT(*), SUM(passengers) FROM route_year_totals`):

   ```sh
   flyctl ssh console -a blech-datasette-t100 -C "python3 /mnt/db/load_rt.py" </dev/null
   ```

6. Clean up:

   ```sh
   flyctl ssh console -a blech-datasette-t100 -C "rm -f /mnt/db/rt.sql.gz /mnt/db/load_rt.py" </dev/null
   ```

The server opens the database `--immutable`, so it doesn't need stopping, but it only sees a new table after it restarts. The deploy from the next push to `main` restarts it, and then runs `scripts/smoke_check.sh`. If you are not pushing, restart it yourself with `flyctl machine restart 28705d7c010318 -a blech-datasette-t100`, then run `scripts/smoke_check.sh`.
