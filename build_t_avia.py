#!/usr/bin/env python3
"""Build t_avia.db, the European airports' database, from Eurostat's route tables and the CAA's UK route tables.

    uv run python build_t_avia.py [--db t_avia.db] [--sources source_downloads] [--t100 t100.db]

Eurostat (source_downloads/eu/estat_avia_par_xx.tsv.gz and estat_avia_gor_xx.tsv.gz, fetched by scripts/fetch_eurostat.py)
gives each reporting airport's routes by year and month: passengers carried, passenger flights and seats, and freight and
freight-only flights, each by direction. The CAA (source_downloads/uk, tables 12.1 and 12.2; scripts/fetch_caa.py) gives a
UK airport's passengers by route and year, both directions together, and fills each UK airport-year Eurostat doesn't have.
Airport names, places and coordinates come from t100.db's openflights_airports and airport_overrides, copied so this
database stands alone. The whole file is rebuilt each time, beside it, then moved into place.

Design: docs/superpowers/specs/2026-11-18-european-airports-design.md; what was decided while building it:
docs/superpowers/plans/2026-11-18-european-airports.md."""
import argparse
import collections
import csv
import gzip
import io
import math
import re
import sqlite3
import sys
import zipfile
from pathlib import Path

from build_database import TOP_ROUTE_SCHEMA, rebuild_top_route_year

HERE = Path(__file__).resolve().parent
CAA_FLOOR = 10_000  # passengers a year for a route in a CAA year: Eurostat's own publishing limit (the user's choice)

# Eurostat measure -> column of route_year / route_month
PAR_MEASURES = {
    "PAS_CRD": "passengers", "PAS_CRD_DEP": "passengers_out", "PAS_CRD_ARR": "passengers_in",
    "CAF_PAS": "pax_flights", "CAF_PAS_DEP": "pax_flights_out", "CAF_PAS_ARR": "pax_flights_in",
    "ST_PAS": "seats", "ST_PAS_DEP": "seats_out", "ST_PAS_ARR": "seats_in",
    # passengers on board: only where a route has no passengers carried (Turkey before 2023), as near as Eurostat has
    "PAS_BRD": "on_board", "PAS_BRD_DEP": "on_board_out", "PAS_BRD_ARR": "on_board_in",
}
GOR_MEASURES = {
    "FRM_LD_NLD": "freight", "FRM_LD": "freight_out", "FRM_NLD": "freight_in",
    "CAF_FRM": "freight_flights", "CAF_FRM_DEP": "freight_flights_out", "CAF_FRM_ARR": "freight_flights_in",
}
COLUMNS = ("passengers", "passengers_out", "passengers_in", "pax_flights", "pax_flights_out", "pax_flights_in",
           "seats", "seats_out", "seats_in", "freight", "freight_out", "freight_in",
           "freight_flights", "freight_flights_out", "freight_flights_in")
ICAO = re.compile(r"^[A-Z0-9]{4}$")
PLACEHOLDER = re.compile(r"^([A-Z]{2}[0-9]{2}|ZZZZ)$")  # Eurostat's other or unknown airports of a country (EG90, LF99) or anywhere


def read_aliases(path):
    """(old ICAO code -> the code it is now, the old codes whose figures add to the new one's) from
    data/avia_airport_overrides.csv's alias_of and combine columns. An alias is the same airport under another code, so
    where a route is filed under both, they're one report and the larger is kept (Italy files Rhodes under both of its
    codes in 1994); a `combine` of `sum` is a different airport whose figures are added (Atatürk's, before Istanbul
    Airport took over in April 2019)."""
    if not path.exists():
        return {}, set()
    with path.open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("alias_of") or "").strip()]
    return ({r["icao"].strip().upper(): r["alias_of"].strip().upper() for r in rows},
            {r["icao"].strip().upper() for r in rows if (r.get("combine") or "").strip() == "sum"})


ALIASES, SUMMED = read_aliases(HERE / "data" / "avia_airport_overrides.csv")
US_COUNTRIES = ("United States", "Puerto Rico", "Guam", "Virgin Islands", "American Samoa", "Northern Mariana Islands")

