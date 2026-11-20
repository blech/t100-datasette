# The European airports (build_t_avia.py, plugins/t_avia.py, the t_avia queries): the loader's parsing and naming rules, and the
# pages over a tiny t_avia database beside the T-100 one. Design: docs/superpowers/specs/2026-11-18-european-airports-design.md.
import collections
import sqlite3

import pytest
import yaml
from datasette.app import Datasette

import build_t_avia as b
from plugins.t100_globe import section_of, views_for
from tests.helpers import ROOT, get


# --- the loader

def test_eurostat_cells_drop_flags_and_unpublished_values():
    assert b.eurostat_number("12345 ") == 12345
    assert b.eurostat_number("12345 e") == 12345
    assert b.eurostat_number(": ") is None and b.eurostat_number(": c") is None
    assert b.eurostat_number("12.5") == 12.5


def test_caa_tables_are_read_in_both_layouts():
    old = b"rundate,report_period,foreign_region,foreign_country,UK_airport,foreign_airport,2001_total_pax,2001_scheduled_pax\n" \
          b"x,2001,R,C,HEATHROW,NEW YORK (JF KENNEDY),2325539,2325539\nx,2001,R,C,OTHER ROUTES,=,36136,0\n"
    new = "﻿rundate,report_period,region_num,foreign_region,foreign_country,uk_group,uk_apt,foreign_apt,ty_t_pax\n" \
          "x,2025,80,R,USA,1,HEATHROW,NEW YORK (JF KENNEDY),3220238\n".encode()
    dom = b"rundate,this_period,last_period,grp_cd,grp_name,apt1_apt_name,apt2_apt_name,total_pax_tp\nx,2019,2018,A,L,HEATHROW,EDINBURGH,1196921\n"
    assert b.read_caa("intl", old) == [("HEATHROW", "NEW YORK (JF KENNEDY)", 2325539)]  # OTHER ROUTES left out
    assert b.read_caa("intl", new) == [("HEATHROW", "NEW YORK (JF KENNEDY)", 3220238)]
    assert b.read_caa("dom", dom) == [("HEATHROW", "EDINBURGH", 1196921)]


def votes(**years):
    out = collections.defaultdict(collections.Counter)
    for year, codes in years.items():
        out[int(year[1:])].update(codes)
    return {"N": out}


def test_a_name_takes_its_years_code_and_one_chance_match_doesnt_move_it():
    athens = votes(y2000={"LGAT": 3}, y2001={"LGAV": 3}, y2005={"LGAV": 4})
    assert b.caa_code(athens, "N", 1999) == "LGAT"
    assert b.caa_code(athens, "N", 2003) == "LGAV"
    chance = votes(y2001={"VOBG": 2}, y2002={"EICK": 1})  # Bangalore matched Cork's figures once
    assert b.caa_code(chance, "N", 2002) == "VOBG"
    assert b.caa_code({}, "N", 2002) is None


def test_hand_kept_names_can_have_years():
    overrides = {"ISTANBUL": [(None, 2018, "LTBA"), (2019, None, "LTFM")]}
    assert b.override_code(overrides, "ISTANBUL", 2018) == "LTBA"
    assert b.override_code(overrides, "ISTANBUL", 2020) == "LTFM"
    assert b.override_code(overrides, "TUNIS", 2020) is None


def test_an_unmatched_name_is_guessed_only_when_openflights_is_sure():
    by_city = {"TUNIS": [("DTTA", "TUNIS CARTHAGE INTERNATIONAL AIRPORT")],
               "NEW YORK": [("KJFK", "JOHN F KENNEDY INTERNATIONAL AIRPORT"), ("KEWR", "NEWARK LIBERTY INTERNATIONAL AIRPORT"), ("KLGA", "LA GUARDIA AIRPORT")],
               "PORTLAND": [("KPDX", "PORTLAND INTERNATIONAL AIRPORT"), ("KPWM", "PORTLAND INTERNATIONAL JETPORT")]}
    assert b.guess_code(by_city, "TUNIS") == "DTTA"
    assert b.guess_code(by_city, "NEW YORK (NEWARK)") == "KEWR"
    assert b.guess_code(by_city, "PORTLAND (OREGON)") is None


def test_eurostat_placeholders_are_recognised():
    assert all(b.PLACEHOLDER.match(c) for c in ("EG90", "LF99", "ZZZZ")) and not b.PLACEHOLDER.match("EGLL")


