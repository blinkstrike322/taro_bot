# tests/test_schema_endpoint.py
# /api/schema — админская диагностика схемы (бой 09.10.2026: код несёт
# миграции, а прод-БД без колонок). Доступ только ADMIN_IDS + валидный
# initData; таблицы зашиты в хендлере.
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


@pytest.mark.asyncio
async def test_schema_forbidden_garbage():
    resp = await app_module.handle_schema(_FakeRequest({"init_data": "garbage"}))
    assert resp.status == 403
    assert json.loads(resp.body)["error"] == "forbidden"


@pytest.mark.asyncio
async def test_schema_lists_columns(db, monkeypatch):
    monkeypatch.setattr(app_module.settings, "ADMIN_IDS", "1001")
    resp = await app_module.handle_schema(_FakeRequest({"init_data": _make_init_data(1001)}))
    assert resp.status == 200
    data = json.loads(resp.body)
    users = {c["name"] for c in data["users"]}
    readings = {c["name"] for c in data["readings"]}
    assert {"streak_days", "last_daily_at", "morning_streak", "last_morning_at"} <= users
    assert {"status", "completed_at", "error", "client_token"} <= readings


@pytest.mark.asyncio
async def test_schema_forbidden_non_admin(db, monkeypatch):
    monkeypatch.setattr(app_module.settings, "ADMIN_IDS", "1001")
    resp = await app_module.handle_schema(_FakeRequest({"init_data": _make_init_data(2002)}))
    assert resp.status == 403
