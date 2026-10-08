# tests/test_ask_forecast.py
# POST /api/ask (одиночная карта + пара) и POST /api/forecast: резолв карт
# по cards.json, 2 попытки LLM, санитизация ответа и детерминированные
# локальные фолбэки (порт SNAP3). _FakeRequest/_make_init_data — из T6.
import json

import pytest
import pytest_asyncio

import app as app_module
import core.fallbacks as fb
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
async def test_ask_single_ok(db, monkeypatch):
    async def fake_llm(messages, **kw):
        return "Тени говорят одно: подожди до четверга. ```\nс мусором\n``` 🌙"

    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    body = {"init_data": _make_init_data(2001), "question": "ждать?",
            "card": {"name": "Луна", "position": "совет"},
            "spread_name": "карта дня", "spread_question": None,
            "reading_summary": "кратко", "character_id": "shadow_walker"}
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    data = json.loads(resp.body)
    assert resp.status == 200 and data["fallback"] is False
    assert "```" not in data["answer"] and "🌙" not in data["answer"]


@pytest.mark.asyncio
async def test_ask_pair_validation(db):
    body = {"init_data": _make_init_data(2001), "question": "q",
            "cards": [{"name": "Луна"}], "spread_name": "s", "spread_question": None,
            "reading_summary": "r", "character_id": "shadow_walker"}
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    assert resp.status == 400 and "две" in json.loads(resp.body)["error"]
    body["cards"] = [{"name": "Луна"}, {"name": "Единорог"}]
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    assert resp.status == 400 and "не опознаны" in json.loads(resp.body)["error"]


@pytest.mark.asyncio
async def test_ask_fallback_on_llm_garbage(db, monkeypatch):
    async def garbage(messages, **kw):
        return "ок"  # < 20 символов → фолбэк

    monkeypatch.setattr(app_module, "_ask_llm", garbage)
    body = {"init_data": _make_init_data(2001), "question": "q",
            "card": {"name": "Луна", "position": "совет"}, "spread_name": "s",
            "spread_question": None, "reading_summary": "r", "character_id": "shadow_walker"}
    resp = await app_module.handle_ask(_FakeRequest({}, body))
    data = json.loads(resp.body)
    assert data["fallback"] is True and len(data["answer"]) >= 20


@pytest.mark.asyncio
async def test_forecast_clamps(db, monkeypatch):
    async def fake_llm(messages, **kw):
        return json.dumps({"лозунг": "Держи курс", "утро": "у", "день": "д", "вечер": "в",
                           "фокус": "ф", "тонус": 99, "удача": -3, "общение": 5, "глоток": "г"},
                          ensure_ascii=False)

    monkeypatch.setattr(app_module, "_forecast_llm", fake_llm)
    resp = await app_module.handle_forecast(_FakeRequest({}, {
        "init_data": _make_init_data(2001), "card": {"name": "Солнце"},
        "character_id": "spark_of_chaos"}))
    f = json.loads(resp.body)["forecast"]
    assert f["тонус"] == 10 and f["удача"] == 0


def test_sanitize_strips_fences_and_emoji():
    assert "```" not in fb.sanitize_llm_text("```x\nтекст\n```")
    assert "🌙" not in fb.sanitize_llm_text("текст 🌙")
