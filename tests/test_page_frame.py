import re

import pytest

TEMPLATES = ["home", "airports", "rollup", "engines", "family", "airline", "routes", "route", "about", "globe", "airline_globe"]


def stylesheets(name):
    html = open(f"templates/{name}.html").read()
    return re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)


@pytest.mark.parametrize("name", TEMPLATES)
def test_every_page_loads_the_base_stylesheet_first(name):
    assert stylesheets(name)[0] == "/static/common/base.css"


@pytest.mark.parametrize("name", TEMPLATES)
def test_only_the_airports_table_loads_its_own_stylesheet(name):
    assert ("/static/landing/style.css" in stylesheets(name)) == (name == "airports")


def test_the_airline_change_table_scrolls_in_its_own_box():
    html = open("templates/airline.html").read()
    assert re.search(r'<div class="scroll">\s*<table id="change-table">', html)
