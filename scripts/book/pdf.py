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


def layout(html: str, base_url: Path):
    import weasyprint

    return weasyprint.HTML(string=html, base_url=str(base_url)).render()


def centre_offset(data_top: float, data_bottom: float, poster_top: float, poster_bottom: float, page_bottom: float) -> float:
    """How far down to move a poster so it's centred on its facing data, from its top, and never off its page."""
    move = (data_top + data_bottom) / 2 - (poster_top + poster_bottom) / 2
    return round(max(0.0, min(move, page_bottom - poster_bottom)), 1)


def _boxes(box):
    yield box
    for child in getattr(box, "children", []):
        yield from _boxes(child)


def _section(box, prefix):
    """The code of a data-CODE or poster-CODE section box, else None."""
    element = getattr(box, "element", None)
    if getattr(box, "element_tag", None) != "section" or element is None:
        return None
    id_ = element.get("id") or ""
    return id_[len(prefix):] if id_.startswith(prefix) else None


def poster_offsets(document) -> dict[str, float]:
    """code -> px to move each poster down so it's centred between the top of its data page and the bottom of its charts.
    Measured from a laid-out document (WeasyPrint's page boxes): a book laid out with these offsets measures all zero."""
    data, posters = {}, {}
    for page in document.pages:
        root = page._page_box
        page_bottom = root.content_box_y() + root.height
        for box in _boxes(root):
            if (code := _section(box, "data-")) and code not in data:
                data[code] = (box.border_box_y(), box.border_box_y() + box.border_height())
            elif (code := _section(box, "poster-")) and code not in posters:
                svg = next((b for b in _boxes(box) if str(getattr(b, "element_tag", "")).endswith("svg")), None)   # tag is "{svg namespace}svg"
                if svg is not None:
                    posters[code] = (svg.border_box_y(), svg.border_box_y() + svg.border_height(), page_bottom)
    return {code: centre_offset(*data[code], *poster) for code, poster in posters.items() if code in data}


def write_pdf(html: str, out: Path, base_url: Path) -> tuple[list[int], list[int], int]:
    """Writes the PDF; returns the (1-based) page numbers of the data pages, of the poster pages, and the page count."""
    document = layout(html, base_url)
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
