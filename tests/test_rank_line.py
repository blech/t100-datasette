import re

from plugins.t100_globe import ordinal, rank_sentences
from tests.helpers import get, put_airport_carriers, put_airport_years
from tests.test_dedicated_airports import cell, city, three_airports


def row(measure, total, size_rank, group="Southwest (incl. AirTran)", share=0.766, dedicated_rank=None, size_count=500):
    return dict(measure=measure, total=total, size_rank=size_rank, size_count=size_count, group_id="g", group_name=group, airline_total=total * share, share=share, dedicated_rank=dedicated_rank)


def plain(markup):
    return re.sub(r"<[^>]+>", "", str(markup))


def test_ordinals():
    assert [ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 48, 101, 112)] == ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "48th", "101st", "112th"]


def test_the_line_says_what_an_airport_handled_how_big_that_is_and_how_dedicated(ds):
    oak = [row("passengers", 9_151_613, 48, share=0.7662, dedicated_rank=7), row("freight", 1_091_593_994, 17, "Federal Express Corporation", 0.8175, 5)]
    assert plain(rank_sentences("OAK", 2025, oak)) == (
        "In 2025, OAK had 9.15 million passengers, making it the 48th busiest airport in the US, and 546,000 tons of freight, the 17th busiest. "
        "It was also the 7th most dedicated airport for passenger flights, with Southwest carrying 76.6% of its passengers, "
        "and the 5th most dedicated airport for freight, with Federal Express carrying 81.8% of it.")
    assert str(rank_sentences("OAK", 2025, oak)).count('<a href="/airports/dedicated?year=2025">most dedicated</a>') == 1


def test_ranks_past_the_limits_are_left_out_and_the_first_place_is_the_busiest(ds):
    small = [row("passengers", 312_000, 312), row("freight", 9_000, 101, dedicated_rank=3)]
    assert plain(rank_sentences("ZZZ", 2025, small)) == "In 2025, ZZZ had 312,000 passengers and 4.5 tons of freight. It was also the 3rd most dedicated airport for freight, with Southwest carrying 76.6% of it."
    assert plain(rank_sentences("ANC", 2025, [row("freight", 2e9, 1)])) == "In 2025, ANC had 1 million tons of freight, making it the busiest airport in the US for freight."
    assert plain(rank_sentences("QQQ", 2025, [row("passengers", 5, 400, dedicated_rank=40)])) == "In 2025, QQQ had 5 passengers."   # past both limits
    assert rank_sentences("QQQ", 2025, []) == ""
    assert "the 11th" not in plain(rank_sentences("QQQ", 2025, [row("passengers", 5, 5, dedicated_rank=11)]))


def test_the_airport_page_shows_the_line_for_us_airports_with_flights_in_the_latest_year(ds, db_path):
    three_airports(db_path)
    page = get(ds, "/airports/AAA").text
    line = re.search(r'<p class="rank-line" id="rank-line">(.*?)</p>', page, re.S).group(1)
    assert plain(line).startswith("In 2025, AAA had 1,000 passengers, making it the busiest airport in the US")
    assert "rank-line" not in get(ds, "/airports/AAA/destinations").text   # only the main page has it
    assert "rank-line" not in get(ds, "/airports/ZZZ").text               # no flights in the latest year
