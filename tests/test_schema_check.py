import asyncio
import logging
import sqlite3

from build_database import create_indexes, create_schema
from plugins.t100_schema import SCHEMA_PATH, expected_tables
from tests.helpers import get_json, make_datasette


def columns(conn):
    names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")]
    return {t: [r[1] for r in conn.execute(f'PRAGMA table_info("{t}")')] for t in names}


def test_schema_sql_matches_what_build_database_creates():
    conn = sqlite3.connect(":memory:")
    create_schema(conn)
    create_indexes(conn)
    assert expected_tables() == columns(conn), f"{SCHEMA_PATH.name} is out of step with build_database.py; regenerate it"


def test_a_complete_database_reports_ok(ds):
    assert get_json(ds, "/-/derived") == {"ok": True, "problems": [], "fix": None}


def test_a_missing_table_is_reported(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE carrier_route_year")
    conn.commit()
    body = get_json(make_datasette(db_path), "/-/derived")
    assert body["ok"] is False and body["problems"] == ["missing table carrier_route_year"]
    assert "rebuild_derived_tables" in body["fix"]


def test_a_table_with_an_older_shape_is_reported_by_column(db_path):
    conn = sqlite3.connect(db_path)
    conn.executescript('DROP TABLE carrier_group; CREATE TABLE carrier_group ([airline_id] TEXT, [group_id] TEXT, [group_name] TEXT);')
    body = get_json(make_datasette(db_path), "/-/derived")
    assert [p for p in body["problems"] if "carrier_group " in p] == ["table carrier_group lacks airline_name"]


def test_extra_columns_and_tables_are_fine(db_path):
    conn = sqlite3.connect(db_path)
    conn.executescript("ALTER TABLE carrier_group ADD COLUMN notes TEXT; CREATE TABLE scratch (x);")
    conn.commit()
    assert get_json(make_datasette(db_path), "/-/derived")["ok"] is True


def test_startup_logs_each_problem(db_path, caplog):
    conn = sqlite3.connect(db_path)
    conn.execute("DROP TABLE family_year")
    conn.commit()
    with caplog.at_level(logging.WARNING, logger="t100.schema"):
        asyncio.run(make_datasette(db_path).invoke_startup())
    assert "database out of date: missing table family_year" in caplog.text
