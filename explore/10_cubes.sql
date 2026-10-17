-- Cubes for story exploration. Run against explore/cubes.duckdb after 00_load.sql.
-- Passenger metrics: use class IN ('F','L') only; cargo classes (G,P) are carried separately.

CREATE OR REPLACE MACRO dist_band(d) AS
  CASE WHEN d < 500 THEN '1: <500' WHEN d < 1500 THEN '2: 500-1499'
       WHEN d < 3000 THEN '3: 1500-2999' WHEN d < 5000 THEN '4: 3000-4999' ELSE '5: 5000+' END;

-- Stable lookups ------------------------------------------------------------
-- One airline_id per carrier_entity (verified: no entity maps to several ids).
CREATE OR REPLACE TABLE carrier_map AS
  SELECT unique_carrier_entity AS carrier_entity, any_value(airline_id) AS airline_id,
         any_value(unique_carrier_name) AS carrier_name
  FROM carriers GROUP BY 1;

-- Latest city market / WAC per airport code (codes are reused rarely; 10 and 25 airports change).
CREATE OR REPLACE TABLE airport_dim AS
  SELECT origin AS airport, arg_max(origin_city_market_id, year*100+month) AS city_market,
         arg_max(origin_wac, year*100+month) AS wac, arg_max(origin_city_name, year*100+month) AS city_name
  FROM seg GROUP BY 1;

-- type_year_band: the quad/tri-jet cube ------------------------------------------
CREATE OR REPLACE TABLE type_year_band AS
  SELECT year, domestic, class, aircraft_group, aircraft_type, dist_band(distance) AS band,
         sum(departures_performed) AS deps, sum(seats) AS seats, sum(passengers) AS pax,
         sum(freight) AS freight, sum(air_time) AS air_time
  FROM seg GROUP BY ALL;

-- route_year: unordered airport pair ------------------------------------------------
CREATE OR REPLACE TABLE route_year AS
  SELECT year, domestic, class, aircraft_group,
         LEAST(origin,dest) AS a, GREATEST(origin,dest) AS b, any_value(distance) AS distance,
         sum(departures_performed) AS deps, sum(seats) AS seats, sum(passengers) AS pax,
         sum(freight) AS freight
  FROM seg GROUP BY year, domestic, class, aircraft_group, LEAST(origin,dest), GREATEST(origin,dest);

-- airport_year: each airport counted as origin only (departing traffic) ---------------
CREATE OR REPLACE TABLE airport_year AS
  SELECT s.year, s.origin AS airport, d.city_market, d.wac, d.city_name, s.domestic,
         sum(CASE WHEN class IN ('F','L') THEN departures_performed END) AS pax_deps,
         sum(CASE WHEN class IN ('F','L') THEN seats END) AS seats,
         sum(CASE WHEN class IN ('F','L') THEN passengers END) AS pax,
         sum(CASE WHEN class IN ('G','P') THEN departures_performed END) AS cargo_deps,
         sum(freight) AS freight
  FROM seg s JOIN airport_dim d ON d.airport = s.origin GROUP BY ALL;

-- carrier_year ------------------------------------------------------------------------
CREATE OR REPLACE TABLE carrier_year AS
  SELECT s.year, m.airline_id, any_value(m.carrier_name) AS carrier_name, s.domestic, s.class,
         sum(departures_performed) AS deps, sum(seats) AS seats, sum(passengers) AS pax, sum(freight) AS freight
  FROM seg s JOIN carrier_map m USING (carrier_entity) GROUP BY s.year, m.airline_id, s.domestic, s.class;
