"""Build helpers for the T-100 database: schema, indexes, view, coordinate overrides."""
import csv
import sqlite3

# (name, SQLite type). Same positions as the BTS pipe-delimited files; the raw
# files have one extra, empty trailing field (see FIELDS_PER_ROW).
SEGMENT_COLUMNS = [
    ("year", "INTEGER"),
    ("month", "INTEGER"),
    ("origin", "TEXT"),
    ("origin_city_market_id", "TEXT"),
    ("origin_wac", "INTEGER"),
    ("origin_city_name", "TEXT"),
    ("dest", "TEXT"),
    ("dest_city_market_id", "TEXT"),
    ("dest_wac", "INTEGER"),
    ("dest_city_name", "TEXT"),
    ("carrier", "TEXT REFERENCES [carriers]([carrier])"),
    ("carrier_entity", "TEXT REFERENCES [carriers]([unique_carrier_entity])"),
    ("carrier_group", "TEXT"),
    ("distance", "INTEGER"),
    ("class", "TEXT"),
    ("aircraft_group", "TEXT"),
    ("aircraft_type", "TEXT REFERENCES [aircraft_types]([ac_typeid])"),
    ("aircraft_config", "TEXT"),
    ("departures_performed", "INTEGER"),
    ("departures_scheduled", "INTEGER"),
    ("payload", "INTEGER"),
    ("seats", "INTEGER"),
    ("passengers", "INTEGER"),
    ("freight", "INTEGER"),
    ("mail", "INTEGER"),
    ("ramp_to_ramp", "INTEGER"),
    ("air_time", "INTEGER"),
    ("wac", "INTEGER"),
]
FIELDS_PER_ROW = len(SEGMENT_COLUMNS) + 1  # trailing '|' adds one empty field
SEGMENT_TABLES = ("t100_international", "t100_domestic")

_INDEXES = [
    ("pk_nonunique", "year, month, origin, dest, carrier_entity, aircraft_type, class"),
    ("origin_date_dest", "origin, year, month, dest"),
    ("origin_dest_year", "origin, dest, year"),
]
_LOOKUP_INDEXES = [
    ("idx_carriers_carrier_entity", "carriers", "carrier_entity"),
    ("idx_aircraft_types_ac_typeid", "aircraft_types", "ac_typeid"),
    ("idx_openflights_airports_iata", "openflights_airports", "iata_code"),
]

_LOOKUP_TABLES = """
CREATE TABLE IF NOT EXISTS "carriers" (
   [airline_id] TEXT, [carrier] TEXT, [carrier_entity] TEXT, [name] TEXT,
   [unique_carrier] TEXT, [unique_carrier_entity] TEXT, [unique_carrier_name] TEXT,
   [wac] TEXT, [carrier_group] TEXT, [carrier_group_new] TEXT, [region] TEXT,
   [start_date_source] TEXT, [thru_date_source] TEXT
);
CREATE TABLE IF NOT EXISTS "aircraft_types" (
   [ac_typeid] TEXT, [ac_group] TEXT, [ssd_name] TEXT, [manufacturer] TEXT,
   [name] TEXT, [short_name] TEXT, [begin_date] TEXT
);
CREATE TABLE IF NOT EXISTS "openflights_airports" (
   "id" INTEGER, "name" TEXT, "city" TEXT, "country" TEXT, "iata_code" TEXT,
   "icao_code" TEXT, "latitude" REAL, "longitude" REAL, "altitude" REAL,
   "timezone" TEXT, "dst" TEXT, "tz" TEXT, "type" TEXT, "source" TEXT
);
CREATE TABLE IF NOT EXISTS "airport_overrides" (
   [code] TEXT PRIMARY KEY, [name] TEXT, [city] TEXT, [country] TEXT,
   [latitude] REAL, [longitude] REAL
);
-- Derived from the segment tables by rebuild_airport_year_totals(); read by the landing page
CREATE TABLE IF NOT EXISTS "airport_year_totals" (
   [year] INTEGER, [origin] TEXT, [origin_city_name] TEXT, [origin_wac] INTEGER,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [origin])
) WITHOUT ROWID;
-- BTS's own name for each airport code ("Raleigh/Durham, NC"), derived by rebuild_airport_names()
CREATE TABLE IF NOT EXISTS "airport_names" (
   [code] TEXT PRIMARY KEY, [name] TEXT
) WITHOUT ROWID;
"""


