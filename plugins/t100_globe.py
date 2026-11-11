import json
import logging
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlencode

from datasette import hookimpl
from markupsafe import Markup, escape
from datasette.utils.asgi import NotFound, Response

# Datasette loads each plugin from its file, not as a package, so a shared module is imported from beside this one
sys.path.insert(0, str(Path(__file__).resolve().parent))
from t100_direction import DIRECTION_CHOICES_ABROAD, DIRECTION_CHOICES_AIRPORT, DIRECTION_CHOICES_ROUTE, count_word, cutoff, parse_dir, route_count_word, route_heading  # noqa: E402


CODE = r"[A-Za-z0-9]{3}"
CITIES = "/airports/cities"  # a city (BTS market) is /airports/cities/<market>, a pair of them /airports/cities/<market>/<market>
COUNTRIES = "/airports/countries"  # a country abroad is /airports/countries/<slug>
log = logging.getLogger(__name__)


def moved(template):
    """A permanent redirect to `template` (filled from the URL's variables), keeping the query string."""

    async def view(request):
        path = template.format(**request.url_vars)
        return Response.redirect(f"{path}?{request.query_string}" if request.query_string else path, status=301)

    return view


def redirect_to(target):
    """A redirect to a fixed address (not permanent: where the page lives may change)."""

    async def view(request):
        return Response.redirect(target, status=302)

    return view


@hookimpl
def register_routes():
    return [
        (r"^/$", home_page),
        (r"^/-/$", redirect_to("/t100")),  # Datasette's index page, with its one database: the database page is the data's front door
        # the busiest-airports table, of airports, cities or (abroad) countries: one table, at an address for each grouping
        (r"^/airports$", airports_table("airport")),
        (r"^/airports/cities$", airports_table("city")),
        (r"^/airports/countries$", airports_table("country")),
        (r"^/airports/countries/(?P<slug>[a-z0-9-]+)$", country_page),
        (r"^/countries$", moved("/airports/countries")),  # the country pages' first addresses
        (r"^/countries/(?P<slug>[a-z0-9-]+)$", moved("/airports/countries/{slug}")),
        (r"^/airports/globe$", globe_page),
        (r"^/airports/globe/routes$", routes_globe_page),  # SPIKE: the busiest routes for a year, on any of the map types
        (r"^/airports/dedicated$", dedicated_airports_page),
        (r"^/airports/movers$", airport_movers_page),
        (r"^/airports/over-time$", rollup_page("airports")),
        (r"^/airports/routes$", rollup_page("toproutes")),
        # a BTS city market (Los Angeles is 32575, the Bay Area 32457) is a group of airports, so its pages are in the Airports section:
        # the city's destinations, and a pair of cities' airport pairs; the list of cities is the busiest-airports table by city
        (r"^/airports/cities/(?P<a>[0-9]{5})/(?P<b>[0-9]{5})$", city_pair_page),
        (r"^/airports/cities/(?P<market>[0-9]{5})$", city_page),
        (r"^/cities$", moved("/airports/cities")),  # the city pages' first addresses
        (r"^/cities/(?P<a>[0-9]{5})/(?P<b>[0-9]{5})$", moved("/airports/cities/{a}/{b}")),
        (r"^/cities/(?P<market>[0-9]{5})$", moved("/airports/cities/{market}")),
        (rf"^/airports/(?P<origin>{CODE})$", airport_page),
        (rf"^/airports/(?P<origin>{CODE})/destinations$", routes_page),
        (rf"^/airports/(?P<origin>{CODE})/changes$", airport_changes_page),
        (rf"^/airports/(?P<origin>{CODE})/globe$", globe_page),
        (rf"^/airports/(?P<origin>{CODE})/(?P<dest>{CODE})(?:/(?P<year>[0-9]{{4}}))?$", route_page),
        (rf"^/airports/(?P<origin>{CODE})/(?P<dest>{CODE})(?:/(?P<year>[0-9]{{4}}))?/table$", route_table_page),
        (r"^/about$", about_page),
        (r"^/aircraft$", aircraft_table_page),
        (r"^/airlines$", airline_table_page),
        (r"^/airlines/over-time$", rollup_page("airlines")),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/changes$", airline_changes_page),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/routes$", airline_routes_page),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/aircraft$", airline_aircraft_page),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)$", airline_page),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/globe$", airline_globe_page),
        # the paths airlines had before the URL used the word the pages do
        (r"^/carriers$", moved("/airlines")),
        (r"^/carriers/(?P<slug>[A-Za-z0-9_-]+)$", moved("/airlines/{slug}")),
        (r"^/carriers/(?P<slug>[A-Za-z0-9_-]+)/globe$", moved("/airlines/{slug}/globe")),
        (r"^/aircraft/over-time$", rollup_page("aircraft")),
        (r"^/aircraft/groups$", groups_page),
        (r"^/aircraft/engines$", moved("/aircraft/groups")),  # the page's address when it showed only the long haul
        (r"^/aircraft/makers$", aircraft_makers_page),
        (r"^/aircraft/table$", moved("/aircraft")),  # the table's address before it became /aircraft
        (r"^/aircraft/(?P<slug>[a-z0-9-]+)$", family_page),
        (r"^/aircraft/(?P<slug>[a-z0-9-]+)/(?P<aircraft>[a-z0-9-]+)$", aircraft_page),
        # the paths the site used before airports came first
        (r"^/globe$", moved("/airports/globe")),
        (r"^/routes$", moved("/airports")),
        (rf"^/globe/(?P<origin>{CODE})$", moved("/airports/{origin}/globe")),
        (rf"^/routes/(?P<origin>{CODE})$", moved("/airports/{origin}")),
        (rf"^/route/(?P<origin>{CODE})/(?P<dest>{CODE})$", moved("/airports/{origin}/{dest}")),
        (rf"^/route/(?P<origin>{CODE})/(?P<dest>{CODE})/(?P<year>[0-9]{{4}})$", moved("/airports/{origin}/{dest}/{year}")),
        # Changelog
        (r"^/changelog$", changelog_page),
    ]


def trail(datasette, *steps):
    """Breadcrumb items for the page header: the site name first, then (label, href) steps.

    The last step is the current page and has no link."""
    site = (datasette.plugin_config("t100_globe") or {}).get("site_name", "t100.husk.org")
    items = [(site, "/"), *steps]
    return [{"label": label, "href": href} for label, href in items[:-1]] + [{"label": items[-1][0], "href": None}]


SECTIONS = ("airports", "aircraft", "airlines", "about")
AIRPORT_CODE = re.compile(r"^[A-Za-z0-9]{3}$")


def section_of(path):
    """The site section a path belongs to, from its first segment; None for the front page and Datasette's own pages."""
    first = path.strip("/").split("/")[0]
    if first and first == 'changelog':
        first = 'about'
    return first if first in SECTIONS else None


