import re

from datasette import hookimpl
from datasette.utils.asgi import NotFound, Response


CODE = r"[A-Za-z0-9]{3}"


def moved(template):
    """A permanent redirect to `template` (filled from the URL's variables), keeping the query string."""

    async def view(request):
        path = template.format(**request.url_vars)
        return Response.redirect(f"{path}?{request.query_string}" if request.query_string else path, status=301)

    return view


@hookimpl
def register_routes():
    return [
        (r"^/$", landing_page),
        (r"^/airports$", airports_index),
        (rf"^/airports/(?P<origin>{CODE})$", routes_page),
        (rf"^/airports/(?P<origin>{CODE})/globe$", globe_page),
        (rf"^/airports/(?P<origin>{CODE})/(?P<dest>{CODE})(?:/(?P<year>[0-9]{{4}}))?$", route_page),
        (r"^/globe$", globe_page),
        (r"^/about$", about_page),
        (r"^/aircraft$", rollup_page("aircraft")),
        (r"^/carriers$", rollup_page("carriers")),
        (r"^/carriers/(?P<group>[A-Za-z0-9_-]+)$", airline_page),
        (r"^/carriers/(?P<group>[A-Za-z0-9_-]+)/globe$", airline_globe_page),
        (r"^/aircraft/engines$", engines_page),
        (r"^/aircraft/(?P<slug>[a-z0-9-]+)$", family_page),
        # the paths the site used before airports came first
        (r"^/routes$", airports_index),
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


async def is_foreign(datasette, code):
    """True if BTS places the airport outside the US and its territories (its WAC is outside 1-93).

    T-100 only records flights with a US airport at one end, so for these airports only the
    US side of their network is in the data."""
    if not code:
        return False
    result = await datasette.get_database("t100").execute("SELECT origin_wac FROM t100 WHERE origin = ? LIMIT 1", [code])
    row = result.first()
    return bool(row) and row[0] is not None and not 1 <= row[0] <= 93


async def airports_index(datasette, request):
    # there is no page of its own for "all routes"; the landing table is where you pick an airport
    query = request.query_string
    return Response.redirect(f"/?{query}" if query else "/")


async def globe_page(datasette, request):
    origin = (request.url_vars.get("origin") or "").upper()
    steps = [("airports", "/airports"), (origin, f"/airports/{origin}"), ("globe", None)] if origin else [("globe", None)]
    html = await datasette.render_template(
        "globe.html",
        {"origin": origin, "crumbs": trail(datasette, *steps), "foreign": await is_foreign(datasette, origin)},
        request=request,
    )
    return Response.html(html)


async def landing_page(datasette, request):
    config = datasette.plugin_config("t100_globe") or {}
    html = await datasette.render_template(
        "landing.html",
        {
            "min_year": config.get("min_year", 1990),
            "max_year": config.get("max_year", 2025),
            "crumbs": trail(datasette),
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
    "carriers": {"title": "Airlines", "crumb": "airlines", "noun": "airlines", "query": "carrier_group_by_year", "key": "group_name"},
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


async def airline_name(datasette, group):
    """The airline group's latest name, or a 404 if there is no such group."""
    result = await datasette.get_database("t100").execute(
        "SELECT group_name FROM carrier_group_year WHERE group_id = ? GROUP BY group_name ORDER BY MAX(year) DESC LIMIT 1", [group]
    )
    row = result.first()
    if row is None:
        raise NotFound(f"No airline {group}")
    return row[0]


async def airline_globe_page(datasette, request):
    group = request.url_vars["group"]
    name = await airline_name(datasette, group)
    html = await datasette.render_template(
        "airline_globe.html",
        {"group": group, "name": name, "crumbs": trail(datasette, ("airlines", "/carriers"), (name, f"/carriers/{group}"), ("map", None))},
        request=request,
    )
    return Response.html(html)


async def airline_page(datasette, request):
    group = request.url_vars["group"]
    db = datasette.get_database("t100")
    name = await airline_name(datasette, group)
    row = (name,)
    span = (await db.execute("SELECT MIN(year), MAX(year) FROM carrier_group_year WHERE group_id = ? AND deps > 0", [group])).first()
    members = await db.execute(
        """
        SELECT c.airline_id, c.unique_carrier_name, MIN(c.start_date_source), MAX(c.thru_date_source)
        FROM carrier_group g JOIN carriers c ON c.airline_id = g.airline_id
        WHERE g.group_id = ? GROUP BY c.airline_id, c.unique_carrier_name ORDER BY MIN(c.start_date_source)
        """,
        [group],
    )
    seen = []
    for airline_id, name, *_ in members.rows:
        if name and name not in seen:
            seen.append(name)
    html = await datasette.render_template(
        "airline.html",
        {
            "group": group,
            "name": row[0],
            "first_year": span[0],
            "last_year": span[1],
            "members": seen if len(seen) > 1 else [],
            "max_year": (datasette.plugin_config("t100_globe") or {}).get("max_year", 2025),
            "crumbs": trail(datasette, ("airlines", "/carriers"), (row[0], None)),
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
