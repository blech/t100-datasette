-- DB1B (BTS's 10% domestic itinerary sample, quarterly, superseded by DB1C from July 2025): the same airport
-- boardings / connections as 50_db1c_connections.sql, from explore/db1b/*.parquet (made by 01_db1b_parquet.sh, which
-- describes the columns). Rows are grouped by routing and fare, so pax weights each row. Only the directional trip
-- break exists (X, Y or Z = break), comparable to DB1C's conn_dir.

CREATE OR REPLACE TABLE db1b_airport_quarter AS
WITH s AS (
  SELECT quarter, pax, apts[n] AS airport, tkt_carrier[n] AS tkt_carrier,
         n > 1 AND trip_break[n] IS NULL AS conn_dir
  FROM 'explore/db1b/*.parquet', range(1, nseg + 1) AS r(n)
  WHERE op_carrier[n] NOT IN ('BUS', 'TRN', '--')
)
SELECT quarter, airport, tkt_carrier AS mkt_carrier, sum(pax) AS boardings,
       sum(pax) FILTER (WHERE conn_dir) AS conn_dir
FROM s GROUP BY ALL;
