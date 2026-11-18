# The distances pages: the check of BTS's distance against the great-circle distance between the airports' coordinates, and
# the x-axis every chart shares, in every year. static/charts/src/distances.js applies the same check in the
# browser, with the margins this gives the page.
import logging
import math
import sqlite3

log = logging.getLogger(__name__)

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


# a pair counts towards the axis only in a year it was flown this often, both ways together: the maps' cut-off for one-off charters,
# diversions and positioning flights (one 1998 freight charter, PHL to Carnarvon on a 727 filed as one segment, set it otherwise)
AXIS_MIN_DEPS = 12
_CANDIDATES = 200

_AXIS_SQL = f"""
    WITH cand AS (
      SELECT d.a, d.b, d.distance FROM pair_distance AS d
      WHERE d.gc_distance IS NOT NULL AND NOT {_SUSPECT_SQL}
      ORDER BY d.distance DESC LIMIT :limit
    )
    SELECT MAX(c.distance) FROM cand AS c
    WHERE EXISTS (
      SELECT 1 FROM (SELECT year, deps FROM route_year_totals WHERE origin = c.a AND dest = c.b
                     UNION ALL SELECT year, deps FROM route_year_totals WHERE origin = c.b AND dest = c.a)
      GROUP BY year HAVING SUM(deps) >= :min_deps
    )
"""


async def axis_max(datasette):
    """The end of every distances chart's x-axis, in every year, so all their shapes compare: the longest checked distance of a
    pair flown at least AXIS_MIN_DEPS times in some year, rounded up to a whole bin. Unchecked pairs don't count, so a bad
    distance there can't stretch every chart. Only the longest checked pairs are tried first, which is quick; failing those, all."""
    margins = check_margins(datasette)
    cache = datasette.__dict__.setdefault("_t100_axis_max", {})
    key = (margins["ratio"], margins["miles"])
    if key in cache:
        return cache[key]
    db = datasette.get_database("t100")
    longest = 0
    try:
        for limit in (_CANDIDATES, -1):  # -1: no limit
            result = await db.execute(_AXIS_SQL, {"limit": limit, "min_deps": AXIS_MIN_DEPS, **margins})
            longest = result.first()[0] or 0
            if longest:
                break
    except sqlite3.OperationalError as err:  # pair_distance without gc_distance: the database is older than the code
        log.warning("distances: no axis, as pair_distance can't be read (%s); rebuild it", err)
        return 0
    if not longest:
        return 0  # not kept, so the page recovers once the distances are loaded
    cache[key] = math.ceil(longest / BIN_MILES) * BIN_MILES
    return cache[key]
