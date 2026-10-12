"""The diagnostic must stay free-only and stop on a client-use restriction."""

from argparse import Namespace
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from scripts import probe_providers as probe


def test_sanitize_redacts_known_secrets_and_bearer_values():
    assert probe.sanitize("key alpha-token / Bearer sensitive-token", ("alpha-token",)) == (
        "key [REDACTED] / [REDACTED]"
    )


@pytest.mark.asyncio
async def test_probe_stops_after_opencode_only_restriction(monkeypatch):
    calls = []
    monkeypatch.setattr(probe, "dotenv_values", lambda _: {"OPENCODE_ZEN_KEY": "diagnostic-key"})
    monkeypatch.delenv("OPENCODE_ZEN_KEY", raising=False)

    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url):
            return httpx.Response(
                200, json={"data": [{"id": model} for model in probe.FREE_MODELS]},
                request=httpx.Request("GET", url),
            )

        async def post(self, url, headers, json):
            calls.append({"url": url, "headers": headers, "json": json})
            return httpx.Response(
                403, json={"error": {"type": "FreeTierError", "message": (
                    "OpenCode's free tier can only be used from within OpenCode"
                )}}, request=httpx.Request("POST", url),
            )

    monkeypatch.setattr(probe.httpx, "AsyncClient", Client)
    result = await probe.probe(Namespace(env_file=Path("unused"), endpoint="zen", models=None))
    assert result["completion_requests"] == 1
    assert result["paid_completion_requests"] == 0
    assert result["stopped_reason"] == "free_tier_application_use_restricted"
    assert len(calls) == 1
    assert set(calls[0]["headers"]) == {"Authorization", "Content-Type"}
    assert calls[0]["json"]["model"] in probe.FREE_MODELS
    assert calls[0]["json"]["max_tokens"] == 16
    assert "diagnostic-key" not in str(result)


@pytest.mark.asyncio
async def test_probe_missing_key_makes_no_requests(monkeypatch):
    monkeypatch.setattr(probe, "dotenv_values", lambda _: {})
    monkeypatch.delenv("OPENCODE_ZEN_KEY", raising=False)
    result = await probe.probe(Namespace(env_file=Path("unused"), endpoint="zen", models=None))
    assert result["error_type"] == "missing_key"
    assert result["completion_requests"] == 0


def test_paid_probe_guard_rejects_missing_prices():
    with pytest.raises(ValueError, match="price_metadata_unavailable"):
        probe.projected_cost({}, {"messages": []}, 100)


def test_cost_reservation_rejects_per_call_and_cumulative_overruns():
    with pytest.raises(ValueError, match="per_call_cost_ceiling"):
        probe.reserve_cost({}, Decimal("0.031"))
    with pytest.raises(ValueError, match="cumulative_cost_ceiling"):
        probe.reserve_cost({"charged_or_reserved_usd": "0.099"}, Decimal("0.002"))


def test_cost_bound_includes_output_limit_and_prices():
    cost, metadata = probe.projected_cost({"prompt": "0.000001", "completion": "0.000002"}, {}, 100)
    assert cost >= Decimal("0.001224")
    assert metadata["max_price"] == {"prompt": 1.0, "completion": 2.0, "request": 0.0}


@pytest.mark.asyncio
async def test_paid_opt_in_is_required_before_network(tmp_path):
    result = await probe.probe_openrouter(Namespace(allow_paid=False), {}, tmp_path / "ledger.json")
    assert result["error_type"] == "paid_opt_in_required"
    assert result["completion_requests"] == 0
