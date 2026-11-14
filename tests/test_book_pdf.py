"""Renders real PDFs, so it needs the `book` dependency group and Pango. On macOS with Homebrew, run it as
DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run --group book pytest tests/test_book_pdf.py"""

import pytest

try:
    import weasyprint   # noqa: F401
except (ImportError, OSError) as e:   # OSError: installed, but Pango isn't on the library path
    pytest.skip(f"WeasyPrint unavailable ({type(e).__name__}); see this file's docstring", allow_module_level=True)

from scripts.book.pdf import write_pdf
from tests.test_book_render import render, entry, facts


def _book(codes):
    return render([(entry(c), facts(c)) for c in codes])


def test_two_airports_make_eight_pages_with_data_on_even_pages(tmp_path):
    out = tmp_path / "b.pdf"
    assert write_pdf(_book(["ATL", "MEM"]), out, tmp_path) == ([4, 6], 8)
    assert out.read_bytes().startswith(b"%PDF")


def test_three_airports_still_put_data_on_even_pages(tmp_path):
    assert write_pdf(_book(["ATL", "MEM", "ORD"]), tmp_path / "b.pdf", tmp_path) == ([4, 6, 8], 10)
