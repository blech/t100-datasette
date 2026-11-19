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
