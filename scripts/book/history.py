"""Each book airport's years, for the data page's charts: its ranks, its airlines' shares and how far its traffic goes.

Read from the rollup and lookup tables, never the segment tables. Airlines here are BTS's own airlines (carrier_pair_year's
airline_id), not the site's merged groups, so Continental is Continental until it stops reporting."""

import math
import re
from dataclasses import dataclass, field

from scripts.book.data import PLACE_MIN_FLIGHTS, US_WAC, _abroad, _airline, _COLUMN, _names, _routes

TOP_AIRLINE_LINES = 4   # then the others, together
DBA = re.compile(r"\s+d/b/a\s.*$", re.I)   # "Sun Country Airlines d/b/a MN Airlines": the airline's own name, not its brand
EARTH_RADIUS_MILES = 3958.8


@dataclass
class AirlineLine:
    name: str
    shares: dict[int, float]   # year -> share of the airport's measure; only years the airport has any
    last_share: float | None   # the last year's, None when the airport had none of the measure that year


@dataclass
class AirlineHistory:
    lines: list[AirlineLine]
    others: AirlineLine | None   # every other airline together; None when there are none
    others_count: int   # how many airlines the others are


@dataclass
class End:
    code: str
    label: str
    miles: float


@dataclass
class DistanceRow:
    year: int
    shortest: End | None
    median: float | None   # the distance the middle unit (passenger or pound) travels
    longest: End | None


@dataclass
class History:
    ranks: dict[str, list[tuple[int, int | None]]]   # measure -> (year, rank)
    airlines: AirlineHistory
    distances: list[DistanceRow] = field(default_factory=list)


def all_ranks(conn, first_year: int, last_year: int) -> dict[tuple[str, int], dict[str, int]]:
    """(measure, year) -> {airport: rank}, the airport_ranks canned query's ranking (data.ranks) for every year at once: an
    airport with none of a measure in a year has no rank in it."""
    out = {}
    for measure, column in _COLUMN.items():
        rows = conn.execute(
            f"""SELECT year, airport, SUM({column}) AS total FROM airport_dir_year
                WHERE year BETWEEN ? AND ? AND {US_WAC} GROUP BY year, airport HAVING total > 0
                ORDER BY year, total DESC, airport""", (first_year, last_year))
        for year, airport, _ in rows:
            ranked = out.setdefault((measure, year), {})
            ranked[airport] = len(ranked) + 1
    for year in range(first_year, last_year + 1):
        for measure in _COLUMN:
            out.setdefault((measure, year), {})
    return out


def rank_history(ranks, code: str, measure: str, first_year: int, last_year: int) -> list[tuple[int, int | None]]:
    return [(y, ranks.get((measure, y), {}).get(code)) for y in range(first_year, last_year + 1)]


def _airline_names(conn, ids):
    ids = list(ids)
    if not ids:
        return {}
    marks = ",".join("?" for _ in ids)
    names = dict(conn.execute(f"SELECT airline_id, MIN(name) FROM carriers WHERE airline_id IN ({marks}) GROUP BY airline_id", ids).fetchall())
    names.update((a, n) for a, n in conn.execute(
        f"SELECT airline_id, airline_name FROM carrier_group WHERE airline_id IN ({marks}) AND airline_name IS NOT NULL", ids))
    return {a: _airline(DBA.sub("", names[a])) if names.get(a) else a for a in ids}


def airline_history(conn, code: str, measure: str, first_year: int, last_year: int) -> AirlineHistory:
    """The airport's four biggest airlines over the whole span, by the measure, and the rest together: each one's share of
    the airport's measure, year by year."""
    rows = conn.execute(
        f"""SELECT year, airline_id, SUM({measure}) FROM carrier_pair_year
            WHERE (origin = ? OR dest = ?) AND year BETWEEN ? AND ? GROUP BY year, airline_id HAVING SUM({measure}) > 0""",
        (code, code, first_year, last_year)).fetchall()
    by_year, by_airline = {}, {}
    for year, airline, amount in rows:
        by_year[year] = by_year.get(year, 0) + amount
        by_airline[airline] = by_airline.get(airline, 0) + amount
    ranked = sorted(by_airline, key=lambda a: (-by_airline[a], a))
    top, rest = ranked[:TOP_AIRLINE_LINES], set(ranked[TOP_AIRLINE_LINES:])
    amounts = {}
    for year, airline, amount in rows:
        key = airline if airline in top else None
        amounts[(key, year)] = amounts.get((key, year), 0) + amount

    def line(name, key):
        shares = {y: amounts.get((key, y), 0) / total for y, total in sorted(by_year.items())}
        return AirlineLine(name, shares, shares.get(last_year))

    names = _airline_names(conn, top)
    return AirlineHistory(lines=[line(names[a], a) for a in top], others=line("Others", None) if rest else None,
                          others_count=len(rest))


