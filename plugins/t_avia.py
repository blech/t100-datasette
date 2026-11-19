# The European airports' pages (/airports/europe/...): the T-100 airport pages' own templates and scripts, reading the t_avia
# database (build_t_avia.py: Eurostat's route tables, with the CAA's for UK airports) instead of t100. Without t_avia.db
# loaded they answer 404, so the T-100 site is unchanged. Design: docs/superpowers/specs/2026-11-18-european-airports-design.md;
# what was decided while building it: docs/superpowers/plans/2026-11-18-european-airports.md.
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode

from datasette import hookimpl
from datasette.utils.asgi import NotFound, Response

sys.path.insert(0, str(Path(__file__).resolve().parent))
from t100_direction import DIRECTION_CHOICES_AIRPORT, DIRECTION_CHOICES_ROUTE, parse_dir, route_count_word, route_heading  # noqa: E402
from t100_distances import BIN_MILES, axis_max, check_margins  # noqa: E402

DATABASE = "t_avia"
BASE = "/airports/europe"  # inside the Airports section, beside /airports/cities and /airports/countries
CODE = r"[A-Za-z0-9]{3,4}"  # IATA, or ICAO where an airport has none
PAX_FLOOR = 10_000  # a destination's passengers a year, both ways: the European pages' default "at least"
DEFAULT_YEAR = 2024  # the last year most of Eurostat's countries have
INDEX_SORTS = {"passengers": "Passengers", "flights": "Flights", "destinations": "Destinations", "freight": "Freight"}  # the index's columns to rank by
# an airport whose code a newer one took over, with its history: Eurostat files both under the one ICAO code, so the newer
# airport's pages carry the older one's years, said so in its note, and the older code's pages lead there
INHERITED = {"BER": {"code": "SXF", "name": "Berlin Schönefeld", "until": "October 2020"}}
FORMER = {v["code"]: k for k, v in INHERITED.items()}
MATRIX_SETTINGS = ("n", "group", "rank", "year", "flown", "scale", "open")


@hookimpl
def register_routes():
    return [
        (r"^/europe$", europe_root),  # a short address for the index
        (r"^/airports/europe$", index_page),
        (rf"^/airports/europe/(?P<origin>{CODE})$", europe_view("airport.html", None)),
        (rf"^/airports/europe/(?P<origin>{CODE})/destinations$", europe_view("routes.html", "destinations")),
        (rf"^/airports/europe/(?P<origin>{CODE})/changes$", europe_view("airport_changes.html", "changes")),
        (rf"^/airports/europe/(?P<origin>{CODE})/distances$", europe_view("airport_distances.html", "distances")),
        (rf"^/airports/europe/(?P<origin>{CODE})/globe$", europe_view("globe.html", "map")),
        (rf"^/airports/europe/(?P<origin>{CODE})/(?P<dest>{CODE})(?:/(?P<year>[0-9]{{4}}))?$", route_page),
    ]


async def europe_root():
    return Response.redirect(BASE, status=302)


def database(datasette):
    """The t_avia database, or a 404 when it isn't loaded (the pages exist only beside it)."""
    if DATABASE not in datasette.databases:
        raise NotFound("The European airports' data isn't loaded here")
    return datasette.get_database(DATABASE)


def site_trail(datasette, *steps):
    from t100_globe import trail as t100_trail  # imported late: t100_globe is loaded as a plugin of its own
    return t100_trail(datasette, *steps)


def trail(datasette, *steps):
    return site_trail(datasette, ("airports", "/airports"), ("europe", BASE), *steps)


async def airport(datasette, code):
    """The airports row of a reporting airport, by its code, or None."""
    row = (await database(datasette).execute(
        "SELECT icao, code, name, city, country, first_year, last_year FROM airport_info WHERE code = ? AND reporting = 1 AND placeholder = 0", [code])).first()
    return dict(row) if row else None


async def caa_years(datasette, icao):
    """The years an airport's figures are the CAA's alone (passengers only), as runs: '1990–1992, 2020–2025'."""
    rows = await database(datasette).execute(
        "SELECT year FROM route_year WHERE airport = ? GROUP BY year HAVING MAX(source = 'eurostat' OR source = 'caa+eurostat') = 0 ORDER BY year", [icao])
    return runs([r[0] for r in rows])


def runs(years):
    """Sorted years as runs: [1990, 1991, 1992, 2020] -> '1990–1992, 2020'."""
    out, start = [], None
    for i, y in enumerate(years):
        if start is None:
            start = y
        if i + 1 == len(years) or years[i + 1] != y + 1:
            out.append(str(start) if start == y else f"{start}–{y}")
            start = None
    return ", ".join(out)


