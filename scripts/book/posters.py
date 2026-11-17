"""The Airport Cities posters (airportcity/posters/print/<CODE>*.svg for the pages, airportcity/posters/<CODE>.svg for an
endpaper) and the site's runway diagrams (static/svg/diagram/<CODE>.svg), made ready to inline in the book's HTML: CSS
variables become their fallback colours, so they print as drawn, and the root's fixed size goes, so the page's CSS sizes
them."""

import re
from pathlib import Path

# innermost first: var(--a, var(--b, #000)) resolves in two passes
_VAR = re.compile(r"var\(\s*--[\w-]+\s*,\s*([^()]+?)\s*\)")
_XML_DECL = re.compile(r"<\?xml[^>]*\?>\s*")
_ROOT = re.compile(r"<svg\b[^>]*>")
_SIZE = re.compile(r'\s(?:width|height)="[^"]*"')
_ID = re.compile(r'\bid="([^"]*)"')
_MASKED_GROUP = re.compile(r'<g\b([^>]*?) mask="url\(#([^)]+)\)"([^>]*)>((?:(?!<g\b).)*?)</g>', re.S)   # no groups inside
_USE = re.compile(r'<use href="#([^"]+)"([^>]*?)/>')
_SHAPE = re.compile(r"<path\b([^>]*?)/>")
_PATH = re.compile(r'<path id="([^"]+)" d="([^"]*)"')
_VIEW_BOX = re.compile(r'\bviewBox="([^"]*)"')


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


def _mask_each_child(svg: str) -> str:
    """The posters mask whole groups: the roads (wide strokes, with a mask cutting out the middle to leave casings) and the
    runways (a mask clearing room for their labels). WeasyPrint applies a mask only after drawing an element's children,
    so on a <g> it does nothing: the roads print solid. On a <path> it's in place before the stroke, so the mask moves onto
    each path in the group, a <use> becoming the path it pointed at."""
    paths = dict(_PATH.findall(svg))

    def push_down(m):
        before, mask, after, body = m.groups()
        masked = f' mask="url(#{mask})"/>'
        body = _USE.sub(lambda u: f'<path d="{paths[u.group(1)]}"{u.group(2)}{masked}', body)
        body = _SHAPE.sub(lambda p: p.group(0) if "mask=" in p.group(1) else f"<path{p.group(1)}{masked}", body)
        return f"<g{before}{after}>{body}</g>"

    return _MASKED_GROUP.sub(push_down, svg)


def crop(svg: str, ratio: float) -> str:
    """The root's viewBox cut down to width/height = ratio, centred: a poster made to the page's shape, so it can fill it."""
    root = _ROOT.search(svg)
    x, y, width, height = (float(v) for v in _VIEW_BOX.search(root.group(0)).group(1).replace(",", " ").split())
    if width / height > ratio:
        x, width = x + (width - height * ratio) / 2, height * ratio
    else:
        y, height = y + (height - width / ratio) / 2, width / ratio
    box = " ".join(f"{round(v, 2):g}" for v in (x, y, width, height))
    return svg[:root.start()] + _VIEW_BOX.sub(f'viewBox="{box}"', root.group(0), count=1) + svg[root.end():]


def _candidates(directory: Path, code: str, variants: tuple[str, ...]) -> list[Path]:
    return [Path(directory) / f"{code}-{v}.svg" for v in variants] + [Path(directory) / f"{code}.svg"]


def load_poster(directory: Path, code: str, variants: tuple[str, ...] = ()) -> str:
    """The first of CODE-<variant>.svg, in the order given, that there is, else CODE.svg. The print posters come as
    CODE-rail-rot.svg (turned a quarter, for an airport wider than it's tall), CODE-rail.svg, and CODE.svg (no railway)."""
    path = next(p for p in _candidates(directory, code, variants) if p.is_file())
    svg = _mask_each_child(_inline(path.read_text(), path.name))
    stray = sorted({i for i in _ID.findall(svg) if not i.startswith(f"{code}-")})
    if stray:   # 63 posters share one HTML document, so their ids must not clash
        raise PosterError(f"{path.name} has ids without the {code}- prefix: {', '.join(stray[:5])}")
    return svg


def _check(directory: Path, codes: list[str], what: str, variants: tuple[str, ...] = ()):
    missing = sorted(c for c in codes if not any(p.is_file() for p in _candidates(directory, c, variants)))
    if missing:
        raise PosterError(f"no {what} in {directory} for {', '.join(missing)}")


def load_posters(directory: Path, codes: list[str], variants: tuple[str, ...] = ()) -> dict[str, str]:
    """code -> poster (see load_poster), checking first that every airport has one."""
    _check(directory, codes, "poster", variants)
    return {c: load_poster(directory, c, variants) for c in codes}


def load_diagrams(directory: Path, codes: list[str]) -> dict[str, str]:
    """code -> runway diagram, for an endpaper. They carry no ids, so many can share the page."""
    _check(directory, codes, "diagram")
    return {c: _inline((Path(directory) / f"{c}.svg").read_text(), f"{c}.svg") for c in codes}


def reprefix(svg: str, code: str, prefix: str) -> str:
    """A second copy of a poster (an endpaper's thumbnail) needs ids of its own: CODE-x becomes <prefix>CODE-x, references too."""
    return re.sub(rf'(\bid="|#){re.escape(code)}-', rf"\g<1>{prefix}{code}-", svg)
