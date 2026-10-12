"""Narrow provider diagnostic; never invokes the application's fallbacks.

Run with the original project's Python runtime and pass its .env path if this
checkout has no local .env. Only explicitly allowlisted free models can be used.
The small synthetic prompt contains no personal information. API keys and raw
responses are never printed. No OpenCode client/session headers are fabricated.
Paid OpenRouter calls need --provider openrouter --allow-paid, current price
metadata, a $0.03 per-call ceiling, and a persistent $0.10 budget ledger.
"""

from __future__ import annotations

import argparse
import asyncio
import fcntl
import json
import os
import re
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from dotenv import dotenv_values


FREE_MODELS = (
    "ling-3.0-flash-fin-free",  # legacy application primary; may be unavailable
    "ling-3.1-flash-free",
    "mimo-v2.6-flash-free",
)
OPENROUTER_MODELS = ("inception/mercury-2.5", "inclusionai/ling-3.0-flash")
CALL_CEILING_USD = Decimal("0.03")
LEDGER_CEILING_USD = Decimal("0.10")
ENDPOINTS = {
    "zen": "https://opencode.ai/zen/v1",
    "inference": "https://opencode.ai/inference/v1",
}
TINY_MESSAGES = [{"role": "user", "content": "Ответь одним словом: да"}]

READING_MESSAGES = [
    {"role": "system", "content": (
        "Ты спокойный и внимательный проводник для рефлексии через таро. Пиши только по-русски. "
        "Карты — метафоры: не обещай будущее и не утверждай мысли других людей как факты. "
        "Ответь конкретно на вопрос, свяжи три карты и дай одно выполнимое действие. "
        "Всего 150–220 слов. Верни JSON по заданной схеме без Markdown."
    )},
    {"role": "user", "content": (
        "Это вымышленный тест. Вопрос: Хочу вернуться к рисованию после долгого перерыва, "
        "но откладываю. Как сделать первый шаг? Карты, порядок и позиции фиксированы: "
        "Луна, прямая — Что удерживает; Шут, прямой — Что поможет; "
        "Отшельник, прямой — Первый шаг. Не заменяй карты или позиции."
    )},
]
READING_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "intro": {"type": "string"}, "short_answer": {"type": "string"},
        "advice": {"type": "string"}, "связь_карт": {"type": "string"},
        "позиции": {
            "type": "array", "minItems": 3, "maxItems": 3,
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "карта": {"type": "string"}, "позиция": {"type": "string"},
                    "реверс": {"type": "boolean"}, "трактовка": {"type": "string"},
                }, "required": ["карта", "позиция", "реверс", "трактовка"],
            },
        },
    }, "required": ["intro", "short_answer", "advice", "связь_карт", "позиции"],
}
SINGLE_CARD_MESSAGES = [
    {"role": "system", "content": (
        "Ты спокойный проводник для рефлексии через таро. Пиши только по-русски. "
        "Карты — метафоры. Ответь конкретно без обещания будущего. Всего 80–120 слов. "
        'Верни только JSON с четырьмя непустыми строками: "card", "short_answer", "card_meaning", "advice".'
    )},
    {"role": "user", "content": (
        "Вымышленный технический тест: хочу вернуться к рисованию после перерыва, но откладываю. "
        "Как сделать первый шаг? Единственная карта: Шут, прямая. Поле card должно быть ровно Шут."
    )},
]


def sanitize(value: object, secrets: tuple[str, ...] = ()) -> str:
    text = str(value or "")
    for secret in secrets:
        if secret:
            text = text.replace(secret, "[REDACTED]")
    text = re.sub(r"(?i)bearer\s+\S+|\b(?:sk|key)[-_][A-Za-z0-9_-]{12,}", "[REDACTED]", text)
    return text[:350]