async def t100_years(datasette, code):
    """Whether the airport has T-100 pages too (its flights to and from the US), for a link across."""
    if "t100" not in datasette.databases:
        return False
    row = (await datasette.get_database("t100").execute("SELECT 1 FROM airport_dir_year WHERE airport = ? LIMIT 1", [code])).first()
    return bool(row)


def europe_view(template, crumb):
    """One of a European airport's pages, from the T-100 airport page's template of the same view, told by `europe` which
    database it reads, where its pages are and how it counts."""

    async def view(datasette, request):
        origin = request.url_vars["origin"].upper()
        if template == "airport.html" and any(k in request.args for k in MATRIX_SETTINGS):
            return Response.redirect(f"{BASE}/{origin}/destinations?{request.query_string}", status=301)
        if origin in FORMER:  # SXF's pages are BER's
            path = request.path.replace(f"{BASE}/{request.url_vars['origin']}", f"{BASE}/{FORMER[origin]}", 1)
            return Response.redirect(f"{path}?{request.query_string}" if request.query_string else path, status=302)
        info = await airport(datasette, origin)
        if not info:
            raise NotFound(f"No European airport {origin}")
        first, last = info["first_year"], info["last_year"]
        dir = parse_dir(request.args.get("dir"))
        steps = [(origin, f"{BASE}/{origin}"), (crumb, None)] if crumb else [(origin, None)]
        context = {
            "origin": origin,
            "first_year": first,
            "last_year": last,
            "latest_year": last,
            "min_year": first,
            "max_year": last,
            "crumbs": trail(datasette, *steps),
            "foreign": False,
            "label": " · ".join(p for p in (info["name"], ", ".join(x for x in (info["city"], info["country"]) if x)) if p),
            "rank_line": "",
            "dir": dir,
            "count_word": "Passengers",
            "dir_choices": DIRECTION_CHOICES_AIRPORT,
            "europe": {
                "database": DATABASE, "base": BASE, "icao": info["icao"], "pax_floor": PAX_FLOOR,
                "caa_years": await caa_years(datasette, info["icao"]),
                "uk": info["icao"].startswith("EG"),
                "inherits": INHERITED.get(origin),
                "t100_href": f"/airports/{origin}" if await t100_years(datasette, origin) else None,
            },
        }
        if template == "airport_distances.html":
            year = request.args.get("year", "")
            year = int(year) if year.isdigit() and first <= int(year) <= last else (DEFAULT_YEAR if first <= DEFAULT_YEAR <= last else last)
            context.update({"year": year, "axis_max": await axis_max(datasette), "bin_miles": BIN_MILES, **check_margins(datasette)})
        html = await datasette.render_template(template, context, request=request)
        return Response.html(html)

    return view


async def index_page(datasette, request):
    """Every reporting airport in a year, busiest first: the way into the European airports' pages."""
    db = database(datasette)
    years = [r[0] for r in await db.execute("SELECT DISTINCT year FROM route_year ORDER BY year DESC")]
    year = request.args.get("year", "")
    year = int(year) if year.isdigit() and int(year) in years else DEFAULT_YEAR
    eurostat_last = (await db.execute("SELECT MAX(year) FROM route_year WHERE source <> 'caa'")).first()[0]  # later years are the CAA's alone
    sort = (request.args.getlist("sort") or [""])[-1]  # the form keeps the current sort; a heading's button adds the new one
    sort = sort if sort in INDEX_SORTS else "passengers"
    sql = datasette.config["databases"][DATABASE]["queries"]["europe_airports"]["sql"]
    from t100_globe import prose_count
    rows = [{**dict(r), **{f"{k}_text": prose_count(r[k]) for k in ("passengers", "flights", "freight")}}
            for r in (await db.execute(sql, {"year": year, "sort": sort})).rows]
    html = await datasette.render_template(
        "europe_airports.html",
        {"crumbs": site_trail(datasette, ("airports", "/airports"), ("europe", None)), "year": year, "years": years, "rows": rows, "base": BASE, "pax_floor": PAX_FLOOR, "sort": sort, "sorts": INDEX_SORTS,
         "eurostat_last": eurostat_last},
        request=request,
    )
    return Response.html(html)


async def places(datasette, codes):
    """The airport_info rows of some codes, by code: for a route's heading and its links."""
    marks = ", ".join("?" for _ in codes)
    rows = await database(datasette).execute(
        f"SELECT code, icao, name, city, country, is_us, reporting FROM airport_info WHERE code IN ({marks})", list(codes))
    return {r["code"]: dict(r) for r in rows}


def place_tip(row, code):
    """A code's hover, as the T-100 headings have it: name, codes, then place."""
    if not row:
        return code
    where = ", ".join(x for x in (row["city"], row["country"]) if x)
    return "\n".join(x for x in (row["name"], f"{code} · {row['icao']}" if row["icao"] != code else code, where) if x)


