"""Numbers for the book, by the site's rules: formatCount(n, 'dense') and formatTons in static/common/numbers.js (held to
tests/fixtures/number_formats.json), and ordinal / percent from plugins/t100_globe.py. A missing value is an em dash."""

import math

from plugins.t100_globe import LB_PER_TON, ordinal, percent

DASH = "—"
MILLIONS = " million"   # non-breaking, so "million" never wraps away from its number


def _missing(n):
    return n is None or n != n


def _digits(v):
    """toLocaleString('en-US', {maximumFractionDigits: 3}): 1,250 / 0.5 / 12.345."""
    text = f"{v:,.3f}".rstrip("0").rstrip(".")
    return text or "0"


def dense_count(n) -> str:
    """Three significant figures, with one unit, million, from a million up: 48,200 / 1.20 million / 1,110 million."""
    if _missing(n):
        return DASH
    v = float(n)
    sign = "-" if v < 0 else ""
    r = float(f"{abs(v):.3g}")   # round first, so 999,999 is a million
    if r < 1e6:
        return sign + _digits(r)
    m = r / 1e6
    if m >= 1000:
        return f"{sign}{round(m):,}{MILLIONS}"
    places = 2 - int(math.floor(math.log10(m)))   # toPrecision(3): 1.00 / 51.5 / 412
    return f"{sign}{m:.{places}f}{MILLIONS}"


def tons(lb) -> str:
    return DASH if _missing(lb) else f"{dense_count(lb / LB_PER_TON)} tons"


def rank(n) -> str:
    return DASH if _missing(n) else ordinal(n)


def share(fraction) -> str:
    return DASH if _missing(fraction) else percent(fraction, 1)


def miles(n) -> str:
    return DASH if _missing(n) else f"{n:,} miles"
