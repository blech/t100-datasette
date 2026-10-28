# Monthly data updates: proposed approach

Status: proposal, not implemented (2026-10-14). Tracks GitHub issue #9. Nothing here has been run against `t100.db` or the Fly volume; the findings come from loading the first new release into a scratch database.

## What BTS now publishes

The two downloads are rolling 12-month windows, not one file per year:

- `DB28SEG.DD.WAC.202508.202607.REL01.02OCT2026.zip` (domestic) and `DB28SEG.FD.WAC.202508.202607.REL01.02OCT2026.zip` (international).
- Each zip holds one `db28seg.{dd,fd}.wac.<from>.<to>.asc`: no header row, `|` delimited with a trailing `|` (29 fields), rows unordered. The 28 columns match the existing tables.
- Released 2 October 2026 for August 2025 to July 2026, so the lag is about two months.
- 459,625 domestic and 113,482 international rows.

`setup_database.md` still says each release contains the previous year and one file per year suffices. That is no longer true and needs rewriting when this is implemented.

Downloading is a manual step: bts.gov blocks automated fetches (curl got refused), so the zips are downloaded in a browser into `source_downloads/` and everything after that can be scripted. The data page URL contains a literal bullet character (`%E2%80%A2-data-bank-28is-t-100-and-t-100f`), which is correct.

## The main catch: overlapping months are revised

The live database ends at December 2025, so the release adds January to July 2026. It also contains August to December 2025, and those months differ from what we loaded:

- Domestic: monthly row counts rise by 2 to 842 (December 2025: 38,533 rows become 39,375). Passengers rise slightly.
- International: bigger revisions. August 2025 gains 82 rows and passengers go from 24.24M to 24.67M (+1.8%). December gains 173 rows and about +2% passengers.
- Not just late additions: for domestic August to December, 188,784 rows are identical, 3,137 old rows are absent from the new file and 4,509 new rows are not in the old one. Some rows changed value.

So an update must **replace** every month the file covers. Appending would double-count, and "insert rows that don't exist" would leave stale rows behind.

## Proposed script: `update_data.py`

- Standard library only, so it runs locally and on the Fly machine.
- Input: one or more zips or `.asc` files; detects domestic vs international from the filename; tolerates a header row.
- Extracts safely: each archive into its own new directory, never executing anything from it.
- Loads into a staging table, finds the year-month pairs present, then per target table, in one transaction: delete those months, insert the staged rows. A failure rolls back and leaves the table untouched.
- Prints rows removed and added per month.
- Sanity check: refuse if a month in the file has under half the rows already stored for it, unless overridden. Catches truncated downloads and a wrong table.
- `--dry-run` prints the report without writing.
- After loading: create any missing indexes, call `rebuild_derived_tables` (`airport_dir_year`, `airport_carrier_dir_year`, `carrier_pair_year`, `route_year_totals`, `airport_names`, `airport_market` and the rollups below), `ANALYZE`.
- Tests first, against small fixture databases: replacement of overlapping months, rollback on failure, header and headerless files, the half-rows guard.

## Rollup tables must be rebuilt too

Added on the `feature/aircraft-carrier-charts` branch (2026-10-14), and applied to the production volume by hand that day: `aircraft_family`, `family_year`, `family_detail_year`, `carrier_group`, `carrier_group_year` and `aircraft_group_band_year`. They are all derived from the segment tables by `build_database.rebuild_derived_tables`, which reads the rules in `data/aircraft_families.csv` and `data/carrier_groups.csv`. They behave like `airport_dir_year`: after any month is replaced they are stale until rebuilt, and nothing warns about it. The `/aircraft`, `/aircraft/<family>` and `/carriers` pages and the long-haul engine chart read them.

