import re

import pytest

from scripts.book.__main__ import main
from scripts.book.pdf import broken_spreads
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
    return ["--db", str(db), "--posters", str(posters), "--endpaper-posters", str(posters), "--out", str(out), "--html", "--top-passengers", "2", "--top-freight", "2", *extra]


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


def test_endpapers_option(world):
    assert main(_args(world, "--endpapers", "codes,codes")) == 0
    html = world[2].with_suffix(".html").read_text()
    assert 'class="endpaper endpaper-front endpaper-codes"' in html and 'class="endpaper endpaper-back endpaper-codes"' in html


def test_each_page_has_its_history_and_distances_go_where_asked(world):
    assert main(_args(world)) == 0
    html = world[2].with_suffix(".html").read_text()
    assert html.count('class="chart ranks"') == 3 and '<div class="distances foot">' in html
    assert main(_args(world, "--distances", "flow")) == 0
    assert '<div class="distances flow">' in world[2].with_suffix(".html").read_text()
    assert main(_args(world, "--history", "wide")) == 0
    assert '<div class="history wide">' in world[2].with_suffix(".html").read_text()
    with pytest.raises(SystemExit):
        main(_args(world, "--distances", "side"))


def test_endpapers_option_rejects_a_bad_kind(world):
    with pytest.raises(SystemExit):
        main(_args(world, "--endpapers", "codes,maps"))


def test_print_posters_north_up_rail_then_plain(world):
    (world[1] / "AAA-rail-rot.svg").write_text(poster("AAA").replace("AAA-r1", "AAA-rot"))
    (world[1] / "AAA-rail.svg").write_text(poster("AAA").replace("AAA-r1", "AAA-rail"))
    assert main(_args(world)) == 0
    html = world[2].with_suffix(".html").read_text()
    assert 'id="AAA-rail"' in html and 'id="AAA-rot"' not in html   # never the turned one: every poster north-up
    assert 'id="FFF-r1"' in html


def test_endpaper_posters_only_loaded_for_a_poster_endpaper(world, tmp_path):
    args = _args(world, "--endpapers", "codes,codes")
    args[args.index("--endpaper-posters") + 1] = str(tmp_path / "nowhere")
    assert main(args) == 0


def test_the_scale_bar_comes_from_the_posters_folder(world):
    from tests.test_book_posters import SCALE_BAR
    db, posters, out = world
    assert main(_args(world)) == 0
    assert 'class="scale-bar"' not in out.with_suffix(".html").read_text()
    (posters / "scale-7.5mpp.svg").write_text(SCALE_BAR)
    assert main(_args(world)) == 0
    assert '<div class="scale-bar"><svg' in out.with_suffix(".html").read_text()


def test_the_posters_are_the_same_scale_ones_by_default():
    from scripts.book.__main__ import parse
    assert parse([]).posters.name == "scale"
