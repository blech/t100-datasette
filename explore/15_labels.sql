-- Merger-aware carrier key + readable labels. Re-run after 10_cubes.sql.
-- carrier_group: airline_id -> group_id/group_name. Mainline mergers only (data/carrier_groups.csv);
-- regional subsidiaries (Comair, Envoy, Piedmont...) and foreign mergers (e.g. BA/Iberia) are left as their own ids.
CREATE OR REPLACE TABLE carrier_group AS
  SELECT m.airline_id, coalesce(g.group_id, m.airline_id) AS group_id,
         coalesce(g.group_name, any_value(m.carrier_name)) AS group_name
  FROM carrier_map m LEFT JOIN read_csv('data/carrier_groups.csv', all_varchar=true) g USING (airline_id)
  GROUP BY m.airline_id, g.group_id, g.group_name;

CREATE OR REPLACE TABLE carrier_group_year AS
  SELECT c.year, g.group_id, any_value(g.group_name) AS group_name, c.domestic, c.class,
         sum(deps) AS deps, sum(seats) AS seats, sum(pax) AS pax, sum(freight) AS freight
  FROM carrier_year c JOIN carrier_group g USING (airline_id) GROUP BY c.year, g.group_id, c.domestic, c.class;

-- labels(kind, key, label): joined onto leads output.
CREATE OR REPLACE TABLE labels AS
  SELECT 'airports' AS kind, d.airport AS key, d.airport || ' - ' || coalesce(n.name, d.city_name) AS label
    FROM airport_dim d LEFT JOIN airport_names n ON n.code = d.airport
  UNION ALL
  SELECT 'city_markets', city_market,
         arg_max(city_name, pax_tot) || ' market (' || count(*) || ' airports)' FROM
         (SELECT d.city_market, d.city_name, d.airport, coalesce((SELECT sum(pax) FROM airport_year y WHERE y.airport=d.airport),0) AS pax_tot FROM airport_dim d)
         GROUP BY city_market
  UNION ALL
  SELECT 'regions_wac', CAST(wac AS VARCHAR),
         CASE WHEN count(*) OVER (PARTITION BY region) > 1 THEN region || ' - ' || biggest_city ELSE region END
  FROM (SELECT wac, mode(trim(regexp_extract(city_name, '[^,]*$'))) AS region,
               arg_max(city_name, (SELECT sum(pax) FROM airport_year y WHERE y.airport=airport_dim.airport)) AS biggest_city
        FROM airport_dim GROUP BY wac)
  UNION ALL
  SELECT 'aircraft_types', ac_typeid, name FROM aircraft_types
  UNION ALL
  SELECT 'carriers', group_id, group_name FROM carrier_group GROUP BY group_id, group_name
  UNION ALL
  SELECT 'market_routes', m1 || '-' || m2, coalesce(n1.city_name, m1) || ' - ' || coalesce(n2.city_name, m2)
  FROM (SELECT DISTINCT m1, m2 FROM market_route_year) r
  LEFT JOIN market_name n1 ON n1.city_market = r.m1 LEFT JOIN market_name n2 ON n2.city_market = r.m2
  UNION ALL
  SELECT 'routes', a || '-' || b, a || '-' || b || ': ' || coalesce(da.city_name, a) || ' - ' || coalesce(db.city_name, b)
  FROM (SELECT DISTINCT a, b FROM route_year) r
  LEFT JOIN airport_dim da ON da.airport = r.a LEFT JOIN airport_dim db ON db.airport = r.b;
