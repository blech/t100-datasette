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
