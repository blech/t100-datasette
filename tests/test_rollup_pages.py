import re

import pytest

from tests.helpers import get, get_json
from tests.test_rollup_queries import fam, put


@pytest.mark.parametrize("path, kind", [("/airlines", "airlines")])
def test_page_renders_with_its_kind_and_assets(ds, path, kind):
    r = get(ds, path)
    assert r.status_code == 200
    assert f'data-kind="{kind}"' in r.text
    assert "/static/charts/rollup.js" in r.text
    assert 'id="heatmap"' in r.text and 'id="label-tip"' in r.text


@pytest.mark.parametrize("path", ["/airlines"])
def test_settings_read_as_one_sentence(ds, path):
    html = get(ds, path).text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["heat-measure", "heat-kind", "heat-service", "heat-n", "heat-rank"]
    assert 'id="heat-scale"' in html


def test_engine_story_has_its_own_page_and_the_aircraft_page_links_to_it(ds):
    html = get(ds, "/aircraft/engines").text
    for id_ in ["engine-chart", "engine-measure", "engine-kind", "engine-band"]:
        assert f'id="{id_}"' in html
    assert "/static/charts/engines.js" in html
    assert 'href="/aircraft"' in html
    aircraft = get(ds, "/aircraft").text
    assert "engine-chart" not in aircraft and 'href="/aircraft/engines"' in aircraft


def test_breadcrumbs_and_landing_links(ds):
    assert 'aria-current="page">aircraft<' in get(ds, "/aircraft").text
    landing = get(ds, "/").text
    assert 'href="/aircraft"' in landing and 'href="/airlines"' in landing and 'href="/aircraft/engines"' in landing


def test_a_family_page_is_found_by_its_slug(ds, db_path):
    put(db_path, "family_year", [fam(2019, "DC-9 / MD-80 / MD-90", 1, "F", 3)])
    r = get(ds, "/aircraft/dc-9-md-80-md-90")
    assert r.status_code == 200
    assert 'data-family="DC-9 / MD-80 / MD-90"' in r.text
    assert "/static/charts/family.js" in r.text
    assert 'aria-current="page">DC-9 / MD-80 / MD-90<' in r.text


def test_an_unknown_family_is_404_and_engines_is_not_a_family(ds):
    assert get(ds, "/aircraft/no-such-plane").status_code == 404
    assert "engine-chart" in get(ds, "/aircraft/engines").text


def test_airline_page_names_the_airline_and_unknown_ones_are_not_found(ds, db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1, service_class="F",
                                             deps=4, seats=400, passengers=300, freight=0)])
    r = get(ds, "/airlines/delta")
    assert r.status_code == 200 and ">Delta (incl. Northwest)</h1>" in r.text and "/static/charts/airline.js" in r.text
    assert get(ds, "/airlines/nope").status_code == 404


def test_airline_map_page_renders_and_links_back_to_the_airline(ds, db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", domestic=1, service_class="F",
                                             deps=4, seats=400, passengers=300, freight=0)])
    r = get(ds, "/airlines/delta/globe")
    assert r.status_code == 200 and 'id="globe"' in r.text and "/static/charts/airlineglobe.js" in r.text
    assert 'href="/airlines/delta"' in r.text
    assert 'id="legend-chips"' in r.text and 'id="colour"' in r.text
    assert 'id="legend-service"' not in r.text
    assert get(ds, "/airlines/nope/globe").status_code == 404
    assert 'href="/airlines/delta/globe"' in get(ds, "/airlines/delta").text


def test_carrier_routes_year_returns_one_years_pairs(ds, db_path):
    row = lambda year, dest, deps: dict(group_id="vx", airline_id="21171", year=year, origin="SFO", dest=dest, deps=deps, seats=0, passengers=deps, freight=0, first_month=1, last_month=12)
    put(db_path, "carrier_route_year", [row(2017, "LAX", 900), row(2017, "TINY", 3), row(2018, "DEN", 300)])
    rows = get_json(ds, "/t100/carrier_routes_year.json?_shape=objects&group=vx&year=2017")["rows"]
    assert [r["dest"] for r in rows] == ["LAX", "TINY"]  # the page applies the minimum, so it can add members up first


