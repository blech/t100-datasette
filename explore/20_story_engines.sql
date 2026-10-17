-- Story 1: long-haul (3000+ mi) passenger departures by engine configuration.
-- aircraft_group: 6 = twin jet, 7 = tri-jet, 8 = quad-jet (validated in check_groups.sql). Group 6 includes business jets;
-- group 8 includes the BAe 146 and DC-8/707 (BAe 146 is short-haul, so it vanishes at 3000+ mi).
CREATE OR REPLACE VIEW story_engines AS
SELECT year,
  CASE aircraft_group WHEN '6' THEN 'twin' WHEN '7' THEN 'tri' WHEN '8' THEN 'quad' END AS engines,
  sum(deps) AS deps, sum(pax) AS pax
FROM type_year_band
WHERE class IN ('F','L') AND aircraft_group IN ('6','7','8') AND band IN ('4: 3000-4999','5: 5000+') AND seats > 0
GROUP BY ALL;
