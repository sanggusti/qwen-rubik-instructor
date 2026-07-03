import pytest

from db import database


@pytest.fixture(autouse=True)
def _persistence_disabled():
    # Insulate the suite from a real TURSO_DATABASE_URL in the repo-root .env:
    # every test starts with persistence off; DB tests opt in via temp_db.
    database.init("")
    yield
    database.init("")


@pytest.fixture
def temp_db(tmp_path):
    assert database.init(str(tmp_path / "test.db"))
    return database
