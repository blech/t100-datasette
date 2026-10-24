import re

import pytest

from tests.helpers import ROOT, get, get_json
from tests.test_rollup_queries import put


def cell(year, origin, group, passengers=0, freight=0, wac=34, domestic=1, service_class="F"):
    return dict(year=year, origin=origin, origin_wac=wac, group_id=group, group_name=f"{group} Air", domestic=domestic, service_class=service_class,
                deps=1, seats=1, passengers=passengers, freight=freight)


def city(db_path, year, *codes):
    put(db_path, "airport_year_totals", [dict(year=year, origin=c, origin_city_name=f"{c} City, ST", origin_wac=34, deps=1, seats=1, passengers=1, freight=0) for c in codes])


def dedicated(ds, year=2025, measure="passengers"):
    return get_json(ds, f"/t100/dedicated_airports.json?_shape=objects&year={year}&measure={measure}")["rows"]


def test_airports_are_ordered_by_the_top_airlines_share_of_the_airports_total(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "AAA", "x", 900), cell(2025, "AAA", "y", 100), cell(2025, "BBB", "x", 500), cell(2025, "BBB", "z", 500),
                                          cell(2025, "CCC", "y", 70), cell(2025, "CCC", "z", 20), cell(2025, "CCC", "x", 10)])
    city(db_path, 2025, "AAA", "BBB", "CCC")
    rows = dedicated(ds)
    assert [(r["origin"], r["group_id"], round(r["share"], 2)) for r in rows] == [("AAA", "x", 0.9), ("CCC", "y", 0.7), ("BBB", "x", 0.5)]
    assert rows[0]["total"] == 1000 and rows[0]["airline_total"] == 900 and rows[0]["origin_city_name"] == "AAA City, ST"
    assert rows[1]["size_rank"] == 3 and rows[0]["size_rank"] == 1  # by size: AAA 1000, BBB 1000 (tie by code), CCC 100


def test_a_carriers_domestic_and_international_flying_and_service_classes_add_up(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "AAA", "x", 300, domestic=1), cell(2025, "AAA", "x", 300, domestic=0), cell(2025, "AAA", "x", 100, service_class="L"),
                                          cell(2025, "AAA", "y", 300)])
    [row] = dedicated(ds)
    assert row["group_id"] == "x" and row["airline_total"] == 700 and row["total"] == 1000 and row["share"] == pytest.approx(0.7)


def test_only_us_airports_and_only_the_chosen_year_count(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "AAA", "x", 10), cell(2024, "OLD", "x", 10), cell(2025, "LHR", "x", 10, wac=493)])
    assert [r["origin"] for r in dedicated(ds)] == ["AAA"]
    assert [r["origin"] for r in dedicated(ds, 2024)] == ["OLD"]


def test_freight_ranks_by_freight_and_leaves_out_airports_with_none(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "MEM", "fedex", 0, 990), cell(2025, "MEM", "delta", 500, 10), cell(2025, "BWI", "wn", 9000, 0)])
    assert [(r["origin"], r["group_id"], round(r["share"], 2)) for r in dedicated(ds, measure="freight")] == [("MEM", "fedex", 0.99)]
    assert [r["origin"] for r in dedicated(ds, measure="passengers")] == ["BWI", "MEM"]  # BWI 100%, MEM: delta 500 of 500


def test_at_most_ten_airports_are_shown(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, f"A{i:02d}", "x", 100 + i) for i in range(15)])
    assert len(dedicated(ds)) == 10


@pytest.mark.parametrize("measure, pool", [("passengers", 100), ("freight", 25)])
def test_only_the_biggest_airports_by_the_measure_are_considered(ds, db_path, measure, pool):
    # the smallest airport is the most dedicated, one airline carrying everything, but it is outside the pool
    big = [cell(2025, f"B{i:03d}", g, **{measure: 1000 - i}) for i in range(pool) for g in ("x", "y")]
    put(db_path, "airport_carrier_year", big + [cell(2025, "TINY", "x", **{measure: 1})])
    assert "TINY" not in [r["origin"] for r in dedicated(ds, measure=measure)]
    put(db_path, "airport_carrier_year", [cell(2025, "FIT", "x", **{measure: 5000})])
    assert dedicated(ds, measure=measure)[0]["origin"] == "FIT"


