# tests/test_api_stats.py
# /api/stats — статистика оператора (camelCase-контракт SNAP3 api.ts) и
# daily_ritual в /api/spread/begin (серия карты дня считается в момент начала
# расклада, час присылает клиент). _FakeRequest экспортируется для T8+.
import asyncio
import json

import pytest
import pytest_asyncio

import app as app_module
import storage.db as sdb
from tests.test_analytics import _make_init_data


class _FakeRequest:
    def __init__(self, query, json_body=None):
        self.query = query
        self._json = json_body or {}
        self.app = {}

    async def json(self):
        return self._json


@pytest_asyncio.fixture
async def db(tmp_path):
    conn = await sdb.init_db(str(tmp_path / "t.db"))
    yield conn
    await conn.close()
    sdb._db_connection = None


@pytest.mark.asyncio
async def test_stats_shape(db):
    await sdb.get_or_create_user(db, 1001)
    resp = await app_module.handle_stats(_FakeRequest({"init_data": _make_init_data(1001)}))
    assert resp.status == 200
    data = json.loads(resp.body)
    assert set(data) >= {"streakDays", "totalReadings", "lastDailyAt", "morningStreak",
                         "lastMorningAt", "guideReadings", "spreadCounts"}
    assert data["totalReadings"] == 0 and data["guideReadings"] == {}


@pytest.mark.asyncio
async def test_stats_unauthorized():
    resp = await app_module.handle_stats(_FakeRequest({"init_data": "garbage"}))
    assert resp.status == 401


async def _wait_whisper_done(token: str) -> None:
    """Фоновый шёпот должен завершиться до конца теста (иначе пишет в закрытую БД)."""
    from storage.db import STATUS_COMPLETED, STATUS_FAILED, get_reading_by_token

    for _ in range(300):
        row = await get_reading_by_token(await sdb.get_db(), token)
        if row and row["status"] in (STATUS_COMPLETED, STATUS_FAILED):
            return
        await asyncio.sleep(0.01)


def _fake_interpret():
    async def fake_interpret(*a, **kw):
        await asyncio.sleep(0.05)  # окно для дедупа: второй begin застает active reading
        return {"intro": "шёпот", "short_answer": "ответ", "advice": "совет"}

    return fake_interpret


@pytest.mark.asyncio
async def test_spread_begin_daily_ritual_counted(db, monkeypatch):
    """Первая карта дня с local_hour: ритуал посчитан, серии подняты."""
    monkeypatch.setattr(app_module, "interpret_reading", _fake_interpret())
    body = {"init_data": _make_init_data(2001), "spread_type": 1, "local_hour": 9}
    resp = await app_module.handle_spread_begin(_FakeRequest({}, json_body=body))
    assert resp.status == 200
    data = json.loads(resp.body)
    assert data["daily_ritual"] == {
        "counted": True, "morning": True, "streakDays": 1, "morningStreak": 1,
    }
    await _wait_whisper_done(data["token"])


@pytest.mark.asyncio
async def test_spread_begin_daily_ritual_dedup_not_recounted(db, monkeypatch):
    """Двойной begin в один день: дедуп-ответ несёт counted=False, серии не растут."""
    monkeypatch.setattr(app_module, "interpret_reading", _fake_interpret())
    body = {"init_data": _make_init_data(2002), "spread_type": 1, "local_hour": 15}
    first = json.loads((await app_module.handle_spread_begin(_FakeRequest({}, json_body=body))).body)
    assert first["daily_ritual"]["counted"] is True
    second = json.loads((await app_module.handle_spread_begin(_FakeRequest({}, json_body=body))).body)
    assert second["token"] == first["token"]  # дедуп: тот же расклад
    assert second["daily_ritual"]["counted"] is False
    await _wait_whisper_done(first["token"])


@pytest.mark.asyncio
async def test_spread_begin_non_daily_has_no_daily_ritual(db, monkeypatch):
    monkeypatch.setattr(app_module, "interpret_reading", _fake_interpret())
    body = {"init_data": _make_init_data(2003), "spread_type": 3, "question": "вопрос", "local_hour": 9}
    resp = await app_module.handle_spread_begin(_FakeRequest({}, json_body=body))
    assert resp.status == 200
    data = json.loads(resp.body)
    assert "daily_ritual" not in data
    await _wait_whisper_done(data["token"])


@pytest.mark.asyncio
async def test_spread_begin_daily_without_valid_local_hour_skips_ritual(db, monkeypatch):
    """Нет local_hour / мусорный час → ритуал не трогается, ключа в ответе нет."""
    monkeypatch.setattr(app_module, "interpret_reading", _fake_interpret())
    resp = await app_module.handle_spread_begin(
        _FakeRequest({}, json_body={"init_data": _make_init_data(2004), "spread_type": 1})
    )
    assert resp.status == 200
    data = json.loads(resp.body)
    assert "daily_ritual" not in data
    row = await sdb.get_user_by_tg_id(db, 2004)
    assert row.streak_days == 0 and row.last_daily_at is None
    await _wait_whisper_done(data["token"])

    resp2 = await app_module.handle_spread_begin(
        _FakeRequest({}, json_body={"init_data": _make_init_data(2005), "spread_type": 1, "local_hour": 99})
    )
    assert resp2.status == 200
    assert "daily_ritual" not in json.loads(resp2.body)
    row2 = await sdb.get_user_by_tg_id(db, 2005)
    assert row2.streak_days == 0 and row2.last_daily_at is None
    await _wait_whisper_done(json.loads(resp2.body)["token"])
