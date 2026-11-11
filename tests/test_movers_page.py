import re

import pytest

from tests.helpers import ROOT, get, put_airport_years


def put(db_path, code, year, passengers, wac=34):
    put_airport_years(db_path, [dict(year=year, origin=code, origin_city_name=f"{code} City, ST", origin_wac=wac, deps=1, seats=1,
                                     passengers=passengers, freight=0)])


def grow(db_path, code, before, after, first=1990, last=2025):
    put(db_path, code, first, before)
    put(db_path, code, last, after)


def five(db_path):
    # growth 4, 3, 1.5 (the median), 1 and 0.5; five million passengers in 1990 and ten million in 2025 all together
    for code, after in (("FOUR", 4_000_000), ("THRE", 3_000_000), ("MEDI", 1_500_000), ("FLAT", 1_000_000), ("HALF", 500_000)):
        grow(db_path, code, 1_000_000, after)


def page(ds, path="/airports/movers"):
    r = get(ds, path)
    assert r.status_code == 200, r.text[:300]
    return r.text


def table(html, name):
    """The rows of the table with this id, as lists of cell texts."""
    body = re.search(rf'<table id="{name}".*?</table>', html, re.S).group(0)
    return [[re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
            for row in re.findall(r"<tr>(.*?)</tr>", body, re.S) if "<td" in row]


def test_risers_and_fallers_are_ranked_against_the_median_airport(ds, db_path):
    five(db_path)
    html = page(ds)
    assert [r[0] for r in table(html, "risers")] == ["FOUR", "THRE"]
    assert [r[0] for r in table(html, "fallers")] == ["HALF", "FLAT"]  # the median airport itself is neither


def test_a_row_gives_the_city_the_passengers_then_and_now_the_growth_and_the_growth_against_the_median(ds, db_path):
    five(db_path)
    html = page(ds)
    assert table(html, "risers")[0][:7] == ["FOUR", "FOUR City, ST", "1 million", "4 million", "×4", "×2.67", "2025"]
    assert table(html, "fallers")[0][4:6] == ["×0.5", "×0.333"]


def test_the_peak_year_and_how_far_the_airport_is_from_it_are_shown(ds, db_path):
    five(db_path)
    put(db_path, "HALF", 2000, 2_000_000)
    html = page(ds)
    assert table(html, "fallers")[0][0:1] + table(html, "fallers")[0][6:8] == ["HALF", "2000", "25%"]
    assert table(html, "risers")[0][6:8] == ["2025", "100%"]  # at its peak


def test_the_airports_link_to_their_pages_with_their_name_as_the_hover(ds, db_path):
    five(db_path)
    assert '<a href="/airports/FOUR" title="FOUR">FOUR</a>' in page(ds)


def test_the_median_and_the_whole_are_quoted_above_the_tables(ds, db_path):
    five(db_path)
    html = page(ds)
    intro = re.search(r'<p class="intro">(.*?)</p>', html, re.S).group(1)
    assert "1.5 times" in intro and "1990" in intro and "2025" in intro and "2 times" in intro


def test_a_small_airport_is_left_out_unless_the_size_is_lowered(ds, db_path):
    five(db_path)
    grow(db_path, "TINY", 200_000, 6_000_000)
    assert "TINY" not in page(ds)
    assert "TINY" in page(ds, "/airports/movers?min=100000")


def test_the_years_are_the_ones_asked_for(ds, db_path):
    five(db_path)
    grow(db_path, "OLD", 1_000_000, 9_000_000, first=2005, last=2015)
    grow(db_path, "FLT", 1_000_000, 1_000_000, first=2005, last=2015)  # the median of two is between them, so OLD is above it
    html = page(ds, "/airports/movers?from=2005&to=2015")
    assert [r[0] for r in table(html, "risers")] == ["OLD"] and [r[0] for r in table(html, "fallers")] == ["FLT"]
    assert "FOUR" not in html


@pytest.mark.parametrize("query", ["from=abc&to=", "from=2030&to=1800", "from=2025&to=1990", "from=2010&to=2010", "min=7&to=2999", "min=-5"])
def test_nonsense_settings_fall_back_to_the_defaults(ds, db_path, query):
    five(db_path)
    assert "FOUR" in page(ds, f"/airports/movers?{query}")


def test_the_settings_are_selects_that_change_the_page_by_themselves(ds):
    html = page(ds)
    assert '<script type="module" src="/static/movers/main.js">' in html
    for name in ("from", "to", "min"):
        assert f'<select name="{name}" id="{name}"' in html
    outside = re.sub(r"<noscript>.*?</noscript>", "", html, flags=re.S)
    assert "<button" not in outside and re.search(r"<noscript>.*<button[^>]*>Show</button>.*</noscript>", html, re.S)


def test_the_chosen_settings_are_selected_and_given_to_the_script(ds, db_path):
    five(db_path)
    html = page(ds, "/airports/movers?from=2005&to=2015&min=1000000")
    assert re.search(r'<option value="2005" selected>', html) and re.search(r'<option value="2015" selected>', html)
    assert re.search(r'<option value="1000000" selected>', html)
    assert 'data-from="2005"' in html and 'data-to="2015"' in html and 'data-min="1000000"' in html


def test_the_page_is_in_the_airports_views_line_after_most_dedicated(ds):
    html = page(ds)
    assert '<a href="/airports/dedicated">Most dedicated</a> · <strong aria-current="page">Risers and fallers</strong> · <a href="/airports/routes">Routes</a>' in html
    assert "<h1>Risers and fallers</h1>" in html and "<title>Risers and fallers" in html


def test_the_page_renders_without_data(ds):
    html = page(ds)
    assert "No airports" in html and "<table" not in html


def test_the_charts_have_somewhere_to_go_and_say_how_the_numbers_are_counted(ds, db_path):
    five(db_path)
    html = page(ds)
    assert 'id="movers-scatter"' in html and 'id="movers-lines"' in html
    assert "boarding or leaving" in html and "once on each flight" in html


def test_the_stylesheet_is_linked(ds):
    assert '<link rel="stylesheet" href="/static/movers/style.css">' in page(ds)
    assert (ROOT / "static/movers/style.css").exists()


@pytest.mark.parametrize("value, written", [(4.8366, "×4.84"), (4, "×4"), (1 / 3, "×0.333"), (0, "×0"), (0.001, "×0.001"), (0.000075, "<×0.001"),
                                            (1234.5, "×1,234"), (None, "–")])
def test_a_multiple_has_three_significant_figures_and_never_an_exponent(value, written):
    from plugins.t100_globe import multiple
    assert multiple(value) == written