def views_for(path):
    """The other views of the subject a page shows, for the views line under the breadcrumb: [{label, href, current, id}].
    Empty when the subject has only one view (or the path is not one of the site's pages)."""
    parts = [p for p in path.strip("/").split("/") if p]

    def make(*items, current):
        return [{"label": label, "href": href, "current": i == current, "id": id_} for i, (label, href, id_) in enumerate(items)]

    match parts:
        case ["airports"] | ["airports", "dedicated"] | ["airports", "movers"] | ["airports", "over-time"] | ["airports", "routes"] | \
                ["airports", "globe"] | ["airports", "cities"] | ["airports", "countries"]:
            # the cities and countries are the busiest-airports table grouped another way
            view = {"cities": [], "countries": []}.get(parts[1], parts[1:]) if parts[1:] else []
            return make(("Busiest airports", "/airports", None), ("Over time", "/airports/over-time", None),
                        ("Most dedicated", "/airports/dedicated", None), ("Risers and fallers", "/airports/movers", None),
                        ("Routes", "/airports/routes", None), ("Map", "/airports/globe", None),
                        current=[[], ["over-time"], ["dedicated"], ["movers"], ["routes"], ["globe"]].index(view))
        case ["airports", code, *rest] if AIRPORT_CODE.match(code) and rest in ([], ["destinations"], ["changes"], ["globe"]):
            c = code.upper()
            return make(("Over time", f"/airports/{c}", None), ("Destinations", f"/airports/{c}/destinations", None),
                        ("Changes", f"/airports/{c}/changes", "changes-link"), ("Map", f"/airports/{c}/globe", None),
                        current=[[], ["destinations"], ["changes"], ["globe"]].index(rest))
        case ["airports", a, b, *rest] if AIRPORT_CODE.match(a) and AIRPORT_CODE.match(b) and b.lower() != "globe" and (
                rest in ([], ["table"]) or (rest and rest[0].isdigit() and rest[1:] in ([], ["table"]))):
            a, b = a.upper(), b.upper()
            year = f"/{rest[0]}" if rest and rest[0].isdigit() else ""
            base = f"/airports/{a}/{b}{year}"
            return make(("Over time", base, None), ("Table", f"{base}/table", None), current=1 if rest and rest[-1] == "table" else 0)
        case ["aircraft", *rest] if len(rest) < 3:
            aircraft = [("Families", "/aircraft", None), ("Over time", "/aircraft/over-time", None), ("Makers", "/aircraft/makers", None),
                        ("Groups", "/aircraft/groups", None)]
            # a family or one of its aircraft is a page of the section but not one of these views: none is current
            views = [[], ["over-time"], ["makers"], ["groups"]]
            return make(*aircraft, current=views.index(rest) if rest in views else -1)
        case ["airlines"] | ["airlines", "over-time"]:
            return make(("Airlines", "/airlines", None), ("Over time", "/airlines/over-time", None), current=len(parts) - 1)
        case ["airlines", slug, *rest] if rest in ([], ["routes"], ["aircraft"], ["changes"], ["globe"]):
            return make(("Over time", f"/airlines/{slug}", None), ("Routes", f"/airlines/{slug}/routes", None),
                        ("Aircraft", f"/airlines/{slug}/aircraft", None), ("Changes", f"/airlines/{slug}/changes", "changes-link"),
                        ("Map", f"/airlines/{slug}/globe", "map-link"),
                        current=[[], ["routes"], ["aircraft"], ["changes"], ["globe"]].index(rest))
        case ["about"]:
            return make(("About", "/about", None), ("Changes", "/changelog", None), current=len(parts) - 1)
        case ["changelog"]:
            return make(("About", "/about", None), ("Changes", "/changelog", None), current=len(parts))
    return []


def crumb_label(database):
    """What Datasette's pages call a database in the breadcrumb: the T-100 data is just 'data' there."""
    return "data" if database == "t100" else database


@hookimpl
def extra_template_vars(request, datasette):
    """The header's current section and the page's views, for every template rendered with a request. Prefixed, because
    these are merged over every page's own context, Datasette's included: its database page has a `views` of its own."""
    if request is None:
        return {}
    site = (datasette.plugin_config("t100_globe") or {}).get("site_name", "t100.husk.org")
    return {"nav_section": section_of(request.path), "nav_views": views_for(request.path), "nav_site": site, "nav_crumb_label": crumb_label}


async def is_foreign(datasette, code):
    """True if BTS places the airport outside the US and its territories (its WAC is outside 1-93).

    T-100 only records flights with a US airport at one end, so for these airports only the
    US side of their network is in the data."""
    if not code:
        return False
    result = await datasette.get_database("t100").execute("SELECT origin_wac FROM t100 WHERE origin = ? LIMIT 1", [code])
    row = result.first()
    return bool(row) and row[0] is not None and not 1 <= row[0] <= 93


async def airport_info(datasette, codes):
    """code -> (name, ICAO code, city) for each of codes, as the airports query has them: the city is BTS's name for it,
    else OpenFlights' city and country; any of the three may be None."""
    result = await datasette.get_database("t100").execute(
        """SELECT c.value, a.name, a.icao, COALESCE(n.name, a.city || ', ' || a.country)
           FROM json_each(:codes) AS c LEFT JOIN (
             SELECT code, name, NULL AS icao, city, country FROM airport_overrides
             UNION ALL
             SELECT iata_code, name, CASE WHEN icao_code IN ('', '\\N') THEN NULL ELSE icao_code END, city, country
             FROM openflights_airports WHERE iata_code NOT IN (SELECT code FROM airport_overrides)
           ) AS a ON a.code = c.value LEFT JOIN airport_names AS n ON n.code = c.value""",
        {"codes": json.dumps(list(codes))},
    )
    return {code: (name, icao, place) for code, name, icao, place in result.rows}


def airport_label(info, code):
    """The line beneath an airport's heading: its name and city, whichever we know, or empty."""
    name, _, place = info.get(code, (None, None, None))
    return " · ".join(part for part in (name, place) if part)


async def linked_label(datasette, info, code, foreign):
    """airport_label with its city linked to the city's page (/airports/cities/<market>), and the country of an airport outside the US
    linked to its country page (the label is then markup)."""
    name, _, place = info.get(code, (None, None, None))
    if not place:
        return airport_label(info, code)
    country = place.partition(", ")[2] if foreign else ""
    country = country if country and country_slug(country) in await countries(datasette) and place.endswith(country) else ""
    town_part = place[: -len(country) - 2] if country else place   # "London" of "London, United Kingdom"; all of "Los Angeles, CA"
    market = (await datasette.get_database("t100").execute(
        "SELECT market_id FROM airport_market JOIN market_name USING (market_id) WHERE code = ?", [code])).first()
    linked = Markup('<a href="{}/{}">{}</a>').format(CITIES, market[0], town_part) if market else town_part
    if country:
        linked = Markup('{}, <a href="{}/{}">{}</a>').format(linked, COUNTRIES, country_slug(country), country)
    return Markup(" · ").join(part for part in (name, linked) if part)


def airport_tip(info, code):
    """An airport link's hover, as the charts' airportTip has it: name, IATA (and ICAO) code, then city."""
    name, icao, place = info.get(code, (None, None, None))
    return "\n".join(part for part in (name, f"{code} · {icao}" if icao else code, place) if part)


def airport_abbr(info, code):
    """An airport's code in prose, marked as an abbreviation with the same hover as a heading's code (airport_tip)."""
    return Markup('<abbr title="{}">{}</abbr>').format(airport_tip(info, code), code)


# --- front page stories: rows from the canned queries -> the numbers the prose quotes, or None without data

def prose_count(n):
    """A count for a sentence, to three significant figures: 48,200 / 51.5 million / 1.11 billion.
    The same rules as static/common/numbers.js; tests/fixtures/number_formats.json holds both to them."""
    if n is None or n != n:
        return "–"
    v = float(n)
    sign = "-" if v < 0 else ""
    r = float(f"{abs(v):.3g}")  # round first, so 999,999 is a million
    if r >= 1e9:
        return f"{sign}{r / 1e9:.3g} billion"
    if r >= 1e6:
        return f"{sign}{r / 1e6:.3g} million"
    return f"{sign}{r:,.0f}" if r == int(r) else f"{sign}{r:,}"


def percent(fraction, places=0):
    return f"{fraction * 100:.{places}f}%"


def airport_story(rows):
    """busiest_airports rows (busiest first) -> the top three airports."""
    if len(rows) < 3:
        return None
    return {"airports": [{"code": r["airport"], "city": r["city"], "passengers": prose_count(r["passengers"])}
                         for r in rows[:3]]}


