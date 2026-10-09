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


# ── Срез ризонинга модели (утечка из боя: taro ask, Тройка Мечей) ──

def test_strip_reasoning_dump_extracts_answer():
    dump = (
        "Пользователь спрашивает, что значит Тройка Мечей в этом раскладе. "
        "Мне нужно двигаться глубже, не повторяя то, что уже было. "
        "Нужно 3-6 предложений, связная проза. "
        "Напишу: В этой позиции внутри тебя есть рана, которую ты прячешь от себя — "
        "мысли крутятся вокруг одной точки и каждый раз приходят к одному разрыву. "
        "Проверю: 4 предложения, нет «эта карта означает». "
        "Проверю запрещённые слова: контекст — нет."
    )
    out = fb.strip_reasoning_dump(dump)
    assert out.startswith("В этой позиции")
    assert "Проверю" not in out and "Мне нужно" not in out


def test_strip_reasoning_dump_clean_text_unchanged():
    clean = "Рана, которую ты прячешь, режет сильнее любой внешней преграды."
    assert fb.strip_reasoning_dump(clean) == clean


def test_strip_reasoning_dump_without_answer_returns_empty():
    dump = "Мне нужно ответить кратко. Проверю: 3 предложения. Проверю запрещённые слова."
    assert fb.strip_reasoning_dump(dump) == ""


_ASK_BODY = {"init_data": _make_init_data(2001), "question": "q",
             "card": {"name": "Луна", "position": "совет"}, "spread_name": "s",
             "spread_question": None, "reading_summary": "r",
             "character_id": "shadow_walker"}


@pytest.mark.asyncio
async def test_ask_extracts_answer_from_reasoning_dump(db, monkeypatch):
    async def dump_llm(messages, **kw):
        return ("Мне нужно ответить в духе теней. "
                "Напишу: Тень говорит одно — этой ране надо имя, пока она режет сама. "
                "Проверю: 2 предложения, без запрещённых слов.")

    monkeypatch.setattr(app_module, "_ask_llm", dump_llm)
    resp = await app_module.handle_ask(_FakeRequest({}, dict(_ASK_BODY)))
    data = json.loads(resp.body)
    assert resp.status == 200 and data["fallback"] is False
    assert "Тень говорит одно" in data["answer"]
    assert "Мне нужно" not in data["answer"] and "Проверю" not in data["answer"]


@pytest.mark.asyncio
async def test_ask_fallback_on_pure_reasoning(db, monkeypatch):
    async def pure_reasoning(messages, **kw):
        return "Мне нужно ответить кратко. Проверю: 3 предложения."

    monkeypatch.setattr(app_module, "_ask_llm", pure_reasoning)
    resp = await app_module.handle_ask(_FakeRequest({}, dict(_ASK_BODY)))
    data = json.loads(resp.body)
    assert data["fallback"] is True and len(data["answer"]) >= 20
