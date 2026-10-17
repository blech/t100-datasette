-- How much of Virgin America's network did Alaska keep, and when did the routes it dropped stop?
-- Routes are unordered airport pairs; "flown" means at least one departure performed in the month.
CREATE OR REPLACE TEMP TABLE m AS
SELECT CASE carrier_entity WHEN '01006' THEN 'VX' WHEN '11020' THEN 'VX' WHEN '06031' THEN 'AS' WHEN '16031' THEN 'AS'
                           WHEN '11064' THEN 'AS' WHEN '11065' THEN 'AS' WHEN '06580' THEN 'QX' WHEN '11023' THEN 'QX' END AS who,
       least(origin, dest) AS a, greatest(origin, dest) AS b, year * 100 + month AS ym, sum(departures_performed) AS deps, sum(passengers) AS pax
FROM seg
WHERE carrier_entity IN ('01006','11020','06031','16031','11064','11065','06580','11023')
GROUP BY ALL HAVING sum(departures_performed) > 0;

CREATE OR REPLACE TEMP TABLE vx_net AS
SELECT a, b, sum(deps) AS vx_deps_2017, sum(pax) AS vx_pax_2017 FROM m WHERE who='VX' AND ym BETWEEN 201701 AND 201712 GROUP BY a, b HAVING sum(deps) >= 12;

CREATE OR REPLACE TEMP TABLE status AS
SELECT n.a, n.b, n.vx_deps_2017, n.vx_pax_2017,
  (SELECT max(ym) FROM m WHERE who='VX' AND m.a=n.a AND m.b=n.b) AS vx_last,
  (SELECT sum(deps) FROM m WHERE who='AS' AND m.a=n.a AND m.b=n.b AND ym BETWEEN 201601 AND 201612) AS as_2016,
  (SELECT sum(deps) FROM m WHERE who='AS' AND m.a=n.a AND m.b=n.b AND ym BETWEEN 201901 AND 201912) AS as_2019,
  (SELECT sum(deps) FROM m WHERE who='AS' AND m.a=n.a AND m.b=n.b AND ym BETWEEN 202501 AND 202512) AS as_2025,
  (SELECT sum(deps) FROM m WHERE who IN ('AS','QX') AND m.a=n.a AND m.b=n.b AND ym BETWEEN 201901 AND 201912) AS asqx_2019,
  (SELECT sum(deps) FROM m WHERE who IN ('AS','QX') AND m.a=n.a AND m.b=n.b AND ym BETWEEN 202501 AND 202512) AS asqx_2025,
  (SELECT max(ym) FROM m WHERE who='AS' AND m.a=n.a AND m.b=n.b) AS as_last,
  (SELECT max(ym) FROM m WHERE who IN ('AS','QX') AND m.a=n.a AND m.b=n.b) AS asqx_last
FROM vx_net n;

-- the same routes by city market, so a move from Dallas Love to DFW counts as the market kept
CREATE OR REPLACE TEMP TABLE mk AS
SELECT least(origin_city_market_id, dest_city_market_id) AS ma, greatest(origin_city_market_id, dest_city_market_id) AS mb,
       CASE WHEN carrier_entity IN ('01006','11020') THEN 'VX' WHEN carrier_entity IN ('06580','11023') THEN 'QX' ELSE 'AS' END AS who,
       year * 100 + month AS ym, sum(departures_performed) AS deps
FROM seg WHERE carrier_entity IN ('01006','11020','06031','16031','11064','11065','06580','11023')
GROUP BY ALL HAVING sum(departures_performed) > 0;

CREATE OR REPLACE TEMP TABLE vx_mk AS
SELECT least(origin_city_market_id, dest_city_market_id) AS ma, greatest(origin_city_market_id, dest_city_market_id) AS mb, any_value(origin||'-'||dest) AS eg,
       sum(passengers) AS pax, sum(departures_performed) AS deps
FROM seg WHERE carrier_entity IN ('01006','11020') AND year=2017 GROUP BY 1,2 HAVING sum(departures_performed) >= 12;

CREATE OR REPLACE TEMP TABLE out AS
SELECT s.a, s.b, s.vx_deps_2017 vx, s.vx_pax_2017 vxpax, s.asqx_2019 y19, s.asqx_2025 y25,
  (SELECT max(ym) FROM m WHERE who IN ('AS','QX') AND m.a=s.a AND m.b=s.b AND ym >= 201804
     AND (SELECT sum(deps) FROM m x WHERE x.who IN ('AS','QX') AND x.a=s.a AND x.b=s.b AND x.ym=m.ym) >= 3) AS last_as
FROM status s;
