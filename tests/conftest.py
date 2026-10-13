import sqlite3

import pytest

from build_database import create_indexes, create_schema
from tests.helpers import make_datasette


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
