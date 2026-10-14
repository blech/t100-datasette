from datasette import hookimpl
from datasette.utils.asgi import Response


@hookimpl
def register_routes():
    return [
        (r"^/$", landing_page),
        (r"^/routes$", routes_index),
        (r"^/route/(?P<origin>[A-Za-z0-9]{3})/(?P<dest>[A-Za-z0-9]{3})(?:/(?P<year>[0-9]{4}))?$", route_page),
        (r"^/routes/(?P<origin>[A-Za-z0-9]{3})$", routes_page),
        (r"^/globe$", globe_page),
        (r"^/globe/(?P<origin>[A-Za-z0-9]{3})$", globe_page),
    ]


def trail(datasette, *steps):
    """Breadcrumb items for the page header: the site name first, then (label, href) steps.

    The last step is the current page and has no link."""
    site = (datasette.plugin_config("t100_globe") or {}).get("site_name", "t100.husk.org")
    items = [(site, "/"), *steps]
    return [{"label": label, "href": href} for label, href in items[:-1]] + [{"label": items[-1][0], "href": None}]


async def routes_index(datasette, request):
    # there is no page of its own for "all routes"; the landing table is where you pick an airport
    query = request.query_string
    return Response.redirect(f"/?{query}" if query else "/")


async def globe_page(datasette, request):
    origin = (request.url_vars.get("origin") or "").upper()
    steps = [("globe", "/globe" if origin else None)] + ([(origin, None)] if origin else [])
    html = await datasette.render_template(
        "globe.html", {"origin": origin, "crumbs": trail(datasette, *steps)}, request=request
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
        {"origin": origin, "crumbs": trail(datasette, ("routes", "/routes"), (origin, None))},
        request=request,
    )
    return Response.html(html)


async def route_page(datasette, request):
    origin = request.url_vars["origin"].upper()
    dest = request.url_vars["dest"].upper()
    year = request.url_vars.get("year") or ""
    steps = [("routes", "/routes"), (origin, f"/routes/{origin}")]
    steps += [(dest, f"/route/{origin}/{dest}"), (year, None)] if year else [(dest, None)]
    html = await datasette.render_template(
        "route.html",
        {"origin": origin, "dest": dest, "year": year, "crumbs": trail(datasette, *steps)},
        request=request,
    )
    return Response.html(html)