_route_columns = ",\n  ".join(f"{c} {'REAL' if c.startswith('freight') and 'flights' not in c else 'INTEGER'}" for c in COLUMNS)
SCHEMA = f"""
CREATE TABLE airport_info (
  icao TEXT PRIMARY KEY, code TEXT UNIQUE, name TEXT, city TEXT, country TEXT, country_code TEXT,
  latitude REAL, longitude REAL, is_us INTEGER, reporting INTEGER, placeholder INTEGER, first_year INTEGER, last_year INTEGER
);
CREATE TABLE route_year (
  airport TEXT, other TEXT, year INTEGER, source TEXT, domestic INTEGER,
  on_board INTEGER,  -- 1 where the passengers are Eurostat's on board, the route having none carried
  {_route_columns},
  PRIMARY KEY (airport, other, year)
) WITHOUT ROWID;
CREATE TABLE route_month (
  airport TEXT, other TEXT, year INTEGER, month INTEGER, domestic INTEGER,
  on_board INTEGER,
  {_route_columns},
  PRIMARY KEY (airport, year, month, other)
) WITHOUT ROWID;
CREATE TABLE caa_names (name TEXT PRIMARY KEY, icao TEXT, how TEXT, votes INTEGER) WITHOUT ROWID;
CREATE TABLE pair_distance (a TEXT, b TEXT, distance INTEGER, PRIMARY KEY (a, b)) WITHOUT ROWID;
CREATE TABLE build_notes (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
-- one report per airport pair and year (a before b, display codes), for totals that would count a pair twice: a pair of two
-- reporting airports is in route_year once from each end. airport is the end whose report is kept (write_pairs)
CREATE TABLE pair_year (
  a TEXT, b TEXT, year INTEGER, airport TEXT, source TEXT, domestic INTEGER,
  deps INTEGER, seats INTEGER, passengers INTEGER, freight REAL,
  PRIMARY KEY (a, b, year)
) WITHOUT ROWID;
""" + TOP_ROUTE_SCHEMA
INDEXES = """
CREATE INDEX idx_route_year_other ON route_year (other, year);
CREATE INDEX idx_route_month_other ON route_month (other, year, month);
"""


# --- Eurostat

def eurostat_number(cell):
    """A Eurostat cell's value: '12345', '12345 e' (with a flag), ': ' or ': c' (not published) -> number or None."""
    head = cell.strip().split(" ")[0]
    if head in ("", ":"):
        return None
    try:
        value = float(head)
    except ValueError:
        return None
    return int(value) if value.is_integer() else value


