import re

import pytest

from scripts.book.posters import PosterError, crop, load_diagrams, load_poster, load_posters, load_scale_bar, reprefix


def _poster(code, ids=("r2",), prefix=True):
    defs = "".join(f'<path id="{code + "-" if prefix else ""}{i}" d="M0 0"/>' for i in ids)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1260" width="1200" height="1260" role="img">'
            '<style>.ac-ink{stroke:var(--ac-ink,#000);stroke-opacity:var(--ac-ink-opacity,1)}'
            '.ac-road{stroke:var(--ac-road, #d9d9d9)}</style>'
            f'<defs>{defs}</defs><rect width="1200" height="1260" fill="#fff"/></svg>')


def _write(tmp_path, code, **kw):
    (tmp_path / f"{code}.svg").write_text(_poster(code.split("-")[0], **kw))


def test_css_variables_become_their_fallbacks(tmp_path):
    _write(tmp_path, "ABE")
    svg = load_poster(tmp_path, "ABE")
    assert "stroke:#000;stroke-opacity:1" in svg
    assert "stroke:#d9d9d9" in svg
    assert "var(" not in svg


def test_view_box_kept_size_dropped(tmp_path):
    _write(tmp_path, "ABE")
    svg = load_poster(tmp_path, "ABE")
    root = svg[:svg.index(">") + 1]
    assert svg.startswith("<svg")
    assert 'viewBox="0 0 1200 1260"' in root
    assert "width=" not in root and "height=" not in root
    assert '<rect width="1200" height="1260"' in svg   # only the root loses its size


def test_missing_posters_are_all_named(tmp_path):
    _write(tmp_path, "ABE")
    with pytest.raises(PosterError) as e:
        load_posters(tmp_path, ["YYY", "ABE", "XXX"])
    assert "XXX" in str(e.value) and "YYY" in str(e.value)


def test_ids_must_carry_the_code(tmp_path):
    _write(tmp_path, "ABE", prefix=False)
    with pytest.raises(PosterError, match="ABE"):
        load_poster(tmp_path, "ABE")
    _write(tmp_path, "ABE")
    assert load_poster(tmp_path, "ABE")


def test_variant_files_are_ignored(tmp_path):
    _write(tmp_path, "ATL-soft")
    with pytest.raises(PosterError, match="ATL"):
        load_posters(tmp_path, ["ATL"])


def test_load_posters_returns_each_by_code(tmp_path):
    _write(tmp_path, "ABE")
    _write(tmp_path, "BOS")
    assert set(load_posters(tmp_path, ["ABE", "BOS"])) == {"ABE", "BOS"}



def test_reprefix_renames_ids_and_their_references():
    svg = '<svg><defs><path id="ATL-r2" d="M0 0"/></defs><use href="#ATL-r2"/><use xlink:href="#ATL-r2"/></svg>'
    assert reprefix(svg, "ATL", "front-") == (
        '<svg><defs><path id="front-ATL-r2" d="M0 0"/></defs><use href="#front-ATL-r2"/><use xlink:href="#front-ATL-r2"/></svg>')


def test_diagrams_resolve_nested_variables(tmp_path):
    (tmp_path / "ATL.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">'
        '<style>.ac-runway{stroke:var(--ac-runway,var(--ac-ink,#000))}</style></svg>')
    svg = load_diagrams(tmp_path, ["ATL"])["ATL"]
    assert ".ac-runway{stroke:#000}" in svg
    assert "width=" not in svg[:svg.index(">")]


def test_road_casing_mask_moves_from_the_group_to_each_road(tmp_path):
    # WeasyPrint applies a mask after drawing an element's children, so on a <g> it does nothing and the roads print solid;
    # on a <path> it's set before the stroke, so each road gets the mask and its own path data in place of a <use>
    (tmp_path / "ABE.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><defs>'
        '<path id="ABE-r2" d="M0 0l1 1"/><path id="ABE-r3" d="M2 2l3 3"/>'
        '<mask id="ABE-m"><rect width="10" height="10" fill="#fff"/>'
        '<g stroke="#000"><use href="#ABE-r2" stroke-width="2"/><use href="#ABE-r3" stroke-width="3"/></g></mask></defs>'
        '<g fill="none"><g class="ac-road" mask="url(#ABE-m)">'
        '<use href="#ABE-r2" stroke-width="3.6"/><use href="#ABE-r3" stroke-width="4.6"/></g>'
        '<g class="ac-ink"><path d="M5 5"/></g></g></svg>')
    svg = load_poster(tmp_path, "ABE")
    assert ('<g class="ac-road"><path d="M0 0l1 1" stroke-width="3.6" mask="url(#ABE-m)"/>'
            '<path d="M2 2l3 3" stroke-width="4.6" mask="url(#ABE-m)"/></g>') in svg
    assert '<use href="#ABE-r2" stroke-width="2"/>' in svg   # the mask itself still draws the narrow strokes
    assert '<g class="ac-ink"><path d="M5 5"/></g>' in svg