def error_detail(response: httpx.Response, secrets: tuple[str, ...]) -> dict:
    try:
        data = response.json()
    except ValueError:
        # HTML/errors can echo request data; do not emit unstructured bodies.
        return {"error_type": "non_json_error", "message": "Provider returned a non-JSON error"}
    error = data.get("error", {}) if isinstance(data, dict) else {}
    if isinstance(error, dict):
        return {
            "error_type": sanitize(error.get("type") or error.get("code") or error.get("name"), secrets),
            "message": sanitize(error.get("message"), secrets),
        }
    return {"error_type": "provider_error", "message": sanitize(error, secrets)}


async def probe(args: argparse.Namespace) -> dict:
    env = dotenv_values(args.env_file)
    key = os.environ.get("OPENCODE_ZEN_KEY") or env.get("OPENCODE_ZEN_KEY")
    if not key:
        return {"provider": "zen", "error_type": "missing_key", "completion_requests": 0}
    secrets = tuple(value for name, value in env.items() if value and any(
        marker in name.upper() for marker in ("KEY", "TOKEN", "SECRET", "SESSION")
    )) + (key,)
    base = ENDPOINTS[args.endpoint]
    result = {
        "provider": "zen",
        "endpoint": base,
        "tested_at": datetime.now(ZoneInfo("Europe/Moscow")).isoformat(),
        "prompt": "synthetic_one_word_russian",
        "max_tokens_per_completion": 16,
        "completion_requests": 0,
        "paid_completion_requests": 0,
        "results": [],
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        catalog_started = time.monotonic()
        try:
            response = await client.get(f"{base}/models")
            response.raise_for_status()
            models = {item["id"] for item in response.json().get("data", []) if "id" in item}
            result["catalog"] = {
                "status": response.status_code,
                "latency_s": round(time.monotonic() - catalog_started, 2),
                "model_count": len(models),
                "allowlisted_models_present": [model for model in FREE_MODELS if model in models],
            }
        except httpx.HTTPError as exc:
            result["catalog"] = {"error_type": type(exc).__name__}
            return result  # No completion if we could not validate the live catalog.
        for model in args.models or FREE_MODELS:
            row = {"model": model, "listed": model in models}
            # Only the legacy model may be probed when absent, to diagnose the
            # exact old application's failure. Others must exist in the catalog.
            if model not in models and model != FREE_MODELS[0]:
                row.update({"ok": False, "error_type": "not_in_live_catalog", "requested": False})
                result["results"].append(row)
                continue
            started = time.monotonic()
            result["completion_requests"] += 1
            try:
                response = await client.post(
                    f"{base}/chat/completions",
                    headers=headers,
                    json={"model": model, "messages": TINY_MESSAGES, "max_tokens": 16, "temperature": 0},
                )
                row.update({"status": response.status_code, "latency_s": round(time.monotonic() - started, 2)})
                if response.is_error:
                    row.update({"ok": False, **error_detail(response, secrets)})
                else:
                    data = response.json()
                    if data.get("error"):
                        row.update({"ok": False, **error_detail(response, secrets)})
                    else:
                        content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
                        row.update({"ok": bool(content), "reply": sanitize(content, secrets)[:40]})
                        usage = data.get("usage") or {}
                        row["usage"] = {name: usage[name] for name in (
                            "prompt_tokens", "completion_tokens", "total_tokens", "cost"
                        ) if name in usage}
            except httpx.HTTPError as exc:
                row.update({"ok": False, "error_type": type(exc).__name__,
                            "latency_s": round(time.monotonic() - started, 2)})
            result["results"].append(row)
            # An application-use restriction is definitive. Do not try new
            # headers, impersonate OpenCode, or sweep other models afterwards.
            message = str(row.get("message", "")).lower()
            if "only" in message and "opencode" in message:
                result["stopped_reason"] = "free_tier_application_use_restricted"
                break
    return result


def reserve_cost(ledger: dict, projected: Decimal) -> dict:
    """Reserve before a network mutation; unknown actual costs keep the reserve."""
    current = Decimal(str(ledger.get("charged_or_reserved_usd", "0")))
    if not projected.is_finite() or projected < 0 or projected > CALL_CEILING_USD:
        raise ValueError("per_call_cost_ceiling")
    if current + projected > LEDGER_CEILING_USD:
        raise ValueError("cumulative_cost_ceiling")
    ledger["charged_or_reserved_usd"] = str(current + projected)
    return ledger


def projected_cost(pricing: dict, payload: dict, max_tokens: int) -> tuple[Decimal, dict]:
    """Conservative input bound, explicit output limit, price-filtered routing."""
    try:
        prompt_price = Decimal(pricing["prompt"])
        completion_price = Decimal(pricing["completion"])
        request_price = Decimal(pricing.get("request", "0"))
    except (KeyError, TypeError, InvalidOperation) as exc:
        raise ValueError("price_metadata_unavailable") from exc
    prices = (prompt_price, completion_price, request_price)
    if any(not price.is_finite() or price < 0 for price in prices):
        raise ValueError("price_metadata_invalid")
    # More than the UTF-8 byte count, including schema and chat overhead. This
    # intentionally overestimates a tiny prompt and is not a tokenizer estimate.
    input_bound = 2 * len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) + 1024
    cost = input_bound * prompt_price + max_tokens * completion_price + request_price
    # OpenRouter max_price uses dollars per million tokens, not per token.
    price_filter = {
        "prompt": float(prompt_price * 1_000_000),
        "completion": float(completion_price * 1_000_000),
        "request": float(request_price),
    }
    return cost, {"input_token_upper_bound": input_bound, "max_price": price_filter}


