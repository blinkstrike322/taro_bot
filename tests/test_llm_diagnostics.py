# tests/test_llm_diagnostics.py
# Диагностика двух слепых зон из боя 10.10.2026:
# 1) тело HTTP-ошибки провайдера выбрасывалось (Zen 400 без причины —
#    непонятно, ключ/сессия/модель), 2) провал валидации логировался без
#    причины (не отличить parse от positions/shape).
import httpx
import pytest

import core.llm as llm


class _Fake400Client:
    """httpx.AsyncClient, всегда отвечающий 400 с JSON-телом ошибки."""

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None):
        request = httpx.Request("POST", url, headers=headers or {})
        return httpx.Response(
            400,
            json={"error": {"message": "model not found: ling-3.0-flash-fin-free"}},
            request=request,
        )


@pytest.mark.asyncio
async def test_call_llm_400_includes_response_body(monkeypatch):
    monkeypatch.setattr(llm.httpx, "AsyncClient", _Fake400Client)
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await llm.call_llm(
            [{"role": "user", "content": "hi"}],
            model="m",
            base_url="https://example.invalid/v1/chat/completions",
            api_key="k",
        )
    assert "model not found" in str(exc_info.value)


CARDS3 = [
    {"name": "Луна", "is_reversed": False},
    {"name": "Солнце", "is_reversed": False},
    {"name": "Звезда", "is_reversed": False},
]


def _good():
    return {
        "intro": "Ночь шепчет.",
        "short_answer": "Слушай тишину.",
        "позиции": [
            {"позиция": "p1", "карта": "Луна", "реверс": False, "трактовка": "т1"},
            {"позиция": "p2", "карта": "Солнце", "реверс": False, "трактовка": "т2"},
            {"позиция": "p3", "карта": "Звезда", "реверс": False, "трактовка": "т3"},
        ],
    }


def test_validate_collects_reason_empty_short_answer():
    reasons: list[str] = []
    assert llm.validate_interpretation({"intro": "и", "short_answer": "  "}, CARDS3, "в", reasons=reasons) is None
    assert reasons == ["empty-short-answer"]


def test_validate_collects_reason_positions_len():
    bad = _good()
    bad["позиции"] = bad["позиции"][:2]
    reasons: list[str] = []
    assert llm.validate_interpretation(bad, CARDS3, "в", "3", reasons=reasons) is None
    assert reasons == ["three-positions-len"]


def test_validate_reasons_empty_on_success():
    reasons: list[str] = []
    assert llm.validate_interpretation(_good(), CARDS3, "в", "3", reasons=reasons) is not None
    assert reasons == []


def test_validate_old_calls_without_reasons_still_work():
    assert llm.validate_interpretation(_good(), CARDS3, "в", "3") is not None
    assert llm.validate_interpretation({"intro": "", "short_answer": ""}, CARDS3, "в") is None