def test_airline_search_box_is_on_the_airlines_page_and_each_airline_page(ds, db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta", domestic=1, service_class="F", deps=4, seats=400, passengers=300, freight=0)])
    for path in ["/airlines", "/airlines/delta"]:
        html = get(ds, path).text
        assert 'id="airline-search"' in html and 'id="airline-list"' in html and "/static/charts/airlinesearch.js" in html
    assert 'id="airline-search"' not in get(ds, "/aircraft").text


def test_airline_map_has_two_handles_on_one_track_and_no_compare_menu(ds, db_path):
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta", domestic=1, service_class="F", deps=4, seats=400, passengers=300, freight=0)])
    html = get(ds, "/airlines/delta/globe").text
    assert 'id="year-from"' in html and 'id="year"' in html and 'id="compare"' not in html


def test_a_merged_group_lists_its_members_and_each_member_has_a_page_of_its_own(ds, db_path):
    put(db_path, "carrier_group", [dict(airline_id="19790", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Delta Air Lines Inc."),
                                   dict(airline_id="19386", group_id="delta", group_name="Delta (incl. Northwest)", airline_name="Northwest Airlines Inc.")])
    year = lambda airline, deps, y: dict(year=y, group_id="delta", group_name="Delta (incl. Northwest)", airline_id=airline, domestic=1, service_class="F", deps=deps, seats=0, passengers=0, freight=0)
    put(db_path, "carrier_group_year", [year("19790", 50, 2019), year("19386", 20, 2008)])
    group = get(ds, "/airlines/delta").text
    assert 'data-members="2"' in group and 'href="/airlines/19790"' in group and 'href="/airlines/19386"' in group
    assert 'id="th-airline"' in group
    member = get(ds, "/airlines/19386")
    assert member.status_code == 200 and "Northwest Airlines Inc." in member.text and 'href="/airlines/delta"' in member.text
    assert 'data-airline="19386"' in member.text and 'data-group="delta"' in member.text and 'id="th-airline"' not in member.text
    assert get(ds, "/airlines/19386/globe").status_code == 200
    assert get(ds, "/airlines/00000").status_code == 404


def test_aircraft_is_the_table_and_the_maker_chart_is_beside_it(ds):
    table = get(ds, "/aircraft")
    assert table.status_code == 200
    for id_ in ["aircraft-table", "at-status", "at-measure", "at-year", "at-kind", "at-maker", "at-q"]:
        assert f'id="{id_}"' in table.text
    assert "/static/charts/aircrafttable.js" in table.text
    assert 'id="aircraft-table" aria-live' not in table.text  # a rebuilt table must not be a live region; the status line is
    assert "heat-kind" not in table.text and 'id="heatmap"' not in table.text
    makers = get(ds, "/aircraft/makers")
    assert makers.status_code == 200
    for id_ in ["maker-chart", "mk-measure", "mk-kind", "mk-service", "mk-aircraft"]:
        assert f'id="{id_}"' in makers.text
    assert "/static/charts/makers.js" in makers.text and "How makers are counted" in makers.text


def test_the_aircraft_pages_link_to_each_other(ds):
    aircraft = get(ds, "/aircraft").text
    assert 'href="/aircraft/makers"' in aircraft and 'href="/aircraft/engines"' in aircraft and 'href="/aircraft/table"' not in aircraft
    assert 'aria-current="page">aircraft<' in aircraft
    assert 'aria-current="page">makers<' in get(ds, "/aircraft/makers").text
    assert 'href="/aircraft"' in get(ds, "/aircraft/makers").text


def test_the_old_table_address_redirects_to_the_table(ds):
    # it was live as the aircraft table from 2026-10-21; the redirect keeps old links working (no family is called "Table")
    r = get(ds, "/aircraft/table?year=2019")
    assert r.status_code == 301 and r.headers["location"] == "/aircraft?year=2019"


def test_chart_pages_offer_a_year_span_and_know_the_full_range(ds, db_path):
    put(db_path, "family_year", [fam(2019, "Boeing 737", 1, "F", 1)])
    put(db_path, "carrier_group_year", [dict(year=2019, airline_id="19790", group_id="delta", group_name="Delta", domestic=1, service_class="F",
                                             deps=4, seats=400, passengers=300, freight=0)])
    for path, select in [("/aircraft/boeing-737", "fam-span"), ("/airports/SFO/LHR", "chart-span"), ("/airlines/delta", "al-span")]:
        html = get(ds, path).text
        assert f'id="{select}"' in html, path
        assert 'data-min-year="1990"' in html and 'data-max-year="2025"' in html, path
        assert 'value="flown"' in html and 'value="all"' in html, path


def test_the_aircraft_table_offers_a_limit_and_an_all_years_choice(ds):
    html = get(ds, "/aircraft").text
    assert 'id="at-limit"' in html
