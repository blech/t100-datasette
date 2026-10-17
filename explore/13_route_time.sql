-- Directional flight-time cube. Only rows with a recorded air_time (zero means "not reported", not "instant").
-- Keyed down to carrier + aircraft type so changes can be compared like-for-like.
CREATE OR REPLACE TABLE route_time_year AS
  SELECT year, origin, dest, carrier, aircraft_type, any_value(distance) AS distance,
         sum(departures_performed) AS deps, sum(air_time) AS air_min, sum(ramp_to_ramp) AS ramp_min
  FROM seg
  WHERE class IN ('F','L') AND air_time > 0 AND departures_performed > 0
  GROUP BY year, origin, dest, carrier, aircraft_type;

-- Like-for-like change in average air minutes between a base year and a later year:
-- only carrier+aircraft combinations flown in both years, weighted by the later year's departures.
-- coverage = share of the later year's timed departures that had a base-year match.
CREATE OR REPLACE MACRO like_for_like(base_year, year2) AS TABLE
  SELECT b.origin, b.dest, any_value(b.distance) AS distance,
         sum(b.deps) AS base_deps, sum(l.deps) AS later_deps,
         round(sum(b.air_min)/sum(b.deps)) AS base_avg_min, round(sum(l.air_min)/sum(l.deps)) AS later_avg_min,
         round(sum(l.deps * (l.air_min*1.0/l.deps - b.air_min*1.0/b.deps)) / sum(l.deps), 1) AS lfl_change_min,
         round(sum(l.deps) * 1.0 / (SELECT sum(deps) FROM route_time_year t WHERE t.year = year2 AND t.origin = b.origin AND t.dest = b.dest), 2) AS coverage
  FROM route_time_year b
  JOIN route_time_year l ON l.origin=b.origin AND l.dest=b.dest AND l.carrier=b.carrier AND l.aircraft_type=b.aircraft_type
  WHERE b.year = base_year AND l.year = year2
  GROUP BY b.origin, b.dest;