def engine_shares(rows, year):
    """Shares of passenger departures on flights of 3,000 miles or more by BTS aircraft group (6 two jet engines, 7 three, 8 four or more)."""
    deps = {}
    for r in rows:
        if r["year"] == year and r["kind"] == "passenger" and r["distance_band"] >= 3000:
            group = str(r["aircraft_group"])
            deps[group] = deps.get(group, 0) + r["deps"]
    total = sum(deps.values())
    if not total:
        return None
    return {"twin": deps.get("6", 0) / total, "tri_quad": (deps.get("7", 0) + deps.get("8", 0)) / total}


def engine_story(rows, first, last):
    """engines_by_year rows -> how much of the long haul tri- and quad-jets flew in the first year, and twins in the last."""
    a, b = engine_shares(rows, first), engine_shares(rows, last)
    if not a or not b:
        return None
    return {"first_year": first, "last_year": last, "first_tri_quad": percent(a["tri_quad"]), "last_twin": percent(b["twin"])}


def concentration_story(rows, first, last):
    """carrier_concentration rows -> the top-four share at each end and at its lowest year in between (None if that is an end)."""
    shares = {r["year"]: r["top4"] for r in rows}
    if first not in shares or last not in shares:
        return None
    low_year = min(shares, key=lambda y: (shares[y], y))
    dip = low_year not in (first, last)
    return {"first_year": first, "first": percent(shares[first]), "low_year": low_year if dip else None,
            "low": percent(shares[low_year]) if dip else None, "last_year": last, "last": percent(shares[last])}


LEGAL_ENDING = re.compile(r"[\s,]+(?:Inc\.?|Co\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Ltd\.?)$")


def short_airline_name(name):
    """"Southwest Airlines Co." -> "Southwest Airlines": BTS's legal names without the legal ending."""
    previous = None
    while previous != name:
        previous, name = name, LEGAL_ENDING.sub("", name).strip()
    return name


def carrier_shares(rows):
    """top_carriers rows -> short names and one-decimal shares."""
    if not rows:
        return None
    return [{"name": short_airline_name(r["airline_name"]), "share": percent(r["share"], 1)} for r in rows]

def airport_direction(request):
    """What an airport page needs to say which way it counts: the direction, its word for the flight count and the choices."""
    dir = parse_dir(request.args.get("dir"))
    return {"dir": dir, "count_word": count_word(dir), "dir_choices": DIRECTION_CHOICES_AIRPORT}


def airport_region(request, abroad=False):
    """Which airports the busiest-airports table ranks, 'us' or 'abroad' (outside the US; always, for the countries), and what that
    changes: the directions are named for the US and the flight count says which way."""
    region = "abroad" if abroad or request.args.get("region") == "abroad" else "us"
    if region == "us":
        return {"region": region, "abroad": False}
    dir = parse_dir(request.args.get("dir"))
    return {"region": region, "abroad": True, "count_word": count_word(dir, abroad=True), "dir_choices": DIRECTION_CHOICES_ABROAD}


def country_slug(name):
    """A country's address: its name in lower case without accents, anything else between words a dash (static/landing/src/table.js does the same)."""
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


async def countries(datasette):
    """The countries outside the US that appear in the data, as {slug: name}: what follows the first comma of an airport's city name."""
    result = await datasette.get_database("t100").execute(
        "SELECT DISTINCT SUBSTR(city_name, INSTR(city_name, ', ') + 2) FROM airport_dir_year WHERE wac NOT BETWEEN 1 AND 93 AND city_name LIKE '%, %'")
    return {country_slug(r[0]): r[0] for r in result.rows}


async def country_page(datasette, request):
    """Every airport of one country outside the US, with its flights to and from the US, grouped by city."""
    slug = request.url_vars["slug"]
    name = (await countries(datasette)).get(slug)
    if name is None:
        raise NotFound(f"No country {slug}")
    min_year, max_year = year_range(datasette)
    html = await datasette.render_template(
        "country.html",
        {"min_year": min_year, "max_year": max_year, "country": name, "crumbs": trail(datasette, ("airports", "/airports"), ("countries", COUNTRIES), (name, None)),
         "dir_choices": DIRECTION_CHOICES_ABROAD, "dir": parse_dir(request.args.get("dir")), "count_word": count_word(parse_dir(request.args.get("dir")), abroad=True),
         "years": list(range(max_year, min_year - 1, -1))},
        request=request,
    )
    return Response.html(html)


async def globe_page(datasette, request):
    origin = (request.url_vars.get("origin") or "").upper()
    steps = [("airports", "/airports"), (origin, f"/airports/{origin}"), ("globe", None)] if origin else [("airports", "/airports"), ("globe", None)]
    html = await datasette.render_template(
        "globe.html",
        {"origin": origin, "crumbs": trail(datasette, *steps), "foreign": await is_foreign(datasette, origin), "max_year": year_range(datasette)[1],
         "label": await linked_label(datasette, await airport_info(datasette, [origin]), origin, await is_foreign(datasette, origin)) if origin else "", **airport_direction(request)},
        request=request,
    )
    return Response.html(html)


async def routes_globe_page(datasette, request):
    """SPIKE: a year's busiest airport pairs on the globe, or on a flat or azimuthal map; its settings are in the URL."""
    html = await datasette.render_template(
        "routes_globe.html", {"crumbs": trail(datasette, ("airports", "/airports"), ("globe", "/airports/globe"), ("routes", None)), "max_year": year_range(datasette)[1]},
        request=request,
    )
    return Response.html(html)


def year_range(datasette):
    config = datasette.plugin_config("t100_globe") or {}
    return config.get("min_year", 1990), config.get("max_year", 2025)


# the busiest-airports table's address for each grouping (static/landing/src/table.js has the same), and its name in the crumbs
TABLE_PATHS = {"airport": "/airports", "city": CITIES, "country": COUNTRIES}
TABLE_CRUMBS = {"city": "cities", "country": "countries"}


def airports_table(group):
    """The busiest-airports table, which was the front page before the front page told stories, grouped by airport, city or
    (abroad only, so the address means abroad) country. Its first addresses for the groupings, /airports?group=city and
    ?region=abroad&group=country, move to their own."""

    async def view(datasette, request):
        asked = request.args.get("group")
        if group == "airport" and asked in ("city", "country"):
            args = [(k, v) for k in request.args.keys() if k != "group" and not (asked == "country" and k == "region") for v in request.args.getlist(k)]
            if asked == "city" or request.args.get("region") == "abroad":
                return Response.redirect(TABLE_PATHS[asked] + (f"?{urlencode(args)}" if args else ""), status=301)
        min_year, max_year = year_range(datasette)
        crumbs = [("airports", None)] if group == "airport" else [("airports", "/airports"), (TABLE_CRUMBS[group], None)]
        html = await datasette.render_template(
            "airports.html",
            {"min_year": min_year, "max_year": max_year, "group": group, "things": TABLE_CRUMBS.get(group, "airports"), "crumbs": trail(datasette, *crumbs),
             **airport_direction(request), **airport_region(request, abroad=group == "country"),
             "ranks": [("all", "all years")] + [(str(y), str(y)) for y in range(max_year, min_year - 1, -1)]},
            request=request,
        )
        return Response.html(html)

    return view


# the most-dedicated page: one table per measure; the pool is how many of the biggest airports compete (see the dedicated_airports query)
DEDICATED_TABLES = (
    {"measure": "passengers", "title": "Passengers", "pool": 100, "unit": "passengers", "query": ""},
    # the airport page's own settings (measure, kind of flight) that show the same thing: freight on every flight, belly cargo included
    {"measure": "freight", "title": "Freight", "pool": 25, "unit": "short tons", "query": "?measure=freight&flights=all"},
)
LB_PER_SHORT_TON = 2000


