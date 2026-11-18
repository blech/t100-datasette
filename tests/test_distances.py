import asyncio

import pytest

from plugins.t100_distances import AXIS_MIN_DEPS, BIN_MILES, axis_max, check_margins, is_suspect
from tests.test_rollup_queries import put

EDGES = [
    ((320, 4138), True),    # a code collision: CAT-MIA
    ((39, 44), False),      # over 10%, but within 50 miles
    ((1100, 1000), False),  # 100 miles, but exactly 10%
    ((1101, 1000), True),
    ((560, 500), True),     # 12%, 60 miles
    ((550, 500), False),    # 10% and 50 miles: neither is over
    ((100, None), False),   # unchecked
    ((None, 100), False),   # no distance
]


@pytest.mark.parametrize("pair, suspect", EDGES)
def test_is_suspect_edges(pair, suspect):
    assert is_suspect(*pair, ratio=0.1, miles=50) is suspect


class Config:
    def __init__(self, config):
        self.config = config

    def plugin_config(self, name):
        return self.config


def test_check_margins_default():
    assert check_margins(Config(None)) == {"ratio": 0.1, "miles": 50}
    assert check_margins(Config({"max_year": 2025})) == {"ratio": 0.1, "miles": 50}
    assert check_margins(Config({"distance_check": {"ratio": 0.2, "miles": 30}})) == {"ratio": 0.2, "miles": 30}


def test_the_site_config_sets_the_margins(ds):
    assert ds.plugin_config("t100_globe")["distance_check"] == {"ratio": 0.1, "miles": 50}


def flown(db_path, *pairs, deps=12):
    put(db_path, "route_year_totals", [dict(year=y, origin=a, dest=b, deps=deps, passengers=100) for a, b, y in pairs])


def test_axis_max_ignores_suspect_and_unchecked_pairs(ds, db_path):
    flown(db_path, ("AAA", "BBB", 2025), ("DDD", "CCC", 2025), ("EEE", "FFF", 2025))
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=10192, gc_distance=10180),
                                   dict(a="CCC", b="DDD", distance=12000, gc_distance=4000),
                                   dict(a="EEE", b="FFF", distance=11000, gc_distance=None)])
    assert BIN_MILES == 250
    assert asyncio.run(axis_max(ds)) == 10250


def test_axis_max_spans_every_year(ds, db_path):
    flown(db_path, ("AAA", "BBB", 2025), ("GGG", "HHH", 1998))
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=900, gc_distance=900),
                                   dict(a="GGG", b="HHH", distance=9939, gc_distance=10045)])
    assert asyncio.run(axis_max(ds)) == 10000


def test_axis_max_needs_twelve_flights_in_one_year(ds, db_path):
    flown(db_path, ("AAA", "BBB", 2024), ("AAA", "BBB", 2025), deps=11)  # 22 flights, but never 12 in a year
    flown(db_path, ("CCC", "DDD", 2025))
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=3000, gc_distance=3000),
                                   dict(a="CCC", b="DDD", distance=900, gc_distance=900)])
    assert AXIS_MIN_DEPS == 12
    assert asyncio.run(axis_max(ds)) == 1000


def test_axis_max_counts_both_directions_together(ds, db_path):
    flown(db_path, ("AAA", "BBB", 2025), ("BBB", "AAA", 2025), deps=6)
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=3000, gc_distance=3000)])
    assert asyncio.run(axis_max(ds)) == 3000


def test_axis_max_finds_a_short_pair_beyond_the_longest_candidates(ds, db_path):
    # more than the 200 longest checked pairs are never flown 12 times: it still finds the one that is
    put(db_path, "pair_distance", [dict(a=f"L{i:02d}", b=f"M{i:02d}", distance=5000 + i, gc_distance=5000 + i) for i in range(250)]
        + [dict(a="CCC", b="DDD", distance=900, gc_distance=900)])
    flown(db_path, ("CCC", "DDD", 2025))
    assert asyncio.run(axis_max(ds)) == 1000


def test_axis_max_is_zero_with_nothing_flown(ds):
    assert asyncio.run(axis_max(ds)) == 0


def test_axis_max_is_zero_not_an_error_without_the_column(ds, db_path):
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE pair_distance")
    conn.execute("CREATE TABLE pair_distance (a TEXT, b TEXT, distance INTEGER)")
    conn.commit()
    conn.close()
    assert asyncio.run(axis_max(ds)) == 0


def test_axis_max_does_not_keep_a_zero(ds, db_path):
    assert asyncio.run(axis_max(ds)) == 0
    flown(db_path, ("AAA", "BBB", 2025))
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=900, gc_distance=900)])
    assert asyncio.run(axis_max(ds)) == 1000
