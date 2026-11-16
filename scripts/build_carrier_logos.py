"""Build the carrier_logo table: BTS airline -> friendly name + logo.

For each BTS airline_id, match the airline's two-letter unique_carrier code
(and its BTS names) against two sources of IATA -> ICAO codes (the OpenFlights
airlines.dat fork and Wikipedia's list of airline codes), keep the best
name-checked candidate, then apply data/airlines_overrides.csv on top.

Logos, in order of preference: an explicit icon_file in the overrides; the airline's
SVG from the soaring-symbols checkout (matched on IATA code or ICAO code *and* name,
copied to static/icons/soaring-symbols/<ICAO>.svg); static/icons/airline-logos/<ICAO>.png;
static/icons/airline-logos-custom/<unique_carrier key>.png (key = unique_carrier with
" (1)" written "_1"). Where soaring-symbols names a different ICAO code for the same
airline than the other sources did, its code wins and the notes say so.
Re-runnable: the table is dropped and rebuilt. Set SOARING_SYMBOLS to use a checkout
elsewhere (default: ../t100/soaring-symbols).

    uv run python scripts/build_carrier_logos.py [t100.db]
"""
import csv
import difflib
import json
import os
import shutil
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DAT = ROOT / "source_downloads" / "airlines-codes-airlines.dat"
WIKI = ROOT / "source_downloads" / "list-of-airline-codes-wikipedia.tsv"
OVERRIDES = ROOT / "data" / "airlines_overrides.csv"
LOGOS = ROOT / "static" / "icons" / "airline-logos"
CUSTOM = ROOT / "static" / "icons" / "airline-logos-custom"
SS_DIR = ROOT / "static" / "icons" / "soaring-symbols"
SOARING = Path(os.environ.get("SOARING_SYMBOLS", ROOT.parent / "t100" / "soaring-symbols"))

GOOD, CHECK = 0.75, 0.5
# Words that don't help tell airlines apart.
STOP = set("""inc co ltd corp corporation llc plc company the dba d b a de sa cv of and airlines airline
airways air lines line aviation international intl natl national compania compagnie""".split())

SCHEMA = """
CREATE TABLE carrier_logo (
    airline_id TEXT PRIMARY KEY,
    unique_carrier TEXT,
    logo TEXT,
    logo_source TEXT,
    bts_name TEXT,
    friendly_name TEXT,
    icao TEXT,
    confidence TEXT,
    score REAL,
    source TEXT,
    guess_name TEXT,
    guess_icao TEXT,
    total_passengers INTEGER,
    notes TEXT
)"""


def norm(s):
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower().replace("air lines", "airlines"))
    words = [w for w in s.split() if w not in STOP]
    return " ".join(words) or s.strip()


def similarity(a, b):
    na, nb = norm(a), norm(b)
    r = difflib.SequenceMatcher(None, na, nb).ratio()
    if na and nb and min(len(na), len(nb)) >= 3 and (na in nb or nb in na):
        r = max(r, 0.85)
    return r


def key_of(unique_carrier):
    return re.sub(r" \((\d+)\)$", r"_\1", unique_carrier)


def load_sources():
    """(iata, icao, name, active, source) for every row with both codes."""
    out = []
    with open(DAT, encoding="utf-8") as f:
        for r in csv.reader(f):
            if len(r[3]) == 2 and len(r[4]) == 3:
                out.append((r[3], r[4], r[1], r[7] == "Y", "airlines.dat"))
    with open(WIKI, encoding="utf-8") as f:
        for r in csv.reader(f, delimiter="\t"):
            if len(r) >= 3 and len(r[0]) == 2 and len(r[1]) == 3 and r[1] != "n/a" and r[0] != "IA":
                name = re.sub(r"\s*\(airline\)", "", r[2])
                out.append((r[0], r[1], name, "defunct" not in " ".join(r[5:]).lower(), "wikipedia"))
    return out


def load_soaring():
    """soaring-symbols airlines that have artwork: (iata, icao, name, svg path)."""
    if not (SOARING / "airlines.json").exists():
        print("soaring-symbols not found at %s; skipping it" % SOARING)
        return []
    out = []
    for a in json.load(open(SOARING / "airlines.json", encoding="utf-8")):
        folder = SOARING / "assets" / a["slug"]
        svg = next((folder / f for f in ("icon.svg", "logo.svg") if (folder / f).exists()), None)
        if svg:
            out.append((a["iata"], a["icao"], a["name"], svg))
    return out


