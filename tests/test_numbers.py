import json
from pathlib import Path

import pytest

from plugins.t100_globe import airport_story, prose_count

CASES = json.loads((Path(__file__).parent / "fixtures" / "number_formats.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=lambda c: str(c["value"]))
def test_prose_count_follows_the_shared_cases(case):
    assert prose_count(case["value"]) == case["prose"]


@pytest.mark.parametrize("value", [None, float("nan")])
def test_a_missing_count_is_a_dash(value):
    assert prose_count(value) == "–"


def test_airport_story_rounds_to_three_figures():
    rows = [{"airport": c, "city": c, "passengers": n} for c, n in
            [("ATL", 123_456_789), ("DFW", 51_512_883), ("DEN", 999_999)]]
    assert [a["passengers"] for a in airport_story(rows)["airports"]] == ["123 million", "51.5 million", "1 million"]
