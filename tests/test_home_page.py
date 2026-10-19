import re
import sqlite3

from tests.helpers import get
from tests.test_home_queries import apt, carrier
from tests.test_home_stories import eng
from tests.test_rollup_queries import put


def load(db_path):
    put(db_path, "airport_year_totals", [apt(2025, "ATL", "Atlanta, GA", 34, 51_508_668), apt(2025, "DFW", "Dallas/Fort Worth, TX", 74, 41_309_075),
                                         apt(2025, "ORD", "Chicago, IL", 41, 40_755_119)])
    put(db_path, "aircraft_group_band_year", [
        dict(year=y, aircraft_group=g, distance_band=3000, domestic=0, service_class="F", deps=d, seats=0, passengers=0, freight=0)
        for y, g, d in [(1990, "6", 19), (1990, "8", 81), (2025, "6", 94), (2025, "8", 6)]])
    put(db_path, "carrier_group_year", [carrier(1990, "A", 50), carrier(1990, "B", 50), carrier(2025, "A", 60), carrier(2025, "B", 40)])
    put(db_path, "carrier_group", [dict(airline_id="A", group_id="A", group_name="A", airline_name="Alpha Airlines Inc.")])


def test_home_page_tells_the_three_stories(ds, db_path):
    load(db_path)
    html = get(ds, "/").text
    assert [h for h in re.findall(r"<h2[^>]*>([^<]*)</h2>", html)] == ["Airports", "Aircraft", "Airlines"]
    assert "Atlanta, GA (ATL)" in html and "51.5 million" in html and "Chicago, IL (ORD)" in html
    assert "81%" in html and "94%" in html
    assert "Alpha Airlines 60.0%" in html
    for href in ["/airports", "/airports/globe", "/aircraft/engines", "/aircraft", "/airlines", "/about"]:
        assert f'href="{href}"' in html, href
    assert "/static/home/main.js" in html and 'data-max-year="2025"' in html
    assert html.count('class="section"') == 3


def test_home_page_without_data_still_renders(ds):
    r = get(ds, "/")
    assert r.status_code == 200
    assert "million" not in r.text and "Airlines" in r.text and 'href="/airlines"' in r.text


def test_root_with_table_params_redirects_to_airports(ds):
    r = get(ds, "/?year=2019&sort=deps")
    assert r.status_code == 301 and r.headers["location"] == "/airports?year=2019&sort=deps"
    assert get(ds, "/?sort=seats").headers["location"] == "/airports?sort=seats"
    assert get(ds, "/?theme=night").status_code == 200


def test_home_page_survives_a_failing_query(ds, db_path):
    # a derived table missing (say, mid-rebuild) costs that section its numbers, not the whole page
    load(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE carrier_group_year")
    conn.commit()
    conn.close()
    r = get(ds, "/")
    assert r.status_code == 200
    assert "51.5 million" in r.text and "four biggest airlines" not in r.text
