import re

from tests.helpers import get


def test_the_destinations_matrix_renders_with_origin_and_assets(ds):
    r = get(ds, "/airports/ATL/destinations")
    assert r.status_code == 200
    assert 'data-origin="ATL"' in r.text
    assert "/static/charts/routes.js" in r.text


def test_lowercase_is_normalised(ds):
    assert 'data-origin="ATL"' in get(ds, "/airports/atl").text


def test_bad_codes_are_404(ds):
    assert get(ds, "/airports/toolong").status_code == 404


def test_airports_index_is_the_table(ds):
    r = get(ds, "/airports?theme=night")
    assert r.status_code == 200 and 'id="airports"' in r.text


def test_globe_page_links_to_routes_over_time(ds):
    assert 'href="/airports/ATL"' in get(ds, "/airports/ATL/globe").text
    assert not re.search(r'href="/airports/[A-Za-z0-9]{3}\b', get(ds, "/airports/globe").text)  # the all-airports map names no airport


def test_page_offers_the_city_grouping(ds):
    html = get(ds, "/airports/ATL/destinations").text
    assert '<option value="city">' in html and 'id="matrix-group"' in html


def test_page_has_the_label_tooltip_element(ds):
    assert 'id="label-tip"' in get(ds, "/airports/ATL/destinations").text


def test_page_offers_ranking_by_the_latest_full_year(ds):
    html = get(ds, "/airports/ATL/destinations").text
    assert 'id="matrix-rank"' in html and '<option value="latest">' in html
    assert 'data-latest-year="2025"' in html


def test_page_offers_colouring_by_share_of_each_year(ds):
    html = get(ds, "/airports/ATL/destinations").text
    assert 'id="matrix-scale"' in html and 'id="scale-note"' in html
    for value, label in [("absolute", "Amount"), ("year", "Share of each year"), ("busiest", "Compared to top destination")]:
        assert re.search(rf'<input type="radio" name="scale" value="{value}"[^>]*>\s*{label}', html), value


def test_the_settings_read_as_one_sentence(ds):
    html = get(ds, "/airports/ATL/destinations").text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    ids = re.findall(r'<select id="([^"]+)"', sentence)
    assert ids == ["matrix-measure", "matrix-service", "matrix-n", "matrix-group", "matrix-flown", "matrix-rank"]
    text = re.sub(r"<select.*?</select>", "*", sentence, flags=re.S)
    assert " ".join(text.split()) == "Show * on * for the top * * *, ranked by *."


def test_page_offers_destinations_first_flown_after_the_data_starts_or_dropped_by_its_end(ds):
    html = get(ds, "/airports/ATL/destinations").text
    options = re.search(r'<select id="matrix-flown"[^>]*>(.*?)</select>', html, re.S).group(1)
    assert re.findall(r'<option value="(\w+)">([^<]+)</option>', options) == [
        ("ever", "ever flown"), ("after", "first flown after 1990"), ("dropped", "dropped by 2025")]
    assert 'data-min-year="1990"' in html and 'id="flown-note"' in html


def test_colour_choice_sits_with_the_legend_not_in_the_sentence(ds):
    html = get(ds, "/airports/ATL/destinations").text
    assert 'id="matrix-scale"' not in re.search(r'<p class="chart-sentence">.*?</p>', html, re.S).group(0)
    assert html.index('id="matrix-scale"') < html.index('id="matrix"')


def test_service_and_grouping_options_read_naturally_in_the_sentence(ds):
    html = get(ds, "/airports/ATL/destinations").text
    for text in ["all flights", "domestic flights", "international flights", "airports", "cities (BTS markets)"]:
        assert f">{text}</option>" in html, text
