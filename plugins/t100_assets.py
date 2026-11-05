# plugins/t100_assets.py
"""Make the pages' JavaScript load faster.

The pages are plain ES modules, and one chart page pulls in about thirty of them. In development they are served as they are.
In the Docker image `scripts/bundle.mjs` bundles each page's script into static/dist/ under a hashed name and writes
static/dist/manifest.json (the plan is docs/superpowers/plans/2026-11-04-bundling.md). This plugin is the templates' side of that:

- `script_url('charts/rollup.js')` is the bundle's URL if the manifest has the entry, else the source module's. A missing manifest
  (development, or a failed build) therefore means the unbundled site, never a broken one.
- `modulepreload('charts/rollup.js')` is <link rel="modulepreload"> tags for everything that script needs, so the browser fetches
  it all at once: the bundle's shared chunks, or, unbundled, the whole import graph (a module's imports are only found once it
  arrives, so otherwise the modules load a level at a time).
- Cache-Control for /static/: hashed bundle files never change, so a year; the rest a short max-age, at most MAX_AGE and never
  longer than the site's default_cache_ttl (5 seconds in development, so editing a file still shows at once)."""
import json
import os
import re
from pathlib import Path

from datasette import hookimpl
from markupsafe import Markup, escape

MAX_AGE = 300
STATIC = Path(__file__).resolve().parent.parent / "static"
DIST = Path(os.environ.get("T100_DIST", STATIC / "dist"))  # the tests point this at an empty directory, so a local build never changes what they see
IMMUTABLE = "public, max-age=31536000, immutable"
IMPORT = re.compile(r"""(?:^|[;\s])(?:import|export)\s*(?:[^'";()]*?\sfrom\s*)?['"]([^'"]+)['"]""")
_graph_cache = {}  # entry -> ({file: mtime}, ordered urls)
_manifest_cache = {}  # manifest path -> (mtime, parsed)


def entry_name(entry):
    """'charts/rollup.js' for either 'charts/rollup.js' or '/static/charts/rollup.js'."""
    return entry.removeprefix("/static/")


def manifest():
    """static/dist/manifest.json as a dict (entry -> {file, imports}), or {} if there is no bundle."""
    path = DIST / "manifest.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {}
    cached = _manifest_cache.get(path)
    if not cached or cached[0] != mtime:
        _manifest_cache[path] = cached = (mtime, json.loads(path.read_text()))
    return cached[1]


def imports_of(path):
    """The static module paths one module imports (absolute /static/ and relative specifiers alike)."""
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
    """Every source module an entry point imports, directly or not, entry first, as /static/... URLs. [] if it isn't a module here.
    Remembered until one of its files changes (checked by stat, without reading them)."""
    entry = entry_name(entry)
    start = STATIC / entry
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


def script_url(entry):
    """The URL to load a page script from: its bundle if there is one, else the source module."""
    built = manifest().get(entry_name(entry))
    return built["file"] if built else "/static/" + entry_name(entry)


def modulepreload(entry):
    """<link rel="modulepreload"> tags for what an entry point needs, to put in a page's <head>."""
    built = manifest().get(entry_name(entry))
    urls = [built["file"], *built["imports"]] if built else module_graph(entry)
    return Markup("\n".join(f'  <link rel="modulepreload" href="{escape(url)}">' for url in urls))


@hookimpl
def extra_template_vars():
    return {"modulepreload": modulepreload, "script_url": script_url}


@hookimpl
def asgi_wrapper(datasette):
    def wrap(app):
        async def cached(scope, receive, send):
            if scope["type"] != "http" or not scope["path"].startswith("/static/"):
                await app(scope, receive, send)
                return
            if scope["path"].startswith("/static/dist/"):
                value = IMMUTABLE if re.search(r"-[A-Z0-9]{8}\.(js|js\.map)$", scope["path"]) else "no-cache"  # not the manifest
            else:
                value = f"public, max-age={min(MAX_AGE, int(datasette.setting('default_cache_ttl') or 0))}"

            async def add_header(message):
                if message["type"] == "http.response.start" and message["status"] == 200:
                    headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                    headers.append((b"cache-control", value.encode()))
                    message = {**message, "headers": headers}
                await send(message)

            await app(scope, receive, add_header)

        return cached

    return wrap
