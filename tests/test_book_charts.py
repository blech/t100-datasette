import xml.etree.ElementTree as ET

import pytest

from scripts.book.charts import FREIGHT_COLOR, PASSENGER_COLOR, bar_chart, chart_width
from scripts.book.format import MILLIONS

NS = "{http://www.w3.org/2000/svg}"


def _svg(points, **kw):
    kw = {"first_year": 1990, "last_year": 2025, "color": PASSENGER_COLOR, "label": "Passengers", **kw}
    return ET.fromstring(bar_chart(points, **kw))


def _bars(svg):
    return [r for r in svg.iter(f"{NS}rect") if r.get("class") == "bar"]


def _texts(svg, cls):
    return [t.text for t in svg.iter(f"{NS}text") if t.get("class") == cls]


def test_one_bar_per_year_with_a_value():
    points = [(y, None if y == 2020 else 100) for y in range(1990, 2026)]
    assert len(_bars(_svg(points))) == 35


def test_chart_skips_missing_years():
    full = _svg([(1990, 10), (2001, 10)])
    later = _svg([(2001, 10)])
    x_2001 = float(_bars(later)[0].get("x"))
    assert x_2001 == float(_bars(full)[1].get("x"))   # 2001 sits where it would with 1990 drawn
    assert "1990" in _texts(later, "x-label")


def test_bars_are_proportional():
    a, b = _bars(_svg([(1990, 50), (1991, 100)]))
    assert float(a.get("height")) * 2 == pytest.approx(float(b.get("height")))


@pytest.mark.parametrize("top, labels", [
    (55_000_000, ["0", f"20{MILLIONS}", f"40{MILLIONS}"]),   # whole millions, not 20.0 million
    (2_400_000, ["0", f"1{MILLIONS}", f"2{MILLIONS}"]),
    (1_200_000, ["0", "500,000", "1,000,000"]),   # a step under a million: every tick in full, so 1,000,000 by 500,000
    (48_000, ["0", "20,000", "40,000"]),
    (2, ["0", "0.5", "1", "1.5", "2"]),
])
def test_axis_labels_are_whole_and_alike_up_one_axis(top, labels):
    assert _texts(_svg([(1990, top)]), "y-label") == labels


def test_freight_axis_in_tons():
    freight = _texts(_svg([(1990, 2_000_000)], scale=2000, color=FREIGHT_COLOR, label="Freight (tons)"), "y-label")
    assert "1,000" in freight   # 2,000,000 lb = 1,000 tons


def test_last_year_label_inside_the_chart():
    svg = _svg([(1990, 10)])
    last = next(t for t in svg.iter(f"{NS}text") if t.text == "2025")
    width = float(svg.get("viewBox").split()[2])
    assert float(last.get("x")) + 15 <= width   # half of a four-digit label at 12 units


def test_all_zero_series_draws_no_bars_and_does_not_divide_by_zero():
    assert _bars(_svg([(1990, 0), (1991, 0)])) == []


def test_output_is_well_formed_svg():
    svg = _svg([(y, y) for y in range(1990, 2026)], label="Fish & chips")
    assert svg.get("viewBox") and svg.get("width") == "100%"
    assert "Fish & chips" in _texts(svg, "title")


def test_width_follows_the_year_span_so_bars_match():
    assert chart_width(1990, 2025) == pytest.approx(400)
    assert chart_width(2003, 2025) < chart_width(1990, 2025)
    long = _svg([(2010, 5)])
    short = _svg([(2010, 5)], first_year=2003)
    assert float(short.get("viewBox").split()[2]) == pytest.approx(chart_width(2003, 2025))
    assert _bars(long)[0].get("width") == _bars(short)[0].get("width")
    assert _bars(long)[0].get("height") == _bars(short)[0].get("height")   # the same height, for the same value
