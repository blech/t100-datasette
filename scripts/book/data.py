"""Each book airport's figures, read from t100.db's rollup and lookup tables (never the segment tables).

An airport's traffic is departing plus arriving, among US airports (wac 1-93), ranked by total then code: the airport_ranks
canned query's definitions, so the book agrees with the site's airport pages."""

import re
from dataclasses import dataclass, field

from plugins.t100_globe import short_airline_name

US_WAC = "wac BETWEEN 1 AND 93"
PLACE_MIN_FLIGHTS = 24   # the airport page's "How many places" default, flights both ways
TOP_DESTINATIONS = 5
TOP_AIRLINES = 3
MARKET_MIN_SHARE = 0.01   # a city market's other airports, named only with at least 1% of this airport's traffic in the page's measure

_COLUMN = {"passengers": "passengers_out + passengers_in", "freight": "freight_out + freight_in"}


@dataclass
class YearFigures:
    year: int
    passengers: int
    freight_lb: int


@dataclass
class Destination:
    code: str
    label: str
    passengers: int
    freight_lb: int


@dataclass
class BookAirport:
    code: str
    passenger_rank: int | None
    freight_rank: int | None
    in_passengers: bool
    in_freight: bool


@dataclass
class AirportFacts:
    code: str
    name: str
    place: str
    market: str | None
    market_airports: list[str]
    first_year: int
    last_year: int
    passengers_first: int | None
    passengers_last: int | None
    freight_first_lb: int | None
    freight_last_lb: int | None
    passenger_rank_first: int | None
    passenger_rank_last: int | None
    freight_rank_first: int | None
    freight_rank_last: int | None
    peak_year: int | None
    peak_value: int | None   # passengers, or lb of freight: the page's measure
    value_2020: int | None
    places: int
    airline_groups: int
    top_airlines: list[tuple[str, float]]
    international_share: float | None
    busiest_international: Destination | None
    longest_route: tuple[str, int] | None
    destinations: list[Destination]
    measure: str   # "passengers" or "freight": what the page ranks destinations and airlines by, and its peak, 2020 and international share
    series: list[YearFigures] = field(default_factory=list)


def ranks(conn, year: int, measure: str) -> dict[str, int]:
    """code -> rank among the US airports with any of `measure` in `year`."""
    rows = conn.execute(
        f"""SELECT airport, SUM({_COLUMN[measure]}) AS total FROM airport_dir_year
            WHERE year = ? AND {US_WAC} GROUP BY airport HAVING total > 0 ORDER BY total DESC, airport""",
        (year,),
    ).fetchall()
    return {row[0]: i for i, row in enumerate(rows, 1)}


def book_airports(conn, year: int, top_passengers: int, top_freight: int) -> list[BookAirport]:
    """The passenger top N in rank order, then the freight top N that aren't among them, in freight rank order."""
    pax, freight = ranks(conn, year, "passengers"), ranks(conn, year, "freight")
    in_pax = sorted((c for c, r in pax.items() if r <= top_passengers), key=pax.get)
    in_freight = {c for c, r in freight.items() if r <= top_freight}
    order = in_pax + sorted(in_freight - set(in_pax), key=freight.get)
    return [BookAirport(c, pax.get(c), freight.get(c), c in in_pax, c in in_freight) for c in order]


def _names(conn, codes):
    """code -> airport name (overrides first, then OpenFlights) and code -> BTS city name."""
    codes = list(codes)
    marks = ",".join("?" for _ in codes)
    names = dict(conn.execute(f"SELECT iata_code, MIN(name) FROM openflights_airports WHERE iata_code IN ({marks}) GROUP BY iata_code", codes).fetchall())
    names.update(conn.execute(f"SELECT code, name FROM airport_overrides WHERE code IN ({marks})", codes).fetchall())
    places = dict(conn.execute(f"SELECT code, name FROM airport_names WHERE code IN ({marks})", codes).fetchall())
    return names, places


def _routes(conn, code, year):
    """other airport -> (passengers, freight, deps, international deps), both directions added."""
    rows = conn.execute(
        """SELECT dest, passengers, freight, deps, deps - domestic_deps FROM route_year_totals WHERE year = ? AND origin = ?
           UNION ALL
           SELECT origin, passengers, freight, deps, deps - domestic_deps FROM route_year_totals WHERE year = ? AND dest = ?""",
        (year, code, year, code),
    ).fetchall()
    totals = {}
    for other, pax, freight, deps, intl in rows:
        t = totals.setdefault(other, [0, 0, 0, 0])
        for i, v in enumerate((pax, freight, deps, intl)):
            t[i] += v or 0
    return totals


def _abroad(conn, others, year):
    """Those of `others` outside the US, by their wac in airport_dir_year."""
    others = list(others)
    if not others:
        return []
    marks = ",".join("?" for _ in others)
    return [r[0] for r in conn.execute(
        f"SELECT airport FROM airport_dir_year WHERE year = ? AND airport IN ({marks}) AND NOT ({US_WAC})", [year, *others])]


def _distance(conn, a, b):
    row = conn.execute("SELECT distance FROM pair_distance WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)", (a, b, b, a)).fetchone()
    return row[0] if row else None


