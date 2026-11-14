"""The Airport Cities posters (airportcity/posters/<CODE>.svg), made ready to inline in the book's HTML: CSS variables become
their fallback colours, so the posters print as drawn, and the root's fixed size goes, so the page's CSS sizes them."""

import re
from pathlib import Path

_VAR = re.compile(r"var\(\s*--[\w-]+\s*,\s*([^)]+?)\s*\)")
_XML_DECL = re.compile(r"<\?xml[^>]*\?>\s*")
_ROOT = re.compile(r"<svg\b[^>]*>")
_SIZE = re.compile(r'\s(?:width|height)="[^"]*"')
_ID = re.compile(r'\bid="([^"]*)"')


class PosterError(Exception):
    pass


def load_poster(directory: Path, code: str) -> str:
    svg = (Path(directory) / f"{code}.svg").read_text()
    svg = _VAR.sub(r"\1", _XML_DECL.sub("", svg, count=1)).strip()
    root = _ROOT.search(svg)
    if not root:
        raise PosterError(f"{code}.svg has no <svg> element")
    svg = svg[:root.start()] + _SIZE.sub("", root.group(0)) + svg[root.end():]
    stray = sorted({i for i in _ID.findall(svg) if not i.startswith(f"{code}-")})
    if stray:   # 63 posters share one HTML document, so their ids must not clash
        raise PosterError(f"{code}.svg has ids without the {code}- prefix: {', '.join(stray[:5])}")
    return svg


def load_posters(directory: Path, codes: list[str]) -> dict[str, str]:
    """code -> poster, checking first that every one exists."""
    missing = sorted(c for c in codes if not (Path(directory) / f"{c}.svg").is_file())
    if missing:
        raise PosterError(f"no poster in {directory} for {', '.join(missing)}")
    return {c: load_poster(directory, c) for c in codes}
