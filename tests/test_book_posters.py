import pytest

from scripts.book.posters import PosterError, load_diagrams, load_poster, load_posters, reprefix


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


def test_missing_diagrams_are_all_named(tmp_path):
    with pytest.raises(PosterError) as e:
        load_diagrams(tmp_path, ["YYY", "XXX"])
    assert "XXX" in str(e.value) and "YYY" in str(e.value)