def validate_reading_shape(reading: object) -> bool:
    if not isinstance(reading, dict):
        return False
    if any(not isinstance(reading.get(field), str) or not reading[field].strip()
           for field in ("intro", "short_answer", "advice", "связь_карт")):
        return False
    positions = reading.get("позиции")
    if not isinstance(positions, list) or len(positions) != 3:
        return False
    expected = (("Луна", "Что удерживает"), ("Шут", "Что поможет"), ("Отшельник", "Первый шаг"))
    return all(isinstance(item, dict) and item.get("карта") == card
               and item.get("позиция") == position and item.get("реверс") is False
               and isinstance(item.get("трактовка"), str) and bool(item["трактовка"].strip())
               for item, (card, position) in zip(positions, expected))


async def probe_openrouter(args: argparse.Namespace, ledger: dict, ledger_path: Path) -> dict:
    result = {
        "provider": "openrouter", "tested_at": datetime.now(ZoneInfo("Europe/Moscow")).isoformat(),
        "completion_requests": 0, "confirmed_cost_usd": "0", "actual_cost_usd": "0", "results": [],
        "budget": {"per_call_ceiling_usd": str(CALL_CEILING_USD),
                   "cumulative_ceiling_usd": str(LEDGER_CEILING_USD)},
    }
    if not args.allow_paid:
        return {**result, "error_type": "paid_opt_in_required"}
    env = dotenv_values(args.env_file)
    key = os.environ.get("OPENROUTER_API_KEY") or env.get("OPENROUTER_API_KEY")
    if not key:
        return {**result, "error_type": "missing_key"}
    secrets = tuple(value for name, value in env.items() if value and any(
        marker in name.upper() for marker in ("KEY", "TOKEN", "SECRET", "SESSION")
    )) + (key,)
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    base = "https://openrouter.ai/api/v1"
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=args.read_timeout, write=10, pool=10)) as client:
        catalog = await client.get(f"{base}/models")
        catalog.raise_for_status()
        models = {item["id"]: item for item in catalog.json().get("data", [])}
        metadata = await client.get(f"{base}/key", headers=headers)
        result["key_metadata_status"] = metadata.status_code
        if not metadata.is_success:
            return {**result, "error_type": "key_metadata_unavailable"}
        key_data = metadata.json().get("data", {})
        result["key_metadata"] = {name: key_data[name] for name in (
            "limit", "limit_remaining", "usage", "is_free_tier"
        ) if name in key_data}
        for model in args.models or OPENROUTER_MODELS:
            if model not in OPENROUTER_MODELS:
                result["stopped_reason"] = "model_not_allowlisted"
                break
            info = models.get(model, {})
            if args.endpoint_provider:
                endpoint_response = await client.get(f"{base}/models/{model}/endpoints")
                endpoint_response.raise_for_status()
                endpoint = next((item for item in endpoint_response.json().get("data", {}).get("endpoints", [])
                                 if str(item.get("provider_name", "")).lower() == args.endpoint_provider), None)
                if not endpoint:
                    result["stopped_reason"] = "selected_endpoint_unavailable"
                    break
                # Catalog capabilities are a union; cheapest price and supported
                # response_format may belong to different endpoints. Use the
                # selected endpoint's own prices and capabilities together.
                info = {**info, "pricing": endpoint.get("pricing", {}),
                        "supported_parameters": endpoint.get("supported_parameters", [])}
            if args.response_mode != "none" and "response_format" not in info.get("supported_parameters", []):
                result["stopped_reason"] = "response_format_not_supported"
                break
            schema_supported = "structured_outputs" in info.get("supported_parameters", [])
            response_format = {"type": "json_object"}
            if schema_supported:
                response_format = {"type": "json_schema", "json_schema": {
                    "name": "arcanum_synthetic_reading", "strict": True, "schema": READING_SCHEMA,
                }}
            messages = SINGLE_CARD_MESSAGES if args.sample == "single-card" else READING_MESSAGES
            if args.sample == "three-cards" and not schema_supported and args.response_mode != "none":
                messages = READING_MESSAGES + [{"role": "user", "content": (
                    "JSON-схема ответа: " + json.dumps(READING_SCHEMA, ensure_ascii=False)
                )}]
            payload = {"model": model, "messages": messages, "max_tokens": args.max_tokens,
                       "temperature": 0.5}
            if args.disable_reasoning:
                if "reasoning" not in info.get("supported_parameters", []):
                    result["stopped_reason"] = "reasoning_control_not_supported"
                    break
                payload["reasoning"] = {"enabled": False}
            if args.response_mode != "none":
                payload["response_format"] = response_format
            try:
                cost, cost_metadata = projected_cost(info.get("pricing", {}), payload, args.max_tokens)
                reserve_cost(ledger, cost)
            except ValueError as exc:
                result["stopped_reason"] = str(exc)
                break
            remaining = key_data.get("limit_remaining")
            if remaining is not None and Decimal(str(remaining)) < cost:
                result["stopped_reason"] = "key_budget_insufficient"
                break
            # Persist reservation before the request; interruption/timeouts cannot
            # make a subsequent run forget a potentially billed generation.
            ledger_path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")
            payload["provider"] = {"max_price": cost_metadata["max_price"]}
            if args.response_mode != "none":
                payload["provider"]["require_parameters"] = True
            if args.endpoint_provider:
                payload["provider"]["only"] = [args.endpoint_provider]
                payload["provider"]["allow_fallbacks"] = False
            row = {"model": model, "pricing_per_token": info["pricing"],
                   "projected_ceiling_usd": str(cost), "cost_guard": cost_metadata,
                   "response_format": response_format["type"] if args.response_mode != "none" else "none",
                   "sample": args.sample, "endpoint_provider": args.endpoint_provider,
                   "reasoning_disabled": args.disable_reasoning}
            started = time.monotonic()
            result["completion_requests"] += 1
            try:
                response = await client.post(f"{base}/chat/completions", headers=headers, json=payload)
                row.update({"status": response.status_code, "latency_s": round(time.monotonic() - started, 2)})
                if response.is_error:
                    row.update({"ok": False, **error_detail(response, secrets)})
                else:
                    data = response.json()
                    usage = data.get("usage") or {}
                    row["usage"] = {name: usage[name] for name in (
                        "prompt_tokens", "completion_tokens", "total_tokens", "cost"
                    ) if name in usage}
                    actual = usage.get("cost")
                    if actual is not None:
                        actual = Decimal(str(actual))
                        if not actual.is_finite() or actual < 0:
                            raise ValueError("invalid_actual_cost")
                        ledger["charged_or_reserved_usd"] = str(
                            Decimal(ledger["charged_or_reserved_usd"]) - cost + actual
                        )
                        result["confirmed_cost_usd"] = str(Decimal(result["confirmed_cost_usd"]) + actual)
                        ledger.setdefault("calls", []).append({"model": model, "actual_cost_usd": str(actual)})
                        ledger_path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")
                    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content")
                    message = (data.get("choices") or [{}])[0].get("message") or {}
                    row["content_diagnostics"] = {
                        "visible_content_chars": len(content or ""),
                        "reasoning_chars": len(message.get("reasoning") or message.get("reasoning_content") or ""),
                        "completion_tokens_details": usage.get("completion_tokens_details"),
                    }
                    cleaned = sanitize(content, secrets) if content else ""
                    # sanitize() truncates diagnostics; synthetic reading needs
                    # full text, so redact known secrets directly before parsing.
                    if content:
                        cleaned = str(content)
                        for secret in secrets:
                            cleaned = cleaned.replace(secret, "[REDACTED]")
                    try:
                        reading = json.loads(cleaned)
                    except ValueError:
                        reading = None
                    valid = validate_reading_shape(reading) if args.sample == "three-cards" else (
                        isinstance(reading, dict) and reading.get("card") == "Шут"
                        and all(isinstance(reading.get(field), str) and reading[field].strip()
                                for field in ("short_answer", "card_meaning", "advice"))
                    )
                    row.update({"ok": bool(valid), "reading": reading,
                                "finish_reason": (data.get("choices") or [{}])[0].get("finish_reason")})
                    if not row["ok"]:
                        row["error_type"] = "reading_shape_invalid"
            except httpx.HTTPError as exc:
                row.update({"ok": False, "error_type": type(exc).__name__,
                            "latency_s": round(time.monotonic() - started, 2)})
            except ValueError as exc:
                row.update({"ok": False, "error_type": sanitize(exc, secrets)})
            result["results"].append(row)
            if "cost" not in row.get("usage", {}):
                result["stopped_reason"] = "actual_cost_unavailable_reservation_kept"
                break
            if Decimal(str(row["usage"]["cost"])) > cost:
                result["stopped_reason"] = "actual_cost_exceeded_projected_bound"
                break
    result["ledger_charged_or_reserved_usd"] = ledger.get("charged_or_reserved_usd", "0")
    result["unresolved_cost_requests"] = sum("cost" not in row.get("usage", {}) for row in result["results"])
    result["actual_cost_usd"] = None if result["unresolved_cost_requests"] else result["confirmed_cost_usd"]
    return result