def test_the_overrides_merge_rhodes_and_santorini_and_name_paris():
    assert b.ALIASES["LGRD"] == "LGRP" and b.ALIASES["LG03"] == "LGSR"
    paris = b.read_airport_overrides(ROOT / "data" / "avia_airport_overrides.csv")["LF90"]
    assert paris[0] == "PAR" and paris[1].startswith("Paris")


def test_atatürk_adds_to_istanbul_airport():
    assert b.ALIASES["LTBA"] == "LTFM" and b.SUMMED == {"LTBA"}


def test_the_pivot_keeps_one_report_adds_a_summed_code_and_falls_back_to_on_board():
    db = sqlite3.connect(":memory:")
    db.executescript(b.SCHEMA)
    db.execute("CREATE TEMP TABLE raw (airport TEXT, other TEXT, year INTEGER, month INTEGER, col TEXT, value REAL, part TEXT)")
    db.executemany("INSERT INTO raw VALUES (?,?,?,?,?,?,?)", [
        ("LIMC", "LGRP", 1994, 0, "passengers", 46621, ""), ("LIMC", "LGRP", 1994, 0, "passengers", 46621, ""),  # one report, two codes
        ("EDDF", "LTFM", 2019, 0, "passengers", 700000, ""), ("EDDF", "LTFM", 2019, 0, "passengers", 200000, "LTBA"),  # Atatürk adds
        ("LTFM", "EDDF", 2019, 0, "on_board", 880000, ""), ("LTFM", "EDDF", 2019, 0, "pax_flights", 5000, ""),  # no passengers carried
        ("LTFM", "EDDF", 2024, 0, "passengers", 990000, ""), ("LTFM", "EDDF", 2024, 0, "on_board", 999000, ""),  # carried wins
    ])
    b.pivot_eurostat(db)
    got = {(a, o, y): (p, ob) for a, o, y, p, ob in db.execute("SELECT airport, other, year, passengers, on_board FROM route_year")}
    assert got == {("LIMC", "LGRP", 1994): (46621, None), ("EDDF", "LTFM", 2019): (900000, None),
                   ("LTFM", "EDDF", 2019): (880000, 1), ("LTFM", "EDDF", 2024): (990000, None)}


# --- one report per airport pair (pair_year) and the routes matrix's tables

def pairs_db(rows):  # rows: (airport, other, year, source, domestic, passengers, pax_flights, freight)
    db = sqlite3.connect(":memory:")
    db.executescript(b.SCHEMA)
    db.executemany("INSERT INTO airport_info (icao, code, reporting, placeholder) VALUES (?,?,?,?)",
                   [("EGLL", "LHR", 1, 0), ("LFPG", "CDG", 1, 0), ("KJFK", "JFK", 0, 0), ("EG90", "EG90", 0, 1)])
    db.executemany("INSERT INTO pair_distance VALUES (?,?,?)", [("CDG", "LHR", 216), ("JFK", "LHR", 3451)])
    db.executemany("INSERT INTO route_year (airport, other, year, source, domestic, passengers, pax_flights, freight) VALUES (?,?,?,?,?,?,?,?)", rows)
    return db


