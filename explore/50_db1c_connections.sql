-- DB1C (BTS's 40% domestic itinerary sample, monthly from July 2025): how much of each airport's boarding
-- traffic is connecting. Reads every explore/DB1C.PUBLIC.*.parquet in place. Field definitions are in
-- source_downloads/DB1C_Description_for_Bookstore.pdf. Domestic-only itineraries (incl. HI, PR, VI): any ticket with
-- an international leg is absent, so international gateways understate connections.
--
-- One row per passenger itinerary; segment n flies Apt_n -> Apt_(n+1) (LastApt after segment 23). Trip breaks at
-- Apt_n: TripBk19_7_n is the classic directional O&D break (the only one DB1B has); TripBk19_8_n adds a break
-- after a stay of over 8 hours. A boarding at Apt_n (n > 1) is a connection when the flag(s) are blank there.
-- Surface coupons (BUS, TRN, --) are not boardings. RpMonth is effectively the month flown (99.98%).

CREATE OR REPLACE TABLE db1c_airport_month AS
WITH t AS (
  SELECT make_date(RpYear, RpMonth, 1) AS month, CouponSeg AS nseg,
         [Apt_1, Apt_2, Apt_3, Apt_4, Apt_5, Apt_6, Apt_7, Apt_8, Apt_9, Apt_10, Apt_11, Apt_12, Apt_13, Apt_14, Apt_15, Apt_16, Apt_17, Apt_18, Apt_19, Apt_20, Apt_21, Apt_22, Apt_23, LastApt] AS apts,
         [NULL, TripBk19_7_2, TripBk19_7_3, TripBk19_7_4, TripBk19_7_5, TripBk19_7_6, TripBk19_7_7, TripBk19_7_8, TripBk19_7_9, TripBk19_7_10, TripBk19_7_11, TripBk19_7_12, TripBk19_7_13, TripBk19_7_14, TripBk19_7_15, TripBk19_7_16, TripBk19_7_17, TripBk19_7_18, TripBk19_7_19, TripBk19_7_20, TripBk19_7_21, TripBk19_7_22, TripBk19_7_23, TripBk19_7_last] AS b7,
         [NULL, TripBk19_8_2, TripBk19_8_3, TripBk19_8_4, TripBk19_8_5, TripBk19_8_6, TripBk19_8_7, TripBk19_8_8, TripBk19_8_9, TripBk19_8_10, TripBk19_8_11, TripBk19_8_12, TripBk19_8_13, TripBk19_8_14, TripBk19_8_15, TripBk19_8_16, TripBk19_8_17, TripBk19_8_18, TripBk19_8_19, TripBk19_8_20, TripBk19_8_21, TripBk19_8_22, TripBk19_8_23, TripBk19_8_last] AS b8,
         [OpCarrier_1, OpCarrier_2, OpCarrier_3, OpCarrier_4, OpCarrier_5, OpCarrier_6, OpCarrier_7, OpCarrier_8, OpCarrier_9, OpCarrier_10, OpCarrier_11, OpCarrier_12, OpCarrier_13, OpCarrier_14, OpCarrier_15, OpCarrier_16, OpCarrier_17, OpCarrier_18, OpCarrier_19, OpCarrier_20, OpCarrier_21, OpCarrier_22, OpCarrier_23] AS op,
         [MktCarrier_1, MktCarrier_2, MktCarrier_3, MktCarrier_4, MktCarrier_5, MktCarrier_6, MktCarrier_7, MktCarrier_8, MktCarrier_9, MktCarrier_10, MktCarrier_11, MktCarrier_12, MktCarrier_13, MktCarrier_14, MktCarrier_15, MktCarrier_16, MktCarrier_17, MktCarrier_18, MktCarrier_19, MktCarrier_20, MktCarrier_21, MktCarrier_22, MktCarrier_23] AS mkt
  FROM 'explore/DB1C.PUBLIC.*.parquet'
), s AS (
  SELECT month, apts[n] AS airport, mkt[n] AS mkt_carrier,
         n > 1 AND b7[n] IS NULL AS conn_dir,
         n > 1 AND b7[n] IS NULL AND b8[n] IS NULL AS conn_8h
  FROM t, range(1, nseg + 1) AS r(n)
  WHERE op[n] NOT IN ('BUS', 'TRN', '--')
)
SELECT month, airport, mkt_carrier, count(*) AS boardings,
       count(*) FILTER (WHERE conn_dir) AS conn_dir, count(*) FILTER (WHERE conn_8h) AS conn_8h
FROM s GROUP BY ALL;

DROP TABLE IF EXISTS db1c_seg; DROP TABLE IF EXISTS db1c_airport;
DROP TABLE IF EXISTS db1c_airport_carrier; DROP TABLE IF EXISTS db1c_vs_t100;
