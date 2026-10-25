# plugins/t100_guard.py
"""Keep crawlers from walking the two big segment tables.

Following "next page" links (`_next=`) and facet counts (`_facet=`) through millions of rows saturates the machine and
starves the site's own chart queries. The first page of each table, and every canned query, still work."""
import re
from urllib.parse import parse_qs

from datasette import hookimpl
from datasette.utils.asgi import Response

BIG_TABLE = re.compile(r"^/t100/t100_(domestic|international)(\.json|\.csv)?$")
EXPENSIVE = ("_next", "_facet")  # a parameter name starts with one of these
REFUSAL = "Deep paging and facet counts are turned off on the public site. Use the first page, or a route or airport page.\n"
ROBOTS = "User-agent: *\nDisallow: /t100/\n"


def is_expensive(path, query_string):
    if not BIG_TABLE.match(path):
        return False
    names = parse_qs(query_string, keep_blank_values=True)
    return any(name.startswith(EXPENSIVE) for name in names)


@hookimpl
def asgi_wrapper(datasette):
    def wrap(app):
        async def guard(scope, receive, send):
            if scope["type"] == "http" and is_expensive(scope["path"], scope.get("query_string", b"").decode("latin-1")):
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
