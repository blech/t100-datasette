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


def write_pdf(html: str, out: Path, base_url: Path) -> tuple[list[int], int]:
    """Writes the PDF; returns the (1-based) page numbers of the data pages and the page count."""
    import weasyprint

    document = weasyprint.HTML(string=html, base_url=str(base_url)).render()
    out.parent.mkdir(parents=True, exist_ok=True)
    document.write_pdf(out)
    data_pages = [i for i, page in enumerate(document.pages, 1) if any(a.startswith("data-") for a in page.anchors)]
    return data_pages, len(document.pages)