def main(db_path):
    ss = load_soaring()
    ss_by_iata, ss_by_icao = {}, {}
    for row in ss:
        ss_by_iata.setdefault(row[0], []).append(row)
        ss_by_icao[row[1]] = row
    if SS_DIR.exists():
        shutil.rmtree(SS_DIR)
    logos = {p.stem for p in LOGOS.glob("*.png")}
    custom = {p.stem for p in CUSTOM.glob("*.png")}
    by_iata = {}
    for row in load_sources():
        by_iata.setdefault(row[0], []).append(row)
    overrides = {r["airline_id"]: r for r in csv.DictReader(open(OVERRIDES, encoding="utf-8"))}

    conn = sqlite3.connect(db_path)
    names, codes = {}, {}
    for airline_id, uc, name in conn.execute(
        "SELECT airline_id, unique_carrier, name FROM carriers WHERE airline_id IS NOT NULL"
    ):
        names.setdefault(airline_id, [])
        if name and name not in names[airline_id]:
            names[airline_id].append(name)
        if uc:
            codes.setdefault(airline_id, [])
            if uc not in codes[airline_id]:
                codes[airline_id].append(uc)
    pax = dict(conn.execute("SELECT airline_id, SUM(passengers) FROM carrier_group_year GROUP BY airline_id"))

    out = []
    disagreements = []
    for airline_id, bts_names in names.items():
        ucs = codes.get(airline_id, [])
        iatas = {re.sub(r" \(\d+\)$", "", u) for u in ucs}
        best = None  # (score, icao, name, source)
        for iata in iatas:
            for _, icao, name, active, source in by_iata.get(iata, []):
                score = max(similarity(b, name) for b in bts_names)
                rank = score + (0.02 if active else 0) + (0.01 if icao in logos else 0)
                if best is None or rank > best[0]:
                    best = (rank, icao, name, source, score)
        confidence = "none"
        friendly = icao = source = None
        guess_name = guess_icao = None
        score = None
        if best:
            _, guess_icao, guess_name, src, score = best
            confidence = "good" if score >= GOOD else "check" if score >= CHECK else "poor"
            if confidence != "poor":
                friendly, icao, source = guess_name, guess_icao, src
        notes = None
        ov = overrides.get(airline_id)
        if ov and (ov["override_name"] or ov["override_icao"] or ov["icon_file"]):
            friendly = ov["override_name"] or friendly
            icao = ov["override_icao"] or icao
            source = "override (%s)" % (ov["status"] or "no status")
            confidence = "override"
            notes = ov["notes"] or None
        # soaring-symbols: same IATA or ICAO code, and a name that agrees.
        keys = [key_of(u) for u in ucs]
        explicit = bool(ov and ov["icon_file"])
        ss_hit = None
        if not explicit and confidence != "none":
            pool = [r for i in iatas for r in ss_by_iata.get(i, [])]
            if icao in ss_by_icao:
                pool.append(ss_by_icao[icao])
            for row in pool:
                sim = max(similarity(b, row[2]) for b in bts_names)
                if sim >= GOOD and (ss_hit is None or sim > ss_hit[0]):
                    ss_hit = (sim, row)
            if ss_hit and ss_hit[1][1] != icao:
                if confidence == "override" and ov["override_icao"]:
                    ss_hit = None  # an explicit ICAO override stands
                else:
                    notes = "; ".join(filter(None, [notes, "soaring-symbols: %s (was %s)" % (ss_hit[1][1], icao)]))
                    disagreements.append((airline_id, ", ".join(ucs), bts_names[0], icao, ss_hit[1][1]))
                    icao = ss_hit[1][1]
        # Logo: explicit override file, else soaring-symbols SVG, else the ICAO PNG, else a custom one by key.
        logo = logo_source = None
        if explicit:
            custom_hit = ov["icon_file"][:-4] in custom
            logo = ("airline-logos-custom/" if custom_hit else "airline-logos/") + ov["icon_file"]
            logo_source = "override"
        elif ss_hit:
            SS_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ss_hit[1][3], SS_DIR / f"{ss_hit[1][1]}.svg")
            logo, logo_source = f"soaring-symbols/{ss_hit[1][1]}.svg", "soaring-symbols"
        elif icao in logos:
            logo, logo_source = f"airline-logos/{icao}.png", "airline-logos"
        else:
            k = next((k for k in keys if k in custom), None)
            if k:
                logo, logo_source = f"airline-logos-custom/{k}.png", "custom"
        out.append((airline_id, ", ".join(ucs), logo, logo_source, bts_names[0], friendly, icao, confidence,
                    None if score is None else round(score, 3), source, guess_name, guess_icao,
                    pax.get(airline_id), notes))

    # Airlines with no candidate, or only a rejected (poor) one, are left out of the table.
    out = [r for r in out if r[7] not in ("none", "poor")]
    out.sort(key=lambda r: -(r[12] or 0))
    conn.execute("DROP TABLE IF EXISTS carrier_logo")
    conn.execute(SCHEMA)
    conn.executemany("INSERT INTO carrier_logo VALUES (%s)" % ",".join("?" * 14), out)
    conn.commit()
    summary = conn.execute(
        "SELECT confidence, COUNT(*), SUM(logo IS NOT NULL) FROM carrier_logo GROUP BY confidence"
    ).fetchall()
    print("carrier_logo: %d rows" % len(out))
    for conf, n, with_logo in summary:
        print(f"  {conf:9} {n:5}  with logo: {with_logo}")
    top = conn.execute(
        "SELECT SUM(confidence IN ('good','check','override')), SUM(logo IS NOT NULL) FROM "
        "(SELECT * FROM carrier_logo ORDER BY total_passengers DESC LIMIT 100)"
    ).fetchone()
    print("top 100 by passengers: usable name %s, with logo %s" % top)
    print("logo sources:", dict(conn.execute(
        "SELECT COALESCE(logo_source, 'none'), COUNT(*) FROM carrier_logo GROUP BY 1").fetchall()))
    for d in disagreements:
        print("  soaring-symbols changed ICAO: %s %s %s: %s -> %s" % d)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "t100.db")
