import json
from pathlib import Path

import pytest

from scripts.book.format import DASH, dense_count, miles, rank, share, tons

CASES = json.loads((Path(__file__).parent / "fixtures" / "number_formats.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["value"]))
def test_dense_count_follows_the_shared_cases(case):
    assert dense_count(case["value"]) == case["dense"]


def test_missing_values_are_an_em_dash():
    assert DASH == "—"
    for f in (dense_count, tons, rank, share, miles):
        assert f(None) == "—"
    assert dense_count(float("nan")) == "—"


def test_tons():
    assert tons(1_356_000_000) == "678,000 tons"
    assert tons(5_000_000_000) == "2.50 million tons"
    assert tons(1_000) == "0.5 tons"


def test_rank_and_share():
    assert rank(1) == "1st"
    assert rank(22) == "22nd"
    assert share(0.4567) == "45.7%"


def test_miles():
    assert miles(4321) == "4,321 miles"
