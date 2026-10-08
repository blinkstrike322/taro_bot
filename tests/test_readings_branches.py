# tests/test_readings_branches.py
# Ветки журнала /api/readings: ?days=N (1-62, приоритет над year/month) и ?all=1
# (весь журнал). Форма строк — 1:1 с месячной веткой get_user_readings_by_month.
import json

import pytest
import pytest_asyncio

import app as app_module
import storage.db as sdb
from tests.test_analytics import _make_init_data
from tests.test_api_stats import _FakeRequest


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


_INTERP = '{"intro":"шёпот","short_answer":"ответ","advice":"совет"}'


async def _seed_reading(db, user_id: int, type_: str, created_at_sql: str) -> None:
    """Прямой INSERT строки чтения с контролируемым created_at (SQL-выражение)."""
    await db.execute(
        "INSERT INTO readings (user_id, type, question, cards_data, interpretation, character_id, created_at) "
        f"VALUES (?, ?, NULL, '{{}}', ?, 'shadow_walker', {created_at_sql})",
        (user_id, type_, _INTERP),
    )


@pytest.mark.asyncio
async def test_readings_days_window(db):
    """Строки старше окна days не возвращаются."""
    user = await sdb.get_or_create_user(db, 3001)
    await _seed_reading(db, user.id, "daily", "datetime('now', '-1 day')")
    await _seed_reading(db, user.id, "spread_3", "datetime('now', '-30 days')")
    await db.commit()
    resp = await app_module.handle_readings(
        _FakeRequest({"days": "7", "init_data": _make_init_data(3001)})
    )
    assert resp.status == 200
    rows = json.loads(resp.body)["readings"]
    assert len(rows) == 1
    assert rows[0]["type"] == "daily"


@pytest.mark.asyncio
async def test_readings_all(db):
    """?all=1 — весь журнал, ограничен take 500, свежие первыми."""
    user = await sdb.get_or_create_user(db, 3002)
    for i in range(505, 0, -1):  # последний вставленный — самый свежий
        await _seed_reading(db, user.id, "daily", f"datetime('now', '-{i} minutes')")
    await db.commit()
    resp = await app_module.handle_readings(
        _FakeRequest({"all": "1", "init_data": _make_init_data(3002)})
    )
    assert resp.status == 200
    rows = json.loads(resp.body)["readings"]
    assert len(rows) == 500
    assert rows[0]["id"] > rows[-1]["id"]


@pytest.mark.asyncio
async def test_days_priority_over_month(db):
    """days=7 вместе с year/month: работает окно days, а не месячная выборка."""
    user = await sdb.get_or_create_user(db, 3003)
    await _seed_reading(db, user.id, "daily", "datetime('now', '-1 day')")
    await _seed_reading(db, user.id, "spread_3", "'2025-01-15 10:00:00'")
    await db.commit()
    resp = await app_module.handle_readings(
        _FakeRequest({
            "days": "7", "year": "2025", "month": "01",
            "init_data": _make_init_data(3003),
        })
    )
    assert resp.status == 200
    rows = json.loads(resp.body)["readings"]
    assert len(rows) == 1
    assert rows[0]["type"] == "daily"