def dedicated_rows(rows, measure):
    """dedicated_airports rows -> table rows with the shares and totals as the page prints them (freight in short tons, not pounds)."""
    scale = LB_PER_SHORT_TON if measure == "freight" else 1
    return [{"code": r["airport"], "city": r["city"], "size_rank": r["size_rank"],
             "airline": short_airline_name(r["group_name"]), "airline_id": r["group_id"],
             "share": percent(r["share"], 1), "airline_total": prose_count(r["airline_total"] / scale), "total": prose_count(r["total"] / scale)}
            for r in rows]


async def dedicated_airports_page(datasette, request):
    """Airports where one airline group carries most of what leaves, for passengers and for freight, in one year."""
    min_year, max_year = year_range(datasette)
    year = max_year
    try:
        asked = int(request.args.get("year", ""))
        year = asked if min_year <= asked <= max_year else max_year
    except ValueError:
        pass
    tables = []
    for t in DEDICATED_TABLES:
        rows = await story(datasette, "dedicated_airports", lambda rows, m=t["measure"]: dedicated_rows(rows, m), {"year": year, "measure": t["measure"]})
        tables.append({**t, "rows": rows})
    info = await airport_info(datasette, {r["code"] for t in tables for r in t["rows"] or []})
    for t in tables:
        for r in t["rows"] or []:
            r["tip"] = airport_tip(info, r["code"])
    html = await datasette.render_template(
        "airports_dedicated.html",
        {"min_year": min_year, "max_year": max_year, "year": year, "tables": tables,
         "crumbs": trail(datasette, ("airports", "/airports"), ("most dedicated", None))},
        request=request,
    )
    return Response.html(html)


# the risers-and-fallers page: how fast each US airport's passengers, flights or destinations grew between two years against the median
# airport (airport_movers). Each measure has the smallest airports it can start from, a default giving about as many airports (100 to 150)
MOVERS_MEASURES = {
    "passengers": {"label": "Passengers", "default": 500_000,
                   "sizes": ((100_000, "100,000"), (500_000, "500,000"), (1_000_000, "1 million"), (5_000_000, "5 million"))},
    "flights": {"label": "Flights", "default": 10_000, "sizes": ((5_000, "5,000"), (10_000, "10,000"), (25_000, "25,000"), (50_000, "50,000"))},
    "destinations": {"label": "Destinations", "default": 10, "sizes": ((5, "5"), (10, "10"), (20, "20"), (40, "40"))},
}
MOVERS_DEFAULT_MEASURE = "passengers"
MOVERS_LISTED = 10


def multiple(v):
    """A ratio as the tables print it: ×4.84, ×0.333, ×1,200 (three significant figures), and <×0.001 for anything smaller."""
    if v is None or v != v:
        return "–"
    if 0 < v < 0.001:
        return "<×0.001"
    return f"×{v:,.0f}" if v >= 1000 else f"×{v:.3g}"


def movers_settings(request, min_year, max_year):
    """(first year, last year, measure, smallest airport in the first year) from the query string, each falling back to its default.
    The smallest is of the measure chosen, so one left over from another measure is not one of its sizes and becomes its default."""
    def whole(key):
        try:
            return int(request.args.get(key, ""))
        except ValueError:
            return None

    first, last = whole("from"), whole("to")
    if first is None or last is None or not (min_year <= first < last <= max_year):
        first, last = min_year, max_year
    asked = request.args.get("measure", "")
    measure = asked if asked in MOVERS_MEASURES else MOVERS_DEFAULT_MEASURE
    config = MOVERS_MEASURES[measure]
    size = whole("min")
    return first, last, measure, size if size in dict(config["sizes"]) else config["default"]


def movers_tables(rows):
    """airport_movers rows (fastest first) -> the sentence's numbers and the risers and fallers tables' rows."""
    shown = lambda r: {"code": r["airport"], "city": r["city"], "then": prose_count(r["value_from"]), "now": prose_count(r["value_to"]),
                       "growth": multiple(r["ratio"]), "against": multiple(r["vs_median"]), "peak_year": r["peak_year"],
                       "vs_peak": percent(r["vs_peak"])}
    # an airport with under 1% of its first year's figure left has probably lost its service: it is named below the tables,
    # and is in neither the median (the query leaves it out) nor the tables, the charts or the total
    lost = [r for r in rows if r["lost"]]
    rows = [r for r in rows if not r["lost"]]
    if not rows:
        return {}
    before, after = sum(r["value_from"] for r in rows), sum(r["value_to"] for r in rows)
    return {
        "median": f"{rows[0]['median_ratio']:.3g}", "together": f"{after / before:.3g}",
        "risers": [shown(r) for r in rows if (r["vs_median"] or 0) > 1][:MOVERS_LISTED],
        "fallers": [shown(r) for r in reversed(rows) if r["vs_median"] is not None and r["vs_median"] < 1][:MOVERS_LISTED],
        "lost": [shown(r) for r in sorted(lost, key=lambda r: -r["value_from"])],
    }


async def airport_movers_page(datasette, request):
    """Risers and fallers: the airports growing fastest and slowest against the median airport between two years, as tables, and (with scripts) charts."""
    min_year, max_year = year_range(datasette)
    first, last, measure, size = movers_settings(request, min_year, max_year)
    config = MOVERS_MEASURES[measure]
    params = {"measure": measure, "from_year": first, "to_year": last, "min_value": size}
    movers = await story(datasette, "airport_movers", lambda rows: movers_tables(rows) if rows else {}, params)
    if movers:
        info = await airport_info(datasette, {r["code"] for t in ("risers", "fallers", "lost") for r in movers[t]})
        for t in ("risers", "fallers", "lost"):
            for r in movers[t]:
                r["tip"] = airport_tip(info, r["code"])
    html = await datasette.render_template(
        "airports_movers.html",
        {"min_year": min_year, "max_year": max_year, "first": first, "last": last, "measure": measure, "label": config["label"],
         "noun": measure, "measures": [(key, c["label"]) for key, c in MOVERS_MEASURES.items()],
         "size": size, "sizes": config["sizes"], "size_label": dict(config["sizes"])[size], "movers": movers,
         "crumbs": trail(datasette, ("airports", "/airports"), ("risers and fallers", None))},
        request=request,
    )
    return Response.html(html)


async def canned(datasette, name, params=None):
    """Rows of one of datasette.yml's canned queries as dicts, so the prose quotes the same numbers the charts fetch."""
    sql = datasette.config["databases"]["t100"]["queries"][name]["sql"]
    result = await datasette.get_database("t100").execute(sql, params or {})
    return [dict(row) for row in result.rows]


async def story(datasette, name, tell, params=None):
    """tell(rows of the canned query `name`), or None if the query fails: one broken query costs its section, not the page."""
    try:
        rows = await canned(datasette, name, params)
    except Exception:
        log.exception("front page query %s failed", name)
        return None
    return tell(rows)


# the busiest-airports table's settings; the front page used to be that table
TABLE_PARAMS = ("year", "sort")


async def home_page(datasette, request):
    if any(request.args.get(key) is not None for key in TABLE_PARAMS):
        return Response.redirect(f"/airports?{request.query_string}", status=301)
    min_year, max_year = year_range(datasette)
    airports = await story(datasette, "busiest_airports", airport_story, {"year": max_year})
    if airports:
        info = await airport_info(datasette, [x["code"] for x in airports["airports"]])
        for x in airports["airports"]:
            x["abbr"] = airport_abbr(info, x["code"])
    html = await datasette.render_template(
        "home.html",
        {
            "min_year": min_year,
            "max_year": max_year,
            "crumbs": trail(datasette),
            "airports": airports,
            "engines": await story(datasette, "engines_by_year", lambda rows: engine_story(rows, min_year, max_year)),
            "concentration": await story(datasette, "carrier_concentration", lambda rows: concentration_story(rows, min_year, max_year)),
            "carriers": await story(datasette, "top_carriers", carrier_shares, {"year": max_year}),
            # each section ends with its own views line, none of them the page you're on
            "section_views": {s: [{**v, "current": False} for v in views_for(f"/{s}")] for s in ("airports", "aircraft", "airlines")},
        },
        request=request,
    )
    return Response.html(html)


