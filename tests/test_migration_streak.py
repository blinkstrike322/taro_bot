import pytest
import pytest_asyncio

import storage.db as sdb


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None

@pytest.mark.asyncio
async def test_users_has_streak_columns(db):
    cursor = await db.execute("PRAGMA table_info(users)")
    cols = {row[1] for row in await cursor.fetchall()}
    assert {"streak_days", "last_daily_at", "morning_streak", "last_morning_at"} <= cols

@pytest.mark.asyncio
async def test_migration_idempotent(tmp_path):
    path = str(tmp_path / "t2.db")
    c1 = await sdb.init_db(path)
    await c1.close()
    c2 = await sdb.init_db(path)  # второй прогон не падает
    await c2.close()
    sdb._db_connection = None

@pytest.mark.asyncio
async def test_get_user_returns_new_fields(db):
    await sdb.get_or_create_user(db, 424242)
    fresh = await sdb.get_user_by_tg_id(db, 424242)
    assert fresh is not None
    assert fresh.streak_days == 0 and fresh.morning_streak == 0
    assert fresh.last_daily_at is None and fresh.last_morning_at is None
