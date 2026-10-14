import re

from tests.helpers import get


def test_routes_over_time_page_renders_with_origin_and_assets(ds):
    r = get(ds, "/airports/ATL")
    assert r.status_code == 200
    assert 'data-origin="ATL"' in r.text
    assert "/static/charts/routes.js" in r.text


def test_lowercase_is_normalised(ds):
    assert 'data-origin="ATL"' in get(ds, "/airports/atl").text


def test_bad_codes_are_404(ds):
    assert get(ds, "/airports/toolong").status_code == 404


def test_airports_index_goes_to_the_landing_page_keeping_the_query(ds):
    r = get(ds, "/airports?theme=night&measure=deps")
    assert r.status_code == 302
    assert r.headers["location"] == "/?theme=night&measure=deps"
    assert get(ds, "/airports").headers["location"] == "/"


def test_globe_page_links_to_routes_over_time(ds):
    assert 'href="/airports/ATL"' in get(ds, "/airports/ATL/globe").text
    assert "/airports/" not in get(ds, "/globe").text


def test_page_offers_the_city_grouping(ds):
    html = get(ds, "/airports/ATL").text
    assert '<option value="city">' in html and 'id="heat-group"' in html


def test_page_has_the_label_tooltip_element(ds):
    assert 'id="label-tip"' in get(ds, "/airports/ATL").text


def test_page_offers_ranking_by_the_latest_full_year(ds):
    html = get(ds, "/airports/ATL").text
    assert 'id="heat-rank"' in html and '<option value="latest">' in html
    assert 'data-latest-year="2025"' in html


def test_page_offers_colouring_by_share_of_each_year(ds):
    html = get(ds, "/airports/ATL").text
    assert 'id="heat-scale"' in html and 'id="scale-note"' in html
    for value, label in [("absolute", "Amount"), ("year", "Share of each year"), ("busiest", "Compared to top destination")]:
        assert re.search(rf'<input type="radio" name="scale" value="{value}"[^>]*>\s*{label}', html), value


def test_the_settings_read_as_one_sentence(ds):
    html = get(ds, "/airports/ATL").text
    sentence = re.search(r'<p class="chart-sentence">(.*?)</p>', html, re.S).group(1)
    ids = re.findall(r'<select id="([^"]+)"', sentence)
    assert ids == ["heat-measure", "heat-service", "heat-n", "heat-group", "heat-rank"]
    text = re.sub(r"<select.*?</select>", "*", sentence, flags=re.S)
    assert " ".join(text.split()) == "Show * on * for the top * *, ranked by *."


def test_colour_choice_sits_with_the_legend_not_in_the_sentence(ds):
    html = get(ds, "/airports/ATL").text
    assert 'id="heat-scale"' not in re.search(r'<p class="chart-sentence">.*?</p>', html, re.S).group(0)
    assert html.index('id="heat-scale"') < html.index('id="heatmap"')


def test_service_and_grouping_options_read_naturally_in_the_sentence(ds):
    html = get(ds, "/airports/ATL").text
    for text in ["all flights", "domestic flights", "international flights", "airports", "cities (BTS markets)"]:
        assert f">{text}</option>" in html, text
