# plugins/t100_guard.py
"""Keep crawlers from walking the tables through Datasette's "next page" and facet links.

Following "next page" links (`_next=`) and facet counts (`_facet=`) through millions of rows saturates the machine and
starves the site's own chart queries, and on the small rollup tables the combinations of facet values are an endless
supply of distinct URLs that keeps the machine awake all day (about 25,000 requests a day in October 2026).
The first page of each table, and every canned query, still work.

Only the public server needs this: serve_public.sh sets T100_GUARD=1. A local `datasette .` leaves it off, so facets and paging work."""
import os
import re
from urllib.parse import parse_qs

from datasette import hookimpl
from datasette.utils.asgi import Response

TABLE = re.compile(r"^/t100/[^/]+(\.json|\.csv)?$")  # a table or canned query, not a row page
EXPENSIVE = ("_next", "_facet")  # a parameter name starts with one of these
REFUSAL = "Deep paging and facet counts are turned off on the public site. Use the first page, or a route or airport page.\n"
ROBOTS = "User-agent: *\nDisallow: /t100/\n"


def is_expensive(path, query_string):
    if not TABLE.match(path):
        return False
    names = parse_qs(query_string, keep_blank_values=True)
    return any(name.startswith(EXPENSIVE) for name in names)


@hookimpl
def asgi_wrapper(datasette):
    def wrap(app):
        async def guard(scope, receive, send):
            if os.environ.get("T100_GUARD") and scope["type"] == "http" and is_expensive(scope["path"], scope.get("query_string", b"").decode("latin-1")):
                await Response.text(REFUSAL, status=403).asgi_send(send)
                return
            await app(scope, receive, send)

        return guard

    return wrap


@hookimpl
def register_routes():
    async def robots(request):
        return Response.text(ROBOTS)

    return [(r"^/robots\.txt$", robots)]
