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


def test_zen_key_does_not_enable_restricted_provider(monkeypatch):
    monkeypatch.setattr(llm.settings, "OPENCODE_ZEN_KEY", "test-zen-key")
    monkeypatch.setattr(llm.settings, "OPENCODE_ZEN_ENABLED", False)
    monkeypatch.setattr(llm.settings, "OPENROUTER_API_KEY", "test-router-key")
    monkeypatch.setattr(llm.settings, "OPENROUTER_MODELS", "inclusionai/ling-3.0-flash")
    assert all(provider[3] == "or" for provider in llm._build_provider_list())


def test_unknown_openrouter_ids_fail_closed(monkeypatch):
    monkeypatch.setattr(llm.settings, "OPENROUTER_MODELS", "unknown/model,openrouter/free")
    monkeypatch.setattr(llm.settings, "OPENCODE_ZEN_ENABLED", False)
    assert llm._build_provider_list() == []


def test_configured_model_order_and_primary_are_consistent(monkeypatch):
    monkeypatch.setattr(llm.settings, "OPENCODE_ZEN_ENABLED", False)
    monkeypatch.setattr(llm.settings, "OPENROUTER_API_KEY", "test-router-key")
    monkeypatch.setattr(llm.settings, "OPENROUTER_MODELS", "inclusionai/ling-3.0-flash,inception/mercury-2.5")
    providers = llm._build_provider_list()
    assert [provider[0] for provider in providers] == ["inclusionai/ling-3.0-flash", "inception/mercury-2.5"]
    assert llm._get_primary_provider() == providers[0]


@pytest.mark.asyncio
async def test_zen_does_not_fabricate_session_header(monkeypatch):
    captured = {}

    class Client(_Fake400Client):
        async def post(self, url, headers=None, json=None):
            captured.update(headers)
            return await super().post(url, headers=headers, json=json)

    monkeypatch.setattr(llm.httpx, "AsyncClient", Client)
    monkeypatch.setattr(llm.settings, "OPENCODE_ZEN_SESSION", "")
    with pytest.raises(httpx.HTTPStatusError):
        await llm.call_llm([], model="m", base_url=llm.ZEN_URL, api_key="k")
    assert "x-session-id" not in captured


@pytest.mark.asyncio
async def test_explicit_zen_session_header_is_preserved(monkeypatch):
    captured = {}

    class Client(_Fake400Client):
        async def post(self, url, headers=None, json=None):
            captured.update(headers)
            return await super().post(url, headers=headers, json=json)

    monkeypatch.setattr(llm.httpx, "AsyncClient", Client)
    monkeypatch.setattr(llm.settings, "OPENCODE_ZEN_SESSION", "explicit-session")
    with pytest.raises(httpx.HTTPStatusError):
        await llm.call_llm([], model="m", base_url=llm.ZEN_URL, api_key="k")
    assert captured["x-session-id"] == "explicit-session"


@pytest.mark.asyncio
async def test_runtime_ling_uses_verified_endpoint_without_changing_text_contract(monkeypatch):
    captured = {}

    class Client(_Fake400Client):
        async def post(self, url, headers=None, json=None):
            captured.update(json)
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "plain whisper"}}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(llm.httpx, "AsyncClient", Client)
    text = await llm.call_llm([], model="inclusionai/ling-3.0-flash", base_url=llm.OPENROUTER_URL, api_key="k")
    assert text == "plain whisper"
    assert captured["reasoning"] == {"enabled": False}
    assert captured["provider"]["only"] == ["deepinfra"]
    assert captured["provider"]["max_price"] == {"prompt": 0.06, "completion": 0.18}
    assert "response_format" not in captured


@pytest.mark.asyncio
async def test_runtime_reading_requests_json_on_verified_endpoint(monkeypatch):
    captured = {}

    class Client(_Fake400Client):
        async def post(self, url, headers=None, json=None):
            captured.update(json)
            return httpx.Response(
                200, json={"choices": [{"message": {"content": '{"short_answer":"test"}'}}]},
                request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(llm.httpx, "AsyncClient", Client)
    await llm.call_llm(
        [], model="inclusionai/ling-3.0-flash", base_url=llm.OPENROUTER_URL, api_key="k", json_mode=True,
    )
    assert captured["response_format"] == {"type": "json_object"}
    assert captured["provider"]["require_parameters"] is True


@pytest.mark.asyncio
async def test_json_mode_survives_explicit_model_fallback(monkeypatch):
    providers = [
        ("inclusionai/ling-3.0-flash", llm.OPENROUTER_URL, "test-key", "or"),
        ("inception/mercury-2.5", llm.OPENROUTER_URL, "test-key", "or"),
    ]
    seen = []

    async def call(messages, model, base_url, api_key, max_tokens=2000, json_mode=False):
        seen.append((model, json_mode))
        if model == "inclusionai/ling-3.0-flash":
            request = httpx.Request("POST", base_url)
            response = httpx.Response(503, request=request)
            raise httpx.HTTPStatusError("test provider unavailable", request=request, response=response)
        return '{"short_answer":"test"}'

    llm._reset_breakers()
    monkeypatch.setattr(llm, "_build_provider_list", lambda: providers)
    monkeypatch.setattr(llm, "call_llm", call)
    result = await llm.call_llm_with_fallback([], json_mode=True)
    assert result == '{"short_answer":"test"}'
    assert seen == [("inclusionai/ling-3.0-flash", True), ("inception/mercury-2.5", True)]
    assert llm.get_last_llm_hop()["fallback_used"] is True
    llm._reset_breakers()


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
