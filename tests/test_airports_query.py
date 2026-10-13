import sqlite3

from build_database import load_airport_overrides
from tests.helpers import add_airports, add_overrides, get_json

ATL = dict(iata_code="ATL", name="Hartsfield Jackson Atlanta International Airport", city="Atlanta", country="United States", latitude=33.6367, longitude=-84.428101)
LHR = dict(iata_code="LHR", name="London Heathrow Airport", city="London", country="United Kingdom", latitude=51.4706, longitude=-0.461941)
SJU = dict(iata_code="SJU", name="Luis Munoz Marin International Airport", city="San Juan", country="Puerto Rico", latitude=18.4394, longitude=-66.0018)


def rows(ds):
    return {r["code"]: r for r in get_json(ds, "/t100/airports.json?_shape=objects")["rows"]}


def test_airports_flags_us_and_territories(ds, db_path):
    add_airports(db_path, [ATL, LHR, SJU])
    got = rows(ds)
    assert got["ATL"]["is_us"] == 1
    assert got["SJU"]["is_us"] == 1
    assert got["LHR"]["is_us"] == 0
    assert got["ATL"]["latitude"] == 33.6367 and got["ATL"]["longitude"] == -84.428101


def test_airports_skips_rows_without_code_or_coordinates(ds, db_path):
    add_airports(db_path, [
        ATL,
        dict(ATL, iata_code="\\N", name="no code"),
        dict(ATL, iata_code="", name="blank code"),
        dict(ATL, iata_code="ZZZ", latitude=None, longitude=None),
    ])
    assert set(rows(ds)) == {"ATL"}


def test_override_adds_missing_code_and_wins_over_openflights(ds, db_path):
    add_airports(db_path, [ATL])
    add_overrides(db_path, [
        dict(code="SEL", name="Seoul (all airports)", city="Seoul", country="South Korea", latitude=37.5665, longitude=126.978),
        dict(code="ATL", name="Atlanta override", city="Atlanta", country="United States", latitude=1.0, longitude=2.0),
    ])
    got = rows(ds)
    assert got["SEL"]["is_us"] == 0
    assert got["ATL"]["latitude"] == 1.0  # override replaced the OpenFlights row, not duplicated it


def test_load_airport_overrides_from_csv(db_path, tmp_path):
    csv_path = tmp_path / "o.csv"
    csv_path.write_text("code,name,city,country,latitude,longitude\nSEL,Seoul,Seoul,South Korea,37.5665,126.978\n")
    conn = sqlite3.connect(db_path)
    assert load_airport_overrides(conn, csv_path) == 1
    assert load_airport_overrides(conn, csv_path) == 1  # idempotent
    assert conn.execute("select count(*) from airport_overrides").fetchone()[0] == 1
