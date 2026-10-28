from tests.helpers import add_segments, get_json
from tests.test_rollup_queries import put
from tests.test_rollups import add_carriers, flight


def seed(db_path):
    add_carriers(db_path, ("19977", "U1", "United Air Lines Inc."))
    put(db_path, "carrier_group", [dict(airline_id="19977", group_id="united", group_name="United (incl. Continental)", airline_name="United Air Lines Inc.")])
    add_segments(db_path, "t100_domestic", [
        flight("SFO", "LAX", 2019, deps=8, carrier_entity="U1", month=3, dest_city_name="Los Angeles, CA", **{"class": "F"}),
        flight("SFO", "LAX", 2019, deps=2, carrier_entity="U1", month=4, dest_city_name="Los Angeles, CA", **{"class": "F"}),
        flight("SFO", "LAX", 2023, deps=5, carrier_entity="U1", month=7, dest_city_name="Los Angeles, CA", **{"class": "F"}),
        flight("SFO", "BOS", 2023, deps=6, carrier_entity="U1", dest_city_name="Boston, MA", **{"class": "F"}),
        flight("SFO", "SEA", 2015, deps=9, carrier_entity="U1", dest_city_name="Seattle, WA", **{"class": "F"}),
        flight("SFO", "SEA", 2019, deps=4, carrier_entity="X9", dest_city_name="Seattle, WA", **{"class": "F"}),
        flight("LAX", "SFO", 2019, deps=50, carrier_entity="U1", **{"class": "F"}),
    ])
    add_segments(db_path, "t100_international", [
        flight("SFO", "NRT", 2019, deps=3, pax=0, freight=5000, carrier_entity="U1", **{"class": "G"}),
    ])


def size(ds, origin="SFO"):
    body = get_json(ds, f"/t100/airport_size.json?origin={origin}&_shape=objects")
    assert body["truncated"] is False
    return body["rows"]


def changes(ds, a=2019, b=2023):
    body = get_json(ds, f"/t100/airport_changes.json?origin=SFO&a={a}&b={b}&_shape=objects")
    return {(r["dest"], r["group_id"]): r for r in body["rows"]}


def test_airport_size_counts_departures_from_the_airport_by_group_service_and_kind(ds, db_path):
    seed(db_path)
    rows = {(r["year"], r["group_id"], r["service"], r["kind"]): r for r in size(ds)}
    assert rows[(2019, "united", "domestic", "passenger")]["deps"] == 10
    assert rows[(2019, "united", "domestic", "passenger")]["group_name"] == "United (incl. Continental)"
    assert rows[(2019, "united", "international", "freight")]["freight"] == 5000
    assert rows[(2019, "unknown", "domestic", "passenger")]["group_name"] == "Unknown carrier"
    assert sum(r["deps"] for r in size(ds) if r["year"] == 2019) == 10 + 3 + 4  # the arrival from LAX is not counted


def test_airport_changes_gives_each_destination_and_group_both_years_and_its_span(ds, db_path):
    seed(db_path)
    rows = changes(ds)
    lax = rows[("LAX", "united")]
    assert lax["deps_a"] == 10 and lax["deps_b"] == 5
    assert lax["first_ym"] == 201903 and lax["last_ym"] == 202307
    assert lax["city"] == "Los Angeles, CA" and lax["group_name"] == "United (incl. Continental)"
    assert rows[("BOS", "united")]["deps_a"] == 0 and rows[("BOS", "united")]["deps_b"] == 6
    assert ("SEA", "united") not in rows  # flown, but in neither year
    assert rows[("SEA", "unknown")]["deps_a"] == 4


def test_airport_changes_agrees_with_the_matrix(ds, db_path):
    seed(db_path)
    matrix = {(r["dest"], r["year"]): r["deps"] for r in get_json(ds, "/t100/routes_by_year.json?origin=SFO&min_deps=1&_shape=objects")["rows"]}
    totals = {}
    for (dest, _), r in changes(ds).items():
        totals[dest] = totals.get(dest, 0) + r["deps_a"]
    assert totals == {d: n for (d, y), n in matrix.items() if y == 2019} | {"BOS": 0}


def gone(ds, **q):
    params = {"origin": "SFO", "a": 2015, "b": 2023, "min": 1, "show": "destinations", **q}
    body = get_json(ds, "/t100/airport_gone.json?_shape=objects&" + "&".join(f"{k}={v}" for k, v in params.items()))
    assert body["truncated"] is False
    return body["rows"]


def test_airport_gone_lists_the_destinations_flown_from_a_up_to_b_but_not_in_b_with_their_busiest_year(ds, db_path):
    seed(db_path)
    rows = {(r["code"], r["member"]): r for r in gone(ds)}
    assert sorted(rows) == [("NRT", "United (incl. Continental)"), ("SEA", "United (incl. Continental)")]  # LAX is still flown in 2023
    sea = rows[("SEA", "United (incl. Continental)")]  # dropped: flown in 2015, busiest then, last flown in 2019
    assert (sea["deps_a"], sea["first_year"], sea["last_year"], sea["peak_year"], sea["peak_deps"], sea["member_deps"]) == (9, 2015, 2019, 2015, 9, 9)
    assert sea["name"] == "Seattle, WA"
    nrt = rows[("NRT", "United (incl. Continental)")]  # added and dropped again in between
    assert (nrt["deps_a"], nrt["first_year"], nrt["last_year"], nrt["peak_year"]) == (0, 2019, 2019, 2019)


def test_airport_gone_counts_each_year_at_the_minimum_and_can_list_airlines_instead(ds, db_path):
    seed(db_path)
    rows = gone(ds, min=5)
    assert [(r["code"], r["last_year"]) for r in rows] == [("SEA", 2015)]  # 2019's 4 departures and NRT's 3 don't reach it
    airlines = gone(ds, show="airlines")
    assert [(r["code"], r["member"], r["first_year"]) for r in airlines] == [("unknown", "SEA", 2019)]  # United still flies from SFO in 2023