def page(ds, path="/airports/dedicated"):
    r = get(ds, path)
    assert r.status_code == 200, r.text[:300]
    return r.text


def test_the_page_has_a_table_for_passengers_and_one_for_freight_linking_airports_and_airlines(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "BWI", "southwest", 708, 0), cell(2025, "BWI", "spirit", 292, 0), cell(2025, "MEM", "fedex", 0, 4_000_000), cell(2025, "MEM", "delta", 10, 40_000)])
    city(db_path, 2025, "BWI", "MEM")
    html = page(ds)
    assert "Passengers" in html and "Freight" in html
    assert '<a href="/airports/BWI">BWI</a>' in html and '<a href="/airlines/southwest">southwest Air</a>' in html
    assert "70.8%" in html and "98.0%" not in html and "99.0%" in html  # MEM freight: 4,000,000 of 4,040,000


def test_the_page_takes_a_year_and_falls_back_to_the_latest_for_nonsense(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "NEW", "x", 100), cell(2019, "OLD", "x", 100)])
    city(db_path, 2025, "NEW")
    city(db_path, 2019, "OLD")
    assert "OLD" in page(ds, "/airports/dedicated?year=2019") and "NEW" not in page(ds, "/airports/dedicated?year=2019")
    for bad in ("abc", "1800", "2999", ""):
        assert "NEW" in page(ds, f"/airports/dedicated?year={bad}")


def test_the_page_is_in_the_airports_views_line(ds):
    html = page(ds)
    assert '<a href="/airports">Busiest airports</a> · <strong aria-current="page">Most dedicated</strong> · <a href="/airports/over-time">Over time</a>' in html


def test_the_page_renders_without_data(ds):
    assert "No data" in page(ds)


def test_the_year_changes_the_page_by_itself_and_the_button_is_only_for_browsers_without_scripts(ds):
    html = page(ds)
    assert '<script type="module" src="/static/dedicated/main.js">' in html and '<select name="year" id="year"' in html
    outside = re.sub(r"<noscript>.*?</noscript>", "", html, flags=re.S)
    assert "<button" not in outside and "Show" not in outside
    assert re.search(r"<noscript>.*<button[^>]*>Show</button>.*</noscript>", html, re.S)


def test_the_airport_and_city_stay_on_one_line_and_the_airline_may_wrap(ds):
    css = (ROOT / "static/dedicated/style.css").read_text()
    assert re.search(r"td\.city\s*\{[^}]*white-space:\s*nowrap", css) and re.search(r"td\.airline\s*\{[^}]*white-space:\s*normal", css)
    html = page(ds)
    assert '<link rel="stylesheet" href="/static/dedicated/style.css">' in html


def test_the_freight_tables_airports_open_the_airport_page_showing_freight_on_all_flights(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "BWI", "southwest", 100, 5), cell(2025, "MEM", "fedex", 0, 1000)])
    city(db_path, 2025, "BWI", "MEM")
    html = page(ds)
    freight = html[html.index('id="freight-heading"'):]
    assert '<a href="/airports/MEM?measure=freight&amp;flights=all">MEM</a>' in freight
    assert '<a href="/airports/BWI">BWI</a>' in html[:html.index('id="freight-heading"')]  # passengers: the page's own defaults


def test_the_tables_have_no_row_number_column(ds, db_path):
    put(db_path, "airport_carrier_year", [cell(2025, "AAA", "x", 10), cell(2025, "BBB", "y", 5)])
    html = page(ds)
    assert 'scope="col" class="num">#</th>' not in html
    assert re.findall(r'<tr>\s*<td class="code">', html), "the airport is the first cell of each row"
