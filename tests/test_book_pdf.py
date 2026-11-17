"""Renders real PDFs, so it needs the `book` dependency group and Pango. On macOS with Homebrew, run it as
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run --group book pytest tests/test_book_pdf.py"""

import pytest

try:
    import weasyprint   # noqa: F401
except (ImportError, OSError) as e:   # OSError: installed, but Pango isn't on the library path
    pytest.skip(f"WeasyPrint unavailable ({type(e).__name__}); see this file's docstring", allow_module_level=True)

from scripts.book.data import Destination
from scripts.book.pdf import broken_spreads, write_pdf
from tests.test_book_render import render, entry, facts


def _book(codes):
    return render([(entry(c), facts(c)) for c in codes])


def test_two_airports_make_ten_pages_with_data_on_even_pages(tmp_path):
    out = tmp_path / "b.pdf"
    assert write_pdf(_book(["ATL", "MEM"]), out, tmp_path) == ([4, 6], [5, 7], 10)
    assert out.read_bytes().startswith(b"%PDF")


def test_three_airports_still_put_data_on_even_pages(tmp_path):
    assert write_pdf(_book(["ATL", "MEM", "ORD"]), tmp_path / "b.pdf", tmp_path) == ([4, 6, 8], [5, 7, 9], 12)


def test_an_overflowing_data_page_breaks_its_spread(tmp_path):
    long = facts("ATL", destinations=[Destination(f"A{i:02d}", "Somewhere", 1000, 0) for i in range(80)])
    data, posters, _ = write_pdf(render([(entry("ATL"), long), (entry("MEM"), facts("MEM"))]), tmp_path / "b.pdf", tmp_path)
    assert data[0] == 4 and posters[0] != 5   # the overflow pushed ATL's poster on
    assert broken_spreads(data, posters) == [4]


def test_the_poster_fills_its_page(tmp_path):
    import weasyprint

    page = weasyprint.HTML(string=_book(["ATL"]), base_url=str(tmp_path)).render().pages[4]   # 5: ATL's poster
    root = page._page_box.children[0]
    svg = next(b for b in _boxes(root) if str(getattr(b, "element_tag", "")).endswith("svg"))
    assert (svg.border_box_x(), svg.border_box_y()) == (0, 0)
    assert (round(svg.border_width()), round(svg.border_height())) == (round(page.width), round(page.height))
    assert not [b for b in page._page_box.children[1:] if getattr(b, "children", None)]   # no page number


def _boxes(box):
    yield box
    for child in getattr(box, "children", ()):
        yield from _boxes(child)
