#!/bin/sh
# Rank the biggest movers per entity and era; writes explore/leads/<entity>.csv.
# Metric: share of all passenger volume (class F/L), so the 2020 collapse doesn't swamp every era.
# routes = airport pairs; market_routes = city-market pairs (survives airport/code switches). Eras: 1990-2000, 2000-2010, 2010-2019, 2019-2025, plus the full span 1990-2025.  Run from the repo root after 10_cubes.sql and 15_labels.sql.
cd "$(dirname "$0")/.." || exit 1
run() { # name, key-expression, source table, measure
  duckdb -init /dev/null explore/cubes.duckdb <<SQL
COPY (
WITH eras(era, y0, y1) AS (VALUES ('1990-2000',1990,2000),('2000-2010',2000,2010),('2010-2019',2010,2019),('2019-2025',2019,2025),('1990-2025',1990,2025)),
y AS (SELECT year, $2 AS k, sum($4) AS m FROM $3 WHERE $5 GROUP BY ALL),
tot AS (SELECT year, sum(m) AS t FROM y GROUP BY year),
j AS (SELECT e.era, ks.k, coalesce(a.m,0) AS m0, coalesce(b.m,0) AS m1, ta.t AS t0, tb.t AS t1
      FROM eras e CROSS JOIN (SELECT DISTINCT k FROM y) ks
      LEFT JOIN y a ON a.year=e.y0 AND a.k=ks.k LEFT JOIN y b ON b.year=e.y1 AND b.k=ks.k
      JOIN tot ta ON ta.year=e.y0 JOIN tot tb ON tb.year=e.y1),
r AS (SELECT era, k AS "key", m0 AS start_value, m1 AS end_value,
       round(100.0*m0/t0,3) AS start_share_pct, round(100.0*m1/t1,3) AS end_share_pct,
       round(100.0*m1/t1 - 100.0*m0/t0,3) AS share_change_pts,
       CASE WHEN m0=0 THEN 'new' WHEN m1=0 THEN 'gone' ELSE '' END AS flag FROM j)
SELECT r.era, r."key", coalesce(l.label, CAST(r."key" AS VARCHAR)) AS label, r.start_value, r.end_value, r.start_share_pct, r.end_share_pct, r.share_change_pts, r.flag
FROM r LEFT JOIN labels l ON l.kind = '$1' AND l.key = CAST(r."key" AS VARCHAR)
QUALIFY row_number() OVER (PARTITION BY r.era ORDER BY abs(share_change_pts) DESC) <= 25
ORDER BY r.era, abs(share_change_pts) DESC
) TO 'explore/leads/$1.csv' (HEADER);
SQL
}
run airports   "airport"       airport_year pax "pax IS NOT NULL"
run city_markets "city_market" airport_year pax "pax IS NOT NULL"
run regions_wac "wac"          airport_year pax "pax IS NOT NULL"
run carriers   "group_id" carrier_group_year pax "class IN ('F','L')"
run aircraft_types "aircraft_type" type_year_band deps "class IN ('F','L')"
run aircraft_families "family" family_year deps "service IN ('F','L')"
run routes     "a || '-' || b" route_year pax "class IN ('F','L')"   # airport pairs
run market_routes "m1 || '-' || m2" market_route_year pax "class IN ('F','L')"   # city-market pairs

# market_routes: add the busiest airport pair at each end of the era, and flag where it switched.
duckdb -init /dev/null explore/cubes.duckdb <<SQL
COPY (
WITH eras(era, y0, y1) AS (VALUES ('1990-2000',1990,2000),('2000-2010',2000,2010),('2010-2019',2010,2019),('2019-2025',2019,2025),('1990-2025',1990,2025))
SELECT l.*, a.top_pair AS start_airports, b.top_pair AS end_airports,
       CASE WHEN a.top_pair IS NOT NULL AND b.top_pair IS NOT NULL AND a.top_pair <> b.top_pair THEN 'airport switch' ELSE '' END AS airport_switch
FROM read_csv('explore/leads/market_routes.csv', all_varchar=true) l
JOIN eras e ON e.era = l.era
LEFT JOIN market_route_top a ON a.year = e.y0 AND a.m1 || '-' || a.m2 = l."key"
LEFT JOIN market_route_top b ON b.year = e.y1 AND b.m1 || '-' || b.m2 = l."key"
ORDER BY l.era, abs(CAST(l.share_change_pts AS DOUBLE)) DESC
) TO 'explore/leads/market_routes.csv' (HEADER);
SQL
