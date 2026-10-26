import re

import pytest

from tests.helpers import add_segments, get
from tests.test_rollup_queries import fam, put
from tests.test_foreign_note import load

SECTIONS = ["direction", "freight", "measures", "groupings", "breaks", "coverage", "source", "privacy"]


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
    ("/airports", "measures"),
    ("/airports/ATL", "direction"),
    ("/airports/ATL/destinations", "direction"),
    ("/airports/ATL/changes", "direction"),
    ("/airports/ATL/LAX", "direction"),
    ("/airports/ATL/globe", "direction"),
    ("/aircraft", "groupings"),
    ("/aircraft", "breaks"),
    ("/airlines", "groupings"),
    ("/airlines", "breaks"),
    ("/aircraft/groups", "freight"),
    ("/aircraft/groups", "breaks"),
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


def test_quad_jets_are_described_as_including_six_engined_aircraft(ds):
    assert "six-engine" in get(ds, "/about").text
    assert "six-engined" in get(ds, "/aircraft/groups").text


def test_the_privacy_section_says_what_is_and_is_not_recorded(ds):
    html = get(ds, "/about").text
    section = html.split('id="privacy"')[1]
    for phrase in ["page", "referring site", "anonymous", "IP address", "cookies", "theme"]:
        assert phrase in section, phrase


# BTS widened T-100 in October 2002 to small aircraft and domestic all-cargo airlines; UPS appears earlier, for no reason given
def test_the_breaks_section_gives_the_october_2002_expansion_and_its_source(ds):
    section = get(ds, "/about").text.split('id="breaks"')[1].split("</ul>")[0]
    for phrase in ["October 2002", "60 seats", "18,000", "all-cargo", "https://www.transtats.bts.gov/data_elements.aspx", "January 2001"]:
        assert phrase in section, phrase
    assert "does not say why" not in section


NOTED = ["/aircraft/groups", "/aircraft", "/airlines", "/airlines/over-time", "/airports/over-time", "/aircraft/over-time"]


@pytest.mark.parametrize("path", NOTED)
def test_the_chart_notes_date_the_break_to_october_2002(ds, path):
    html = get(ds, path).text
    assert "October 2002" in html and "before 2003" not in html