def airport_facts(conn, entry: BookAirport, first_year: int, last_year: int) -> AirportFacts:
    code = entry.code
    series = [YearFigures(y, p or 0, f or 0) for y, p, f in conn.execute(
        f"""SELECT year, SUM({_COLUMN['passengers']}), SUM({_COLUMN['freight']}) FROM airport_dir_year
            WHERE airport = ? AND year BETWEEN ? AND ? GROUP BY year ORDER BY year""",
        (code, first_year, last_year),
    )]
    by_year = {s.year: s for s in series}
    first, last = by_year.get(first_year), by_year.get(last_year)
    by = "passengers" if entry.in_passengers else "freight"
    key = 0 if by == "passengers" else 1

    def amount(s):
        return s.passengers if by == "passengers" else s.freight_lb

    peak = max(series, key=lambda s: (amount(s), -s.year), default=None)

    routes = _routes(conn, code, last_year)
    # ranked by the page's measure, then code; a destination with none of that measure isn't one of its busiest
    ranked = sorted((o for o in routes if routes[o][key] > 0), key=lambda o: (-routes[o][key], o))
    top = ranked[:TOP_DESTINATIONS]
    places = [o for o, t in routes.items() if t[2] >= PLACE_MIN_FLIGHTS]
    # abroad by the other airport's own wac: a US route with an odd international flight on it isn't international
    abroad = set(_abroad(conn, routes, last_year))
    busiest_intl = next((o for o in ranked if o in abroad), None)

    names, bts = _names(conn, [code] + list(routes))

    def destination(o):
        return Destination(o, names.get(o) or bts.get(o) or o, routes[o][0], routes[o][1])

    distances = [(o, d) for o in places if (d := _distance(conn, code, o)) is not None]
    longest = max(distances, key=lambda od: (od[1], od[0]), default=None)

    market, market_airports = None, []
    row = conn.execute("SELECT market_id FROM airport_market WHERE code = ?", (code,)).fetchone()
    if row:
        floor = MARKET_MIN_SHARE * (amount(last) if last else 0)
        market_airports = [r[0] for r in conn.execute(
            f"""SELECT m.code FROM airport_market AS m JOIN airport_dir_year AS y ON y.airport = m.code AND y.year = ?
                WHERE m.market_id = ? AND m.code != ? GROUP BY m.code HAVING SUM({_COLUMN[by]}) >= ? AND SUM({_COLUMN[by]}) > 0
                ORDER BY m.code""",
            (last_year, row[0], code, floor))]
        if market_airports:
            name = conn.execute("SELECT name FROM market_name WHERE market_id = ?", (row[0],)).fetchone()
            market = name[0] if name else None

    airlines = conn.execute(
        """SELECT group_id, MIN(group_name), SUM(passengers_out + passengers_in), SUM(freight_out + freight_in),
                  SUM(CASE WHEN domestic = 0 THEN passengers_out + passengers_in ELSE 0 END),
                  SUM(CASE WHEN domestic = 0 THEN freight_out + freight_in ELSE 0 END)
           FROM airport_carrier_dir_year WHERE year = ? AND airport = ? GROUP BY group_id""",
        (last_year, code),
    ).fetchall()
    carried = [a for a in airlines if (a[2] or 0) > 0 or (a[3] or 0) > 0]
    col, intl_col = (2, 4) if by == "passengers" else (3, 5)   # the page's measure, in all and abroad
    total = sum(a[col] or 0 for a in airlines)
    intl = sum(a[intl_col] or 0 for a in airlines)
    carrying = sorted((a for a in airlines if (a[col] or 0) > 0), key=lambda a: (-a[col], a[0]))[:TOP_AIRLINES]
    top_airlines = [(_airline(a[1]), a[col] / total) for a in carrying]

    pax_ranks = {y: ranks(conn, y, "passengers").get(code) for y in (first_year, last_year)}
    freight_ranks = {y: ranks(conn, y, "freight").get(code) for y in (first_year, last_year)}
    return AirportFacts(
        code=code, name=names.get(code) or code, place=bts.get(code) or "",
        market=market, market_airports=market_airports if market else [],
        first_year=first_year, last_year=last_year,
        passengers_first=first.passengers if first else None, passengers_last=last.passengers if last else None,
        freight_first_lb=first.freight_lb if first else None, freight_last_lb=last.freight_lb if last else None,
        passenger_rank_first=pax_ranks[first_year], passenger_rank_last=pax_ranks[last_year],
        freight_rank_first=freight_ranks[first_year], freight_rank_last=freight_ranks[last_year],
        peak_year=peak.year if peak else None, peak_value=amount(peak) if peak else None,
        value_2020=amount(by_year[2020]) if 2020 in by_year else None,
        places=len(places), airline_groups=len(carried), top_airlines=top_airlines,
        international_share=intl / total if total else None,
        busiest_international=destination(busiest_intl) if busiest_intl else None,
        longest_route=longest, destinations=[destination(o) for o in top], measure=by, series=series,
    )


def _airline(name):
    """"Southwest Airlines Co. (incl. AirTran)" -> "Southwest Airlines", as the airport page's rank line has it."""
    return short_airline_name(re.sub(r"\s*\(incl\..*?\)", "", name))
