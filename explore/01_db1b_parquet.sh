#!/bin/sh
# Convert BTS DB1B public zips (one quarter each, pipe-separated .asc inside) to one Parquet file per quarter, streaming
# with unzip -p so the ~0.5 GB text files never land on disk. Quarters already converted are skipped.
#
#   explore/01_db1b_parquet.sh [zip ...]     # default: source_downloads/db1b/DB1B.PUBLIC.*.zip
#
# Output: explore/db1b/db1b_<yyyyq>.parquet, one row per DB1B record (an itinerary and fare, weighted by pax). The
# record layout is in source_downloads/DB1B_Record_Description_Product for bookstore.pdf: 10 ticket fields, then 11 per
# coupon. Airport-level fields are lists of nseg + 1 (origin first); coupon-level fields are lists of nseg. trip_break[k]
# is the code at apts[k] (X, Y or Z = break; NULL at the origin). City market IDs follow an older scheme in 2010 and
# 2011 Q3, so join on airports, not markets.
#
# A few quarters (2019 Q1-Q2, 2020 Q2) are only published as DB1B.<yyyymm>.*.zip without .PUBLIC.: the fuller product,
# which also has itineraries touching foreign points and domestic portions of international trips (trip break Y). The
# public product is exactly the rest, so those records are dropped from every file (none are in the public ones).
set -eu
cd "$(dirname "$0")/.."
mkdir -p explore/db1b
[ $# -gt 0 ] || set -- source_downloads/db1b/DB1B.*.zip

for zip in "$@"; do
  yyyymm=$(basename "$zip" | sed -E 's/^DB1B\.(PUBLIC\.)?([0-9]{6})\..*/\2/')
  yyyyq=$(echo "$yyyymm" | awk '{ printf "%s%d", substr($0, 1, 4), substr($0, 5, 2) / 3 }')
  out="explore/db1b/db1b_$yyyyq.parquet"
  if [ -f "$out" ]; then echo "skip $out"; continue; fi
  echo "$zip -> $out"
  unzip -p "$zip" | duckdb -bail :memory: -c "
    COPY (
      WITH r AS (
        SELECT string_split(line, '|') AS f
        FROM read_csv('/dev/stdin', columns = {'line': 'VARCHAR'}, delim = chr(1), header = false, quote = '', escape = '')
      ), t AS (SELECT f, f[4]::int AS nseg, range(1, f[4]::int + 1) AS ks FROM r
      ), d AS (
      SELECT make_date(f[3][1:4]::int, f[3][5]::int * 3 - 2, 1) AS quarter,
             try_cast(f[1] AS INTEGER) AS fare, f[2] AS rp_carrier, nseg, f[5]::int AS pax, nullif(trim(f[7]), '') AS fare_cred,
             [f[6]] || list_transform(ks, lambda k: f[11 * k + 6]) AS apts,
             [NULL] || list_transform(ks, lambda k: nullif(trim(f[11 * k + 7]), '')) AS trip_break,
             [try_cast(f[8] AS INTEGER)] || list_transform(ks, lambda k: try_cast(f[11 * k + 8] AS INTEGER)) AS city_mkt,
             [try_cast(f[10] AS SMALLINT)] || list_transform(ks, lambda k: try_cast(f[11 * k + 10] AS SMALLINT)) AS wac,
             list_transform(ks, lambda k: f[11 * k]) AS op_carrier,
             list_transform(ks, lambda k: f[11 * k + 1]) AS op_type,
             list_transform(ks, lambda k: f[11 * k + 2]) AS tkt_carrier,
             list_transform(ks, lambda k: f[11 * k + 3]) AS tkt_type,
             list_transform(ks, lambda k: f[11 * k + 4]) AS fare_basis,
             list_transform(ks, lambda k: try_cast(f[11 * k + 5] AS INTEGER)) AS distance
      FROM t)
      SELECT * FROM d WHERE list_max(wac) < 100 AND NOT list_contains(trip_break, 'Y')
    ) TO '$out.tmp' (FORMAT parquet, COMPRESSION zstd);"
  mv "$out.tmp" "$out"
done
