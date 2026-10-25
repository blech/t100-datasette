-- DB1B (BTS's 10% domestic itinerary sample, quarterly, superseded by DB1C from July 2025): the same airport
-- boardings / connections as 50_db1c_connections.sql, from explore/db1b.public.*.asc. Field definitions are in
-- source_downloads/DB1B_Record_Description_Product for bookstore.pdf.
--
-- Pipe-separated, variable length: fields 1-10 are the ticket (1 fare, 2 reporting carrier, 3 yyyyq, 4 coupons,
-- 5 passengers, 6 origin airport, 7 fare credibility, 8 city market, 9 unused, 10 WAC), then 11 fields per coupon
-- (op carrier, op type, ticketed carrier, ticketed type, fare basis, distance, destination airport, trip break at
-- the destination, city market, unused, WAC). Rows are grouped by routing and fare, so field 5 weights each row.
-- Only the directional trip break exists (X, Y or Z = break), comparable to DB1C's conn_dir.

CREATE OR REPLACE TABLE db1b_airport_quarter AS
WITH r AS (
  SELECT string_split(line, '|') AS f
  FROM read_csv('explore/db1b.public.*.asc', columns = {'line': 'VARCHAR'}, delim = chr(1), header = false,
                quote = '', escape = '')
), t AS (
  SELECT make_date(f[3][1:4]::int, f[3][5]::int * 3 - 2, 1) AS quarter, f[4]::int AS nseg, f[5]::int AS pax, f
  FROM r
), s AS (
  -- coupon n's block starts at 11 * n; it departs from the previous block's destination (or field 6)
  SELECT quarter, pax,
         CASE WHEN n = 1 THEN f[6] ELSE f[11 * (n - 1) + 6] END AS airport,
         f[11 * n + 2] AS tkt_carrier,
         n > 1 AND trim(f[11 * (n - 1) + 7]) = '' AS conn_dir
  FROM t, range(1, nseg + 1) AS r(n)
  WHERE f[11 * n] NOT IN ('BUS', 'TRN', '--')
)
SELECT quarter, airport, tkt_carrier AS mkt_carrier, sum(pax) AS boardings,
       sum(pax) FILTER (WHERE conn_dir) AS conn_dir
FROM s GROUP BY ALL;
