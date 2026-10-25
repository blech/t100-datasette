# tests/test_home_queries.py
import pytest

from tests.helpers import get_json
from tests.test_rollup_queries import put


def apt(year, origin, city, wac, passengers):
    return dict(year=year, origin=origin, origin_city_name=city, origin_wac=wac, deps=1, seats=1, passengers=passengers, freight=0)


def carrier(year, airline_id, passengers, domestic=1):
    return dict(year=year, airline_id=airline_id, group_id=airline_id, group_name=airline_id, domestic=domestic, service_class="F",
                deps=1, seats=1, passengers=passengers, freight=0)


def test_busiest_airports_are_us_only_and_ordered_by_passengers(ds, db_path):
    put(db_path, "airport_year_totals", [
        apt(2025, "ATL", "Atlanta, GA", 34, 500), apt(2025, "DFW", "Dallas/Fort Worth, TX", 74, 400),
        apt(2025, "LHR", "London, United Kingdom", 493, 900), apt(2025, "SJU", "San Juan, PR", 3, 400),
        apt(2025, "XXX", "Nowhere, TX", 74, 0), apt(2024, "ORD", "Chicago, IL", 41, 999)])
    rows = get_json(ds, "/t100/busiest_airports.json?_shape=objects&year=2025")["rows"]
    assert [(r["origin"], r["total_passengers"]) for r in rows] == [("ATL", 500), ("DFW", 400), ("SJU", 400)]
    assert rows[0]["origin_city_name"] == "Atlanta, GA"


def test_carrier_concentration_sums_each_airline_and_ranks_ties_by_id(ds, db_path):
    # five airlines; A is split across domestic and international and must be summed first
    put(db_path, "carrier_group_year", [
        carrier(2025, "A", 30), carrier(2025, "A", 10, domestic=0), carrier(2025, "B", 20), carrier(2025, "C", 20),
        carrier(2025, "D", 10), carrier(2025, "E", 10), carrier(2024, "A", 50), carrier(2024, "B", 50)])
    rows = get_json(ds, "/t100/carrier_concentration.json?_shape=objects")["rows"]
    assert [r["year"] for r in rows] == [2024, 2025]
    assert rows[0]["top4"] == pytest.approx(1.0) and rows[0]["carriers"] == 2
    # 2025: total 100; top four are A 40, B 20, C 20, then D 10 (D beats E on id)
    assert rows[1]["top4"] == pytest.approx(0.9) and rows[1]["top10"] == pytest.approx(1.0) and rows[1]["carriers"] == 5


def test_top_carriers_names_the_top_four_with_their_shares(ds, db_path):
    put(db_path, "carrier_group_year", [carrier(2025, x, p) for x, p in [("19393", 40), ("19805", 30), ("19790", 15), ("19977", 10), ("1", 5)]])
    put(db_path, "carrier_group", [dict(airline_id="19393", group_id="19393", group_name="Southwest", airline_name="Southwest Airlines Co.")])
    rows = get_json(ds, "/t100/top_carriers.json?_shape=objects&year=2025")["rows"]
    assert [r["airline_id"] for r in rows] == ["19393", "19805", "19790", "19977"]
    assert rows[0]["airline_name"] == "Southwest Airlines Co." and rows[1]["airline_name"] == "19805"
    assert rows[0]["share"] == pytest.approx(0.4)


def test_top_carrier_history_follows_one_years_top_four_through_every_year(ds, db_path):
    # 2025's top four are A, B, C, D (E is fifth); in 2024 E was bigger than all of them
    put(db_path, "carrier_group_year", [
        carrier(2025, "A", 30), carrier(2025, "A", 10, domestic=0), carrier(2025, "B", 20), carrier(2025, "C", 20),
        carrier(2025, "D", 10), carrier(2025, "E", 5), carrier(2024, "A", 20), carrier(2024, "E", 60), carrier(2024, "F", 20)])
    put(db_path, "carrier_group", [dict(airline_id="A", group_id="A", group_name="A", airline_name="Alpha Air Inc.")])
    rows = get_json(ds, "/t100/top_carrier_history.json?_shape=objects&year=2025")["rows"]
    assert [(r["year"], r["airline_id"]) for r in rows] == [
        (2024, "A"), (2025, "A"), (2025, "B"), (2025, "C"), (2025, "D")]
    # shares are of each year's whole market, not of the four
    assert rows[0]["share"] == pytest.approx(0.2) and rows[1]["share"] == pytest.approx(40 / 95)
    assert rows[1]["airline_name"] == "Alpha Air Inc." and rows[2]["airline_name"] == "B"
    # passenger counts, and each year's whole market, for the absolute chart
    assert (rows[0]["passengers"], rows[0]["total"]) == (20, 100) and (rows[1]["passengers"], rows[1]["total"]) == (40, 95)

