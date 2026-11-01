# Which way a page counts flights: '' both directions (the default), 'out' leaving (or a route's first airport to its second),
# 'in' arriving (or the reverse). The words and cut-offs here are the ones static/common/direction.js uses in the browser.

_WORDS = {"": "Flights", "out": "Departures", "in": "Arrivals"}

DIRECTION_CHOICES_AIRPORT = [("", "Both directions"), ("out", "Departing"), ("in", "Arriving")]

# an airport outside the US has only its flights to and from the US in the data, so its directions are named for the US:
# leaving it (out) is flying to the US, arriving at it (in) is flying from the US
DIRECTION_CHOICES_ABROAD = [("", "to and from the US"), ("out", "to the US"), ("in", "from the US")]
_WORDS_ABROAD = {"": "Flights", "out": "Flights to the US", "in": "Flights from the US"}


def parse_dir(value):
    """A ?dir= value -> '', 'out' or 'in'; anything else counts as both."""
    return value if value in ("out", "in") else ""


def count_word(dir, abroad=False):
    return (_WORDS_ABROAD if abroad else _WORDS)[dir]


def route_count_word(dir):
    """A route's one-way count is departures from the airport its heading starts with, whichever way that is."""
    return "Flights" if dir == "" else "Departures"


def route_heading(a, b, dir):
    """LAX ↔ LHR, LAX → LHR or LHR → LAX, for the route at /airports/a/b."""
    return {"": f"{a} ↔ {b}", "out": f"{a} → {b}", "in": f"{b} → {a}"}[dir]


def cutoff(dir, base=12):
    """A cut-off defined in departures, doubled when both directions are counted (roughly monthly each way)."""
    return base * 2 if dir == "" else base


def DIRECTION_CHOICES_ROUTE(a, b):
    return [(d, route_heading(a, b, d)) for d in ("", "out", "in")]