def place_href(row, code, suffix=""):
    """Where an airport's own pages are, by the European pages' rule: here if it reports, T-100's if it's a US airport,
    else none (as static/common/source.js's airportHref)."""
    if row and row["reporting"]:
        return f"{BASE}/{code}{suffix}"
    if row and row["is_us"]:
        return f"/airports/{code}{suffix}"
    return None


async def route_page(datasette, request):
    """A route over time, or one year of it by month: the T-100 route page's template and script, from the origin's own
    report of the route. A route from an airport that doesn't report goes to the other end's page, the other way round."""
    origin = request.url_vars["origin"].upper()
    dest = request.url_vars["dest"].upper()
    year = request.url_vars.get("year") or ""
    if origin in FORMER or dest in FORMER:
        path = f"{BASE}/{FORMER.get(origin, origin)}/{FORMER.get(dest, dest)}{f'/{year}' if year else ''}"
        return Response.redirect(f"{path}?{request.query_string}" if request.query_string else path, status=302)
    db = database(datasette)
    info = await places(datasette, [origin, dest])
    has = "SELECT 1 FROM route_year WHERE airport = ? AND other = ? LIMIT 1"
    o, d = info.get(origin), info.get(dest)
    if not (o and d and o["reporting"] and (await db.execute(has, [o["icao"], d["icao"]])).first()):
        if o and d and d["reporting"] and (await db.execute(has, [d["icao"], o["icao"]])).first():
            dir = {"out": "in", "in": "out"}.get(parse_dir(request.args.get("dir")), "")
            q = urlencode([(k, v) for k, v in parse_qsl(request.query_string) if k != "dir"] + ([("dir", dir)] if dir else []))
            return Response.redirect(f"{BASE}/{dest}/{origin}{f'/{year}' if year else ''}{f'?{q}' if q else ''}", status=302)
        raise NotFound(f"No European route {origin}–{dest}")
    dir = parse_dir(request.args.get("dir"))
    span = await db.execute("SELECT MIN(year), MAX(year) FROM route_year WHERE airport = ? AND other = ?", [o["icao"], d["icao"]])
    first, last = span.first()
    marked = request.args.get("year", "")
    focus = year or (marked if marked.isdigit() and first <= int(marked) <= last else "")
    q = "&".join(f"{k}={v}" for k, v in (("dir", dir), ("year", focus)) if v)
    steps = [(origin, f"{BASE}/{origin}")]
    steps += [(dest, f"{BASE}/{origin}/{dest}?year={year}"), (year, None)] if year else [(dest, None)]

    def heading_href(code):  # a heading's code opens that airport's destinations, counted the same way, where it has pages
        h = place_href(info.get(code), code, "/destinations")
        return h and (f"{h}?{q}" if q else h)

    names = [", ".join(x for x in (info[c]["name"] or c, info[c]["city"]) if x) for c in (origin, dest)]
    html = await datasette.render_template(
        "route.html",
        {"origin": origin, "dest": dest, "year": year, "min_year": first, "max_year": last, "view": "",
         "crumbs": trail(datasette, *steps), "dir": dir, "heading": route_heading(origin, dest, dir),
         "count_word": route_count_word(dir),
         "heading_codes": [{"code": c, "href": heading_href(c), "tip": place_tip(info.get(c), c)}
                           for c in ((dest, origin) if dir == "in" else (origin, dest))],
         "heading_arrow": "→" if dir else "↔",
         "origin_abbr": origin,
         "other_way": route_heading(dest, origin, dir) if dir else "",
         "dir_choices": DIRECTION_CHOICES_ROUTE(origin, dest),
         "label": {"": "{0} ↔ {1}", "out": "{0} → {1}", "in": "{1} → {0}"}[dir].format(*names),
         "europe": {"database": DATABASE, "base": BASE, "pax_floor": PAX_FLOOR, "uk": o["icao"].startswith("EG"),
                    "inherits": [{**INHERITED[c], "successor": c} for c in (origin, dest) if c in INHERITED],
                    "caa_years": await caa_route_years(datasette, o["icao"], d["icao"]),
                    "reverse_href": f"{BASE}/{dest}/{origin}" if d["reporting"] else None}},
        request=request,
    )
    return Response.html(html)


async def caa_route_years(datasette, a, b):
    """The years a route's figures are the CAA's alone, as runs (caa_years for one route)."""
    rows = await database(datasette).execute(
        "SELECT year FROM route_year WHERE airport = ? AND other = ? AND source = 'caa' ORDER BY year", [a, b])
    return runs([r[0] for r in rows])
