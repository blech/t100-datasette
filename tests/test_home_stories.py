# tests/test_home_stories.py
from plugins.t100_globe import airport_story, carrier_shares, concentration_story, engine_story, short_airline_name


def test_airport_story_names_the_top_three():
    rows = [dict(airport=c, city=f"{c} city", passengers=p) for c, p in [("ATL", 51_508_668), ("DFW", 41_309_075), ("ORD", 40_755_119), ("DEN", 1)]]
    story = airport_story(rows)
    assert [a["code"] for a in story["airports"]] == ["ATL", "DFW", "ORD"]
    assert story["airports"][0] == {"code": "ATL", "city": "ATL city", "passengers": "51.5 million"}


def eng(year, group, band, deps, kind="passenger"):
    return dict(year=year, aircraft_group=group, distance_band=band, service="international", kind=kind, deps=deps)


def test_engine_story_uses_long_haul_passenger_departures():
    rows = [eng(1990, "6", 3000, 19), eng(1990, "8", 5000, 55), eng(1990, "7", 3000, 26), eng(1990, "6", 1500, 1000),
            eng(1990, "8", 3000, 500, kind="freight"), eng(2025, "6", 3000, 94), eng(2025, "8", 5000, 6)]
    assert engine_story(rows, 1990, 2025) == {"first_year": 1990, "last_year": 2025, "first_tri_quad": "81%", "last_twin": "94%"}


def test_concentration_story_finds_the_dip():
    rows = [dict(year=y, top4=s) for y, s in [(1990, 0.506), (2005, 0.421), (2006, 0.43), (2025, 0.587)]]
    assert concentration_story(rows, 1990, 2025) == {
        "first_year": 1990, "first": "51%", "low_year": 2005, "low": "42%", "last_year": 2025, "last": "59%"}


def test_concentration_story_without_a_dip_has_no_low_year():
    rows = [dict(year=y, top4=s) for y, s in [(1990, 0.4), (2000, 0.5), (2025, 0.6)]]
    assert concentration_story(rows, 1990, 2025)["low_year"] is None


def test_carrier_shares_shorten_names():
    rows = [dict(airline_id="19393", airline_name="Southwest Airlines Co.", share=0.1542),
            dict(airline_id="19805", airline_name="American Airlines Inc.", share=0.151)]
    assert carrier_shares(rows) == [{"name": "Southwest Airlines", "share": "15.4%"}, {"name": "American Airlines", "share": "15.1%"}]


def test_short_airline_name_drops_legal_endings_only():
    assert short_airline_name("Delta Air Lines Inc.") == "Delta Air Lines"
    assert short_airline_name("Trans World Airways LLC") == "Trans World Airways"
    assert short_airline_name("SkyWest Airlines Inc.") == "SkyWest Airlines"
    assert short_airline_name("Allegiant Air") == "Allegiant Air"


def test_stories_with_a_missing_year_are_none():
    assert airport_story([]) is None
    assert airport_story([dict(airport="ATL", city="Atlanta, GA", passengers=1)]) is None
    assert engine_story([eng(1990, "6", 3000, 1)], 1990, 2026) is None
    assert concentration_story([dict(year=1990, top4=0.5)], 1990, 2026) is None
    assert carrier_shares([]) is None
