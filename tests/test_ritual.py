from datetime import UTC, datetime

import pytest
import pytest_asyncio

import storage.db as sdb
from core.ritual import touch_daily_streak


def _dt(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=UTC)

@pytest_asyncio.fixture
async def env(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    user = await sdb.get_or_create_user(conn, 777)
    yield conn, user
    await conn.close()
    sdb._db_connection = None

async def _fresh(db):
    return await sdb.get_user_by_tg_id(db, 777)

@pytest.mark.asyncio
async def test_A_morning_then_morning(env):
    db, user = env
    r1 = await touch_daily_streak(db, user, 9, now=_dt("2026-10-06 07:00:00"))
    assert r1 == {"counted": True, "morning": True, "streakDays": 1, "morningStreak": 1}
    r2 = await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-07 08:00:00"))
    assert r2["counted"] and r2["streakDays"] == 2 and r2["morningStreak"] == 2

@pytest.mark.asyncio
async def test_B_morning_after_skip(env):
    db, user = env
    await touch_daily_streak(db, user, 9, now=_dt("2026-10-06 07:00:00"))
    r = await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-09 07:00:00"))
    assert r["streakDays"] == 1 and r["morningStreak"] == 1  # обе серии оборвались

@pytest.mark.asyncio
async def test_C_evening_freezes_morning(env):
    db, user = env
    await touch_daily_streak(db, user, 9, now=_dt("2026-10-05 07:00:00"))
    await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-06 07:00:00"))
    r = await touch_daily_streak(db, await _fresh(db), 20, now=_dt("2026-10-07 20:00:00"))
    assert r["counted"] and r["streakDays"] == 3
    assert r["morningStreak"] == 2 and r["morning"] is False  # заморозка, не сброс

@pytest.mark.asyncio
async def test_D_same_day_repeat_not_counted(env):
    db, user = env
    await touch_daily_streak(db, user, 9, now=_dt("2026-10-06 07:00:00"))
    r = await touch_daily_streak(db, await _fresh(db), 9, now=_dt("2026-10-06 11:00:00"))
    assert r["counted"] is False and r["streakDays"] == 1

@pytest.mark.asyncio
async def test_E_first_evening_no_morning(env):
    db, user = env
    r = await touch_daily_streak(db, user, 21, now=_dt("2026-10-06 21:00:00"))
    assert r == {"counted": True, "morning": False, "streakDays": 1, "morningStreak": 0}
