import xml.etree.ElementTree as ET

import pytest

from scripts.book.charts import (FREIGHT_COLOR, PASSENGER_COLOR, airline_sparklines, bar_chart, chart_width, distance_rows,
                                 rank_chart)
from scripts.book.format import MILLIONS
from scripts.book.history import AirlineHistory, AirlineLine, DistanceRow, End

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


# rank over time


def _lines(svg):
    return [p for p in svg.iter(f"{NS}path") if p.get("class", "").startswith("line")]


@pytest.mark.parametrize("worst", [8, 63, 847])
def test_rank_axis_is_always_1_at_the_top_to_50(worst):
    svg = ET.fromstring(rank_chart({"passengers": [(1990, 1), (1991, worst)]}, first_year=1990, last_year=1991))
    assert _texts(svg, "y-label") == ["1", "10", "20", "30", "40", "50"]
    ys = {t.text: float(t.get("y")) for t in svg.iter(f"{NS}text") if t.get("class") == "y-label"}
    assert ys["1"] < ys["50"]   # 1 at the top


def test_ranks_below_50_are_left_off_the_chart():
    svg = ET.fromstring(rank_chart({"freight": [(2003, 847), (2004, 51), (2005, 50), (2006, 3)]}, first_year=2003, last_year=2006))
    d = _lines(svg)[0].get("d")
    assert d.count("M") == 1 and d.count("L") == 1   # 2005 to 2006 only


def test_rank_lines_solid_for_the_page_measure_dotted_for_the_other():
    svg = ET.fromstring(rank_chart({"freight": [(2003, 2), (2004, 1)], "passengers": [(1990, 30), (2004, 20)]},
                                   first_year=1990, last_year=2004))
    first, second = _lines(svg)
    assert first.get("stroke") == FREIGHT_COLOR and not first.get("stroke-dasharray")
    assert second.get("stroke") == PASSENGER_COLOR and second.get("stroke-dasharray")
    assert _texts(svg, "legend") == ["Freight", "Passengers"]


def test_rank_line_breaks_where_there_is_no_rank():
    svg = ET.fromstring(rank_chart({"passengers": [(1990, 5), (1991, None), (1992, 6), (1993, 7)]}, first_year=1990, last_year=1993))
    d = _lines(svg)[0].get("d")
    assert d.count("M") == 2   # two runs: 1990 alone, and 1992-1993


# airline shares


def _history():
    return AirlineHistory(lines=[AirlineLine("Delta Air Lines", {1990: 0.5, 2025: 0.72}, 0.72),
                                 AirlineLine("Fish & Chips Air", {1990: 0.3, 2025: 0.0}, 0.0)],
                          others=AirlineLine("Others", {1990: 0.2, 2025: 0.28}, 0.28), others_count=12)


def test_airline_sparklines_a_row_each_with_the_last_share():
    svg = ET.fromstring(airline_sparklines(_history(), first_year=1990, last_year=2025, color=PASSENGER_COLOR))
    assert _texts(svg, "airline") == ["Delta Air Lines", "Fish & Chips Air", "Others (12)"]
    assert _texts(svg, "share") == ["72.0%", "0.0%", "28.0%"]
    assert len(_lines(svg)) == 3


def test_a_sparkline_row_is_0_to_100_percent_of_its_height():
    shares = {y: 1.0 if y == 1990 else 0.0 for y in range(1990, 2026)}
    svg = ET.fromstring(airline_sparklines(AirlineHistory([AirlineLine("A", shares, 0.0)], None, 0),
                                           first_year=1990, last_year=2025, color=PASSENGER_COLOR))
    row = next(r for r in svg.iter(f"{NS}rect") if r.get("class") == "row")
    top, height = float(row.get("y")), float(row.get("height"))
    d = _lines(svg)[0].get("d")
    ys = [float(pt.split(",")[1]) for pt in d.lstrip("M").split("L")]
    assert min(ys) == pytest.approx(top) and max(ys) == pytest.approx(top + height)
    assert d.count("M") == 1


def test_a_year_without_traffic_breaks_the_sparkline():
    svg = ET.fromstring(airline_sparklines(AirlineHistory([AirlineLine("A", {1990: 0.5, 1991: 0.5, 1995: 0.5}, None)], None, 0),
                                           first_year=1990, last_year=2025, color=PASSENGER_COLOR))
    assert _lines(svg)[0].get("d").count("M") == 2


# distances


def test_distance_rows_name_the_ends_and_the_median():
    rows = [DistanceRow(1990, End("OAK", "Oakland, CA", 11.4), 1461.2, End("HKG", "Hong Kong, Hong Kong", 6915)),
            DistanceRow(2025, None, None, None)]
    svg = ET.fromstring(distance_rows(rows, scale=10_000, color=PASSENGER_COLOR))
    text = "".join(svg.itertext())
    assert "OAK" in text and "Oakland, CA" in text and "11 miles" in text
    assert "HKG" in text and "6,915 miles" in text and "1,461 miles" in text
    assert _texts(svg, "year") == ["1990", "2025"]


def test_close_ends_keep_their_labels_apart():
    rows = [DistanceRow(2025, End("ONT", "Ontario, CA", 400), 870, End("DLT", "Somewhere Long, Far Away", 900))]
    svg = ET.fromstring(distance_rows(rows, scale=10_000, color=PASSENGER_COLOR))
    short, long_ = (t for t in svg.iter(f"{NS}text") if t.get("class", "").startswith("end"))
    assert short.get("text-anchor") == "start" and long_.get("text-anchor") == "start"
    assert float(long_.get("x")) > float(short.get("x")) + 6.2 * len("ONT Ontario, CA, 400 miles")


def test_one_route_both_shortest_and_longest_is_named_once():
    bna = End("BNA", "Nashville, TN", 625)
    svg = ET.fromstring(distance_rows([DistanceRow(2025, bna, 600, bna)], scale=10_000, color=PASSENGER_COLOR))
    assert "".join(svg.itertext()).count("BNA") == 1


def test_distance_marks_sit_in_proportion_to_the_scale():
    rows = [DistanceRow(2025, End("A", "A", 0), 5_000, End("B", "B", 10_000))]
    svg = ET.fromstring(distance_rows(rows, scale=10_000, color=PASSENGER_COLOR))
    xs = {m.get("class"): float(m.get("cx")) for m in svg.iter(f"{NS}circle")}
    assert xs["mark median"] - xs["mark shortest"] == pytest.approx(xs["mark longest"] - xs["mark median"])
