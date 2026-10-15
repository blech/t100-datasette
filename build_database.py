"""Build helpers for the T-100 database: schema, indexes, view, coordinate overrides."""
import csv
import re
import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

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
-- Aircraft type -> family/subfamily/class, from data/aircraft_families.csv rules by rebuild_aircraft_family()
CREATE TABLE IF NOT EXISTS "aircraft_family" (
   [aircraft_type] TEXT PRIMARY KEY, [name] TEXT, [family] TEXT, [subfamily] TEXT, [aircraft_class] TEXT, [fallback] INTEGER
) WITHOUT ROWID;
-- Yearly totals per aircraft family (service_class is the BTS class: F/L passenger, G/P cargo), by rebuild_family_year()
CREATE TABLE IF NOT EXISTS "family_year" (
   [year] INTEGER, [family] TEXT, [aircraft_class] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [family], [domestic], [service_class])
) WITHOUT ROWID;
-- Merger-aware carrier groups (data/carrier_groups.csv; unlisted airlines are their own group), by rebuild_carrier_groups()
CREATE TABLE IF NOT EXISTS "carrier_group" (
   [airline_id] TEXT PRIMARY KEY, [group_id] TEXT, [group_name] TEXT, [airline_name] TEXT
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "carrier_group_year" (
   [year] INTEGER, [group_id] TEXT, [group_name] TEXT, [airline_id] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [group_id], [airline_id], [domestic], [service_class])
) WITHOUT ROWID;
-- Yearly totals per airline group, member airline and airport pair, both directions together (origin < dest), for an airline's own page, by rebuild_carrier_route_year()
CREATE TABLE IF NOT EXISTS "carrier_route_year" (
   [group_id] TEXT, [airline_id] TEXT, [year] INTEGER, [origin] TEXT, [dest] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER, [first_month] INTEGER, [last_month] INTEGER,
   PRIMARY KEY ([group_id], [airline_id], [year], [origin], [dest])
) WITHOUT ROWID;
-- Yearly totals per aircraft family by subfamily and airline group (for a family's own page), by rebuild_family_detail_year()
CREATE TABLE IF NOT EXISTS "family_detail_year" (
   [family] TEXT, [year] INTEGER, [subfamily] TEXT, [group_id] TEXT, [group_name] TEXT, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([family], [year], [subfamily], [group_id], [domestic], [service_class])
) WITHOUT ROWID;
-- Totals by BTS aircraft_group (6 twin jet, 7 tri-jet, 8 quad-jet...) and distance band (lower bound, miles), by rebuild_aircraft_group_band_year()
CREATE TABLE IF NOT EXISTS "aircraft_group_band_year" (
   [year] INTEGER, [aircraft_group] TEXT, [distance_band] INTEGER, [domestic] INTEGER, [service_class] TEXT,
   [deps] INTEGER, [seats] INTEGER, [passengers] INTEGER, [freight] INTEGER,
   PRIMARY KEY ([year], [aircraft_group], [distance_band], [domestic], [service_class])
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


# derived tables that gained a column: an older copy is dropped (it is only ever rebuilt data) so the rebuild recreates it
_ADDED_COLUMNS = [("carrier_group", "airline_name"), ("carrier_group_year", "airline_id"), ("carrier_route_year", "airline_id")]


def drop_outdated_derived_tables(conn: sqlite3.Connection) -> list:
    dropped = []
    for table, column in _ADDED_COLUMNS:
        columns = [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]
        if columns and column not in columns:
            conn.execute(f'DROP TABLE "{table}"')
            dropped.append(table)
    conn.commit()
    return dropped


def create_schema(conn: sqlite3.Connection) -> None:
    drop_outdated_derived_tables(conn)
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


# Distance bands for aircraft_group_band_year: each band starts at the number shown
DISTANCE_BAND_STARTS = (0, 500, 1500, 3000, 5000)
_BAND_SQL = "CASE WHEN COALESCE(distance, 0) < 500 THEN 0 WHEN distance < 1500 THEN 500 WHEN distance < 3000 THEN 1500 WHEN distance < 5000 THEN 3000 ELSE 5000 END"
# aircraft_types.ac_group -> (family, class) for types no rule in data/aircraft_families.csv matches
_GROUP_FALLBACK = {
    "0": ("Other piston", "Piston"), "1": ("Other piston", "Piston"), "2": ("Other piston", "Piston"),
    "3": ("Other helicopter", "Helicopter"), "4": ("Other turboprop", "Turboprop"), "5": ("Other turboprop", "Turboprop"),
    "6": ("Other jet", "Other jet"), "7": ("Other tri-jet", "Other jet"), "8": ("Other quad-jet", "Other jet"),
}


def rebuild_aircraft_family(conn: sqlite3.Connection, rules_path=None) -> int:
    """Map every aircraft type to a family. The first rule (lowest priority) whose regex matches the type's name wins."""
    create_schema(conn)
    with open(rules_path or DATA_DIR / "aircraft_families.csv", newline="") as f:
        rules = sorted(csv.DictReader(f), key=lambda r: int(r["priority"]))
    compiled = [(re.compile(r["name_regex"], re.IGNORECASE), r["family"], r["subfamily"], r["class"]) for r in rules]
    rows = []
    for code, group, name in conn.execute("SELECT ac_typeid, ac_group, name FROM aircraft_types WHERE ac_typeid IS NOT NULL"):
        for pattern, family, subfamily, cls in compiled:
            if pattern.search(name or ""):
                rows.append((code, name, family, subfamily, cls, 0))
                break
        else:
            family, cls = _GROUP_FALLBACK.get(group, ("Other jet", "Other jet"))
            rows.append((code, name, family, "", cls, 1))
    with conn:
        conn.execute("DELETE FROM aircraft_family")
        conn.executemany("INSERT OR REPLACE INTO aircraft_family VALUES (?, ?, ?, ?, ?, ?)", rows)
    return conn.execute("SELECT COUNT(*) FROM aircraft_family").fetchone()[0]


def rebuild_family_year(conn: sqlite3.Connection) -> int:
    """Recompute family_year from the segment tables and aircraft_family. Segments with an unknown type are kept as 'Unknown'."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM family_year")
        conn.execute(
            """
            INSERT INTO family_year
            SELECT t.year, COALESCE(f.family, 'Unknown'), COALESCE(f.aircraft_class, 'Unknown'), t.domestic, COALESCE(t.class, ''),
                   SUM(t.departures_performed), SUM(t.seats), SUM(t.passengers), SUM(t.freight)
            FROM t100 t LEFT JOIN aircraft_family f ON f.aircraft_type = t.aircraft_type
            WHERE t.year IS NOT NULL
            GROUP BY t.year, COALESCE(f.family, 'Unknown'), COALESCE(f.aircraft_class, 'Unknown'), t.domestic, COALESCE(t.class, '')
            """
        )
    return conn.execute("SELECT COUNT(*) FROM family_year").fetchone()[0]


def rebuild_carrier_groups(conn: sqlite3.Connection, groups_path=None) -> int:
    """Map every airline_id to a merger-aware group. data/carrier_groups.csv lists the mainline mergers; every other airline is its own group."""
    create_schema(conn)
    with open(groups_path or DATA_DIR / "carrier_groups.csv", newline="") as f:
        listed = {r["airline_id"]: (r["group_id"], r["group_name"]) for r in csv.DictReader(f)}
    airlines = conn.execute(
        "SELECT airline_id, MIN(unique_carrier_name) FROM carriers WHERE airline_id IS NOT NULL GROUP BY airline_id"
    ).fetchall()
    rows = [(a, *listed.get(a, (a, name)), name) for a, name in airlines]
    with conn:
        conn.execute("DELETE FROM carrier_group")
        conn.executemany("INSERT INTO carrier_group VALUES (?, ?, ?, ?)", rows)
    return len(rows)


def rebuild_carrier_group_year(conn: sqlite3.Connection) -> int:
    """Recompute carrier_group_year. Carrier entities missing from the carriers table are kept as 'unknown'."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM carrier_group_year")
        conn.execute(
            """
            INSERT INTO carrier_group_year
            SELECT t.year, COALESCE(g.group_id, 'unknown'), COALESCE(g.group_name, 'Unknown carrier'), COALESCE(c.airline_id, 'unknown'), t.domestic, COALESCE(t.class, ''),
                   SUM(t.departures_performed), SUM(t.seats), SUM(t.passengers), SUM(t.freight)
            FROM t100 t
            LEFT JOIN (SELECT unique_carrier_entity AS entity, MIN(airline_id) AS airline_id FROM carriers GROUP BY 1) c ON c.entity = t.carrier_entity
            LEFT JOIN carrier_group g ON g.airline_id = c.airline_id
            WHERE t.year IS NOT NULL
            GROUP BY t.year, COALESCE(g.group_id, 'unknown'), COALESCE(g.group_name, 'Unknown carrier'), COALESCE(c.airline_id, 'unknown'), t.domestic, COALESCE(t.class, '')
            """
        )
    return conn.execute("SELECT COUNT(*) FROM carrier_group_year").fetchone()[0]


def rebuild_carrier_route_year(conn: sqlite3.Connection) -> int:
    """Recompute carrier_route_year: each airline group's yearly flying on each airport pair, by member airline, with the first and last month it flew."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM carrier_route_year")
        conn.execute(
            """
            INSERT INTO carrier_route_year
            SELECT COALESCE(g.group_id, 'unknown'), COALESCE(c.airline_id, 'unknown'), t.year,
                   MIN(t.origin, t.dest), MAX(t.origin, t.dest),
                   SUM(t.departures_performed), SUM(t.seats), SUM(t.passengers), SUM(t.freight),
                   MIN(CASE WHEN t.departures_performed > 0 THEN t.month END), MAX(CASE WHEN t.departures_performed > 0 THEN t.month END)
            FROM t100 t
            LEFT JOIN (SELECT unique_carrier_entity AS entity, MIN(airline_id) AS airline_id FROM carriers GROUP BY 1) c ON c.entity = t.carrier_entity
            LEFT JOIN carrier_group g ON g.airline_id = c.airline_id
            WHERE t.year IS NOT NULL
            GROUP BY COALESCE(g.group_id, 'unknown'), COALESCE(c.airline_id, 'unknown'), t.year, MIN(t.origin, t.dest), MAX(t.origin, t.dest)
            """
        )
    return conn.execute("SELECT COUNT(*) FROM carrier_route_year").fetchone()[0]


def rebuild_family_detail_year(conn: sqlite3.Connection) -> int:
    """Recompute family_detail_year: each aircraft family's yearly totals by subfamily and airline group."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM family_detail_year")
        conn.execute(
            """
            INSERT INTO family_detail_year
            SELECT COALESCE(f.family, 'Unknown'), t.year, COALESCE(f.subfamily, ''),
                   COALESCE(g.group_id, 'unknown'), COALESCE(g.group_name, 'Unknown carrier'), t.domestic, COALESCE(t.class, ''),
                   SUM(t.departures_performed), SUM(t.seats), SUM(t.passengers), SUM(t.freight)
            FROM t100 t
            LEFT JOIN aircraft_family f ON f.aircraft_type = t.aircraft_type
            LEFT JOIN (SELECT unique_carrier_entity AS entity, MIN(airline_id) AS airline_id FROM carriers GROUP BY 1) c ON c.entity = t.carrier_entity
            LEFT JOIN carrier_group g ON g.airline_id = c.airline_id
            WHERE t.year IS NOT NULL
            GROUP BY COALESCE(f.family, 'Unknown'), t.year, COALESCE(f.subfamily, ''),
                     COALESCE(g.group_id, 'unknown'), COALESCE(g.group_name, 'Unknown carrier'), t.domestic, COALESCE(t.class, '')
            """
        )
    return conn.execute("SELECT COUNT(*) FROM family_detail_year").fetchone()[0]


def rebuild_aircraft_group_band_year(conn: sqlite3.Connection) -> int:
    """Recompute aircraft_group_band_year: totals by BTS aircraft_group and distance band, e.g. for long-haul twin vs quad-jet shares."""
    create_schema(conn)
    with conn:
        conn.execute("DELETE FROM aircraft_group_band_year")
        conn.execute(
            f"""
            INSERT INTO aircraft_group_band_year
            SELECT year, COALESCE(aircraft_group, ''), {_BAND_SQL}, domestic, COALESCE(class, ''),
                   SUM(departures_performed), SUM(seats), SUM(passengers), SUM(freight)
            FROM t100 WHERE year IS NOT NULL
            GROUP BY year, COALESCE(aircraft_group, ''), {_BAND_SQL}, domestic, COALESCE(class, '')
            """
        )
    return conn.execute("SELECT COUNT(*) FROM aircraft_group_band_year").fetchone()[0]


def rebuild_derived_tables(conn: sqlite3.Connection) -> dict:
    """Rebuild everything derived from the segment tables. Run after loading or changing segment data."""
    return {
        "airport_year_totals": rebuild_airport_year_totals(conn),
        "airport_names": rebuild_airport_names(conn),
        "aircraft_family": rebuild_aircraft_family(conn),
        "family_year": rebuild_family_year(conn),
        "carrier_group": rebuild_carrier_groups(conn),
        "carrier_group_year": rebuild_carrier_group_year(conn),
        "aircraft_group_band_year": rebuild_aircraft_group_band_year(conn),
        "family_detail_year": rebuild_family_detail_year(conn),
        "carrier_route_year": rebuild_carrier_route_year(conn),
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