async def run(args: argparse.Namespace) -> dict:
    if args.provider == "zen":
        if args.models and any(model not in FREE_MODELS for model in args.models):
            return {"error_type": "model_not_allowlisted"}
        return await probe(args)
    ledger_path = Path(__file__).resolve().parents[1] / "temp" / "provider_probe_ledger.json"
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.with_suffix(".lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"error_type": "probe_already_running"}
        ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else {"charged_or_reserved_usd": "0"}
        return await probe_openrouter(args, ledger, ledger_path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=("zen", "openrouter"), default="zen")
    parser.add_argument("--allow-paid", action="store_true")
    parser.add_argument("--env-file", type=Path, default=Path(__file__).resolve().parents[1] / ".env")
    parser.add_argument("--endpoint", choices=tuple(ENDPOINTS), default="zen")
    parser.add_argument("--model", dest="models", choices=FREE_MODELS + OPENROUTER_MODELS, action="append")
    parser.add_argument("--max-tokens", type=int, default=1000)
    parser.add_argument("--read-timeout", type=float, default=45)
    parser.add_argument("--response-mode", choices=("auto", "none"), default="auto")
    parser.add_argument("--sample", choices=("three-cards", "single-card"), default="three-cards")
    parser.add_argument("--endpoint-provider", choices=("deepinfra",))
    parser.add_argument("--disable-reasoning", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 1 <= args.max_tokens <= 3000:
        parser.error("--max-tokens must be between 1 and 3000")
    if not 1 <= args.read_timeout <= 60:
        parser.error("--read-timeout must be between 1 and 60")
    result = asyncio.run(run(args))
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
