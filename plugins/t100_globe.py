from datasette import hookimpl
from datasette.utils.asgi import Response


@hookimpl
def register_routes():
    return [
        (r"^/globe$", globe_page),
        (r"^/globe/(?P<origin>[A-Za-z0-9]{3})$", globe_page),
    ]


async def globe_page(datasette, request):
    origin = (request.url_vars.get("origin") or "").upper()
    html = await datasette.render_template("globe.html", {"origin": origin}, request=request)
    return Response.html(html)
