import logging
import re

from datasette import hookimpl
from datasette.utils.asgi import NotFound, Response


CODE = r"[A-Za-z0-9]{3}"
log = logging.getLogger(__name__)


def moved(template):
    """A permanent redirect to `template` (filled from the URL's variables), keeping the query string."""

    async def view(request):
        path = template.format(**request.url_vars)
        return Response.redirect(f"{path}?{request.query_string}" if request.query_string else path, status=301)

    return view


@hookimpl
def register_routes():
    return [
        (r"^/$", home_page),
        (r"^/airports$", airports_index),
        (r"^/airports/globe$", globe_page),
        (rf"^/airports/(?P<origin>{CODE})$", routes_page),
        (rf"^/airports/(?P<origin>{CODE})/globe$", globe_page),
        (rf"^/airports/(?P<origin>{CODE})/(?P<dest>{CODE})(?:/(?P<year>[0-9]{{4}}))?$", route_page),
        (r"^/about$", about_page),
        (r"^/aircraft$", rollup_page("aircraft")),
        (r"^/airlines$", rollup_page("airlines")),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)$", airline_page),
        (r"^/airlines/(?P<slug>[A-Za-z0-9_-]+)/globe$", airline_globe_page),
        # the paths airlines had before the URL used the word the pages do
        (r"^/carriers$", moved("/airlines")),
        (r"^/carriers/(?P<slug>[A-Za-z0-9_-]+)$", moved("/airlines/{slug}")),
        (r"^/carriers/(?P<slug>[A-Za-z0-9_-]+)/globe$", moved("/airlines/{slug}/globe")),
        (r"^/aircraft/engines$", engines_page),
        (r"^/aircraft/(?P<slug>[a-z0-9-]+)$", family_page),
        # the paths the site used before airports came first
        (r"^/globe$", moved("/airports/globe")),
        (r"^/routes$", moved("/airports")),
        (rf"^/globe/(?P<origin>{CODE})$", moved("/airports/{origin}/globe")),
        (rf"^/routes/(?P<origin>{CODE})$", moved("/airports/{origin}")),
        (rf"^/route/(?P<origin>{CODE})/(?P<dest>{CODE})$", moved("/airports/{origin}/{dest}")),
        (rf"^/route/(?P<origin>{CODE})/(?P<dest>{CODE})/(?P<year>[0-9]{{4}})$", moved("/airports/{origin}/{dest}/{year}")),
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
    return first if first in SECTIONS else None


def views_for(path):
    """The other views of the subject a page shows, for the views line under the breadcrumb: [{label, href, current, id}].
    Empty when the subject has only one view (or the path is not one of the site's pages)."""
    parts = [p for p in path.strip("/").split("/") if p]

    def make(*items, current):
        return [{"label": label, "href": href, "current": i == current, "id": id_} for i, (label, href, id_) in enumerate(items)]

    match parts:
        case ["airports"]:
            return make(("Busiest airports", "/airports", None), ("Map", "/airports/globe", None), current=0)
        case ["airports", "globe"]:
            return make(("Busiest airports", "/airports", None), ("Map", "/airports/globe", None), current=1)
        case ["airports", code] if AIRPORT_CODE.match(code):
            c = code.upper()
            return make(("Routes over time", f"/airports/{c}", None), ("Map", f"/airports/{c}/globe", None), current=0)
        case ["airports", code, "globe"] if AIRPORT_CODE.match(code):
            c = code.upper()
            return make(("Routes over time", f"/airports/{c}", None), ("Map", f"/airports/{c}/globe", None), current=1)
        case ["airports", a, b, *rest] if AIRPORT_CODE.match(a) and AIRPORT_CODE.match(b) and len(rest) <= 1 and b.lower() != "globe":
            a, b = a.upper(), b.upper()
            year = f"/{rest[0]}" if rest else ""
            return make((f"{a} → {b}", f"/airports/{a}/{b}{year}", None), (f"{b} → {a}", f"/airports/{b}/{a}{year}", None), current=0)
        case ["aircraft"]:
            return make(("Families", "/aircraft", None), ("Long-haul engines", "/aircraft/engines", None), current=0)
        case ["aircraft", "engines"]:
            return make(("Families", "/aircraft", None), ("Long-haul engines", "/aircraft/engines", None), current=1)
        case ["airlines", slug]:
            return make(("Overview", f"/airlines/{slug}", None), ("Map", f"/airlines/{slug}/globe", "map-link"), current=0)
        case ["airlines", slug, "globe"]:
            return make(("Overview", f"/airlines/{slug}", None), ("Map", f"/airlines/{slug}/globe", None), current=1)
    return []


@hookimpl
def extra_template_vars(request):
    """The header's current section and the page's views, for every template rendered with a request. Prefixed, because
    these are merged over every page's own context, Datasette's included: its database page has a `views` of its own."""
    if request is None:
        return {}
    return {"nav_section": section_of(request.path), "nav_views": views_for(request.path)}


async def is_foreign(datasette, code):
    """True if BTS places the airport outside the US and its territories (its WAC is outside 1-93).

    T-100 only records flights with a US airport at one end, so for these airports only the
    US side of their network is in the data."""
    if not code:
        return False
    result = await datasette.get_database("t100").execute("SELECT origin_wac FROM t100 WHERE origin = ? LIMIT 1", [code])
    row = result.first()
    return bool(row) and row[0] is not None and not 1 <= row[0] <= 93


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
    return {"airports": [{"code": r["origin"], "city": r["origin_city_name"], "passengers": prose_count(r["total_passengers"])}
                         for r in rows[:3]]}


