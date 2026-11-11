import pytest

from build_database import rebuild_search_index
from tests.helpers import add_airports, get_json, put_airport_years
from tests.test_rollup_pages import aircraft_fixtures
from tests.test_rollup_queries import put
import sqlite3


def seed(db_path, airports=(), aircraft=False):
    put_airport_years(db_path, [dict(year=2019, origin=c, origin_city_name=city, origin_wac=1, deps=d) for c, city, d in airports])
    if aircraft:
        aircraft_fixtures(db_path)
    conn = sqlite3.connect(db_path)
    rebuild_search_index(conn)
    conn.close()


def search(ds, *tokens):
    params = "".join(f"&t{i}={t}" for i, t in enumerate(tokens, 1))
    return get_json(ds, f"/t100/search.json?_shape=objects{params}")["rows"]


KEF = ("KEF", "Reykjavik, Iceland", 9)


def test_an_airport_is_found_by_its_code(ds, db_path):
    seed(db_path, [KEF, ("SFO", "San Francisco, CA", 50)])
    assert [(r["kind"], r["href"]) for r in search(ds, "kef")] == [("airport", "/airports/KEF")]


def test_a_foreign_airport_is_found_by_city_and_by_country(ds, db_path):
    seed(db_path, [KEF])
    assert [r["href"] for r in search(ds, "reykjavik")] == ["/airports/KEF"]
    assert [r["href"] for r in search(ds, "iceland")] == ["/airports/KEF"]


def test_every_token_must_match_so_a_full_aircraft_name_finds_it(ds, db_path):
    seed(db_path, aircraft=True)
    assert [r["href"] for r in search(ds, "boeing", "737-8")] == ["/aircraft/boeing-737/boeing-737-800"]
    assert search(ds, "boeing", "a340") == []


def test_a_search_with_no_tokens_finds_nothing(ds, db_path):
    seed(db_path, [KEF])
    assert search(ds, "", "", "") == []
    assert get_json(ds, "/t100/search.json?_shape=objects")["rows"] == []


@pytest.mark.parametrize("token", ["%", "_", "'", '"', "\\\\"])
def test_wildcards_and_quotes_match_literally_never_everything(ds, db_path, token):
    seed(db_path, [KEF, ("SFO", "San Francisco, CA", 50)])
    assert search(ds, token) == []


def test_each_kind_is_capped_at_six(ds, db_path):
    seed(db_path, [(f"A{c}{d}", f"Alpha{c}{d}, ST", 1) for c in "BCDE" for d in "123456"])
    assert len([r for r in search(ds, "a") if r["kind"] == "airport"]) == 6


def test_an_exact_code_outranks_a_busier_airport_whose_place_only_starts_the_same(ds, db_path):
    seed(db_path, [("SFO", "San Francisco, CA", 50), ("SFB", "Sanford, FL", 5), ("XYZ", "Sfoo Town, ST", 900)])
    assert [r["href"] for r in search(ds, "sfo")][0] == "/airports/SFO"


def test_results_come_grouped_airports_then_airlines_then_aircraft(ds, db_path):
    seed(db_path, [("BOE", "Boeing Field, WA", 3)], aircraft=True)
    assert [r["kind"] for r in search(ds, "boe")] == ["airport", "aircraft", "aircraft"]


def test_the_search_works_in_public_mode(db_path):
    from tests.helpers import make_datasette
    seed(db_path, [KEF])
    ds = make_datasette(db_path, {"default_allow_sql": False, "allow_download": False})
    assert [r["href"] for r in search(ds, "kef")] == ["/airports/KEF"]
