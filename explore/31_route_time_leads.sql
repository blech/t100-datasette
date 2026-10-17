-- Like-for-like flight-time changes vs 2019, written to explore/leads/. Needs 13_route_time.sql and 15_labels.sql.
-- Filters: >=100 timed departures in both years, >=1000 miles, and >=60% of later-year departures matched to a base-year carrier+type.
CREATE OR REPLACE TEMP TABLE lfl AS
  SELECT 2023 AS to_year, * FROM like_for_like(2019, 2023) UNION ALL
  SELECT 2025, * FROM like_for_like(2019, 2025);

COPY (
  SELECT to_year, origin, dest, coalesce(na.city_name, origin) || ' -> ' || coalesce(nb.city_name, dest) AS label, distance,
         base_deps, later_deps, base_avg_min, later_avg_min, lfl_change_min, coverage,
         round(60.0 * distance / later_avg_min) AS later_mph_gc, round(60.0 * distance / base_avg_min) AS base_mph_gc
  FROM lfl LEFT JOIN airport_dim na ON na.airport = lfl.origin LEFT JOIN airport_dim nb ON nb.airport = lfl.dest
  WHERE base_deps >= 100 AND later_deps >= 100 AND distance >= 1000 AND coverage >= 0.6
  QUALIFY row_number() OVER (PARTITION BY to_year ORDER BY lfl_change_min DESC) <= 40
     OR row_number() OVER (PARTITION BY to_year ORDER BY lfl_change_min ASC) <= 15
  ORDER BY to_year, lfl_change_min DESC
) TO 'explore/leads/route_time.csv' (HEADER);

-- Where the changes sit: US <-> foreign country (WAC 1-93 = US states), by direction, weighted by later-year departures.
COPY (
  SELECT to_year, CASE WHEN ao.wac BETWEEN 1 AND 93 THEN 'from US' ELSE 'to US' END AS direction,
         split_part(CASE WHEN ao.wac BETWEEN 1 AND 93 THEN wd.label ELSE wo.label END, ' - ', 1) AS foreign_country,
         count(*) AS routes, sum(later_deps) AS deps, round(sum(lfl_change_min * later_deps) / sum(later_deps), 1) AS avg_lfl_change_min
  FROM lfl
  JOIN airport_dim ao ON ao.airport = lfl.origin JOIN airport_dim ad ON ad.airport = lfl.dest
  JOIN (SELECT key, label FROM labels WHERE kind='regions_wac') wo ON wo.key = CAST(ao.wac AS VARCHAR)
  JOIN (SELECT key, label FROM labels WHERE kind='regions_wac') wd ON wd.key = CAST(ad.wac AS VARCHAR)
  WHERE (ao.wac BETWEEN 1 AND 93) <> (ad.wac BETWEEN 1 AND 93)
    AND base_deps >= 50 AND later_deps >= 50 AND distance >= 1000 AND coverage >= 0.6
  GROUP BY ALL HAVING sum(later_deps) >= 1500
  ORDER BY to_year, abs(avg_lfl_change_min) DESC
) TO 'explore/leads/route_time_countries.csv' (HEADER);