MATRIX_SETTINGS = ("n", "group", "rank", "year", "flown", "scale", "open")  # the destinations matrix's settings, which mean nothing to the charts that took its address


async def airport_years(datasette, code):
    """The first and last years with flights from or to the airport, or (None, None) when it has none."""
    result = await datasette.get_database("t100").execute(
        "SELECT MIN(year), MAX(year) FROM airport_dir_year WHERE airport = ? AND deps + arrs > 0", [code])
    first, last = result.first()
    return first, last


# how far down the size ranking a rank is worth stating, and how far down the dedicated ranking (the dedicated page lists ten)
SIZE_RANK_LIMIT = 100
DEDICATED_RANK_LIMIT = 10
LB_PER_TON = 2000


def ordinal(n):
    """1st, 2nd, 3rd, 4th, 11th, 112th."""
    n = int(n)
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def rank_sentences(code, year, rows, size_limit=SIZE_RANK_LIMIT, dedicated_limit=DEDICATED_RANK_LIMIT):
    """The line under a US airport's heading from its airport_ranks rows (one per measure it has): what it handled in `year`, how it
    ranks among the US airports (for the top `size_limit`), and, for the top `dedicated_limit` of the pool the most-dedicated page
    ranks, which airline carried most of it. Markup; empty when the airport had neither passengers nor freight."""
    by = {r["measure"]: r for r in rows}
    if not by:
        return ""
    amount = {"passengers": lambda r: f"{prose_count(r['total'])} passengers", "freight": lambda r: f"{prose_count(r['total'] / LB_PER_TON)} tons of freight"}
    parts, ranked_before = [], False
    for measure in ("passengers", "freight"):
        r = by.get(measure)
        if not r:
            continue
        text = amount[measure](r)
        if r["size_rank"] <= size_limit:
            place = "" if r["size_rank"] == 1 else f"{ordinal(r['size_rank'])} "   # the busiest, not the 1st busiest
            if ranked_before:
                text += f", the {place}busiest"
            else:
                text += f", making it the {place}busiest airport in the US" + (" for freight" if measure == "freight" else "")
            ranked_before = True
        parts.append(text)
    # "9.15 million passengers, making it the 48th busiest airport in the US, and 546,000 tons of freight, 17th busiest";
    # a part with no rank joins with a plain "and"
    first = parts[0]
    sentence = Markup("In {}, {} had {}").format(year, code, first)
    for part in parts[1:]:
        sentence += Markup("{}{}").format(", and " if ", " in first else " and ", part)
    sentence += "."
    dedicated = []
    for measure, noun, verb in (("passengers", "passenger flights", "carrying {} of its passengers"), ("freight", "freight", "carrying {} of it")):
        r = by.get(measure)
        if r and r["dedicated_rank"] and r["dedicated_rank"] <= dedicated_limit:
            airline = re.sub(r"\s*\(incl\..*?\)", "", short_airline_name(r["group_name"]))   # "Southwest (incl. AirTran)" is just Southwest here
            dedicated.append((measure, noun, ordinal(r["dedicated_rank"]), airline, percent(r["share"], 1), verb))
    if dedicated:
        link = f"/airports/dedicated?year={year}"   # the first mention links to the page that ranks them
        pieces = [Markup('the {} {} airport for {}, with {} {}').format(o, Markup(f'<a href="{link}">most dedicated</a>') if i == 0 else "most dedicated", noun, airline, verb.format(share))
                  for i, (_, noun, o, airline, share, verb) in enumerate(dedicated)]
        sentence += Markup(" It was also {}.").format(Markup(", and ").join(pieces))
    return sentence


async def airport_rank_line(datasette, origin, foreign):
    """rank_sentences for the latest full year, or empty for an airport outside the US or one that did not fly then."""
    if foreign:
        return ""
    year = year_range(datasette)[1]
    try:
        rows = await canned(datasette, "airport_ranks", {"origin": origin, "year": year})
    except Exception:
        log.exception("airport_ranks failed for %s", origin)
        return ""
    return rank_sentences(origin, year, rows)


def airport_view(template, crumb):
    """One of an airport's views: its charts over time (no crumb of its own), its destinations matrix, or what changed."""

    async def view(datasette, request):
        origin = request.url_vars["origin"].upper()
        if template == "airport.html" and any(k in request.args for k in MATRIX_SETTINGS):
            return Response.redirect(f"/airports/{origin}/destinations?{request.query_string}", status=301)
        first, last = await airport_years(datasette, origin)
        steps = [("airports", "/airports"), (origin, f"/airports/{origin}"), (crumb, None)] if crumb else [("airports", "/airports"), (origin, None)]
        html = await datasette.render_template(
            template,
            {
                "origin": origin,
                "first_year": first,
                "last_year": last,
                "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
                "min_year": year_range(datasette)[0],
                "crumbs": trail(datasette, *steps),
                "foreign": await is_foreign(datasette, origin),
                "label": await linked_label(datasette, await airport_info(datasette, [origin]), origin, await is_foreign(datasette, origin)),
                "rank_line": await airport_rank_line(datasette, origin, await is_foreign(datasette, origin)) if template == "airport.html" else "",
                **airport_direction(request),
            },
            request=request,
        )
        return Response.html(html)

    return view


airport_page = airport_view("airport.html", None)
routes_page = airport_view("routes.html", "destinations")
airport_changes_page = airport_view("airport_changes.html", "changes")


def route_view(template, table):
    """A route's page, in one of its views: over time (the chart) or the table, for all years or one."""

    async def view(datasette, request):
        origin = request.url_vars["origin"].upper()
        dest = request.url_vars["dest"].upper()
        year = request.url_vars.get("year") or ""
        here = f"/airports/{origin}/{dest}{f'/{year}' if year else ''}"
        steps = [("airports", "/airports"), (origin, f"/airports/{origin}")]
        # going up from a year keeps it, marked on the route's chart over time
        steps += [(dest, f"/airports/{origin}/{dest}?year={year}"), (year, here if table else None)] if year else [(dest, here if table else None)]
        if table:
            steps.append(("table", None))
        info = await airport_info(datasette, [origin, dest])
        dir = parse_dir(request.args.get("dir"))
        names = [await linked_label(datasette, info, c, await is_foreign(datasette, c)) or c for c in (origin, dest)]
        # the year in focus: the page's own, or the one marked on the chart over time (?year=), if it's one of the data's
        low, high = year_range(datasette)
        marked = request.args.get("year", "")
        focus = year or (marked if not table and marked.isdigit() and low <= int(marked) <= high else "")
        matrix_query = "&".join(f"{k}={v}" for k, v in (("dir", dir), ("year", focus)) if v)
        matrix_query = f"?{matrix_query}" if matrix_query else ""
        html = await datasette.render_template(
            template,
            {"origin": origin, "dest": dest, "year": year, "min_year": year_range(datasette)[0], "max_year": year_range(datasette)[1],
             "view": "table" if table else "", "crumbs": trail(datasette, *steps),
             "dir": dir, "heading": route_heading(origin, dest, dir), "count_word": route_count_word(dir),
             # the heading's codes, in its order, each opening that airport's destinations counted the same way (and ranked by the year)
             "heading_codes": [{"code": c, "href": f"/airports/{c}/destinations{matrix_query}", "tip": airport_tip(info, c)}
                               for c in ((dest, origin) if dir == "in" else (origin, dest))],
             "heading_arrow": "→" if dir else "↔",
             "origin_abbr": airport_abbr(info, origin),
             # the same direction at the reversed address is the other way: /B/A?dir=out is B → A
             "other_way": route_heading(dest, origin, dir) if dir else "",
             "dir_choices": DIRECTION_CHOICES_ROUTE(origin, dest),
             "label": Markup({"": "{0} ↔ {1}", "out": "{0} → {1}", "in": "{1} → {0}"}[dir]).format(*names)},
            request=request,
        )
        return Response.html(html)

    return view


