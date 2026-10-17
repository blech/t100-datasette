-- Materialise a typed local copy of t100.db into explore/cubes.duckdb (read-only on the source).
INSTALL sqlite; LOAD sqlite;
ATTACH 't100.db' AS d (TYPE sqlite, READ_ONLY);
CREATE OR REPLACE TABLE seg AS SELECT * FROM d.t100;
CREATE OR REPLACE TABLE carriers AS SELECT * FROM d.carriers;
CREATE OR REPLACE TABLE aircraft_types AS SELECT * FROM d.aircraft_types;
CREATE OR REPLACE TABLE airport_names AS SELECT * FROM d.airport_names;