def engine_shares(rows, year):
    """Shares of passenger departures on flights of 3,000 miles or more by BTS aircraft group (6 twin, 7 tri, 8 quad)."""
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

async def globe_page(datasette, request):
    origin = (request.url_vars.get("origin") or "").upper()
    steps = [("airports", "/airports"), (origin, f"/airports/{origin}"), ("globe", None)] if origin else [("airports", "/airports"), ("globe", None)]
    html = await datasette.render_template(
        "globe.html",
        {"origin": origin, "crumbs": trail(datasette, *steps), "foreign": await is_foreign(datasette, origin), "max_year": year_range(datasette)[1]},
        request=request,
    )
    return Response.html(html)


def year_range(datasette):
    config = datasette.plugin_config("t100_globe") or {}
    return config.get("min_year", 1990), config.get("max_year", 2025)


async def airports_index(datasette, request):
    """The busiest-airports table, which was the front page before the front page told stories."""
    min_year, max_year = year_range(datasette)
    html = await datasette.render_template(
        "airports.html",
        {"min_year": min_year, "max_year": max_year, "crumbs": trail(datasette, ("airports", None))},
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
    html = await datasette.render_template(
        "home.html",
        {
            "min_year": min_year,
            "max_year": max_year,
            "crumbs": trail(datasette),
            "airports": await story(datasette, "busiest_airports", airport_story, {"year": max_year}),
            "engines": await story(datasette, "engines_by_year", lambda rows: engine_story(rows, min_year, max_year)),
            "concentration": await story(datasette, "carrier_concentration", lambda rows: concentration_story(rows, min_year, max_year)),
            "carriers": await story(datasette, "top_carriers", carrier_shares, {"year": max_year}),
        },
        request=request,
    )
    return Response.html(html)


async def routes_page(datasette, request):
    origin = request.url_vars["origin"].upper()
    html = await datasette.render_template(
        "routes.html",
        {
            "origin": origin,
            "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
            "crumbs": trail(datasette, ("airports", "/airports"), (origin, None)),
            "foreign": await is_foreign(datasette, origin),
        },
        request=request,
    )
    return Response.html(html)


async def route_page(datasette, request):
    origin = request.url_vars["origin"].upper()
    dest = request.url_vars["dest"].upper()
    year = request.url_vars.get("year") or ""
    steps = [("airports", "/airports"), (origin, f"/airports/{origin}")]
    steps += [(dest, f"/airports/{origin}/{dest}"), (year, None)] if year else [(dest, None)]
    html = await datasette.render_template(
        "route.html",
        {"origin": origin, "dest": dest, "year": year, "crumbs": trail(datasette, *steps)},
        request=request,
    )
    return Response.html(html)


ROLLUP_PAGES = {
    "aircraft": {"title": "Aircraft families", "crumb": "aircraft", "noun": "aircraft families", "query": "family_by_year", "key": "family"},
    "airlines": {"title": "Airlines", "crumb": "airlines", "noun": "airlines", "query": "carrier_group_by_year", "key": "group_name"},
}


def rollup_page(kind):
    """A heat map of one rollup (aircraft families or merged airline groups) by year, for all US air traffic."""

    async def view(datasette, request):
        page = ROLLUP_PAGES[kind]
        html = await datasette.render_template(
            "rollup.html",
            {
                "kind": kind,
                "page": page,
                "latest_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
                "crumbs": trail(datasette, (page["crumb"], None)),
            },
            request=request,
        )
        return Response.html(html)

    return view


async def engines_page(datasette, request):
    html = await datasette.render_template(
        "engines.html",
        {"crumbs": trail(datasette, ("aircraft", "/aircraft"), ("engines", None))},
        request=request,
    )
    return Response.html(html)


def slugify(name):
    """"DC-9 / MD-80 / MD-90" -> "dc-9-md-80-md-90". The page's JavaScript uses the same rule."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


async def family_page(datasette, request):
    slug = request.url_vars["slug"]
    result = await datasette.get_database("t100").execute("SELECT DISTINCT family FROM family_year")
    family = next((r[0] for r in result.rows if slugify(r[0]) == slug), None)
    if family is None:
        raise NotFound(f"No aircraft family {slug}")
    html = await datasette.render_template(
        "family.html",
        {"family": family, "crumbs": trail(datasette, ("aircraft", "/aircraft"), (family, None))},
        request=request,
    )
    return Response.html(html)


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


async def airline_page(datasette, request):
    info = await resolve_airline(datasette, request.url_vars["slug"])
    html = await datasette.render_template(
        "airline.html",
        {
            **info, "own": info["airline"] or info["group"],
            "max_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
            "crumbs": airline_crumbs(datasette, info),
        },
        request=request,
    )
    return Response.html(html)


async def about_page(datasette, request):
    config = datasette.plugin_config("t100_globe") or {}
    html = await datasette.render_template(
        "about.html",
        {"min_year": config.get("min_year", 1990), "max_year": config.get("max_year", 2025), "crumbs": trail(datasette, ("about", None))},
        request=request,
    )
    return Response.html(html)
