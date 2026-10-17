-- Routes keyed on BTS city-market pairs, so airport/code switches (OSA->KIX, SEL->ICN) stay one series.
-- Uses the market ID on each segment row (not the airport's latest market), so a market change is respected.
CREATE OR REPLACE TABLE market_route_year AS
  SELECT year, domestic, class, aircraft_group,
         LEAST(origin_city_market_id, dest_city_market_id) AS m1, GREATEST(origin_city_market_id, dest_city_market_id) AS m2,
         any_value(distance) AS distance,
         sum(departures_performed) AS deps, sum(seats) AS seats, sum(passengers) AS pax, sum(freight) AS freight
  FROM seg GROUP BY year, domestic, class, aircraft_group,
         LEAST(origin_city_market_id, dest_city_market_id), GREATEST(origin_city_market_id, dest_city_market_id);

-- Busiest airport pair inside each market pair and year (passengers F/L), to flag airport switches.
CREATE OR REPLACE TABLE market_route_top AS
  SELECT year, m1, m2, arg_max(a || '-' || b, pax) AS top_pair
  FROM (SELECT s.year,
               LEAST(origin_city_market_id, dest_city_market_id) AS m1, GREATEST(origin_city_market_id, dest_city_market_id) AS m2,
               LEAST(origin,dest) AS a, GREATEST(origin,dest) AS b, sum(passengers) AS pax
        FROM seg s WHERE class IN ('F','L') GROUP BY ALL)
  GROUP BY year, m1, m2;

-- Readable market-pair labels (largest airport's city name per market).
CREATE OR REPLACE TABLE market_name AS
  SELECT city_market, arg_max(city_name, (SELECT sum(pax) FROM airport_year y WHERE y.airport = d.airport)) AS city_name
  FROM airport_dim d GROUP BY city_market;
