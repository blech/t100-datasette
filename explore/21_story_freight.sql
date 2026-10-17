-- Story 1b: freight (lb) on long-haul (3000+ mi) flights by engine configuration.
-- service = 'freighter' (class G/P, all-cargo) vs 'belly' (class F/L, freight in passenger aircraft holds).
CREATE OR REPLACE VIEW story_freight AS
SELECT year, CASE aircraft_group WHEN '6' THEN 'twin' WHEN '7' THEN 'tri' WHEN '8' THEN 'quad' END AS engines,
  CASE WHEN class IN ('G','P') THEN 'freighter' ELSE 'belly' END AS service,
  sum(freight) AS freight, sum(deps) AS deps
FROM type_year_band WHERE aircraft_group IN ('6','7','8') AND band IN ('4: 3000-4999','5: 5000+')
GROUP BY ALL;
