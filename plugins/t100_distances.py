# An airport's distances page: the check of BTS's distance against the great-circle distance between the airports'
# coordinates, and the x-axis every airport's chart shares. static/charts/src/distances.js applies the same check in the
# browser, with the margins this gives the page.
import math

BIN_MILES = 250
_DEFAULT_MARGINS = {"ratio": 0.1, "miles": 50}

# a distance is suspect when it is off the great-circle one by more than the ratio of it and by more than the miles; one
# with no great-circle distance (an airport without coordinates) can't be checked, and isn't suspect
_SUSPECT_SQL = "(ABS(d.distance - d.gc_distance) > :ratio * d.gc_distance AND ABS(d.distance - d.gc_distance) > :miles)"


def is_suspect(distance, gc, ratio, miles):
    if distance is None or gc is None:
        return False
    off = abs(distance - gc)
    return off > ratio * gc and off > miles


def check_margins(datasette):
    """The check's margins, from distance_check under plugins: t100_globe in datasette.yml."""
    config = (datasette.plugin_config("t100_globe") or {}).get("distance_check") or {}
    return {key: config.get(key, default) for key, default in _DEFAULT_MARGINS.items()}


async def axis_max(datasette, year):
    """The longest checked distance any airport pair flew in the year, rounded up to a whole bin: the end of every airport's
    x-axis, so their shapes compare. Unchecked pairs don't count, so a bad distance there can't stretch every chart."""
    margins = check_margins(datasette)
    cache = datasette.__dict__.setdefault("_t100_axis_max", {})
    key = (int(year), margins["ratio"], margins["miles"])
    if key not in cache:
        result = await datasette.get_database("t100").execute(
            f"""
            SELECT MAX(d.distance)
            FROM (SELECT DISTINCT MIN(origin, dest) AS a, MAX(origin, dest) AS b FROM route_year_totals
                  WHERE year = :year AND origin != dest) AS p
            JOIN pair_distance AS d ON d.a = p.a AND d.b = p.b
            WHERE d.gc_distance IS NOT NULL AND NOT {_SUSPECT_SQL}
            """,
            {"year": int(year), **margins},
        )
        longest = result.first()[0] or 0
        cache[key] = math.ceil(longest / BIN_MILES) * BIN_MILES
    return cache[key]
