# core/spreads.py
"""Каталог раскладов — источник правды data/spreads.json.

Легаси-совместимость: старые типы фронта (1, "1", 3, "3", "daily")
маппятся на записи каталога. Неизвестный id безопасно падает в single/daily.
Расклад, требующий вопрос (needs_question), при пустом/whitespace-вопросе
тоже безопасно падает в daily — его нельзя разрешить сам по себе.
"""
import json
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).parent.parent
_SPREADS: dict[str, dict[str, Any]] = {}

_LEGACY_MAP = {1: "single", "1": "single", 3: "three", "3": "three", "daily": "daily"}


def load_spreads() -> dict[str, dict[str, Any]]:
    global _SPREADS
    if _SPREADS:
        return _SPREADS
    path = PROJECT_ROOT / "data" / "spreads.json"
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    _SPREADS = raw["spreads"]
    return _SPREADS


def get_spread(spread_id: str) -> dict[str, Any] | None:
    return load_spreads().get(spread_id)


def resolve_spread(raw: object, question: str | None) -> dict[str, Any]:
    """Разрешить spread_type запроса в запись каталога (никогда не None)."""
    spreads = load_spreads()
    if isinstance(raw, str) and raw in spreads:
        resolved = spreads[raw]
    elif str(raw) in spreads:
        resolved = spreads[str(raw)]
    else:
        legacy = _LEGACY_MAP.get(raw) or _LEGACY_MAP.get(str(raw))
        resolved = spreads[legacy] if legacy else None

    has_question = bool(question and str(question).strip())
    if resolved is not None and resolved.get("needs_question") and not has_question:
        return spreads["daily"]
    if resolved is not None:
        return resolved
    if has_question:
        return spreads["single"]
    return spreads["daily"]
