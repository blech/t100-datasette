# The European airports' pages (/airports/europe/...): the T-100 airport pages' own templates and scripts, reading the t_avia
# database (build_t_avia.py: Eurostat's route tables, with the CAA's for UK airports) instead of t100. Without t_avia.db
# loaded they answer 404, so the T-100 site is unchanged. Design: docs/superpowers/specs/2026-11-18-european-airports-design.md;
# what was decided while building it: docs/superpowers/plans/2026-11-18-european-airports.md.
import sys
from pathlib import Path

from datasette import hookimpl
from datasette.utils.asgi import NotFound, Response

sys.path.insert(0, str(Path(__file__).resolve().parent))
from t100_direction import DIRECTION_CHOICES_AIRPORT, parse_dir  # noqa: E402
from t100_distances import BIN_MILES, axis_max, check_margins  # noqa: E402

DATABASE = "t_avia"
BASE = "/airports/europe"  # inside the Airports section, beside /airports/cities and /airports/countries
CODE = r"[A-Za-z0-9]{3,4}"  # IATA, or ICAO where an airport has none
PAX_FLOOR = 10_000  # a destination's passengers a year, both ways: the European pages' default "at least"
DEFAULT_YEAR = 2024  # the last year most of Eurostat's countries have
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
        "SELECT icao, code, name, city, country, first_year, last_year FROM airport_info WHERE code = ? AND reporting = 1", [code])).first()
    return dict(row) if row else None


async def caa_years(datasette, icao):
    """The years an airport's figures are the CAA's alone (passengers only), as runs: '1990–1992, 2020–2025'."""
    rows = await database(datasette).execute(
        "SELECT year FROM route_year WHERE airport = ? GROUP BY year HAVING MAX(source = 'eurostat' OR source = 'caa+eurostat') = 0 ORDER BY year", [icao])
    years = [r[0] for r in rows]
    runs, start = [], None
    for i, y in enumerate(years):
        if start is None:
            start = y
        if i + 1 == len(years) or years[i + 1] != y + 1:
            runs.append(str(start) if start == y else f"{start}–{y}")
            start = None
    return ", ".join(runs)


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
    sql = datasette.config["databases"][DATABASE]["queries"]["europe_airports"]["sql"]
    from t100_globe import prose_count
    rows = [{**dict(r), "passengers_text": prose_count(r["passengers"])} for r in (await db.execute(sql, {"year": year})).rows]
    html = await datasette.render_template(
        "europe_airports.html",
        {"crumbs": site_trail(datasette, ("airports", "/airports"), ("europe", None)), "year": year, "years": years, "rows": rows, "base": BASE, "pax_floor": PAX_FLOOR},
        request=request,
    )
    return Response.html(html)