def read_eurostat(path, measures):
    """Yield (reporting ICAO, its country prefix, partner ICAO, partner country, year, month or 0, column, value, part) from
    one route file, for its years and months; quarters are left out. `part` names the summed codes (SUMMED) the row was
    filed under, so their figures add to the new code's instead of being taken as the same report."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        head = [h.strip() for h in f.readline().rstrip("\n").split("\t")]
        keys = head[0].split("\\")[0].split(",")
        years = [(i, int(h), 0) for i, h in enumerate(head) if i and re.fullmatch(r"\d{4}", h)]
        months = [(i, int(h[:4]), int(h[5:])) for i, h in enumerate(head) if i and re.fullmatch(r"\d{4}-\d\d", h)]
        for line in f:
            cells = line.rstrip("\n").split("\t")
            key = dict(zip(keys, cells[0].split(",")))
            column = measures.get(key.get("tra_meas"))
            periods = {"A": years, "M": months}.get(key.get("freq"))
            if not column or periods is None:
                continue
            parts = key["airp_pr"].split("_")
            if len(parts) != 4 or not ICAO.match(parts[1]) or not ICAO.match(parts[3]) or parts[1] == parts[3]:
                continue
            for i, year, month in periods:
                if i < len(cells):
                    value = eurostat_number(cells[i])
                    if value is not None:
                        part = " ".join(c for c in (parts[1], parts[3]) if c in SUMMED)
                        yield ALIASES.get(parts[1], parts[1]), parts[0], ALIASES.get(parts[3], parts[3]), parts[2], year, month, column, value, part


def load_eurostat(db, eu_dir):
    """Every Eurostat value into the staging table raw (airport, other, year, month, column, value); each ICAO code's
    country prefix as Eurostat gives it."""
    db.execute("CREATE TEMP TABLE raw (airport TEXT, other TEXT, year INTEGER, month INTEGER, col TEXT, value REAL, part TEXT)")
    countries = {}
    files = sorted(eu_dir.glob("estat_avia_par_*.tsv.gz")) + sorted(eu_dir.glob("estat_avia_gor_*.tsv.gz"))
    for path in files:
        measures = PAR_MEASURES if "_par_" in path.name else GOR_MEASURES
        batch = []
        for rep, rep_cc, other, other_cc, year, month, column, value, part in read_eurostat(path, measures):
            countries.setdefault(rep, rep_cc)
            countries.setdefault(other, other_cc)
            batch.append((rep, other, year, month, column, value, part))
            if len(batch) >= 200_000:
                db.executemany("INSERT INTO raw VALUES (?,?,?,?,?,?,?)", batch)
                batch.clear()
        db.executemany("INSERT INTO raw VALUES (?,?,?,?,?,?,?)", batch)
        print(f"  {path.name}", file=sys.stderr)
    return countries


def pivot_eurostat(db):
    """route_year and route_month from the staging table: one row per airport, other airport and period. A route filed
    under one code twice keeps the larger figure; one filed under a summed code too (`part`) adds it. Passengers are those
    carried, or on board where a route has none carried (on_board says so)."""
    def pick(c):
        return f"MAX(CASE WHEN col = '{c}' THEN value END)"
    picks = ", ".join(f"COALESCE({pick(c)}, {pick(c.replace('passengers', 'on_board'))})" if c.startswith("passengers") else pick(c)
                      for c in COLUMNS)
    on_board = f"CASE WHEN {pick('passengers')} IS NULL AND {pick('on_board')} IS NOT NULL THEN 1 END"
    values = """(SELECT airport, other, year, month, col, SUM(value) AS value FROM
                   (SELECT airport, other, year, month, col, MAX(value) AS value FROM raw WHERE {where} GROUP BY airport, other, year, month, col, part)
                 GROUP BY airport, other, year, month, col)"""
    db.execute(f"""INSERT INTO route_year (airport, other, year, source, on_board, {', '.join(COLUMNS)})
                   SELECT airport, other, year, 'eurostat', {on_board}, {picks} FROM {values.format(where="month = 0")} GROUP BY airport, other, year""")
    db.execute(f"""INSERT INTO route_month (airport, other, year, month, on_board, {', '.join(COLUMNS)})
                   SELECT airport, other, year, month, {on_board}, {picks} FROM {values.format(where="month > 0")} GROUP BY airport, other, year, month""")


# --- CAA

def caa_files(uk_dir):
    """(year, kind, format, name, bytes) for each annual CAA table 12.1 ('intl') and 12.2 ('dom'): the 1990-2014 zips (their
    annual tables, not the months') and the 2015 onwards folders. 1997-2000 have table 12 as .xls, international only."""
    intl = re.compile(r"12_1_.*(intl|lntl).*\.csv$", re.I)
    dom = re.compile(r"12_2_.*dom.*\.csv$", re.I)
    intl_xls = re.compile(r"^12_(intl|lntl).*route.*\.xls$", re.I)
    for zpath in sorted(uk_dir.glob("* Monthly Airport Data.zip")):
        year = int(zpath.name[:4])
        with zipfile.ZipFile(zpath) as z:
            for member in z.namelist():
                if re.search(r"(^|/)\d{6}/", member):  # a month's folder
                    continue
                base = member.rsplit("/", 1)[-1]
                for kind, fmt, pattern in (("intl", "csv", intl), ("dom", "csv", dom), ("intl", "xls", intl_xls)):
                    if pattern.search(base):
                        yield year, kind, fmt, member, z.read(member)
    for folder in sorted(p for p in uk_dir.iterdir() if p.is_dir() and re.fullmatch(r"\d{4}", p.name)):
        for path in sorted(folder.glob("*.csv")):
            for kind, pattern in (("intl", intl), ("dom", dom)):
                if pattern.search(path.name.replace(" ", "_")):
                    yield int(folder.name), kind, "csv", path.name, path.read_bytes()


def caa_number(cell):
    try:
        return int(round(float(str(cell).strip().replace(",", ""))))
    except ValueError:
        return None


def usable(a, b, pax):
    return a and b not in ("=", "", "UNKNOWN") and a not in ("OTHER ROUTES", "UNKNOWN") and a != b and pax


def read_caa(kind, data):
    """[(UK airport name, other airport name, passengers)] from one CSV table: the first number after the two airports is
    this year's total, in every year's layout."""
    rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig", "replace"))))
    head = [h.strip().lower() for h in rows[0]]
    names = ("uk_airport", "uk_apt", "foreign_airport", "foreign_apt") if kind == "intl" else ("airport1", "apt1_apt_name", "airport2", "apt2_apt_name")
    first = next(i for i, h in enumerate(head) if h in names[:2])
    second = next(i for i, h in enumerate(head) if h in names[2:])
    out = []
    for r in rows[1:]:
        if len(r) > second + 1:
            a, b, pax = r[first].strip().upper(), r[second].strip().upper(), caa_number(r[second + 1])
            if usable(a, b, pax):
                out.append((a, b, pax))
    return out


def read_caa_xls(data):
    """The same from a 1997-2000 spreadsheet, whose route rows are 'GATWICK', '-', 'INNSBRUCK', then this year's total as the
    first number. Needs xlrd (uv run --with xlrd); without it those years are left out."""
    try:
        import xlrd
    except ImportError:
        return None
    sheet = xlrd.open_workbook(file_contents=data).sheet_by_index(0)
    out = []
    for i in range(sheet.nrows):
        row = sheet.row_values(i)
        if len(row) > 3 and str(row[1]).strip() == "-":
            a, b = str(row[0]).strip().upper(), str(row[2]).strip().upper()
            pax = next((caa_number(v) for v in row[3:] if caa_number(v) is not None and str(v).strip() != ""), None)
            if usable(a, b, pax):
                out.append((a, b, pax))
    return out


def load_caa(uk_dir):
    """{year: [(kind, UK airport name, other airport name, passengers)]}"""
    by_year = collections.defaultdict(list)
    for year, kind, fmt, name, data in caa_files(uk_dir):
        rows = read_caa(kind, data) if fmt == "csv" else read_caa_xls(data)
        if rows is None:
            print(f"  CAA {year} {kind}: {name} needs xlrd, left out", file=sys.stderr)
            continue
        by_year[year].extend((kind, a, b, p) for a, b, p in rows)
        print(f"  CAA {year} {kind}: {len(rows)} routes", file=sys.stderr)
    return by_year


def learn_caa_names(db, caa):
    """{name: {year: Counter(ICAO)}}: in the years both sources have, a CAA route whose passengers equal exactly one Eurostat
    UK pair's (both directions together) votes for that pair's codes in that year. Codes change (Johannesburg was FAJS and
    became FAOR), so a name's code is looked up by year (caa_code)."""
    uk_pairs = collections.defaultdict(lambda: collections.defaultdict(list))  # year -> passengers -> [(airport, other)]
    for airport, other, year, pax in db.execute("SELECT airport, other, year, passengers FROM route_year WHERE airport LIKE 'EG%' AND passengers > 0"):
        uk_pairs[year][int(pax)].append((airport, other))
    votes = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for year, rows in caa.items():
        pairs = uk_pairs.get(year)
        if not pairs:
            continue
        for kind, a, b, pax in rows:
            found = pairs.get(pax, [])
            if kind == "dom":  # the CAA lists a domestic pair once; Eurostat has it from both ends
                found = [p for p in found if p[1].startswith("EG")]
                if len(found) == 2 and found[0] == found[1][::-1]:
                    found = found[:1]
            if len(found) == 1:
                airport, other = found[0]
                votes[a][year][airport] += 1
                votes[b][year][other] += 1
    return votes


def caa_code(votes, name, year):
    """A name's code in a year: that year's majority among the codes with real support (2 votes or more, and a tenth of its
    top code's), else the nearest year's (the later one on a tie). One chance match of equal figures doesn't move a name."""
    by_year = votes.get(name)
    if not by_year:
        return None
    total = collections.Counter()
    for c in by_year.values():
        total.update(c)
    top = total.most_common(1)[0][1]
    good = {code for code, v in total.items() if v >= 2 and v * 10 >= top} or {total.most_common(1)[0][0]}
    years = [y for y, c in by_year.items() if any(code in good for code in c)]
    nearest = min(years, key=lambda y: (abs(y - year), -y))
    return max((code for code in by_year[nearest] if code in good), key=lambda code: by_year[nearest][code])


def openflights_names(t100):
    """A fallback for names never matched by figures: upper-case city -> [(ICAO, upper-case name)] for airports with an IATA
    code, from OpenFlights."""
    db = sqlite3.connect(f"file:{t100}?mode=ro", uri=True)
    by_city = collections.defaultdict(list)
    for icao, name, city in db.execute(
            "SELECT icao_code, name, city FROM openflights_airports WHERE icao_code NOT IN ('', '\\N') AND iata_code NOT IN ('', '\\N') "
            "AND icao_code IS NOT NULL AND iata_code IS NOT NULL ORDER BY id"):
        by_city[(city or "").upper()].append((icao, (name or "").upper()))
    db.close()
    return by_city


def guess_code(by_city, name):
    """'TUNIS' -> the one airport whose city is Tunis; 'NEW YORK (NEWARK)' -> the New York airport whose name has NEWARK."""
    base, _, rest = name.partition("(")
    base = base.strip().rstrip("-").strip()
    hint = rest.rstrip(")").strip()
    candidates = by_city.get(base, [])
    if len(candidates) == 1:
        return candidates[0][0]
    if hint and candidates:
        word = re.split(r"[\s/-]+", hint)[0]
        named = [c for c in candidates if word and word in c[1]]
        if len(named) == 1:
            return named[0][0]
    return None


def read_name_overrides(path):
    """name -> [(from year or None, to year or None, ICAO)] from data/caa_airports.csv: a name the figures can't settle, or
    one that moved (the CAA's ISTANBUL was Atatürk until 2018 and the new airport from 2019)."""
    if not path.exists():
        return {}
    out = collections.defaultdict(list)
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if (r.get("icao") or "").strip():
                year = lambda k: int(r[k]) if (r.get(k) or "").strip() else None
                out[r["name"].strip().upper()].append((year("from_year"), year("to_year"), r["icao"].strip().upper()))
    return dict(out)


def override_code(overrides, name, year):
    for first, last, icao in overrides.get(name, ()):
        if (first is None or year >= first) and (last is None or year <= last):
            return icao
    return None


def add_caa(db, caa, coder, countries):
    """A UK airport's route list and passengers from the CAA, every year it has: a route Eurostat has too keeps Eurostat's
    flights, seats and freight beside the CAA's passengers (the same figures, where both publish them); a route only the CAA
    has gets passengers alone; a Eurostat route the CAA doesn't list (one whose name has no code, or a domestic route in
    1997-2000) stays as it is. A domestic pair counts at both its airports. Returns (routes added, routes joined, unnamed)."""
    unnamed = collections.Counter()
    added = joined = 0
    for year, routes in sorted(caa.items()):
        merged = collections.Counter()
        for kind, a, b, pax in routes:
            ia, ib = coder(a, year), coder(b, year)
            if not ia or not ib:
                unnamed[a if not ia else b] += pax
                continue
            if ia == ib:
                continue
            if kind == "dom" and not (ia.startswith("EG") and ib.startswith("EG")):  # a domestic name coded abroad is a wrong guess
                unnamed[b if ia.startswith("EG") else a] += pax
                continue
            merged[(ia, ib)] += pax
            countries.setdefault(ia, "UK")
            if kind == "dom":
                merged[(ib, ia)] += pax
                countries.setdefault(ib, "UK")
        for (ia, ib), pax in merged.items():
            cur = db.execute("UPDATE route_year SET passengers = ?, on_board = NULL, source = 'caa+eurostat' WHERE airport = ? AND other = ? AND year = ?", (pax, ia, ib, year))
            if cur.rowcount:
                joined += 1
            else:
                db.execute("INSERT INTO route_year (airport, other, year, source, passengers) VALUES (?,?,?,'caa',?)", (ia, ib, year, pax))
                added += 1
    return added, joined, unnamed


# --- airports

def openflights(t100):
    """ICAO -> (IATA or None, name, city, country, lat, lon) from t100.db's openflights_airports, the lowest id where a code is
    there twice, with airport_overrides' names and coordinates winning for its IATA codes, as the T-100 airports query has it.
    An IATA code goes to the first ICAO code that has it; a later one keeps its ICAO code."""
    db = sqlite3.connect(f"file:{t100}?mode=ro", uri=True)
    overrides = {r[0]: r[1:] for r in db.execute("SELECT code, name, city, country, latitude, longitude FROM airport_overrides")}
    out, taken = {}, set()
    for icao, iata, name, city, country, lat, lon in db.execute(
            "SELECT icao_code, iata_code, name, city, country, latitude, longitude FROM openflights_airports "
            "WHERE icao_code IS NOT NULL AND icao_code NOT IN ('', '\\N') ORDER BY id"):
        if icao in out:
            continue
        iata = iata if iata and iata not in ("", "\\N") and iata not in taken else None
        if iata in overrides:
            o = overrides[iata]
            name, city, country = o[0] or name, o[1] or city, o[2] or country
            lat, lon = (o[3], o[4]) if o[3] is not None and o[4] is not None else (lat, lon)
        out[icao] = (iata, name, city, country, lat, lon)
        if iata:
            taken.add(iata)
    db.close()
    return out


def read_airport_overrides(path):
    """ICAO -> (IATA, name, city, country, lat, lon), each None where not given, from data/avia_airport_overrides.csv."""
    if not path.exists():
        return {}
    out = {}
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if (r.get("alias_of") or "").strip():
                continue

            def num(k):
                return float(r[k]) if (r.get(k) or "").strip() else None
            out[r["icao"].strip().upper()] = ((r.get("iata") or "").strip().upper() or None, r.get("name") or None, r.get("city") or None,
                                              r.get("country") or None, num("latitude"), num("longitude"))
    return out


def great_circle_miles(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(a))


def write_pairs(db):
    """pair_year from route_year, then the routes matrix's top_route_year and route_band_year from it (T-100's own ranking).
    Of a pair's two reports in a year, Eurostat's (with flights and freight) is kept over a CAA-only one, then one with
    freight over one without (Istanbul's reports had none before 2023, so FRA-IST would lose 61,000 tonnes in 2019), then the
    one with more passengers, then the first airport's; never an average, which would match neither airport's route page. Pairs with a
    placeholder at either end are left out. Returns the rows written."""
    db.execute("DELETE FROM pair_year")
    db.execute("""
        INSERT INTO pair_year
        SELECT MIN(ca, cb), MAX(ca, cb), year, ca, source, domestic, deps, seats, passengers, freight FROM (
          SELECT x.code AS ca, y.code AS cb, r.year, r.source, r.domestic, r.seats, r.passengers, r.freight,
            CASE WHEN r.pax_flights IS NULL AND r.freight_flights IS NULL THEN NULL
                 ELSE IFNULL(r.pax_flights, 0) + IFNULL(r.freight_flights, 0) END AS deps,
            ROW_NUMBER() OVER (PARTITION BY MIN(x.code, y.code), MAX(x.code, y.code), r.year
                               ORDER BY r.source = 'caa', r.freight IS NULL, r.passengers DESC NULLS LAST, x.code) AS pick
          FROM route_year r JOIN airport_info x ON x.icao = r.airport JOIN airport_info y ON y.icao = r.other
          WHERE x.placeholder = 0 AND y.placeholder = 0 AND x.code != y.code)
        WHERE pick = 1""")
    rebuild_top_route_year(db, pairs_sql="""
        SELECT a, b, year, CASE WHEN domestic = 1 THEN 'domestic' ELSE 'international' END AS service, deps, seats, passengers, freight
        FROM pair_year""")
    return db.execute("SELECT COUNT(*) FROM pair_year").fetchone()[0]


def write_airports(db, t100, countries):
    known = openflights(t100)
    extra = read_airport_overrides(HERE / "data" / "avia_airport_overrides.csv")
    used = {r[0] for r in db.execute("SELECT airport FROM route_year UNION SELECT other FROM route_year")}
    reporting = {r[0]: (r[1], r[2]) for r in db.execute("SELECT airport, MIN(year), MAX(year) FROM route_year GROUP BY airport")}
    taken = {v[0] for v in known.values() if v[0]}
    rows = []
    for icao in sorted(used):
        base = known.get(icao, (None,) * 6)
        override = extra.get(icao, (None,) * 6)
        iata, name, city, country, lat, lon = (o if o is not None else b for o, b in zip(override, base))
        if override[0] and override[0] in taken and override[0] != base[0]:
            iata = base[0]  # an override's IATA code another airport already has is ignored
        first, last = reporting.get(icao, (None, None))
        placeholder = bool(PLACEHOLDER.match(icao)) and not override[1]  # a placeholder the overrides name is a place (LF90: Paris)
        rows.append((icao, iata or icao, name or ("Other or unknown airports" if placeholder else None), city, country, countries.get(icao), lat, lon,
                     int(country in US_COUNTRIES), int(icao in reporting), int(placeholder), first, last))
    db.executemany("INSERT INTO airport_info VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    db.execute("UPDATE route_year SET domestic = (SELECT IFNULL(a.country_code = b.country_code, 0) FROM airport_info a, airport_info b WHERE a.icao = route_year.airport AND b.icao = route_year.other)")
    db.execute("UPDATE route_month SET domestic = (SELECT IFNULL(a.country_code = b.country_code, 0) FROM airport_info a, airport_info b WHERE a.icao = route_month.airport AND b.icao = route_month.other)")
    pairs = db.execute("""SELECT DISTINCT a.code, b.code, a.latitude, a.longitude, b.latitude, b.longitude
                          FROM route_year r JOIN airport_info a ON a.icao = r.airport JOIN airport_info b ON b.icao = r.other
                          WHERE a.latitude IS NOT NULL AND b.latitude IS NOT NULL""").fetchall()
    db.executemany("INSERT OR IGNORE INTO pair_distance VALUES (?,?,?)",
                   [(min(x, y), max(x, y), round(great_circle_miles(la, lo, lb, lob))) for x, y, la, lo, lb, lob in pairs])
    return sum(1 for r in rows if r[6] is None and not r[10])


def build(db_path, sources, t100):
    tmp = db_path.with_name(db_path.name + ".building")
    if tmp.exists():
        tmp.unlink()
    db = sqlite3.connect(tmp)
    db.execute("PRAGMA journal_mode = OFF")
    db.execute("PRAGMA synchronous = OFF")
    db.execute("PRAGMA temp_store = FILE")
    db.executescript(SCHEMA)
    print("Reading Eurostat…", file=sys.stderr)
    countries = load_eurostat(db, sources / "eu")
    pivot_eurostat(db)
    db.execute("DROP TABLE raw")
    print("Reading the CAA…", file=sys.stderr)
    caa = load_caa(sources / "uk")
    votes = learn_caa_names(db, caa)
    overrides = read_name_overrides(HERE / "data" / "caa_airports.csv")
    by_city = openflights_names(t100)
    every_name = {n for rows in caa.values() for _, a, b, _ in rows for n in (a, b)}
    guessed = {n: g for n in every_name - set(votes) - set(overrides) if (g := guess_code(by_city, n))}

    def coder(name, year):
        code = override_code(overrides, name, year) or caa_code(votes, name, year) or guessed.get(name)
        return ALIASES.get(code, code)

    caa_added, caa_joined, unnamed = add_caa(db, caa, coder, countries)
    rows = []
    for n in sorted(every_name):
        if n in overrides:
            rows.append((n, overrides[n][-1][2], "hand", 0))
        elif n in votes:
            total = collections.Counter()
            for c in votes[n].values():
                total.update(c)
            codes = ", ".join(f"{c} ({v})" for c, v in total.most_common())
            rows.append((n, total.most_common(1)[0][0], "learnt: " + codes, sum(total.values())))
        elif n in guessed:
            rows.append((n, guessed[n], "openflights city", 0))
        else:
            rows.append((n, None, "none", 0))
    db.executemany("INSERT INTO caa_names VALUES (?,?,?,?)", rows)
    no_coordinates = write_airports(db, t100, countries)
    print("Pairs…", file=sys.stderr)
    write_pairs(db)
    db.executescript(INDEXES)
    notes = {
        "caa_floor": str(CAA_FLOOR),
        "caa_routes_added": str(caa_added),
        "caa_routes_joined": str(caa_joined),
        "caa_unnamed_count": str(len(unnamed)),
        "caa_unnamed_top": "; ".join(f"{n} ({p:,})" for n, p in unnamed.most_common(60)),
        "airports_without_coordinates": str(no_coordinates),
    }
    db.executemany("INSERT INTO build_notes VALUES (?,?)", notes.items())
    db.commit()
    counts = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("route_year", "route_month", "airport_info", "caa_names")}
    db.execute("VACUUM")
    db.close()
    tmp.replace(db_path)
    print(f"Wrote {db_path}: {counts}; {caa_added:,} CAA-only route-years, {caa_joined:,} joined to Eurostat; {len(unnamed)} CAA names without a code; "
          f"{no_coordinates} airports without coordinates", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--db", type=Path, default=Path("t_avia.db"))
    parser.add_argument("--sources", type=Path, default=Path("source_downloads"))
    parser.add_argument("--t100", type=Path, default=Path("t100.db"))
    args = parser.parse_args()
    build(args.db.resolve(), args.sources, args.t100)


if __name__ == "__main__":
    main()
