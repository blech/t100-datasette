# plugins/t100_assets.py
"""Make the pages' JavaScript load faster.

The pages are plain ES modules with no build step, and one chart page pulls in about thirty of them. Two things made that slow:

- Static files had an ETag but no Cache-Control, so the browser asked the server about every module on every visit.
  They now get a short max-age: at most MAX_AGE, and never longer than the site's default_cache_ttl (5 seconds in
  development, so editing a file still shows at once; a day in public mode, so MAX_AGE applies there).
- A module's imports are only found once it arrives, so the modules loaded a level at a time. `t100_modulepreload`
  lists a module's whole import graph as <link rel="modulepreload"> tags, so the browser fetches them all at once.

A bundler would replace both (see docs/superpowers/plans/); this is the cheap version until then."""
import re
from pathlib import Path

from datasette import hookimpl
from markupsafe import Markup, escape

MAX_AGE = 300
STATIC = Path(__file__).resolve().parent.parent / "static"
IMPORT = re.compile(r"""(?:^|[;\s])(?:import|export)\s*(?:[^'";()]*?\sfrom\s*)?['"]([^'"]+)['"]""")
_graph_cache = {}  # entry -> ({file: mtime}, ordered urls)


def imports_of(path):
    """The static module paths one module imports, as URLs under /static/ (absolute and relative specifiers alike)."""
    found = []
    for spec in IMPORT.findall(path.read_text()):
        if spec.startswith("/static/"):
            target = STATIC / spec[len("/static/"):]
        elif spec.startswith("."):
            target = (path.parent / spec).resolve()
        else:
            continue  # a package or another host
        if target.is_file() and STATIC in target.parents:
            found.append(target)
    return found


def module_graph(entry):
    """Every module an entry point imports, directly or not, entry first, as /static/... URLs. [] if it isn't a module here.
    Remembered until one of its files changes (checked by stat, without reading them)."""
    start = STATIC / entry.removeprefix("/static/")
    if not start.is_file():
        return []
    cached = _graph_cache.get(entry)
    if cached and all(p.is_file() and p.stat().st_mtime == m for p, m in cached[0].items()):
        return cached[1]
    seen, queue = {}, [start]
    while queue:
        path = queue.pop(0)
        if path not in seen:
            seen[path] = path.stat().st_mtime
            queue.extend(imports_of(path))
    urls = ["/static/" + p.relative_to(STATIC).as_posix() for p in seen]
    _graph_cache[entry] = (seen, urls)
    return urls


def modulepreload(entry):
    """<link rel="modulepreload"> tags for an entry point's whole import graph, to put in a page's <head>."""
    return Markup("\n".join(f'  <link rel="modulepreload" href="{escape(url)}">' for url in module_graph(entry)))


@hookimpl
def extra_template_vars():
    return {"modulepreload": modulepreload}


@hookimpl
def asgi_wrapper(datasette):
    def wrap(app):
        async def cached(scope, receive, send):
            if scope["type"] != "http" or not scope["path"].startswith("/static/"):
                await app(scope, receive, send)
                return
            max_age = min(MAX_AGE, int(datasette.setting("default_cache_ttl") or 0))

            async def add_header(message):
                if message["type"] == "http.response.start" and message["status"] == 200:
                    headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                    headers.append((b"cache-control", f"public, max-age={max_age}".encode()))
                    message = {**message, "headers": headers}
                await send(message)

            await app(scope, receive, add_header)

        return cached

    return wrap
