-- Aircraft family rollup. First matching rule (lowest priority) in data/aircraft_families.csv wins; rules match BTS type names.
-- Unmatched types fall back on BTS ac_group so the totals always add up.
CREATE OR REPLACE TABLE aircraft_family AS
  WITH rules AS (SELECT CAST(priority AS INT) AS priority, name_regex, family, subfamily, "class" AS cls
                 FROM read_csv('data/aircraft_families.csv', all_varchar=true)),
  hit AS (SELECT t.ac_typeid, arg_min(r.family, r.priority) AS family, arg_min(r.subfamily, r.priority) AS subfamily,
                 arg_min(r.cls, r.priority) AS cls, min(r.priority) AS rule
          FROM aircraft_types t JOIN rules r ON regexp_matches(t.name, r.name_regex, 'i') GROUP BY t.ac_typeid)
  SELECT t.ac_typeid AS aircraft_type, t.name,
         coalesce(h.family, CASE t.ac_group WHEN '0' THEN 'Other piston' WHEN '1' THEN 'Other piston' WHEN '2' THEN 'Other piston'
              WHEN '3' THEN 'Other helicopter' WHEN '4' THEN 'Other turboprop' WHEN '5' THEN 'Other turboprop'
              WHEN '6' THEN 'Other jet' WHEN '7' THEN 'Other tri-jet' ELSE 'Other quad-jet' END) AS family,
         coalesce(h.subfamily, '') AS subfamily,
         coalesce(h.cls, CASE t.ac_group WHEN '0' THEN 'Piston' WHEN '1' THEN 'Piston' WHEN '2' THEN 'Piston' WHEN '3' THEN 'Helicopter'
              WHEN '4' THEN 'Turboprop' WHEN '5' THEN 'Turboprop' ELSE 'Other jet' END) AS "class",
         h.rule IS NULL AS fallback
  FROM aircraft_types t LEFT JOIN hit h USING (ac_typeid);

CREATE OR REPLACE TABLE family_year AS
  SELECT y.year, f.family, f.class AS "class", y.domestic, y.class AS service,
         sum(y.deps) AS deps, sum(y.seats) AS seats, sum(y.pax) AS pax, sum(y.freight) AS freight
  FROM type_year_band y JOIN aircraft_family f ON f.aircraft_type = y.aircraft_type
  GROUP BY y.year, f.family, f.class, y.domestic, y.class;
