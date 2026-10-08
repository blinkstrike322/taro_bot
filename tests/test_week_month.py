# tests/test_week_month.py
# POST /api/week и POST /api/month: валидация дайджестов без LLM
# (clamp/truncate/top-N/400), happy-path с monkeypatched _ask_llm и
# детерминированные фолбэки из топ-карты (порт SNAP3 api/week + api/month).
import json

import pytest

import app as app_module
import core.fallbacks as fb
from tests.test_analytics import _make_init_data
from tests.test_api_stats import _FakeRequest

WEEK_DIGEST = {
    "total": 12,
    "days_active": 5,
    "spread_counts": {"карта дня": 7, "три карты": 5},
    "card_counts": {"Луна": 4, "Солнце": 3},
    "guide_counts": {"shadow_walker": 12},
    "questions": ["ждать ли?", "что важнее?"],
    "date_from": "01 окт",
    "date_to": "07 окт",
}

MONTH_DIGEST = {
    "total": 40,
    "days_active": 18,
    "days_in_month": 31,
    "month_name": "октябрь",
    "year": 2026,
    "spread_counts": {"карта дня": 25, "три карты": 15},
    "card_counts": {"Башня": 6, "Звезда": 5},
    "guide_counts": {"ruin_keeper": 40},
    "majors": 9,
    "suit_counts": {"wands": 12, "cups": 10},
    "days": [{"day": i, "count": 1} for i in range(1, 32)],
    "questions": ["куда идти?"],
}


def _body(digest: dict, **over) -> dict:
    body = {"init_data": _make_init_data(3001), "digest": digest,
            "character_id": "shadow_walker"}
    body.update(over)
    return body


# ── хелперы валидации (core/fallbacks) ───────────────────────────

def test_validate_counts_clamps_truncates_tops():
    raw = {"a" * 70: 5000, "b": -5, "c": 3, "мусор": "x", 42: 7, "": 1, "d": 2}
    out = fb._validate_counts(raw, max_items=3)
    # ключ обрезан до 60, значение clamp 0..999, сортировка по убыванию, топ-3
    assert out == {"a" * 60: 999, "42": 7, "c": 3}


def test_validate_counts_garbage():
    assert fb._validate_counts(None) == {}
    assert fb._validate_counts("мусор") == {}
    assert fb._validate_counts([("a", 1)]) == {}


def test_clean_questions_truncates_and_caps():
    qs = ["x" * 100, 5, None, "   ", "первый", "второй", "третий", "четвёртый",
          "пятый", "шестой"]
    assert fb._clean_questions(qs, max=5, max_len=80) == [
        "x" * 80, "первый", "второй", "третий", "четвёртый",
    ]


def test_clean_questions_garbage():
    assert fb._clean_questions(None) == []
    assert fb._clean_questions("мусор") == []
    assert fb._clean_questions({1: 2}) == []


# ── /api/week ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_week_ok(monkeypatch):
    captured = {}

    async def fake_llm(messages, **kw):
        captured["messages"] = messages
        return ("неделя говорила луной: три раза она вставала между вопросами "
                "и ответами. что спросишь завтра?")

    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    resp = await app_module.handle_week(_FakeRequest({}, _body(dict(WEEK_DIGEST))))
    data = json.loads(resp.body)
    assert resp.status == 200 and data["fallback"] is False
    assert "луной" in data["answer"]
    prompt = captured["messages"][1]["content"]
    assert "12 чтений" in prompt and "5 дней" in prompt
    assert "4 × Луна" in prompt and "01 окт" in prompt


@pytest.mark.asyncio
async def test_week_digest_sanitized(monkeypatch):
    captured = {}

    async def fake_llm(messages, **kw):
        captured["messages"] = messages
        return "колода повторяла одно и то же имя всю неделю напролёт, без пауз."

    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    digest = {
        "total": 30,
        "days_active": 20,  # > 7 → clamp
        "spread_counts": "мусор",
        "card_counts": {f"карта-{i:02d}": i for i in range(1, 13)} | {"звезда": 5000},
        "guide_counts": "мусор",
        "questions": ["х" * 100, 5, "   ", "первый", "второй", "третий",
                      "четвёртый", "пятый", "шестой"],
        "date_from": "д" * 50,
        "date_to": "д" * 50,
    }
    resp = await app_module.handle_week(_FakeRequest({}, _body(digest)))
    assert resp.status == 200
    prompt = captured["messages"][1]["content"]
    assert "7 дней" in prompt and "20 дней" not in prompt
    assert "999 × звезда" in prompt  # clamp 0..999
    assert "карта-12" in prompt and "карта-04" not in prompt  # топ-8
    assert "х" * 80 in prompt and "х" * 100 not in prompt  # ≤80 симв
    assert "шестой" not in prompt  # максимум 5 вопросов
    assert "д" * 40 in prompt and "д" * 50 not in prompt  # даты ≤40
    assert "голоса проводников: —" in prompt  # мусорный map → пусто


