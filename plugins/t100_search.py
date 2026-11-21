# plugins/t100_search.py
"""The header search's endpoint, /-/search.json?t1=&t2=&t3=: the `search` canned query (datasette.yml) run on t100.db's search_index
and, when t_avia.db is served and has one, on its search_index too (the European airports and countries, build_t_avia.write_search),
merged in the query's own order: the kind with the best match first, then each kind's best rows. One address for every page, so a
European page's search doesn't ask its own database for T-100's query."""
from datasette import hookimpl
from datasette.utils.asgi import Response

DATABASES = ("t100", "t_avia")
KINDS = ("airport", "europe_airport", "city", "europe_country", "airline", "aircraft")  # the order kinds with equal best matches come in
SHOWN = ("kind", "href", "label", "hint")


async def has_index(db):
    return bool((await db.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_index'")).rows)


async def search(datasette, request):
    words = {f"t{i}": request.args.get(f"t{i}", "") for i in (1, 2, 3)}
    sql = datasette.config["databases"]["t100"]["queries"]["search"]["sql"]
    rows = []
    for name in DATABASES:
        db = datasette.databases.get(name)
        if db is not None and await has_index(db):
            rows += [dict(r) for r in (await db.execute(sql, words)).rows]
    order = {k: i for i, k in enumerate(KINDS)}
    best = {}
    for r in rows:
        best[r["kind"]] = min(best.get(r["kind"], r["best"]), r["best"])
    rows.sort(key=lambda r: (best[r["kind"]], order.get(r["kind"], len(KINDS)), r["score"], -(r["rank"] or 0), r["label"]))
    return Response.json({"rows": [{k: r[k] for k in SHOWN} for r in rows]})


@hookimpl
def register_routes():
    return [(r"^/-/search\.json$", search)]
