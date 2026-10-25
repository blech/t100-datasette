-- Rollups of the DB1C (monthly, 40%) and DB1B (quarterly, 10%) ticket samples at T100-like grains, for joining to
-- the site's data. See 50 and 01_db1b_parquet.sh for the record layouts and the trip-break rule: a trip breaks at an
-- airport when the directional break (TripBk19_7 / DB1B trip break) is set there. Counts are sample passengers: scale
-- by 1/0.4 or 1/0.1, or better to T100 (international itineraries are excluded, so both run ~10% short).
--
--   od_segment_period  period x origin x dest x operating carrier: passengers, local = flew only this segment
--                      (a trip starts and ends here), connecting_at_origin / connecting_at_dest
--   od_route_period    period x trip origin x trip destination x connecting airports (via, joined by -) x
--                      marketing carriers (joined by /; -- is a surface leg)
--   od_trip_period     od_route_period summed to origin x destination, nonstop vs connecting
-- period is the first day of the month (DB1C) or quarter (DB1B); months says which. Each itinerary is handled as
-- lists (one element per airport / coupon) so nothing coupon-level is materialised: ~100M itineraries.
-- od_segment_period and od_trip_period are copied to explore/od_rollups.db (SQLite) at the end.

-- One row per itinerary: apts and brk have nseg + 1 elements (brk[k]: trip break at apts[k]); op and mkt have nseg.
CREATE OR REPLACE TEMP VIEW od_itin AS
  SELECT 'DB1C' AS source, make_date(RpYear, RpMonth, 1) AS period, 1 AS months, 1 AS pax, CouponSeg AS nseg,
         [Apt_1, Apt_2, Apt_3, Apt_4, Apt_5, Apt_6, Apt_7, Apt_8, Apt_9, Apt_10, Apt_11, Apt_12, Apt_13, Apt_14, Apt_15, Apt_16, Apt_17, Apt_18, Apt_19, Apt_20, Apt_21, Apt_22, Apt_23, LastApt] AS apts,
         list_transform([NULL, TripBk19_7_2, TripBk19_7_3, TripBk19_7_4, TripBk19_7_5, TripBk19_7_6, TripBk19_7_7, TripBk19_7_8, TripBk19_7_9, TripBk19_7_10, TripBk19_7_11, TripBk19_7_12, TripBk19_7_13, TripBk19_7_14, TripBk19_7_15, TripBk19_7_16, TripBk19_7_17, TripBk19_7_18, TripBk19_7_19, TripBk19_7_20, TripBk19_7_21, TripBk19_7_22, TripBk19_7_23, TripBk19_7_last],
                        lambda x: x IS NOT NULL) AS brk,
         [OpCarrier_1, OpCarrier_2, OpCarrier_3, OpCarrier_4, OpCarrier_5, OpCarrier_6, OpCarrier_7, OpCarrier_8, OpCarrier_9, OpCarrier_10, OpCarrier_11, OpCarrier_12, OpCarrier_13, OpCarrier_14, OpCarrier_15, OpCarrier_16, OpCarrier_17, OpCarrier_18, OpCarrier_19, OpCarrier_20, OpCarrier_21, OpCarrier_22, OpCarrier_23] AS op,
         [MktCarrier_1, MktCarrier_2, MktCarrier_3, MktCarrier_4, MktCarrier_5, MktCarrier_6, MktCarrier_7, MktCarrier_8, MktCarrier_9, MktCarrier_10, MktCarrier_11, MktCarrier_12, MktCarrier_13, MktCarrier_14, MktCarrier_15, MktCarrier_16, MktCarrier_17, MktCarrier_18, MktCarrier_19, MktCarrier_20, MktCarrier_21, MktCarrier_22, MktCarrier_23] AS mkt
  FROM 'explore/DB1C.PUBLIC.*.parquet'
  UNION ALL
  SELECT 'DB1B', quarter, 3, pax, nseg, apts, list_transform(trip_break, lambda x: x IS NOT NULL), op_carrier, tkt_carrier
  FROM 'explore/db1b/*.parquet';

CREATE OR REPLACE TABLE od_segment_period AS
  WITH c AS (
    SELECT source, period, months, pax, apts[n] AS origin, apts[n+1] AS dest, op[n] AS op_carrier,
           n > 1 AND NOT brk[n] AS conn_in, n < nseg AND NOT brk[n+1] AS conn_out
    FROM od_itin, range(1, nseg + 1) AS r(n)
    WHERE op[n] NOT IN ('BUS', 'TRN', '--'))
  SELECT source, period, months, origin, dest, op_carrier, sum(pax) AS pax,
         sum(pax) FILTER (WHERE NOT conn_in AND NOT conn_out) AS local_pax,
         sum(pax) FILTER (WHERE conn_in) AS connecting_at_origin,
         sum(pax) FILTER (WHERE conn_out) AS connecting_at_dest
  FROM c GROUP BY ALL;

-- Trips start at coupon 1 and at each break; trip i runs coupons starts[i] .. starts[i+1] - 1 (or nseg).
CREATE OR REPLACE TABLE od_route_period AS
  WITH s AS (
    SELECT *, list_filter(range(1, nseg + 1), lambda k: k = 1 OR brk[k]) AS starts FROM od_itin
  ), t AS (
    SELECT source, period, months, pax, apts, mkt, starts[i] AS st, coalesce(starts[i + 1] - 1, nseg) AS en
    FROM s, range(1, len(starts) + 1) AS r(i))
  SELECT source, period, months, apts[st] AS origin, apts[en + 1] AS dest,
         array_to_string(apts[st + 1:en], '-') AS via, array_to_string(mkt[st:en], '/') AS mkt_carriers,
         sum(pax) AS trips
  FROM t GROUP BY ALL;

CREATE OR REPLACE TABLE od_trip_period AS
  SELECT source, period, months, origin, dest, sum(trips) AS trips,
         sum(trips) FILTER (WHERE via = '') AS nonstop_trips, sum(trips) FILTER (WHERE via <> '') AS connecting_trips
  FROM od_route_period GROUP BY ALL;

INSTALL sqlite; LOAD sqlite;
ATTACH 'explore/od_rollups.db' AS o (TYPE sqlite);
DROP TABLE IF EXISTS o.od_segment_period; DROP TABLE IF EXISTS o.od_trip_period;
CREATE TABLE o.od_segment_period AS SELECT * REPLACE (strftime(period, '%Y-%m-%d') AS period) FROM od_segment_period;
CREATE TABLE o.od_trip_period AS SELECT * REPLACE (strftime(period, '%Y-%m-%d') AS period) FROM od_trip_period;
DETACH o;
