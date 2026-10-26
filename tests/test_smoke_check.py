import re

import pytest

from tests.helpers import get

# the paths scripts/smoke_check.sh expects a deploy to answer with a page; a page that has moved fails the deploy
SCRIPT = open("scripts/smoke_check.sh").read()
PAGES = [p.strip('"') for p in re.findall(r"^check 200 (\S+)", SCRIPT, re.M)]


def test_the_smoke_check_names_pages():
    assert "/" in PAGES and "/aircraft/groups" in PAGES and "/airlines/delta/aircraft" in PAGES


@pytest.mark.parametrize("path", PAGES)
def test_no_page_the_smoke_check_expects_has_moved(ds, path):
    assert get(ds, path).status_code != 301, path
