import re

import pytest

from tests.helpers import get, get_json
from tests.test_rollup_queries import fam, put


@pytest.mark.parametrize("path, kind", [("/airlines/over-time", "airlines"), ("/aircraft/over-time", "aircraft")])
def test_page_renders_with_its_kind_and_assets(ds, path, kind):
    r = get(ds, path)
    assert r.status_code == 200
    assert f'data-kind="{kind}"' in r.text
    assert "/static/charts/rollup.js" in r.text
    assert 'id="matrix"' in r.text and 'id="label-tip"' in r.text


@pytest.mark.parametrize("path", ["/airlines/over-time", "/aircraft/over-time"])
def test_settings_read_as_one_sentence(ds, path):
    html = get(ds, path).text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["matrix-measure", "matrix-kind", "matrix-service", "matrix-n", "matrix-rank"]
    assert 'id="matrix-scale"' in html


def test_the_groups_page_charts_a_range_of_distances_and_the_aircraft_page_links_to_it(ds):
    html = get(ds, "/aircraft/groups").text
    for id_ in ["engine-chart", "engine-measure", "engine-kind", "engine-from", "engine-to"]:
        assert f'id="{id_}"' in html
    assert 'id="engine-band"' not in html
    assert "<h1>Aircraft groups by distance</h1>" in html and "<title>Aircraft groups by distance · T-100</title>" in html
    assert '<li aria-current="page">groups</li>' in html
    assert "/static/charts/engines.js" in html
    assert 'href="/aircraft"' in html
    aircraft = get(ds, "/aircraft").text
    assert "engine-chart" not in aircraft and 'href="/aircraft/groups"' in aircraft


def test_breadcrumbs_and_landing_links(ds):
    assert 'aria-current="page">aircraft<' in get(ds, "/aircraft").text
    landing = get(ds, "/").text
    assert 'href="/aircraft"' in landing and 'href="/airlines"' in landing and 'href="/aircraft/groups"' in landing


def test_a_family_page_is_found_by_its_slug(ds, db_path):
    put(db_path, "family_year", [fam(2019, "DC-9 / MD-80 / MD-90", 1, "F", 3)])
    r = get(ds, "/aircraft/dc-9-md-80-md-90")
    assert r.status_code == 200
    assert 'data-family="DC-9 / MD-80 / MD-90"' in r.text
    assert "/static/charts/family.js" in r.text
    assert 'aria-current="page">DC-9 / MD-80 / MD-90<' in r.text


def test_an_unknown_family_is_404_and_engines_is_not_a_family(ds):
    assert get(ds, "/aircraft/no-such-plane").status_code == 404
    assert "engine-chart" in get(ds, "/aircraft/groups").text


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
    assert 'id="th-airline"' in get(ds, "/airlines/delta/changes").text  # a merged group's changes say which member flew each route
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
    assert "matrix-kind" not in table.text and 'id="matrix"' not in table.text
    makers = get(ds, "/aircraft/makers")
    assert makers.status_code == 200
    for id_ in ["maker-chart", "mk-measure", "mk-kind", "mk-service", "mk-aircraft"]:
        assert f'id="{id_}"' in makers.text
    assert "/static/charts/makers.js" in makers.text and "How makers are counted" in makers.text


def test_the_aircraft_pages_link_to_each_other(ds):
    aircraft = get(ds, "/aircraft").text
    assert 'href="/aircraft/makers"' in aircraft and 'href="/aircraft/groups"' in aircraft and 'href="/aircraft/table"' not in aircraft
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


def test_the_airlines_table_page_has_its_controls_breadcrumb_and_script(ds):
    html = get(ds, "/airlines").text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    assert re.findall(r'<select id="([^"]+)"', sentence) == ["airline-measure", "airline-year", "airline-flights", "airline-service", "airline-limit"]
    for id_ in ["airline-q", "airline-status", "airline-table"]:
        assert f'id="{id_}"' in html
    assert "/static/charts/airlinetable.js" in html and "data-latest-year=" in html
    assert 'aria-current="page">airlines<' in html


def test_the_matrix_breadcrumb_goes_back_to_the_table(ds):
    html = get(ds, "/airlines/over-time").text
    assert '<a href="/airlines">airlines</a>' in html and 'aria-current="page">over time<' in html


