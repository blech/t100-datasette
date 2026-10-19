import logging
import sqlite3
from pathlib import Path

from datasette import hookimpl
from datasette.utils.asgi import Response

log = logging.getLogger("t100.schema")
SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"
DATABASE = "t100"
FIX = "rebuild with build_database.rebuild_derived_tables (see setup_database.md)"


def expected_tables(schema_path=SCHEMA_PATH):
    """{table: [column, ...]} that the pages and queries rely on, read from schema.sql (generated from build_database.py)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(Path(schema_path).read_text())
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    return {t: [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')] for t in names}


async def schema_problems(database, schema_path=SCHEMA_PATH):
    """What the database lacks compared with the schema: missing tables and missing columns. Extra tables and columns are fine."""
    present = set(await database.table_names())
    problems = []
    for table, columns in expected_tables(schema_path).items():
        if table not in present:
            problems.append(f"missing table {table}")
            continue
        have = set(await database.table_columns(table))
        missing = [c for c in columns if c not in have]
        if missing:
            problems.append(f"table {table} lacks {', '.join(missing)}")
    return problems


@hookimpl
def startup(datasette):
    async def check():
        problems = await schema_problems(datasette.get_database(DATABASE))
        for p in problems:
            log.warning("database out of date: %s", p)
        if problems:
            log.warning("pages that use these tables will fail until you %s", FIX)

    return check


async def schema_page(datasette, request):
    problems = await schema_problems(datasette.get_database(DATABASE))
    body = {"ok": not problems, "problems": problems, "fix": FIX if problems else None}
    return Response.json(body, headers={"Cache-Control": "no-store"})


@hookimpl
def register_routes():
    return [(r"^/-/derived$", schema_page)]