The direction rollups (added 2026-10-28 on the `bidirectional` branch, and loaded onto the production volume by hand that day) replaced `airport_year_totals`, `airport_carrier_year` and `carrier_route_year`: `airport_dir_year` (each airport's yearly departures and arrivals), `airport_carrier_dir_year` (the same by airline group; the `/airports/dedicated` page and the airport charts read it) and `carrier_pair_year` (each airline's pairs as flown). They go stale in the same way. They are 56,309, 521,967 and 1,931,147 rows (about 127MB together), and their passenger totals must agree: `airport_dir_year` and `airport_carrier_dir_year` each sum to 56,906,337,858 passengers both ways, twice `carrier_pair_year`'s 28,453,168,929.

- The update script must call `rebuild_derived_tables` as a whole, not just the airport tables, and its report should print the row counts it returns.
- Rebuilding takes about two minutes locally (130 seconds for everything), so the shared-CPU machine would be slower. Option 1 below already needs `build_database.py` and `data/` in the image; `data/` is not copied by the Dockerfile today, so add it.
- Checks worth keeping in the script: each rollup's departures, passengers and freight must equal the `t100` view's totals (they matched exactly on 2026-10-14), and no segment should land in the "Unknown" family or carrier group.
- New aircraft types or airlines fall into fallback buckets until a rule is added: `aircraft_family.fallback = 1` lists types the rules didn't match, and carriers not in `carrier_groups.csv` are their own group, so a merger needs a new row. Print both lists after a load so new ones get noticed.
- Partial years matter here too: shares of a year on the heat maps and the engine chart will include a seven-month 2026 unless the page treats it like the other charts (see below).
- Restoring: the production rollups were applied from a small separate SQLite file uploaded by sftp and copied in with `ATTACH`, not by running the derivation on the machine. That is a workable fallback if the machine cannot run the full rebuild.

## Decision: partial years

With data to July 2026, 2026 is a seven-month year. If the site treats the latest year as the default, the landing table, globe and charts show 2026 as a tiny, misleading year.

Recommendation: default to the latest **complete** year, include the partial year in menus labelled "2026 (to July)", and derive the cut-off from the database rather than the hard-coded `plugins: t100_globe: min_year/max_year` in `datasette.yml`. The alternative, defaulting to the latest year with a label, is worse because the first view would be misleading.

Things that assume a full year: the aircraft, carrier and engine charts (their "latest year" ranking option uses `max_year`), landing table ranking and year select, the globe year slider and its play-through, `routes_by_year` year columns, `top_airports` (reads `airport_dir_year`), and the route chart's yearly bars.

## Production update

The data isn't in git, so a GitHub Action can't do this. Two routes:

1. **Run on the machine (recommended).** Upload the two zips (about 12MB) to the volume with `flyctl ssh sftp`, run the script via `flyctl ssh console -C "python3 …"`, delete the temp files, restart Datasette. Needs `update_data.py` and `build_database.py` in the image. Costs a minute or two of SQL on a shared CPU. The volume has about 1.3GB free (2026-10-14); the script must not duplicate the tables, so staging has to be small or on a separate temp file (about 100MB per release).
2. **Run locally, re-upload the database.** 2.6GB over chunked sftp, about 45 minutes. Simple but slow.

Either way:

- Take a Fly volume snapshot first and check it has finished before changing anything.
- Load data before pushing any code that depends on it: CI deploys on every push to `main`.
- The site serves the database `--immutable`, so the running Datasette must be restarted after the data changes or it may serve stale or inconsistent pages.
- Run the same script locally first against a scratch copy and compare totals before touching production.
- Run `scripts/smoke_check.sh` afterwards.

## Smaller catches

- New data can add airport codes without coordinates; check `airport_overrides` and the footnote count on the globe page.
- City names for a code come from the newest BTS row (`airport_names`), so rebuild it after loading.
- Expect a rolling window each time: re-running with the same file must be a no-op in effect (same row counts).
- If a later release restates older months than the window covers, the script only touches months present in the file; older months stay as loaded.

## Open questions

- Partial-year handling as above: confirm before implementing.
- Whether to update the local `t100.db` before production (recommended: yes, as the rehearsal).
- Whether the cut-off month should be stored in a small metadata table (simplest) or computed with `MAX(year, month)` each time.
