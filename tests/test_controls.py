import re

BASE = open("static/common/base.css").read()
GLOBE = open("static/globe/style.css").read()


def rule(css, selector):
    return re.search(rf"(?:^|\}})\s*{re.escape(selector)}\s*\{{([^}}]*)\}}", css, re.M).group(1)


def test_menus_draw_their_own_arrow_so_safari_sizes_them_as_chrome_does():
    # Safari's native menus ignore padding, so they sit shorter than the buttons beside them
    menus = rule(BASE, "select")
    assert "-webkit-appearance: none" in menus and "appearance: none" in menus
    assert "linear-gradient" in menus and "var(--muted)" in menus  # the arrow, in the theme's colour
    assert "line-height: 1.5" in menus  # the page's own, as the find box has it, not the chart sentence's tall lines, which native menus ignored


def test_the_maps_controls_keep_the_arrow():
    # a background shorthand would wipe the arrow out
    assert not re.search(r"button, select \{[^}]*\bbackground:", GLOBE)