def great_circle_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """The great-circle (haversine) distance between two points, in statute miles."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(h))


def airport_coordinates(conn) -> dict[str, tuple[float, float]]:
    """Each code's (latitude, longitude): airport_overrides first, then openflights_airports by IATA code, the lowest id
    where a code is there twice. The same rule as the distance-histogram branch's build_database.airport_coordinates; its
    pair_distance.gc_distance can replace this once that's merged."""
    coords = {}
    for code, lat, lon in conn.execute(
            "SELECT iata_code, latitude, longitude FROM openflights_airports WHERE iata_code IS NOT NULL AND iata_code NOT IN ('', '\\N') "
            "AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY id DESC"):
        coords[code] = (lat, lon)
    for code, lat, lon in conn.execute("SELECT code, latitude, longitude FROM airport_overrides WHERE latitude IS NOT NULL AND longitude IS NOT NULL"):
        coords[code] = (lat, lon)
    return coords


def weighted_median(pairs) -> float | None:
    """pairs: (value, weight). The smallest value with at least half the weight at or below it."""
    pairs = sorted(p for p in pairs if p[1] > 0)
    total = sum(w for _, w in pairs)
    run = 0
    for value, weight in pairs:
        run += weight
        if run >= total / 2:
            return value
    return None


def distance_row(conn, code: str, measure: str, year: int, coords=None) -> DistanceRow:
    """The year's shortest and longest routes carrying the measure with at least PLACE_MIN_FLIGHTS flights both ways, by the
    great-circle distance between the airports, and the distance the middle passenger (or pound of freight) travels, over
    every route. A route to an airport without coordinates is left out."""
    coords = airport_coordinates(conn) if coords is None else coords
    key = 0 if measure == "passengers" else 1
    if code not in coords:
        return DistanceRow(year, None, None, None)
    here = coords[code]
    routes = {o: (great_circle_miles(*here, *coords[o]), t) for o, t in _routes(conn, code, year).items()
              if t[key] > 0 and o in coords and o != code}   # not a flight back to where it left
    regular = [(miles, o) for o, (miles, t) in routes.items() if t[2] >= PLACE_MIN_FLIGHTS]
    median = weighted_median([(miles, t[key]) for miles, t in routes.values()])
    if not regular:
        return DistanceRow(year, None, median, None)
    shortest, longest = min(regular), max(regular)
    labels = _labels(conn, [shortest[1], longest[1]], year)
    return DistanceRow(year, End(shortest[1], labels[shortest[1]], shortest[0]), median,
                       End(longest[1], labels[longest[1]], longest[0]))


def _labels(conn, codes, year):
    """Where a route's other end is: BTS's place ("Oakland, CA", "London, United Kingdom", the country already in it), else
    the airport's name, with its country when it's abroad."""
    names, countries, bts = _names(conn, codes)
    abroad = set(_abroad(conn, codes, year))
    out = {}
    for c in codes:
        if bts.get(c):
            out[c] = bts[c]
        else:
            label = names.get(c) or c
            out[c] = f"{label}, {countries[c]}" if c in abroad and countries.get(c) else label
    return out


FREIGHT_FIRST_YEAR = 2003   # BTS added domestic all-cargo airlines in October 2002 (about.html), so freight starts here


def _start(measure, first_year):
    return max(first_year, FREIGHT_FIRST_YEAR) if measure == "freight" else first_year


def airport_history(conn, entry, ranks, first_year: int, last_year: int, coords=None) -> History:
    """What the page draws: the ranks in the page's measure, and in the other when the airport is in the book by that too;
    the airlines and the distances in the page's measure, for its first and last years."""
    measure = "passengers" if entry.in_passengers else "freight"
    measures = [measure] + [m for m, inside in (("passengers", entry.in_passengers), ("freight", entry.in_freight))
                            if inside and m != measure]
    start = _start(measure, first_year)
    coords = airport_coordinates(conn) if coords is None else coords
    return History(
        ranks={m: rank_history(ranks, entry.code, m, _start(m, first_year), last_year) for m in measures},
        airlines=airline_history(conn, entry.code, measure, start, last_year),
        distances=[distance_row(conn, entry.code, measure, y, coords) for y in (start, last_year)],
    )