@pytest.mark.asyncio
async def test_week_total_zero_400():
    digest = {**WEEK_DIGEST, "total": 0}
    resp = await app_module.handle_week(_FakeRequest({}, _body(digest)))
    assert resp.status == 400
    assert "за неделю не было чтений" in json.loads(resp.body)["error"]


@pytest.mark.asyncio
async def test_week_garbage_digest_400():
    resp = await app_module.handle_week(_FakeRequest({}, _body("мусор")))
    assert resp.status == 400
    resp = await app_module.handle_week(_FakeRequest({}, _body(None)))
    assert resp.status == 400
    # нечисловой total → тоже «не было чтений»
    resp = await app_module.handle_week(
        _FakeRequest({}, _body({**WEEK_DIGEST, "total": "много"})))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_week_unauthorized():
    resp = await app_module.handle_week(_FakeRequest({}, _body(dict(WEEK_DIGEST), init_data="мусор")))
    assert resp.status == 401


@pytest.mark.asyncio
async def test_week_fallback_from_top_card(monkeypatch):
    async def garbage(messages, **kw):
        return "ок"  # < 20 символов → обе попытки мимо

    monkeypatch.setattr(app_module, "_ask_llm", garbage)
    resp = await app_module.handle_week(_FakeRequest({}, _body(dict(WEEK_DIGEST))))
    data = json.loads(resp.body)
    assert data["fallback"] is True and len(data["answer"]) >= 20
    assert "неделя прошла под знаком «Луна»" in data["answer"]
    assert "4 раза" in data["answer"]


@pytest.mark.asyncio
async def test_week_unknown_character_defaults(monkeypatch):
    async def fake_llm(messages, **kw):
        return "колода держала неделю в тени и говорила шёпотом, без спешки."

    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    resp = await app_module.handle_week(
        _FakeRequest({}, _body(dict(WEEK_DIGEST), character_id="незнакомец")))
    assert resp.status == 200


# ── /api/month ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_month_ok(monkeypatch):
    captured = {}

    async def fake_llm(messages, **kw):
        captured["messages"] = messages
        return "месяц вёл башней: она рушила планы и учила строить заново. что дальше?"

    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    resp = await app_module.handle_month(_FakeRequest({}, _body(dict(MONTH_DIGEST))))
    data = json.loads(resp.body)
    assert resp.status == 200 and data["fallback"] is False
    prompt = captured["messages"][1]["content"]
    assert "октябрь 2026" in prompt and "40 чтений" in prompt
    assert "старших арканов выпало 9" in prompt
    assert "12 × wands" in prompt


@pytest.mark.asyncio
async def test_month_days_sanitized(monkeypatch):
    captured = {}

    async def fake_llm(messages, **kw):
        captured["messages"] = messages
        return "месяц шёл ровно, без громких дней, и колода говорила вполголоса."

    monkeypatch.setattr(app_module, "_ask_llm", fake_llm)
    digest = {
        **MONTH_DIGEST,
        "majors": 10_000,  # clamp 999
        "days": [{"day": 5, "count": 5000}, "мусор", {"day": 99, "count": 1},
                 {"count": 3}] + [{"day": i, "count": 1} for i in range(1, 70)],
    }
    resp = await app_module.handle_month(_FakeRequest({}, _body(digest)))
    assert resp.status == 200
    prompt = captured["messages"][1]["content"]
    assert "старших арканов выпало 999" in prompt
    # {day: 5, count: 5000} → clamp 999 → громкий день; мусор и day=99 — долой
    assert "гуще всего 5 числа" in prompt
    assert "99 числа" not in prompt


@pytest.mark.asyncio
async def test_month_total_zero_400():
    digest = {**MONTH_DIGEST, "total": 0}
    resp = await app_module.handle_month(_FakeRequest({}, _body(digest)))
    assert resp.status == 400
    assert "за месяц не было чтений" in json.loads(resp.body)["error"]


@pytest.mark.asyncio
async def test_month_garbage_digest_400():
    resp = await app_module.handle_month(_FakeRequest({}, _body(["не", "словарь"])))
    assert resp.status == 400


@pytest.mark.asyncio
async def test_month_fallback_from_top_card(monkeypatch):
    async def garbage(messages, **kw):
        return "ок"

    monkeypatch.setattr(app_module, "_ask_llm", garbage)
    resp = await app_module.handle_month(_FakeRequest({}, _body(dict(MONTH_DIGEST))))
    data = json.loads(resp.body)
    assert data["fallback"] is True and len(data["answer"]) >= 20
    assert "месяц прошёл под знаком «Башня»" in data["answer"]
    assert "6 раз" in data["answer"]