route_page = route_view("route.html", table=False)
route_table_page = route_view("route_table.html", table=True)


ROLLUP_PAGES = {
    "airlines": {"title": "Airlines", "crumb": "airlines", "noun": "airlines", "query": "carrier_group_by_year", "key": "group_name"},
    "airports": {"title": "Airports", "crumb": "airports", "noun": "airports", "query": "airport_by_year", "key": "origin"},
    # every airline's busiest airport pairs: one of the airports section's views, at /airports/routes
    "toproutes": {"title": "Routes", "crumb": "airports", "noun": "routes", "query": "top_routes_by_year", "key": "route"},
    "aircraft": {"title": "Aircraft families", "crumb": "aircraft", "noun": "families", "query": "aircraft_by_year", "key": "family"},
}


def rollup_page(kind):
    """A matrix of one rollup (merged airline groups) by year, for all US air traffic."""

    async def view(datasette, request):
        page = ROLLUP_PAGES[kind]
        html = await datasette.render_template(
            "rollup.html",
            {
                "kind": kind,
                "page": page,
                "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
                "crumbs": trail(datasette, (page["crumb"], f"/{page['crumb']}"), ("routes" if kind == "toproutes" else "over time", None)),
                **({**airport_direction(request), **airport_region(request)} if kind == "airports" else {}),
            },
            request=request,
        )
        return Response.html(html)

    return view


# "San Francisco, CA" -> "San Francisco", as the routes matrix names a city pair
town = lambda name: name.split(", ")[0]


def weighted_distance(rows):
    """Miles between two cities: their airport pairs' distances weighted by passengers, or by flights when none carried any,
    as rebuild_top_market_year weighs them for the routes matrix."""
    for measure in ("passengers", "deps"):
        flown = [(r["distance"], r[measure] or 0) for r in rows if r["distance"] and r[measure]]
        if flown:
            return round(sum(d * w for d, w in flown) / sum(w for _, w in flown))
    return None


async def city_pair_page(datasette, request):
    """A pair of BTS city markets, in the order the address gives them: a matrix of its airport pairs by year, like the routes
    matrix's. Any two markets with flights between them have a page, read live from route_year_totals (market_pairs_by_year).
    ?a= or ?b= narrows one side to one of its airports (?b=VNY: New York ↔ Van Nuys); narrowed to one on each side it is a
    route, and goes to the route's page."""
    a, b = request.url_vars["a"], request.url_vars["b"]
    db = datasette.get_database("t100")
    names = dict((await db.execute("SELECT market_id, name FROM market_name WHERE market_id IN (?, ?)", [a, b])).rows)
    rows = await canned(datasette, "market_pairs_by_year", {"ma": a, "mb": b}) if a != b and len(names) == 2 else []
    if not rows:
        raise NotFound(f"No city pair {a} and {b}")
    # each side's airports, busiest first (by passengers, then flights, over all years)
    totals = {}
    for r in rows:
        t = totals.setdefault((r["origin"], r["dest"]), [0, 0])
        t[0] += r["passengers"] or 0
        t[1] += r["deps"] or 0
    pairs = sorted(totals, key=lambda k: (-totals[k][0], -totals[k][1]))
    sides = [list(dict.fromkeys(pair[i] for pair in pairs)) for i in (0, 1)]
    # the narrowing asked for, if it is one of that side's airports (anything else is ignored)
    chosen = [(request.args.get(k) or "").upper() for k in ("a", "b")]
    chosen = [c if c in side else "" for c, side in zip(chosen, sides)]
    year = request.args.get("year", "")
    if all(chosen):
        return Response.redirect(f"/airports/{chosen[0]}/{chosen[1]}" + (f"?year={year}" if year.isdigit() else ""))
    shown = [r for r in rows if (not chosen[0] or r["origin"] == chosen[0]) and (not chosen[1] or r["dest"] == chosen[1])]

    def narrowed(i, code):
        """This page's address with side i narrowed to code (or widened, for None), its other settings kept."""
        args = [(k, v) for k in request.args.keys() if k not in ("a", "b") for v in request.args.getlist(k)]
        args += [(k, c) for k, c in zip(("a", "b"), chosen) if k != "ab"[i] and c] + ([("ab"[i], code)] if code else [])
        return f"{CITIES}/{a}/{b}" + (f"?{urlencode(args)}" if args else "")

    info = await airport_info(datasette, set(sides[0]) | set(sides[1]))
    # each code narrows its side to it; the one chosen is marked, not linked
    codes = lambda i: [Markup("<strong>{}</strong>").format(airport_abbr(info, c)) if c == chosen[i]
                       else Markup('<a href="{}">{}</a>').format(narrowed(i, c), airport_abbr(info, c)) for c in sides[i]]
    towns = [town(names[a]), town(names[b])]
    title = " ↔ ".join(chosen[i] or towns[i] for i in (0, 1))
    # the heading's two sides each open their own page, as a route heading's codes do: a city its city page (the first up a
    # level, the second across), an airport it is narrowed to its destinations
    market_names = (names[a], names[b])
    heading = Markup(" ↔ ").join(
        Markup('<a href="/airports/{0}/destinations" title="{1}">{0}</a>').format(chosen[i], airport_tip(info, chosen[i])) if chosen[i]
        else Markup('<a href="{}/{}" title="{}">{}</a>').format(CITIES, (a, b)[i], market_names[i], towns[i]) for i in (0, 1))
    min_year, max_year = year_range(datasette)
    steps = [("airports", "/airports"), ("cities", CITIES), (towns[0], f"{CITIES}/{a}")]
    steps += [(towns[1], f"{CITIES}/{a}/{b}"), (chosen[0] or chosen[1], None)] if any(chosen) else [(towns[1], None)]
    html = await datasette.render_template(
        "city_pair.html",
        {"ma": a, "mb": b, "title": title, "heading": heading, "name_a": names[a], "name_b": names[b], "airports_a": codes(0), "airports_b": codes(1),
         "chosen_a": chosen[0], "chosen_b": chosen[1], "town_a": towns[0], "town_b": towns[1],
         "widen_a": narrowed(0, None), "widen_b": narrowed(1, None),
         "pair_count": len({(r["origin"], r["dest"]) for r in shown}), "distance": weighted_distance(shown), "latest_year": max_year,
         # as a route's trail is airports / ORD / LAX: airports / cities, the first city, then the second, then the airport it is narrowed to
         "crumbs": trail(datasette, *steps)},
        request=request,
    )
    return Response.html(html)


