"""The book's HTML to PDF, with WeasyPrint (the `book` dependency group). WeasyPrint is imported here only, so the rest of
the book, and `--html`, work without it."""

import os
import sys
from pathlib import Path

HOMEBREW_LIB = "/opt/homebrew/lib"
_ENV = "DYLD_FALLBACK_LIBRARY_PATH"


def needs_library_path() -> bool:
    """True on a Mac where Homebrew's Pango is installed but not on the library path, which macOS reads only at start-up:
    the caller then restarts Python with library_env()."""
    return sys.platform == "darwin" and Path(HOMEBREW_LIB, "libpango-1.0.dylib").exists() and HOMEBREW_LIB not in os.environ.get(_ENV, "").split(":")


def library_env() -> dict:
    env = dict(os.environ)
    env[_ENV] = ":".join(p for p in (env.get(_ENV), HOMEBREW_LIB) if p)
    return env


def write_pdf(html: str, out: Path, base_url: Path) -> tuple[list[int], list[int], int]:
    """Writes the PDF; returns the (1-based) page numbers of the data pages, of the poster pages, and the page count."""
    import weasyprint

    document = weasyprint.HTML(string=html, base_url=str(base_url)).render()
    out.parent.mkdir(parents=True, exist_ok=True)
    document.write_pdf(out)

    first = {}   # anchor -> the page it starts on (a section running over several pages has its anchor on each)
    for i, page in enumerate(document.pages, 1):
        for a in page.anchors:
            first.setdefault(a, i)

    def pages_with(prefix):
        return sorted(p for a, p in first.items() if a.startswith(prefix))

    return pages_with("data-"), pages_with("poster-"), len(document.pages)


def broken_spreads(data_pages: list[int], poster_pages: list[int]) -> list[int]:
    """The data pages that don't face their poster: on a right-hand page, or with the poster not on the next page (a data
    page that ran onto a second page pushes its poster on, while still starting on a left-hand page)."""
    posters = poster_pages + [None] * (len(data_pages) - len(poster_pages))
    return [d for d, p in zip(data_pages, posters) if d % 2 or p != d + 1]
