import asyncio

import pytest

from plugins.t100_distances import BIN_MILES, axis_max, check_margins, is_suspect
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


def flown(db_path, *pairs):
    put(db_path, "route_year_totals", [dict(year=y, origin=a, dest=b, deps=10, passengers=100) for a, b, y in pairs])


def test_axis_max_ignores_suspect_and_unchecked_pairs(ds, db_path):
    flown(db_path, ("AAA", "BBB", 2025), ("DDD", "CCC", 2025), ("EEE", "FFF", 2025))
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=10192, gc_distance=10180),
                                   dict(a="CCC", b="DDD", distance=12000, gc_distance=4000),
                                   dict(a="EEE", b="FFF", distance=11000, gc_distance=None)])
    assert BIN_MILES == 250
    assert asyncio.run(axis_max(ds, 2025)) == 10250


def test_axis_max_only_counts_that_year(ds, db_path):
    flown(db_path, ("AAA", "BBB", 2025), ("GGG", "HHH", 2024))
    put(db_path, "pair_distance", [dict(a="AAA", b="BBB", distance=900, gc_distance=900),
                                   dict(a="GGG", b="HHH", distance=12000, gc_distance=12000)])
    assert asyncio.run(axis_max(ds, 2025)) == 1000


def test_axis_max_is_zero_with_nothing_flown(ds):
    assert asyncio.run(axis_max(ds, 2025)) == 0
