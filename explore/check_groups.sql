-- Validate the aircraft_group hypothesis: 6 twin jet, 7 tri-jet, 8 quad-jet
LOAD sqlite;
ATTACH 't100.db' AS d (TYPE sqlite, READ_ONLY);
SELECT aircraft_group g, t.name, min(year) first_yr, max(year) last_yr, sum(departures_performed) deps
FROM d.t100 f JOIN d.aircraft_types t ON t.ac_typeid=f.aircraft_type
WHERE aircraft_group IN ('7','8') GROUP BY ALL HAVING deps>2000 ORDER BY g, deps DESC;
-- Do any 4-engine or 3-engine types sit in group 6, or twins in 7/8? (name patterns)
SELECT aircraft_group g, t.name, sum(departures_performed) deps
FROM d.t100 f JOIN d.aircraft_types t ON t.ac_typeid=f.aircraft_type
WHERE (t.name ILIKE '%727%' OR t.name ILIKE '%A340%' OR t.name ILIKE '%747%' OR t.name ILIKE '%MD-11%' OR t.name ILIKE '%DC-10%' OR t.name ILIKE '%L-1011%' OR t.name ILIKE '%A380%' OR t.name ILIKE '%757%' OR t.name ILIKE '%DC-8%' OR t.name ILIKE '%707%' OR t.name ILIKE '%BAe 146%' OR t.name ILIKE '%146%' OR t.name ILIKE '%Il-%' OR t.name ILIKE '%An-%' OR t.name ILIKE '%IL%76%')
GROUP BY ALL HAVING deps>1000 ORDER BY g, deps DESC;