async def city_page(datasette, request):
    """A BTS city market: its airports, then the destinations matrix of all of them together (market_routes_by_year), whose
    cities lead on to the city pair pages."""
    market = request.url_vars["market"]
    db = datasette.get_database("t100")
    name = (await db.execute("SELECT name FROM market_name WHERE market_id = ?", [market])).first()
    min_year, max_year = year_range(datasette)
    # the market's airports with flights, busiest first: by passengers in the latest year, then over all years
    airports = (await db.execute(
        """SELECT airport FROM airport_dir_year
           WHERE airport IN (SELECT code FROM airport_market WHERE market_id = :market)
           GROUP BY airport HAVING SUM(deps + arrs) > 0
           ORDER BY SUM(CASE WHEN year = :latest THEN passengers_out + passengers_in END) DESC NULLS LAST,
             SUM(passengers_out + passengers_in) DESC, SUM(deps + arrs) DESC, airport""", {"market": market, "latest": max_year})).rows
    if not name or not airports:
        raise NotFound(f"No city {market}")
    codes = [r[0] for r in airports]
    info = await airport_info(datasette, codes)
    foreign = await is_foreign(datasette, codes[0])  # a market is all in the US or all abroad
    html = await datasette.render_template(
        "city.html",
        {"market": market, "name": name[0], "town": town(name[0]), "origin": town(name[0]),
         "airports": [Markup('<a href="/airports/{}">{}</a>').format(c, airport_abbr(info, c)) for c in codes],
         "latest_year": max_year, "min_year": min_year, "foreign": foreign,
         "crumbs": trail(datasette, ("airports", "/airports"), ("cities", CITIES), (town(name[0]), None)),
         **airport_direction(request)},
        request=request,
    )
    return Response.html(html)


MATRIX_ONLY = ("n", "rank", "scale")  # the airlines matrix's settings that mean nothing to the table that took its address


async def airline_table_page(datasette, request):
    """Every airline group, ranked, with its members inside; old links to the matrix that had /airlines go on to it."""
    if any(k in request.args for k in MATRIX_ONLY):
        return Response.redirect(f"/airlines/over-time?{request.query_string}", status=301)
    html = await datasette.render_template(
        "airline_table.html",
        {
            "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
            "crumbs": trail(datasette, ("airlines", None)),
        },
        request=request,
    )
    return Response.html(html)


async def groups_page(datasette, request):
    html = await datasette.render_template(
        "engines.html",
        {"crumbs": trail(datasette, ("aircraft", "/aircraft"), ("groups", None))},
        request=request,
    )
    return Response.html(html)


def aircraft_view(template, crumb):
    async def view(datasette, request):
        html = await datasette.render_template(
            template,
            {
                "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
                "crumbs": trail(datasette, ("aircraft", "/aircraft"), (crumb, None)) if crumb else trail(datasette, ("aircraft", None)),
            },
            request=request,
        )
        return Response.html(html)

    return view


aircraft_table_page = aircraft_view("aircraft_table.html", None)
aircraft_makers_page = aircraft_view("aircraft_makers.html", "makers")


def slugify(name):
    """"DC-9 / MD-80 / MD-90" -> "dc-9-md-80-md-90". The page's JavaScript uses the same rule."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def and_join(names):
    """'A', 'A and B', 'A, B and C'."""
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


async def family_facts(datasette, family):
    """The line under a family's heading: who made its aircraft and what kind they are ("Made by McDonnell Douglas. Type: jet,
    twin-engine."), commonest first when a family spans several makers or kinds; empty when BTS doesn't say."""
    rows = (await datasette.get_database("t100").execute(
        """SELECT t.maker, t.kind, COUNT(*) FROM aircraft_family f JOIN aircraft_types t ON t.ac_typeid = f.aircraft_type
           WHERE f.family = ? GROUP BY t.maker, t.kind ORDER BY COUNT(*) DESC, t.maker, t.kind""", [family])).rows
    makers = list(dict.fromkeys(m for m, _, _ in rows if m))
    kinds = list(dict.fromkeys(k[0].lower() + k[1:] for _, k, _ in rows if k))
    parts = ([f"Made by {and_join(makers)}."] if makers else []) + ([f"Type: {'; '.join(kinds)}."] if kinds else [])
    return " ".join(parts)


async def family_page(datasette, request):
    slug = request.url_vars["slug"]
    result = await datasette.get_database("t100").execute("SELECT DISTINCT family FROM family_year")
    family = next((r[0] for r in result.rows if slugify(r[0]) == slug), None)
    if family is None:
        raise NotFound(f"No aircraft family {slug}")
    html = await datasette.render_template(
        "family.html",
        {"family": family, "facts": await family_facts(datasette, family), "min_year": year_range(datasette)[0], "max_year": year_range(datasette)[1], "crumbs": trail(datasette, ("aircraft", "/aircraft"), (family, None))},
        request=request,
    )
    return Response.html(html)


async def aircraft_page(datasette, request):
    """One aircraft (a BTS aircraft type) under its family: /aircraft/<family>/<aircraft>, both slugs of the names the table shows."""
    family_slug, aircraft_slug = request.url_vars["slug"], request.url_vars["aircraft"]
    rows = (await datasette.get_database("t100").execute(
        """
        SELECT y.aircraft_type, COALESCE(t.name, CASE y.aircraft_type WHEN 'unknown' THEN 'Type not reported' ELSE 'Type ' || y.aircraft_type END),
               COALESCE(f.family, 'Unknown'), COALESCE(t.maker, 'Unknown maker'), COALESCE(t.kind, 'Unknown'), MIN(CASE WHEN y.deps > 0 THEN y.year END), MAX(CASE WHEN y.deps > 0 THEN y.year END)
        FROM type_year y LEFT JOIN aircraft_types t ON t.ac_typeid = y.aircraft_type LEFT JOIN aircraft_family f ON f.aircraft_type = y.aircraft_type
        GROUP BY y.aircraft_type
        """
    )).rows
    found = next((r for r in rows if slugify(r[2]) == family_slug and slugify(r[1]) == aircraft_slug), None)
    if found is None:
        raise NotFound(f"No aircraft {aircraft_slug} in {family_slug}")
    type_id, name, family, maker, kind, first, last = found
    html = await datasette.render_template(
        "aircraft.html",
        {"type_id": type_id, "name": name, "family": family, "family_slug": family_slug, "maker": maker, "kind": kind, "first": first, "last": last,
         "min_year": year_range(datasette)[0], "max_year": year_range(datasette)[1],
         "crumbs": trail(datasette, ("aircraft", "/aircraft"), (family, f"/aircraft/{family_slug}"), (name, None))},
        request=request,
    )
    return Response.html(html)


async def is_foreign_airline(datasette, airline_ids):
    """True if BTS lists every one of these airlines as foreign (carrier group 0, which matches the code on their segments).

    US airlines report every flight they operate; foreign airlines report only flights to or from a US airport."""
    if not airline_ids:
        return False
    marks = ",".join("?" * len(airline_ids))
    row = (await datasette.get_database("t100").execute(
        f"SELECT COUNT(*), SUM(carrier_group <> '0') FROM carriers WHERE airline_id IN ({marks})", list(airline_ids))).first()
    return row[0] > 0 and not row[1]


async def resolve_airline(datasette, slug):
    """What /airlines/<slug> is: a group of airlines (a merger such as Delta with Northwest, or one airline on its own)
    or one member of a merged group. Returns the ids to query with, the names, and the group's members; 404 if neither."""
    db = datasette.get_database("t100")
    members = (await db.execute(
        """
        SELECT d.airline_id, COALESCE(g.airline_name, d.group_name), MIN(d.year), MAX(d.year), SUM(d.deps)
        FROM carrier_group_year d LEFT JOIN carrier_group g ON g.airline_id = d.airline_id
        WHERE d.group_id = ? AND d.deps > 0 GROUP BY d.airline_id ORDER BY SUM(d.deps) DESC
        """,
        [slug],
    )).rows
    if members:
        group_name = (await db.execute("SELECT group_name FROM carrier_group_year WHERE group_id = ? GROUP BY group_name ORDER BY MAX(year) DESC LIMIT 1", [slug])).first()[0]
        return {
            "group": slug, "airline": "", "name": group_name, "parent": None,
            "foreign": await is_foreign_airline(datasette, [m[0] for m in members]),
            "first_year": min(m[2] for m in members), "last_year": max(m[3] for m in members),
            "members": [{"id": m[0], "name": m[1], "first_year": m[2], "last_year": m[3]} for m in members] if len(members) > 1 else [],
        }
    # one airline inside a merged group
    row = (await db.execute(
        """
        SELECT d.group_id, d.group_name, COALESCE(g.airline_name, d.group_name), MIN(d.year), MAX(d.year)
        FROM carrier_group_year d LEFT JOIN carrier_group g ON g.airline_id = d.airline_id
        WHERE d.airline_id = ? AND d.deps > 0 GROUP BY d.group_id, d.group_name, g.airline_name ORDER BY MAX(d.year) DESC LIMIT 1
        """,
        [slug],
    )).first()
    if row is None:
        raise NotFound(f"No airline {slug}")
    return {
        "group": row[0], "airline": slug, "name": row[2], "parent": {"id": row[0], "name": row[1]},
        "foreign": await is_foreign_airline(datasette, [slug]),
        "first_year": row[3], "last_year": row[4], "members": [],
    }


