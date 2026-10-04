# core/spreads.py
"""Каталог раскладов — источник правды data/spreads.json.

Легаси-совместимость: старые типы фронта (1, "1", 3, "3", "daily")
маппятся на записи каталога. Неизвестный id безопасно падает в single/daily.
"""
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

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
        return spreads[raw]
    if str(raw) in spreads:
        return spreads[str(raw)]
    legacy = _LEGACY_MAP.get(raw) or _LEGACY_MAP.get(str(raw))
    if legacy:
        return spreads[legacy]
    if question and str(question).strip():
        return spreads["single"]
    return spreads["daily"]