def test_a_pair_reported_twice_is_kept_once_with_one_ends_report():
    db = pairs_db([("EGLL", "LFPG", 2019, "caa+eurostat", 0, 900_000, 9_000, 10.0),
                   ("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0),
                   ("EGLL", "KJFK", 2019, "caa+eurostat", 0, 3_000_000, 14_000, 100.0),
                   ("EGLL", "EG90", 2019, "eurostat", 1, 50_000, 500, 0.0)])
    b.write_pairs(db)
    rows = db.execute("SELECT a, b, airport, passengers, deps FROM pair_year ORDER BY a").fetchall()
    assert rows == [("CDG", "LHR", "CDG", 950_000, 9_100), ("JFK", "LHR", "LHR", 3_000_000, 14_000)]  # the placeholder is out


def test_eurostats_report_beats_a_caa_only_one_even_with_fewer_passengers():
    db = pairs_db([("EGLL", "LFPG", 2021, "caa", 0, 500_000, None, None),
                   ("LFPG", "EGLL", 2021, "eurostat", 0, 480_000, 4_000, 3.0)])
    b.write_pairs(db)
    assert db.execute("SELECT airport, passengers, deps FROM pair_year").fetchall() == [("CDG", 480_000, 4_000)]


def test_the_routes_matrix_tables_count_each_pair_once():
    db = pairs_db([("EGLL", "LFPG", 2019, "caa+eurostat", 0, 900_000, 9_000, 10.0),
                   ("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    b.write_pairs(db)
    assert db.execute("SELECT SUM(passengers) FROM route_band_year WHERE year = 2019").fetchone() == (950_000,)
    assert db.execute("SELECT a, b, year_rank FROM top_route_year").fetchall() == [("CDG", "LHR", 1)]


def test_a_caa_domestic_name_coded_abroad_is_unnamed():
    # BEDFORD (THURLEIGH) guessed as KBED (Massachusetts) must not make KBED a UK reporter
    db = pairs_db([])
    codes = {"LUTON": "EGGW", "BEDFORD (THURLEIGH)": "KBED", "NEW YORK (JFK)": "KJFK"}
    added, joined, unnamed = b.add_caa(db, {2003: [("dom", "LUTON", "BEDFORD (THURLEIGH)", 2),
                                                   ("int", "LUTON", "NEW YORK (JFK)", 5_000)]},
                                       lambda name, year: codes[name], {})
    assert db.execute("SELECT airport, other FROM route_year ORDER BY airport").fetchall() == [("EGGW", "KJFK")]
    assert unnamed["BEDFORD (THURLEIGH)"] == 2


# --- the pages

def test_european_paths_are_airports_pages_with_the_same_views():
    assert section_of("/airports/europe/LHR/globe") == "airports"
    views = views_for("/airports/europe/LHR/destinations")
    assert [v["href"] for v in views] == ["/airports/europe/LHR", "/airports/europe/LHR/destinations", "/airports/europe/LHR/distances",
                                          "/airports/europe/LHR/changes", "/airports/europe/LHR/globe"]
    assert [v["current"] for v in views] == [False, True, False, False, False]
    assert views_for("/airports/europe/EGXX")[0]["href"] == "/airports/europe/EGXX"  # an ICAO code where there's no IATA one


def test_without_the_european_database_its_pages_are_not_found(ds):
    assert get(ds, "/airports/europe/LHR").status_code == 404
    assert get(ds, "/airports/europe").status_code == 404


def tiny_t_avia(path):
    db = sqlite3.connect(path)
    db.executescript(b.SCHEMA)
    db.executemany("INSERT INTO airport_info VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", [
        ("EGLL", "LHR", "London Heathrow Airport", "London", "United Kingdom", "UK", 51.47, -0.46, 0, 1, 0, 2019, 2020),
        ("KJFK", "JFK", "John F Kennedy International Airport", "New York", "United States", "US", 40.64, -73.78, 1, 0, 0, None, None),
        ("LFPG", "CDG", "Charles de Gaulle International Airport", "Paris", "France", "FR", 49.01, 2.55, 0, 1, 0, 2019, 2019),
        ("OMDB", "DXB", "Dubai International Airport", "Dubai", "United Arab Emirates", "AE", 25.25, 55.36, 0, 0, 0, None, None),
        ("EG90", "EG90", "Other or unknown airports", None, None, "UK", None, None, 0, 0, 1, None, None),
    ])
    cols = "airport, other, year, source, domestic, passengers, passengers_out, passengers_in, pax_flights, seats, freight, freight_flights"
    db.executemany(f"INSERT INTO route_year ({cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
        ("EGLL", "KJFK", 2019, "caa+eurostat", 0, 3_000_000, 1_500_000, 1_500_000, 14_000, 4_000_000, 100_000, 10),
        ("EGLL", "LFPG", 2019, "caa+eurostat", 0, 900_000, 450_000, 450_000, 9_000, 1_200_000, 0, 0),
        ("EGLL", "OMDB", 2019, "caa+eurostat", 0, 8_000, 4_000, 4_000, 200, 50_000, 0, 0),  # under the floor
        ("EGLL", "EG90", 2019, "eurostat", 1, 50_000, 25_000, 25_000, 500, 60_000, 0, 0),   # a placeholder
        ("EGLL", "KJFK", 2020, "caa", 0, 700_000, None, None, None, None, None, None),         # a CAA year: passengers only
    ])
    db.executemany("INSERT INTO pair_distance VALUES (?,?,?)", [("JFK", "LHR", 3451), ("CDG", "LHR", 216)])
    b.write_pairs(db)
    db.commit()
    db.close()


@pytest.fixture
def both(db_path, tmp_path):
    t_avia = tmp_path / "t_avia.db"
    tiny_t_avia(t_avia)
    return Datasette([str(db_path), str(t_avia)], config=yaml.safe_load((ROOT / "datasette.yml").read_text()),
                     plugins_dir=str(ROOT / "plugins"), template_dir=str(ROOT / "templates"),
                     static_mounts=[("static", str(ROOT / "static"))])


def test_a_european_airport_has_the_airport_pages_reading_t_avia(both):
    for path in ("", "/destinations", "/changes", "/distances", "/globe"):
        r = get(both, f"/airports/europe/LHR{path}")
        assert r.status_code == 200, path
        assert 'data-database="t_avia"' in r.text and 'data-count-by="passengers"' in r.text
        assert 'id="europe-note"' in r.text and "the CAA's alone" in r.text
    assert get(both, "/airports/europe/JFK").status_code == 404  # not a reporting airport
    over_time = get(both, "/airports/europe/LHR").text
    assert '<option value="airline">' not in over_time and "10,000 passengers" in over_time


def test_the_index_lists_reporting_airports(both):
    r = get(both, "/airports/europe?year=2019")
    assert r.status_code == 200 and 'href="/airports/europe/LHR"' in r.text
    assert '<td class="num">2</td>' in r.text  # JFK and CDG; Dubai is under the floor and EG90 is no place
    assert "Eurostat's tables end in 2019" in r.text
    assert "2020 has UK airports only" in get(both, "/airports/europe?year=2020").text  # the tiny database's CAA-only year


def test_routes_count_by_passengers_and_leave_out_placeholders(both):
    rows = get(both, "/t_avia/routes_by_year.json?_shape=objects&origin=LHR&dir=&year=2019&min_deps=").json()["rows"]
    assert sorted(r["dest"] for r in rows) == ["CDG", "JFK"]  # Dubai is under 10,000; EG90 is no place
    jfk = next(r for r in rows if r["dest"] == "JFK")
    assert jfk["deps"] == 14_010 and jfk["freight"] == round(100_000 * 2204.62) and jfk["distance"] == 3451
    caa = get(both, "/t_avia/routes_by_year.json?_shape=objects&origin=LHR&dir=&year=2020&min_deps=").json()["rows"]
    assert caa == [{**caa[0], "dest": "JFK", "deps": None, "passengers": 700_000}]


def test_where_airports_link_from_a_european_page(both):
    rows = {r["code"]: r["page"] for r in get(both, "/t_avia/airports.json?_shape=objects").json()["rows"]}
    assert rows == {"LHR": "europe", "CDG": "europe", "JFK": "t100", "DXB": None}


def test_a_t100_airport_abroad_links_to_its_european_pages_only_when_there_are_some(both, ds):
    from plugins.t100_globe import europe_link
    import asyncio
    assert asyncio.run(europe_link(both, "LHR")) == {"europe_href": "/airports/europe/LHR", "europe_uk": True}
    assert asyncio.run(europe_link(both, "DXB")) == {}
    assert asyncio.run(europe_link(ds, "LHR")) == {}  # no t_avia database


def test_a_route_has_its_page_from_the_origins_report(both):
    r = get(both, "/airports/europe/LHR/JFK")
    assert r.status_code == 200
    assert 'data-database="t_avia"' in r.text and 'id="chart-split"' not in r.text and 'id="europe-note"' in r.text
    assert "In 2020 there are the CAA's passengers alone" in r.text
    assert 'href="/airports/europe/LHR/destinations"' in r.text and 'href="/airports/JFK/destinations"' in r.text  # JFK's T-100 pages
    assert get(both, "/airports/europe/LHR/JFK/2019").status_code == 200
    assert get(both, "/airports/europe/LHR/DXB").status_code == 200   # under the floor, but a route all the same
    assert get(both, "/airports/europe/LHR/SYD").status_code == 404   # not an airport here
    assert get(both, "/airports/europe/CDG/JFK").status_code == 404   # no such route in CDG's report


def test_a_route_from_an_airport_that_doesnt_report_is_the_other_ends(both):
    r = get(both, "/airports/europe/JFK/LHR/2019?dir=out&measure=seats")
    assert r.status_code == 302 and r.headers["location"] == "/airports/europe/LHR/JFK/2019?measure=seats&dir=in"


def test_the_route_queries_give_t100s_columns(both):
    rows = get(both, "/t_avia/route.json?_shape=objects&origin=LHR&dest=JFK&dir=").json()["rows"]
    assert [(r["year"], r["source"], r["deps"], r["total_passengers"]) for r in rows] == [(2020, "caa", None, 700_000), (2019, "caa+eurostat", 14_010, 3_000_000)]
    assert rows[1]["total_freight"] == round(100_000 * 2204.62) and rows[1]["carrier"] is None
    out = get(both, "/t_avia/route.json?_shape=objects&origin=LHR&dest=JFK&dir=out").json()["rows"]
    assert [(r["year"], r["total_passengers"]) for r in out] == [(2019, 1_500_000)]  # the CAA's years have no directions
    assert get(both, "/t_avia/route_by_month.json?_shape=objects&origin=LHR&dest=JFK&dir=&year=2019").json()["rows"] == []  # no months in the tiny one
    assert "route_year" not in both.config["databases"]["t_avia"]["queries"]  # the route_year table would shadow it


def test_a_european_route_has_no_other_views():
    assert views_for("/airports/europe/LHR/JFK") == [] and views_for("/airports/europe/LHR/JFK/2019") == []


def test_the_index_ranks_by_any_of_its_columns(both):
    r = get(both, "/airports/europe?year=2019")
    assert 'data-sort="passengers" aria-sort="descending"' in r.text and "by passengers" in r.text
    assert "23,710 flights" in r.text and "110,231 short tons" in r.text  # LHR: passenger and freight-only flights, tonnes as short tons
    order = lambda sort: [r["code"] for r in get(both, f"/t_avia/europe_airports.json?_shape=objects&year=2019&sort={sort}").json()["rows"]]
    db = sqlite3.connect(both.databases["t_avia"].path)
    db.execute("INSERT INTO route_year (airport, other, year, source, domestic, passengers, freight) VALUES ('LFPG', 'OMDB', 2019, 'eurostat', 0, 1000, 900000)")
    db.commit()
    db.close()  # CDG: few passengers, much freight
    assert order("freight") == ["CDG", "LHR"] and order("passengers") == ["LHR", "CDG"] and order("") == ["LHR", "CDG"]
    r = get(both, "/airports/europe?year=2019&sort=freight")
    assert 'data-sort="freight" aria-sort="descending"' in r.text and '<input type="hidden" name="sort" value="freight">' in r.text
    assert get(both, "/airports/europe?year=2019&sort=nonsense").status_code == 200  # an unknown sort is passengers


def test_the_last_sort_asked_for_wins(both):
    r = get(both, "/airports/europe?sort=freight&year=2019&sort=destinations")
    assert 'data-sort="destinations" aria-sort="descending"' in r.text


def test_schonefeld_is_berlin_brandenburgs_past(both):
    from plugins.t_avia import INHERITED, FORMER
    assert FORMER == {"SXF": "BER", "ISL": "IST"} and INHERITED["BER"]["until"] == "October 2020"
    r = get(both, "/airports/europe/SXF/destinations?year=2019")
    assert r.status_code == 302 and r.headers["location"] == "/airports/europe/BER/destinations?year=2019"
    assert get(both, "/airports/europe/LHR/SXF").headers["location"] == "/airports/europe/LHR/BER"


def test_a_placeholder_that_reports_is_no_airport(both):
    db = sqlite3.connect(both.databases["t_avia"].path)
    db.execute("UPDATE airport_info SET reporting = 1 WHERE icao = 'EG90'")
    db.execute("INSERT INTO route_year (airport, other, year, source, domestic, passengers) VALUES ('EG90', 'KJFK', 2019, 'eurostat', 0, 99000000)")
    db.commit()
    db.close()
    assert 'href="/airports/europe/EG90"' not in get(both, "/airports/europe?year=2019").text
    assert get(both, "/airports/europe/EG90").status_code == 404


def test_paris_combined_is_an_airport_that_cdg_points_to(both):
    db = sqlite3.connect(both.databases["t_avia"].path)
    db.execute("INSERT INTO airport_info VALUES ('LF90', 'PAR', 'Paris (Charles de Gaulle and Orly together)', 'Paris', 'France', 'FR', 48.86, 2.35, 0, 1, 0, 1999, 1999)")
    db.execute("INSERT INTO route_year (airport, other, year, source, domestic, passengers) VALUES ('LF90', 'EGLL', 1999, 'eurostat', 0, 4000000)")
    db.commit()
    db.close()
    par = get(both, "/airports/europe/PAR")
    assert par.status_code == 200 and "Charles de Gaulle and Orly, together" in par.text
    assert 'href="/airports/europe/CDG"' in par.text and 'href="/airports/europe/ORY"' in par.text
    assert 'href="/airports/europe/PAR"' in get(both, "/airports/europe/CDG").text
    assert 'href="/airports/europe/PAR"' in get(both, "/airports/europe?year=1999").text
    assert "PAR is Paris" in get(both, "/airports/europe/PAR/LHR").text


def test_passengers_on_board_are_said_on_the_airport_route_and_about(both):
    db = sqlite3.connect(both.databases["t_avia"].path)
    db.execute("UPDATE route_year SET on_board = 1 WHERE airport = 'EGLL' AND year = 2019 AND other IN ('KJFK', 'LFPG')")
    db.commit()
    db.close()
    assert "In 2019 its passengers are those on board" in get(both, "/airports/europe/LHR").text
    assert "In 2019 the passengers are those on board" in get(both, "/airports/europe/LHR/JFK").text
    assert "In 2019 the passengers" not in get(both, "/airports/europe/LHR/DXB").text
    about = get(both, "/about").text
    assert 'id="europe"' in about and "<code>on_board</code>" in about


def test_about_leaves_out_europe_without_its_data(ds):
    assert 'id="europe"' not in get(ds, "/about").text


# --- the top-level pages' queries

def add_reports(ds, rows):
    """Route reports (airport, other, year, source, domestic, passengers, pax_flights, freight) added to the tiny t_avia.db,
    then its pair tables rebuilt, as build_t_avia does."""
    db = sqlite3.connect(ds.databases["t_avia"].path)
    db.executemany("INSERT OR REPLACE INTO route_year (airport, other, year, source, domestic, passengers, pax_flights, freight) VALUES (?,?,?,?,?,?,?,?)", rows)
    b.write_pairs(db)
    db.commit()
    db.close()


def rows_of(ds, query, args):
    return get(ds, f"/t_avia/{query}.json?_shape=objects&{args}").json()["rows"]


def test_top_routes_by_year_counts_a_pair_once(both):
    add_reports(both, [("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    pairs = [r for r in rows_of(both, "top_routes_by_year", "year=2019") if not r["rest"] and r["year"] == 2019]
    paris = [r for r in pairs if {r["origin"], r["dest"]} == {"CDG", "LHR"}]
    assert len(paris) == 1 and paris[0]["passengers"] == 950_000
    assert paris[0]["freight"] == round(12.0 * 2204.62)


def test_busiest_routes_year_gives_t100s_columns(both):
    add_reports(both, [("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    rows = rows_of(both, "busiest_routes_year", "year=2019&n=10&service=")
    assert list(rows[0]) == ["origin", "dest", "service", "deps", "seats", "passengers", "freight", "distance"]
    assert [(r["origin"], r["dest"]) for r in rows] == [("JFK", "LHR"), ("CDG", "LHR"), ("DXB", "LHR")]
    assert rows[1]["distance"] == 216


def test_pair_distances_by_year_has_gc_distance(both):
    rows = rows_of(both, "pair_distances_by_year", "year=2019")
    jfk = next(r for r in rows if r["a"] == "JFK")
    assert jfk["distance"] == jfk["gc_distance"] == 3451


def test_airport_by_year_counts_each_airports_own_report(both):
    rows = rows_of(both, "airport_by_year", "dir=&region=abroad")
    lhr = {(r["year"], r["service"]): r["passengers"] for r in rows if r["airport"] == "LHR"}
    assert lhr[(2019, "international")] == 3_908_000 and lhr[(2019, "domestic")] == 50_000
    assert lhr[(2020, "international")] == 700_000
    assert {r["airport"] for r in rows} == {"LHR"}  # CDG reports nothing here; nothing under 100,000 passengers


def test_a_caa_year_sorts_last_by_flights(both):
    add_reports(both, [("LFPG", "EGLL", 2020, "eurostat", 0, 600_000, 5_000, 1.0)])
    rows = rows_of(both, "europe_countries", "year=2020&sort=flights")
    assert [r["country_code"] for r in rows] == ["FR", "UK"]  # the UK's 2020 is the CAA's alone: no flights


def test_europe_airports_filters_by_country(both):
    add_reports(both, [("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    assert [r["code"] for r in rows_of(both, "europe_airports", "year=2019&sort=&country=FR")] == ["CDG"]
    assert [r["code"] for r in rows_of(both, "europe_airports", "year=2019&sort=&country=")] == ["LHR", "CDG"]


# --- the top-level pages

TOP_PAGES = ["over-time", "routes", "distances", "globe"]


@pytest.mark.parametrize("view", TOP_PAGES)
def test_the_top_level_pages_read_t_avia_with_a_coverage_note(both, view):
    r = get(both, f"/airports/europe/{view}")
    assert r.status_code == 200
    assert 'data-database="t_avia"' in r.text and 'id="europe-coverage-note"' in r.text


@pytest.mark.parametrize("view", TOP_PAGES + ["countries", "countries/france"])
def test_without_the_european_database_the_top_level_pages_are_not_found(ds, view):
    assert get(ds, f"/airports/europe/{view}").status_code == 404


def test_the_european_index_and_its_views_share_a_views_line():
    views = views_for("/airports/europe/routes")
    assert [v["href"] for v in views] == ["/airports/europe", "/airports/europe/over-time", "/airports/europe/routes",
                                          "/airports/europe/distances", "/airports/europe/globe", "/airports/europe/countries"]
    assert [v["current"] for v in views] == [False, False, True, False, False, False]
    assert views_for("/airports/europe")[0]["current"] and views_for("/airports/europe/countries/france")[5]["current"]


def test_the_map_and_distances_open_on_the_last_year_most_countries_have(both):
    db = sqlite3.connect(both.databases["t_avia"].path)
    db.execute("INSERT INTO route_year (airport, other, year, source, domestic, passengers) VALUES ('EGLL', 'KJFK', 2025, 'caa', 0, 3000000)")
    db.execute("INSERT INTO route_year (airport, other, year, source, domestic, passengers) VALUES ('EGLL', 'KJFK', 2024, 'caa', 0, 3000000)")
    db.commit()
    db.close()
    assert 'data-max-year="2024"' in get(both, "/airports/europe/globe").text
    assert 'data-year="2024"' in get(both, "/airports/europe/distances").text


# --- countries

def test_the_countries_list_links_each_reporting_country(both):
    add_reports(both, [("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    r = get(both, "/airports/europe/countries?year=2019")
    assert r.status_code == 200
    assert 'href="/airports/europe/countries/france?year=2019"' in r.text and 'href="/airports/europe/countries/united-kingdom?year=2019"' in r.text


def test_a_countrys_page_lists_its_airports_only(both):
    add_reports(both, [("LFPG", "EGLL", 2019, "eurostat", 0, 950_000, 9_100, 12.0)])
    r = get(both, "/airports/europe/countries/france?year=2019")
    assert r.status_code == 200 and "Airports in France" in r.text
    assert 'href="/airports/europe/CDG"' in r.text and 'href="/airports/europe/LHR"' not in r.text


def test_a_country_that_isnt_one_is_not_found(both):
    assert get(both, "/airports/europe/countries/narnia").status_code == 404


def test_the_countries_lists_last_sort_wins(both):
    r = get(both, "/airports/europe/countries?sort=freight&year=2019&sort=airports")
    assert 'data-sort="airports" aria-sort="descending"' in r.text


def test_every_reporting_country_has_a_name():
    import csv
    names = {r["code"] for r in csv.DictReader((ROOT / "data" / "eurostat_countries.csv").open())}
    built = ROOT / "t_avia.db"
    if built.exists():
        codes = {c for (c,) in sqlite3.connect(built).execute("SELECT DISTINCT country_code FROM airport_info WHERE reporting = 1 AND placeholder = 0")}
        assert codes <= names


def test_a_countrys_heading_reads_naturally(both):
    assert "Airports in the United Kingdom" in get(both, "/airports/europe/countries/united-kingdom?year=2019").text
