import asyncio
import sqlite3
from pathlib import Path

import yaml
from datasette.app import Datasette

import build_database
from build_database import SEGMENT_COLUMNS

ROOT = Path(__file__).resolve().parent.parent
_NAMES = [n for n, _ in SEGMENT_COLUMNS]


def _insert(db_path, table, rows):
    conn = sqlite3.connect(db_path)
    for row in rows:
        cols = list(row)
        conn.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
            [row[c] for c in cols],
        )
    conn.commit()
    conn.close()


def add_segments(db_path, table, rows):
    for row in rows:
        unknown = set(row) - set(_NAMES)
        assert not unknown, f"unknown segment columns: {unknown}"
    _insert(db_path, table, rows)


def rebuild_airport_rollups(db_path):
    """Rebuild the rollups the airport queries read, after a test has added segments. carrier_group is left as the test put it."""
    conn = sqlite3.connect(db_path)
    for name in ("route_year_totals", "airport_names", "airport_market", "airport_carrier_dir_year", "carrier_pair_year"):
        getattr(build_database, f"rebuild_{name}")(conn)
    conn.close()


def _dir_columns(r):
    """An old one-way rollup row's figures as departures, with any arrivals the row also gives (arrs, seats_in, ...)."""
    return dict(deps=r.get("deps", 0), arrs=r.get("arrs", 0), seats_out=r.get("seats", 0), seats_in=r.get("seats_in", 0),
                passengers_out=r.get("passengers", 0), passengers_in=r.get("passengers_in", 0),
                freight_out=r.get("freight", 0), freight_in=r.get("freight_in", 0))


def put_airport_years(db_path, rows):
    """airport_year_totals-shaped rows (origin, origin_city_name, origin_wac, deps, ...) into airport_dir_year."""
    _insert(db_path, "airport_dir_year", [dict(year=r["year"], airport=r["origin"], city_name=r.get("origin_city_name"), wac=r.get("origin_wac"),
                                               **_dir_columns(r)) for r in rows])


def put_airport_carriers(db_path, rows):
    """airport_carrier_year-shaped rows into airport_carrier_dir_year."""
    _insert(db_path, "airport_carrier_dir_year", [dict(year=r["year"], airport=r["origin"], wac=r.get("origin_wac"), group_id=r["group_id"],
                                                       group_name=r["group_name"], domestic=r["domestic"], service_class=r["service_class"],
                                                       **_dir_columns(r)) for r in rows])


def rolled_json(ds, path):
    """get_json for a query on the rollups: rebuilds them from the segments first."""
    rebuild_airport_rollups(ds.databases["t100"].path)
    return get_json(ds, path)


def add_airports(db_path, rows):
    """rows: dicts with iata_code, name, city, country, latitude, longitude."""
    _insert(db_path, "openflights_airports", rows)


def add_overrides(db_path, rows):
    _insert(db_path, "airport_overrides", rows)


def make_datasette(db_path, settings=None):
    config = yaml.safe_load((ROOT / "datasette.yml").read_text())
    # datasette.yml already has a settings block; merge overrides into it rather than passing settings=
    config["settings"] = {**config.get("settings", {}), **(settings or {})}
    return Datasette(
        [str(db_path)],
        config=config,
        plugins_dir=str(ROOT / "plugins"),
        template_dir=str(ROOT / "templates"),
        static_mounts=[("static", str(ROOT / "static"))],
    )


async def _get(ds, path):
    await ds.invoke_startup()
    return await ds.client.get(path)


def get(ds, path):
    return asyncio.run(_get(ds, path))


def get_json(ds, path):
    response = get(ds, path)
    assert response.status_code == 200, f"{path} -> {response.status_code}: {response.text[:300]}"
    return response.json()