def test_the_first_variant_there_is_wins(tmp_path):
    (tmp_path / "ABE-rail-rot.svg").write_text(_poster("ABE", ids=("rot",)))
    (tmp_path / "ABE-rail.svg").write_text(_poster("ABE", ids=("rail",)))
    (tmp_path / "BOS-rail.svg").write_text(_poster("BOS", ids=("rail",)))
    _write(tmp_path, "MCI")
    posters = load_posters(tmp_path, ["ABE", "BOS", "MCI"], variants=("rail-rot", "rail"))
    assert 'id="ABE-rot"' in posters["ABE"]
    assert 'id="BOS-rail"' in posters["BOS"]
    assert 'id="MCI-r2"' in posters["MCI"]   # no variant: the plain poster


def test_a_variant_alone_is_enough(tmp_path):
    (tmp_path / "BOS-rail.svg").write_text(_poster("BOS", ids=("rail",)))
    assert load_posters(tmp_path, ["BOS"], variants=("rail-rot", "rail"))
    with pytest.raises(PosterError, match="BOS"):
        load_posters(tmp_path, ["BOS"])


def test_every_group_mask_moves_to_its_paths(tmp_path):
    # the runway ink has a mask too (knocking out the labels' halos), on a group of paths rather than of <use>s
    (tmp_path / "ABE.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><mask id="ABE-lm"><rect width="10" height="10" fill="#fff"/>'
        '<g fill="#000"><text x="1" y="1">09</text></g></mask></defs>'
        '<g class="ac-ink" mask="url(#ABE-lm)"><path stroke-width="1.2" d="M5 5"/><path stroke-width="6" d="M6 6"/></g></svg>')
    svg = load_poster(tmp_path, "ABE")
    assert ('<g class="ac-ink"><path stroke-width="1.2" d="M5 5" mask="url(#ABE-lm)"/>'
            '<path stroke-width="6" d="M6 6" mask="url(#ABE-lm)"/></g>') in svg


@pytest.mark.parametrize("view_box, ratio, cropped", [
    ("0 0 1400 1850", 8.5 / 11, "0 19.12 1400 1811.76"),   # a print poster on Letter: a little off the top and bottom
    ("0 0 1200 1260", 8.5 / 11, "113.18 0 973.64 1260"),   # wider than the page: off the sides
    ("0 0 850 1100", 8.5 / 11, "0 0 850 1100"),
])
def test_crop_centres_the_page_shape_in_the_view_box(view_box, ratio, cropped):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" role="img"><rect viewBox="0 0 1 1"/></svg>'
    assert crop(svg, ratio) == f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{cropped}" role="img"><rect viewBox="0 0 1 1"/></svg>'


def test_missing_diagrams_are_all_named(tmp_path):
    with pytest.raises(PosterError) as e:
        load_diagrams(tmp_path, ["YYY", "XXX"])
    assert "XXX" in str(e.value) and "YYY" in str(e.value)


SCALE_BAR = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1850" width="1400" height="1850">
<style>.ac-ink{stroke:var(--ac-ink,#000)}</style>
<path class="ac-ink" fill="none" stroke-width="2.5" d="M100 1690h429.2M100.0 1690v-14M529.2 1690v-14M100 1690h400.0M500.0 1690v14"/>
<g class="ac-label" font-family="Helvetica,Arial,sans-serif" font-size="22"><text x="100.0" y="1668" text-anchor="start">0</text>
<text x="529.2" y="1668" text-anchor="middle">2 miles</text><text x="100.0" y="1728" text-anchor="start">0</text>
<text x="500.0" y="1728" text-anchor="middle">3 km</text></g>
</svg>"""


def test_the_scale_bar_is_cut_down_to_the_bar_on_the_posters_canvas(tmp_path):
    (tmp_path / "scale-7.5mpp.svg").write_text(SCALE_BAR)
    bar = load_scale_bar(tmp_path)
    assert (bar.canvas_width, bar.canvas_height) == (1400, 1850)
    x, y, w, h = (float(v) for v in re.search(r'viewBox="([^"]+)"', bar.svg).group(1).split())
    assert x <= 100 and x + w >= 529.2 + 3.5 * 22 * 0.6   # "2 miles", centred on the 2-mile tick
    assert y <= 1668 - 22 and y + h >= 1728 and h < 150   # both rows of labels, and no more
    assert (bar.width, bar.height) == (w, h)
    assert 'width="1400"' not in bar.svg and "var(" not in bar.svg


def test_no_scale_bar_is_none_and_two_is_an_error(tmp_path):
    assert load_scale_bar(tmp_path) is None
    (tmp_path / "scale-7.5mpp.svg").write_text(SCALE_BAR)
    (tmp_path / "scale-10mpp.svg").write_text(SCALE_BAR)
    with pytest.raises(PosterError):
        load_scale_bar(tmp_path)
