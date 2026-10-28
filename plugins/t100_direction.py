# Which way a page counts flights: '' both directions (the default), 'out' leaving (or a route's first airport to its second),
# 'in' arriving (or the reverse). The words and cut-offs here are the ones static/common/direction.js uses in the browser.

_WORDS = {"": "Flights", "out": "Departures", "in": "Arrivals"}

DIRECTION_CHOICES_AIRPORT = [("", "Both directions"), ("out", "Departing"), ("in", "Arriving")]


def parse_dir(value):
    """A ?dir= value -> '', 'out' or 'in'; anything else counts as both."""
    return value if value in ("out", "in") else ""


def count_word(dir):
    return _WORDS[dir]


def route_heading(a, b, dir):
    """LAX ↔ LHR, LAX → LHR or LHR → LAX, for the route at /airports/a/b."""
    return {"": f"{a} ↔ {b}", "out": f"{a} → {b}", "in": f"{b} → {a}"}[dir]


def cutoff(dir, base=12):
    """A cut-off defined in departures, doubled when both directions are counted (roughly monthly each way)."""
    return base * 2 if dir == "" else base


def DIRECTION_CHOICES_ROUTE(a, b):
    return [(d, route_heading(a, b, d)) for d in ("", "out", "in")]
