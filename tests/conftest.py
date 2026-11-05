import os
import sqlite3
import tempfile

import pytest

from build_database import create_indexes, create_schema
from tests.helpers import make_datasette

# no JavaScript bundle in any test (a local `npm run bundle` would otherwise change the script URLs pages use): see plugins/t100_assets.py
os.environ["T100_DIST"] = tempfile.mkdtemp(prefix="t100-no-dist-")


@pytest.fixture
def db_path(tmp_path):
    path = tmp_path / "t100.db"
    conn = sqlite3.connect(path)
    create_schema(conn)
    create_indexes(conn)
    conn.close()
    return path


@pytest.fixture
def ds(db_path):
    return make_datasette(db_path)