def airline_crumbs(datasette, info, *tail):
    steps = [("airlines", "/airlines")]
    if info["parent"]:
        steps.append((info["parent"]["name"], f"/airlines/{info['parent']['id']}"))
    own = info["airline"] or info["group"]
    steps.append((info["name"], f"/airlines/{own}" if tail else None))
    return trail(datasette, *steps, *tail)


async def airline_globe_page(datasette, request):
    info = await resolve_airline(datasette, request.url_vars["slug"])
    html = await datasette.render_template(
        "airline_globe.html",
        {**info, "own": info["airline"] or info["group"], "crumbs": airline_crumbs(datasette, info, ("map", None))},
        request=request,
    )
    return Response.html(html)


def airline_direction(request):
    """An airline page counts each airport pair with both directions together, or with dir=each each direction on its own;
    its "at least" choices are counted one way and double for a pair (roughly monthly each way)."""
    each = request.args.get("dir") == "each"
    base = 12 if each else 24
    return {"each": each, "min_default": base,
            "min_choices": [(1, "once")] + [(cutoff("out" if each else "", v), f"{cutoff('out' if each else '', v)} times") for v in (12, 52, 365)]}


# --- the October 2002 reporting change: from that month BTS required domestic all-cargo flights to be reported, so most
# before then are missing. Only the airlines whose own flying shows it get the note (see docs/cargo-2002-note.md)

# each airline's domestic all-cargo departures in January-September 2002, October-December 2002 and 2003
REPORTING_2002_SQL = """
SELECT COALESCE(c.airline_id, 'unknown') AS airline_id, MAX(g.airline_name) AS name,
  SUM(CASE WHEN t.year = 2002 AND t.month <= 9 THEN t.departures_performed ELSE 0 END) AS before,
  SUM(CASE WHEN t.year = 2002 AND t.month >= 10 THEN t.departures_performed ELSE 0 END) AS after,
  SUM(CASE WHEN t.year = 2003 THEN t.departures_performed ELSE 0 END) AS next_year
FROM t100 t
LEFT JOIN (SELECT unique_carrier_entity AS entity, MIN(airline_id) AS airline_id FROM carriers GROUP BY 1) c ON c.entity = t.carrier_entity
LEFT JOIN carrier_group g ON g.airline_id = c.airline_id
WHERE t.year IN (2002, 2003) AND t.domestic = 1 AND t.class IN ('G', 'P')
GROUP BY 1
"""


def reporting_2002(rows):
    """Rows of REPORTING_2002_SQL -> {airline_id: {name, before, after}} (monthly rates) for the airlines whose flying shows
    the change: October-December 2002 at 1.5 times their monthly rate before it or more, still there through 2003 (so a
    busy fourth quarter alone doesn't count), and at least 10 a month in both (so a handful of flights doesn't, nor an
    airline that only started in 2003)."""
    found = {}
    for airline_id, name, before, after, next_year in rows:
        was, now, then = before / 9, after / 3, next_year / 12
        if airline_id != "unknown" and min(now, then) >= max(10, 1.5 * was):
            found[airline_id] = {"name": short_airline_name(name or airline_id), "before": was, "after": now}
    return found


async def reporting_2002_airlines(datasette):
    """reporting_2002 for the database, worked out once (about a second) and kept: the 2002 and 2003 data don't change."""
    if not hasattr(datasette, "_t100_reporting_2002"):
        rows = (await datasette.get_database("t100").execute(REPORTING_2002_SQL, custom_time_limit=30_000)).rows
        datasette._t100_reporting_2002 = reporting_2002([tuple(r) for r in rows])
    return datasette._t100_reporting_2002


# notes written by hand, by airline_id, for breaks the test above doesn't find because they come at another date
REPORTING_NOTES = {
    "19917": "UPS freight tonnage grew after January 2001, which appears to be early compliance with the October 2002 reporting change requirement for domestic cargo.",
}


def monthly(rate):
    return "none" if rate == 0 else "almost none" if rate < 0.5 else f"about {prose_count(round(rate))}"


async def reporting_note(datasette, info):
    """The note for an airline page, about its airlines (the group's members, or the one airline): those whose data show the
    October 2002 change, as "Federal Express went from none to about 24,800 a month", then any written by hand
    (REPORTING_NOTES); None when there is nothing to say."""
    found = await reporting_2002_airlines(datasette)
    if info["airline"]:
        ids = [info["airline"]]
    else:
        ids = [r[0] for r in (await datasette.get_database("t100").execute("SELECT airline_id FROM carrier_group WHERE group_id = ?", [info["group"]])).rows]
    parts = []
    shown = sorted((found[i] for i in ids if i in found), key=lambda a: -a["after"])
    if shown:
        first, *rest = shown
        went = ", and ".join([f"{first['name']} went from {monthly(first['before'])} to {monthly(first['after'])} a month",
                              *(f"{a['name']} from {monthly(a['before'])} to {monthly(a['after'])}" for a in rest)])
        parts.append("Airlines only had to report domestic all-cargo flights from October 2002, so most before then are missing. "
                     f"{went} at the end of 2002: that jump is the reporting, not new flying.")
    parts += [REPORTING_NOTES[i] for i in ids if i in REPORTING_NOTES]
    return " ".join(parts) or None


def airline_view(template, tail):
    """An airline's page, in one of its views: over time (its size and airport pairs) or what changed between two years."""

    async def view(datasette, request):
        info = await resolve_airline(datasette, request.url_vars["slug"])
        html = await datasette.render_template(
            template,
            {
                **info, "own": info["airline"] or info["group"],
                "min_year": year_range(datasette)[0], "max_year": year_range(datasette)[1],
                "crumbs": airline_crumbs(datasette, info, *tail),
                "reporting_note": await reporting_note(datasette, info) if template == "airline.html" else None,
                **airline_direction(request),
            },
            request=request,
        )
        return Response.html(html)

    return view


airline_page = airline_view("airline.html", ())
airline_changes_page = airline_view("airline_changes.html", (("changes", None),))
airline_routes_page = airline_view("airline_routes.html", (("routes", None),))
airline_aircraft_page = airline_view("airline_aircraft.html", (("aircraft", None),))


async def about_page(datasette, request):
    config = datasette.plugin_config("t100_globe") or {}
    html = await datasette.render_template(
        "about.html",
        {"min_year": config.get("min_year", 1990), "max_year": config.get("max_year", 2025), "crumbs": trail(datasette, ("about", None))},
        request=request,
    )
    return Response.html(html)


async def changelog_page(datasette, request):
    config = datasette.plugin_config("t100_globe") or {}
    html = await datasette.render_template(
        "changelog.html",
        {"min_year": config.get("min_year", 1990), "max_year": config.get("max_year", 2025), "crumbs": trail(datasette, ("changes", None))},
        request=request,
    )
    return Response.html(html)