def _segment_ddl(table):
    cols = ",\n".join(f"   [{n}] {t}" for n, t in SEGMENT_COLUMNS)
    return f'CREATE TABLE IF NOT EXISTS "{table}" (\n{cols}\n)'


def _view_sql():
    cols = ", ".join(n for n, _ in SEGMENT_COLUMNS)
    return (
        f"CREATE VIEW IF NOT EXISTS t100 AS "
        f"SELECT 0 AS domestic, {cols} FROM t100_international "
        f"UNION ALL SELECT 1, {cols} FROM t100_domestic"
    )


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(_LOOKUP_TABLES)
    for table in SEGMENT_TABLES:
        conn.execute(_segment_ddl(table))
    conn.execute(_view_sql())
    conn.commit()


def create_indexes(conn: sqlite3.Connection) -> None:
    for table in SEGMENT_TABLES:
        for suffix, cols in _INDEXES:
            conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_{suffix} ON {table} ({cols})")
    for name, table, col in _LOOKUP_INDEXES:
        conn.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({col})")
    conn.commit()


def rebuild_airport_year_totals(conn: sqlite3.Connection) -> int:
    """Recompute airport_year_totals from both segment tables. Run after loading or changing segment data."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM airport_year_totals")
        conn.execute(
            """
            INSERT INTO airport_year_totals (year, origin, origin_city_name, origin_wac, deps, seats, passengers, freight)
            SELECT year, origin, MAX(origin_city_name), MAX(origin_wac),
                   SUM(departures_performed), SUM(seats), SUM(passengers), SUM(freight)
            FROM t100
            WHERE year IS NOT NULL AND origin IS NOT NULL
            GROUP BY year, origin
            """
        )
    return conn.execute("SELECT COUNT(*) FROM airport_year_totals").fetchone()[0]


def rebuild_airport_names(conn: sqlite3.Connection) -> int:
    """Recompute airport_names: the newest BTS city name for each airport code, trimmed.

    The literal text 'NULL' (which BTS uses for some rows) is not a name. Within a year the commonest name wins.
    """
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM airport_names")
        conn.execute(
            """
            INSERT INTO airport_names (code, name)
            SELECT code, name FROM (
              SELECT code, name,
                     ROW_NUMBER() OVER (PARTITION BY code ORDER BY year DESC, uses DESC, name) AS rank
              FROM (
                SELECT code, name, year, SUM(uses) AS uses FROM (
                  SELECT origin AS code, TRIM(origin_city_name) AS name, year, COUNT(*) AS uses FROM t100 GROUP BY 1, 2, 3
                  UNION ALL
                  SELECT dest, TRIM(dest_city_name), year, COUNT(*) FROM t100 GROUP BY 1, 2, 3
                )
                WHERE code IS NOT NULL AND name IS NOT NULL AND name NOT IN ('', 'NULL')
                GROUP BY code, name, year
              )
            ) WHERE rank = 1
            """
        )
    return conn.execute("SELECT COUNT(*) FROM airport_names").fetchone()[0]


def rebuild_derived_tables(conn: sqlite3.Connection) -> dict:
    """Rebuild everything derived from the segment tables. Run after loading or changing segment data."""
    return {
        "airport_year_totals": rebuild_airport_year_totals(conn),
        "airport_names": rebuild_airport_names(conn),
    }


def load_airport_overrides(conn: sqlite3.Connection, csv_path) -> int:
    with open(csv_path, newline="") as f:
        rows = list(csv.DictReader(f))
    conn.executemany(
        "INSERT OR REPLACE INTO airport_overrides (code, name, city, country, latitude, longitude) "
        "VALUES (:code, :name, :city, :country, :latitude, :longitude)",
        rows,
    )
    conn.commit()
    return len(rows)
