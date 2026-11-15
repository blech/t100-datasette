import re

import pytest

from scripts.book.__main__ import main
from scripts.book.pdf import broken_spreads, centre_offset
from tests.test_book_data import build_world
from tests.test_book_render import poster


@pytest.fixture
def world(db_path, tmp_path):
    build_world(db_path)
    posters = tmp_path / "posters"
    posters.mkdir()
    for code in ("AAA", "BBB", "FFF"):
        (posters / f"{code}.svg").write_text(poster(code))
    return db_path, posters, tmp_path / "out" / "book.pdf"


def _args(world, *extra):
    db, posters, out = world
    return ["--db", str(db), "--posters", str(posters), "--out", str(out), "--html", "--top-passengers", "2", "--top-freight", "2", *extra]


def test_html_build_writes_a_file(world):
    assert main(_args(world)) == 0
    html = world[2].with_suffix(".html").read_text()
    assert re.findall(r'<section id="data-(\w+)"', html) == ["AAA", "BBB", "FFF"]


def test_only_keeps_the_book_order(world):
    assert main(_args(world, "--only", "FFF,AAA")) == 0
    html = world[2].with_suffix(".html").read_text()
    assert re.findall(r'<section id="data-(\w+)"', html) == ["AAA", "FFF"]


def test_broken_spreads():
    assert broken_spreads([4, 6], [5, 7]) == []
    assert broken_spreads([4, 8], [7, 9]) == [4]   # a data page ran onto a second page
    assert broken_spreads([4, 6], [5]) == [6]      # a poster missing altogether


def test_only_rejects_an_unknown_code(world, capsys):
    assert main(_args(world, "--only", "AAA,ZZZ")) != 0
    assert "ZZZ" in capsys.readouterr().err
    assert not world[2].parent.exists()


def test_missing_poster_stops_the_build(world, capsys):
    (world[1] / "BBB.svg").unlink()
    assert main(_args(world)) != 0
    assert "BBB" in capsys.readouterr().err
    assert not world[2].parent.exists()


def test_centre_offset():
    assert centre_offset(0, 800, 0, 700, 900) == 50            # 100px shorter than the data: down by half
    assert centre_offset(0, 600, 0, 700, 900) == 0             # taller than the data: stays at the top
    assert centre_offset(0, 1000, 0, 700, 720) == 20           # never off the bottom of the page


def test_endpapers_option(world):
    assert main(_args(world, "--endpapers", "codes,codes")) == 0
    html = world[2].with_suffix(".html").read_text()
    assert 'class="endpaper endpaper-front endpaper-codes"' in html and 'class="endpaper endpaper-back endpaper-codes"' in html


def test_endpapers_option_rejects_a_bad_kind(world):
    with pytest.raises(SystemExit):
        main(_args(world, "--endpapers", "codes,maps"))
