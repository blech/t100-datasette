from tests.helpers import add_segments, get

NOTE = 'id="foreign-note"'


def seg(origin, origin_wac, dest, dest_wac):
    return dict(year=2024, month=1, origin=origin, origin_wac=origin_wac, dest=dest, dest_wac=dest_wac,
                departures_performed=20, passengers=3000, seats=4000)


def load(db_path):
    add_segments(db_path, "t100_international", [seg("LHR", 493, "JFK", 22), seg("JFK", 22, "LHR", 493), seg("SJU", 3, "MIA", 33)])
    add_segments(db_path, "t100_domestic", [seg("ATL", 34, "LAX", 91)])


def test_routes_page_for_a_foreign_airport_says_only_us_destinations_are_listed(ds, db_path):
    load(db_path)
    html = get(ds, "/routes/LHR").text
    assert NOTE in html and 'data-foreign="1"' in html
    assert "LHR is outside the US" in html


def test_routes_page_for_us_airports_and_territories_has_no_note(ds, db_path):
    load(db_path)
    for code in ["ATL", "JFK", "SJU"]:
        html = get(ds, f"/routes/{code}").text
        assert NOTE not in html and 'data-foreign="1"' not in html, code


def test_airport_with_no_data_has_no_note(ds, db_path):
    load(db_path)
    assert NOTE not in get(ds, "/routes/ZZZ").text


def test_lowercase_code_is_recognised(ds, db_path):
    load(db_path)
    assert NOTE in get(ds, "/routes/lhr").text


def test_globe_page_flags_foreign_airports_and_not_the_chooser(ds, db_path):
    load(db_path)
    assert 'data-foreign="1"' in get(ds, "/globe/LHR").text and NOTE in get(ds, "/globe/LHR").text
    assert NOTE not in get(ds, "/globe/ATL").text
    assert NOTE not in get(ds, "/globe").text