def aircraft_fixtures(db_path):
    put(db_path, "aircraft_types", [dict(ac_typeid="614", ac_group="6", name="Boeing 737-800", maker="Boeing", kind="Jet, twin-engine")])
    put(db_path, "aircraft_family", [dict(aircraft_type="614", name="Boeing 737-800", family="Boeing 737", subfamily="737 NG", aircraft_class="Narrowbody jet", fallback=0)])
    put(db_path, "type_year", [dict(year=y, aircraft_type=t, domestic=1, service_class="F", deps=5, seats=500, passengers=400, freight=0)
                               for y, t in ((2001, "614"), (2019, "614"), (2019, "999"))])
    put(db_path, "family_year", [fam(2019, "Boeing 737", 1, "F", 5)])


def test_an_aircraft_page_is_found_by_its_family_and_its_own_slug(ds, db_path):
    aircraft_fixtures(db_path)
    r = get(ds, "/aircraft/boeing-737/boeing-737-800")
    assert r.status_code == 200
    assert 'data-query="aircraft_detail"' in r.text and 'data-subject="614"' in r.text and 'data-title="Boeing 737-800"' in r.text
    assert "/static/charts/family.js" in r.text
    assert "<h1>Boeing 737-800 over time</h1>" in r.text
    assert 'href="/aircraft/boeing-737"' in r.text and "Boeing" in r.text and "Jet, twin-engine" in r.text and "2001" in r.text
    assert 'aria-current="page">Boeing 737-800<' in r.text


def test_family_and_aircraft_pages_have_what_their_bars_link_to(ds, db_path):
    aircraft_fixtures(db_path)
    aircraft = get(ds, "/aircraft/boeing-737/boeing-737-800").text
    assert 'data-family-name="Boeing 737"' in aircraft and 'id="click-hint"' in aircraft  # the aircraft page names its family for the data link
    family = get(ds, "/aircraft/boeing-737").text
    assert '<p class="note" id="click-hint"></p>' in family  # shown on every split, its words set by the script


def test_an_aircraft_page_for_an_unknown_aircraft_or_the_wrong_family_is_404(ds, db_path):
    aircraft_fixtures(db_path)
    assert get(ds, "/aircraft/boeing-737/no-such-plane").status_code == 404
    assert get(ds, "/aircraft/no-such-family/boeing-737-800").status_code == 404
    assert get(ds, "/aircraft/makers/boeing-737-800").status_code == 404


def test_a_type_with_no_family_has_a_page_named_as_the_table_names_it(ds, db_path):
    aircraft_fixtures(db_path)
    r = get(ds, "/aircraft/unknown/type-999")
    assert r.status_code == 200 and 'data-subject="999"' in r.text and "Type 999" in r.text


def split_options(html):
    select = re.search(r'<select id="fam-split".*?</select>', html, re.S).group(0)
    return re.findall(r'<option value="([^"]+)"', select)


def test_the_splits_are_version_airline_aircraft_or_nothing_for_a_family_and_airline_or_nothing_for_an_aircraft(ds, db_path):
    aircraft_fixtures(db_path)
    assert split_options(get(ds, "/aircraft/boeing-737").text) == ["subfamily", "airline", "aircraft", "all"]
    aircraft = get(ds, "/aircraft/boeing-737/boeing-737-800").text
    assert split_options(aircraft) == ["airline", "all"]
    assert 'data-default-split="airline"' in aircraft


def test_an_aircraft_is_never_called_a_type_but_the_bts_groups_are(ds, db_path):
    aircraft_fixtures(db_path)
    for path in ("/aircraft", "/aircraft/makers"):
        html = get(ds, path).text
        assert 'aria-label="Type of aircraft"' in html and "Kind of aircraft" not in html, path
    for path in ("/aircraft", "/aircraft/boeing-737", "/aircraft/boeing-737/boeing-737-800", "/about"):
        text = re.sub(r"<[^>]+>", " ", get(ds, path).text)
        assert not re.search(r"aircraft types? (BTS|lump)|BTS's aircraft types|one type|a type by|its types|each type|older types", text, re.I), path


def test_the_families_matrix_has_its_own_address_and_wording(ds):
    html = get(ds, "/aircraft/over-time").text
    assert "Aircraft families over time" in html and "airline" not in html.split('<p class="intro">')[1].split("</p>")[0].lower()
    assert "Every airline" not in html and "Every US airport" not in html
    assert 'id="matrix-group"' not in html
