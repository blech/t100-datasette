import re

import pytest

from tests.helpers import add_segments, get
from tests.test_rollup_queries import fam, put
from tests.test_foreign_note import load

SECTIONS = ["direction", "freight", "measures", "groupings", "breaks", "coverage", "source"]


def test_about_page_renders_with_every_section_and_a_breadcrumb(ds):
    r = get(ds, "/about")
    assert r.status_code == 200
    for section in SECTIONS:
        assert f'id="{section}"' in r.text, section
    assert 'aria-current="page">about<' in r.text


def test_the_contents_list_links_to_every_section(ds):
    html = get(ds, "/about").text
    for section in SECTIONS:
        assert f'href="#{section}"' in html, section


def test_the_about_page_explains_the_terms_it_was_written_for(ds):
    html = get(ds, "/about").text
    for term in ["belly", "freight-only", "short tons", "one direction", "UPS", "FedEx", "tech stop", "city market"]:
        assert term in html, term


def test_landing_page_links_to_about_in_its_prose(ds):
    html = get(ds, "/").text
    assert re.search(r'<p class="intro">.*href="/about".*?</p>', html, re.S)


@pytest.mark.parametrize("path, anchor", [
    ("/", "measures"),
    ("/airports/ATL", "direction"),
    ("/airports/ATL/LAX", "direction"),
    ("/airports/ATL/globe", "direction"),
    ("/aircraft", "groupings"),
    ("/aircraft", "breaks"),
    ("/carriers", "groupings"),
    ("/carriers", "breaks"),
    ("/aircraft/engines", "freight"),
    ("/aircraft/engines", "breaks"),
])
def test_caveats_link_to_the_matching_section(ds, path, anchor):
    assert f'href="/about#{anchor}"' in get(ds, path).text


def test_family_page_links_to_about(ds, db_path):
    put(db_path, "family_year", [fam(2019, "Boeing 737", 1, "F", 3)])
    html = get(ds, "/aircraft/boeing-737").text
    assert 'href="/about#groupings"' in html and 'href="/about#freight"' in html


def test_foreign_airport_note_links_to_the_direction_section(ds, db_path):
    load(db_path)
    assert 'href="/about#direction"' in get(ds, "/airports/LHR").text
