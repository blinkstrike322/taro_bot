# tests/test_llm_reliability.py
# Circuit breaker (per (label, model): 3 сбоя → cooldown с backoff ×2 до 300с,
# успех сбрасывает) + разделённые таймауты одного вызова LLM.
import time

import pytest

import core.llm as llm


@pytest.fixture(autouse=True)
def _reset_breaker():
    llm._reset_breakers()
    yield
    llm._reset_breakers()


def test_breaker_opens_after_three_failures():
    assert llm._is_cooled_down("zen", "m1") is False
    llm._record_failure("zen", "m1")
    llm._record_failure("zen", "m1")
    assert llm._is_cooled_down("zen", "m1") is False
    llm._record_failure("zen", "m1")
    assert llm._is_cooled_down("zen", "m1") is True
    assert llm._breaker("zen", "m1").consecutive_failures == 3
    assert llm._cooldown_end("zen", "m1") > time.time()


def test_breaker_success_resets():
    for _ in range(3):
        llm._record_failure("zen", "m1")
    assert llm._is_cooled_down("zen", "m1") is True
    llm._record_success("zen", "m1")
    assert llm._is_cooled_down("zen", "m1") is False
    assert llm._breaker("zen", "m1").consecutive_failures == 0


def test_breaker_cooldown_backoff_grows_and_caps():
    # 30с база, backoff ×2 на каждый лишний сбой, потолок 300с.
    assert llm._cooldown_seconds(2) == 0.0
    assert llm._cooldown_seconds(3) == 30.0
    assert llm._cooldown_seconds(4) == 60.0
    assert llm._cooldown_seconds(5) == 120.0
    assert llm._cooldown_seconds(6) == 240.0
    assert llm._cooldown_seconds(7) == 300.0
    assert llm._cooldown_seconds(8) == 300.0


def test_breaker_retries_after_cooldown():
    for _ in range(3):
        llm._record_failure("zen", "m1")
    assert llm._is_cooled_down("zen", "m1") is True
    # cooldown истёк — провайдер снова доступен
    state = llm._breaker("zen", "m1")
    state.cooled_until = time.time() - 1
    assert llm._is_cooled_down("zen", "m1") is False


def test_llm_timeout_config_values():
    t = llm.build_llm_timeout()
    assert t.connect == 10.0
    assert t.read == 60.0
    assert t.write == 30.0
    assert t.pool == 10.0
    # худший случай одного вызова (connect + read) не должен превышать ~90с
    assert t.connect + t.read <= 90.0


@pytest.mark.asyncio
async def test_call_llm_with_fallback_skips_cooled_provider(monkeypatch, caplog):
    providers = [("m1", "url1", "k1", "zen"), ("m2", "url2", "k2", "or")]
    monkeypatch.setattr(llm, "_build_provider_list", lambda: providers)
    calls = []

    async def fake_call_llm(messages, model, base_url, api_key, max_tokens=2000):
        calls.append(model)
        return "ok-result"
    monkeypatch.setattr(llm, "call_llm", fake_call_llm)

    for _ in range(3):
        llm._record_failure("zen", "m1")

    with caplog.at_level("WARNING", logger="core.llm"):
        result = await llm.call_llm_with_fallback([], max_tokens=10)

    assert result == "ok-result"
    assert calls == ["m2"]  # остывший m1 пропущен, работает m2
    assert any("Skipping zen" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_call_llm_with_fallback_records_failure(monkeypatch):
    providers = [("m1", "url", "k", "zen")]
    monkeypatch.setattr(llm, "_build_provider_list", lambda: providers)

    async def boom(messages, model, base_url, api_key, max_tokens=2000):
        raise RuntimeError("provider down")
    monkeypatch.setattr(llm, "call_llm", boom)

    with pytest.raises(RuntimeError):
        await llm.call_llm_with_fallback([])

    assert llm._breaker("zen", "m1").consecutive_failures == 1


@pytest.mark.asyncio
async def test_call_llm_with_fallback_opens_breaker_after_three_visits(monkeypatch):
    providers = [("m1", "url", "k", "zen")]
    monkeypatch.setattr(llm, "_build_provider_list", lambda: providers)

    async def boom(messages, model, base_url, api_key, max_tokens=2000):
        raise RuntimeError("provider down")
    monkeypatch.setattr(llm, "call_llm", boom)

    for _ in range(3):
        with pytest.raises(RuntimeError):
            await llm.call_llm_with_fallback([])

    assert llm._is_cooled_down("zen", "m1") is True