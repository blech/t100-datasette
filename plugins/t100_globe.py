from datasette import hookimpl
from datasette.utils.asgi import Response


@hookimpl
def register_routes():
    return [
        (r"^/$", landing_page),
        (r"^/route/(?P<origin>[A-Za-z0-9]{3})/(?P<dest>[A-Za-z0-9]{3})(?:/(?P<year>[0-9]{4}))?$", route_page),
        (r"^/routes/(?P<origin>[A-Za-z0-9]{3})$", routes_page),
        (r"^/globe$", globe_page),
        (r"^/globe/(?P<origin>[A-Za-z0-9]{3})$", globe_page),
    ]


async def globe_page(datasette, request):
    origin = (request.url_vars.get("origin") or "").upper()
    html = await datasette.render_template("globe.html", {"origin": origin}, request=request)
    return Response.html(html)


async def landing_page(datasette, request):
    config = datasette.plugin_config("t100_globe") or {}
    html = await datasette.render_template(
        "landing.html",
        {"min_year": config.get("min_year", 1990), "max_year": config.get("max_year", 2025)},
        request=request,
    )
    return Response.html(html)


async def routes_page(datasette, request):
    origin = request.url_vars["origin"].upper()
    html = await datasette.render_template("routes.html", {"origin": origin}, request=request)
    return Response.html(html)


async def route_page(datasette, request):
    html = await datasette.render_template(
        "route.html",
        {
            "origin": request.url_vars["origin"].upper(),
            "dest": request.url_vars["dest"].upper(),
            "year": request.url_vars.get("year") or "",
        },
        request=request,
    )
    return Response.html(html)
