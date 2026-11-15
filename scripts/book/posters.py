"""The Airport Cities posters (airportcity/posters/<CODE>.svg) and the site's runway diagrams (static/svg/diagram/<CODE>.svg),
made ready to inline in the book's HTML: CSS variables become their fallback colours, so they print as drawn, and the root's
fixed size goes, so the page's CSS sizes them."""

import re
from pathlib import Path

# innermost first: var(--a, var(--b, #000)) resolves in two passes
_VAR = re.compile(r"var\(\s*--[\w-]+\s*,\s*([^()]+?)\s*\)")
_XML_DECL = re.compile(r"<\?xml[^>]*\?>\s*")
_ROOT = re.compile(r"<svg\b[^>]*>")
_SIZE = re.compile(r'\s(?:width|height)="[^"]*"')
_ID = re.compile(r'\bid="([^"]*)"')


class PosterError(Exception):
    pass


def _inline(svg: str, name: str) -> str:
    svg = _XML_DECL.sub("", svg, count=1).strip()
    previous = None
    while previous != svg:
        previous, svg = svg, _VAR.sub(r"\1", svg)
    root = _ROOT.search(svg)
    if not root:
        raise PosterError(f"{name} has no <svg> element")
    return svg[:root.start()] + _SIZE.sub("", root.group(0)) + svg[root.end():]


def load_poster(directory: Path, code: str) -> str:
    svg = _inline((Path(directory) / f"{code}.svg").read_text(), f"{code}.svg")
    stray = sorted({i for i in _ID.findall(svg) if not i.startswith(f"{code}-")})
    if stray:   # 63 posters share one HTML document, so their ids must not clash
        raise PosterError(f"{code}.svg has ids without the {code}- prefix: {', '.join(stray[:5])}")
    return svg


def _check(directory: Path, codes: list[str], what: str):
    missing = sorted(c for c in codes if not (Path(directory) / f"{c}.svg").is_file())
    if missing:
        raise PosterError(f"no {what} in {directory} for {', '.join(missing)}")


def load_posters(directory: Path, codes: list[str]) -> dict[str, str]:
    """code -> poster, checking first that every one exists."""
    _check(directory, codes, "poster")
    return {c: load_poster(directory, c) for c in codes}


def load_diagrams(directory: Path, codes: list[str]) -> dict[str, str]:
    """code -> runway diagram, for an endpaper. They carry no ids, so many can share the page."""
    _check(directory, codes, "diagram")
    return {c: _inline((Path(directory) / f"{c}.svg").read_text(), f"{c}.svg") for c in codes}


def reprefix(svg: str, code: str, prefix: str) -> str:
    """A second copy of a poster (an endpaper's thumbnail) needs ids of its own: CODE-x becomes <prefix>CODE-x, references too."""
    return re.sub(rf'(\bid="|#){re.escape(code)}-', rf"\g<1>{prefix}{code}-", svg)
