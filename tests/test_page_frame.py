import pathlib
import re

import pytest

# Every page of the site, read from templates/ so a new page is checked without being listed: all but partials (_nav.html),
# the shared skeleton, and Datasette's own pages in the site's style (base.html, query.html and its per-query query-*.html)
TEMPLATES = sorted(
    p.stem for p in pathlib.Path("templates").glob("*.html")
    if not p.name.startswith("_") and p.stem not in ("t100_base", "base", "query") and not p.name.startswith("query-")
)


def test_the_page_list_finds_the_pages():
    assert {"home", "airports", "route", "city", "city_pair"} <= set(TEMPLATES)


@pytest.mark.parametrize("name", TEMPLATES)
def test_every_page_extends_the_shared_skeleton(name):
    # t100_base.html holds the head every page needs (base.css, fonts.css, the header's script): a page with a <head> of
    # its own misses whatever is added there later, as the city pages missed B612 Mono for their axes
    html = open(f"templates/{name}.html").read()
    assert re.match(r'(\s*\{#.*?#\})*\s*\{% extends "t100_base.html" %\}', html, re.S), name
    assert not re.search(r"<!doctype|<head\b|<body\b", html, re.I), name


def stylesheets(name):
    html = open(f"templates/{name}.html").read()
    links = re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
    if "{% extends" in html:  # the shared skeleton (t100_base.html) loads the base stylesheet before a page's own
        links = ["/static/common/base.css"] + links
    return links


@pytest.mark.parametrize("name", TEMPLATES)
def test_every_page_loads_the_base_stylesheet_first(name):
    assert stylesheets(name)[0] == "/static/common/base.css"


@pytest.mark.parametrize("name", TEMPLATES)
def test_only_the_airport_tables_load_their_own_stylesheet(name):
    # /airports, a country's airports and the dedicated-airports table share the airports table's look
    assert ("/static/landing/style.css" in stylesheets(name)) == (name in ("airports", "country", "airports_dedicated"))


def test_search_fields_are_drawn_like_the_menus_beside_them():
    # without a rule of their own, search fields take the browser's small type and box
    css = open("static/common/base.css").read()
    rule = re.search(r'^([^{}]*\bselect\b[^{}]*)\{([^}]*)\}', css, re.M)  # minified or one selector a line
    assert rule and 'input[type="search"]' in rule.group(1) and re.search(r"font:\s*inherit", rule.group(2))
    for name in TEMPLATES:
        for field in re.findall(r'<input[^>]*type="search"[^>]*>', open(f"templates/{name}.html").read()):
            assert "style=" not in field, name


def test_the_airline_change_table_scrolls_in_its_own_box():
    html = open("templates/airline_changes.html").read()
    assert re.search(r'<div class="scroll">\s*<table id="change-table">', html)


@pytest.mark.parametrize("name", [t for t in TEMPLATES if "/static/charts/rollup.js" in open(f"templates/{t}.html").read() or "/static/charts/routes.js" in open(f"templates/{t}.html").read()])
def test_every_matrix_page_has_the_label_popover(name):
    # a matrix turns its row labels' titles into this popover, so a page without it would lose its labels' hover text
    assert 'id="label-tip"' in open(f"templates/{name}.html").read()
